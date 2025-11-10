import { spawn, spawnSync } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_BACKEND_PORT = 8001;
const DEFAULT_FRONTEND_PORT = 3007;
const LOG_BUFFER_LIMIT = 200;
const HEALTH_TIMEOUT_MS = 60000;
const HEALTH_INTERVAL_MS = 1000;
const ENV_FORWARD_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY',
  'AZURE_OPENAI_API_KEY',
  'AZURE_OPENAI_ENDPOINT',
  'AZURE_OPENAI_VERSION',
  'DEEPWIKI_EMBEDDER_TYPE',
  'OLLAMA_HOST',
  'LM_STUDIO_BASE_URL',
  'LM_STUDIO_API_KEY',
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function commandExists(command) {
  if (!command) return false;
  try {
    spawnSync(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    return false;
  }
}

async function waitForUrl(url, { timeout = HEALTH_TIMEOUT_MS, interval = HEALTH_INTERVAL_MS, label = 'service' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), interval);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (response.ok) {
        return true;
      }
    } catch (error) {
      // Ignore until timeout expires
    }
    await delay(interval);
  }
  throw new Error(`${label} did not respond at ${url} within ${Math.round(timeout / 1000)}s`);
}

function getDefaultRepoPath() {
  const swarmRoot = process.env.SWARM_HOME || path.join(os.homedir(), 'GitHub', 'swarm');
  return path.join(swarmRoot, 'swarm-wiki');
}

export class DeepWikiManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.settingsKey = 'deepwikiSettings';
    this.backendProcess = null;
    this.frontendProcess = null;
    this.logBuffer = [];
    this.currentSettings = null;
    this.startPromise = null;
    this.isStopping = false;
    this.status = this.buildStatus('stopped', 'DeepWiki is idle');
  }

  getPythonCandidates(settings) {
    return [
      settings?.pythonCommand,
      process.env.PYTHON,
      process.platform === 'win32' ? 'python' : null,
      'python3',
      'python',
    ].filter(Boolean);
  }

  getNodeCandidates(settings) {
    return [
      settings?.nodeCommand,
      process.env.NODE_COMMAND,
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      'npm',
    ].filter(Boolean);
  }

  async waitForChildSpawn(child, command, label) {
    return new Promise((resolve, reject) => {
      const handleError = (error) => {
        cleanup();
        reject(new Error(`Failed to start ${label} with "${command}": ${error.code || error.message}`));
      };
      const handleSpawn = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        child.off('error', handleError);
        child.off('spawn', handleSpawn);
      };
      child.once('error', handleError);
      child.once('spawn', handleSpawn);
    });
  }

  async spawnFromCandidates(label, candidates, args, options) {
    const attempts = [];
    for (const command of candidates) {
      if (!command) continue;
      if (!commandExists(command)) {
        attempts.push(`${command} (not found)`);
        continue;
      }
      try {
        const child = spawn(command, args, options);
        await this.waitForChildSpawn(child, command, label);
        return { child, command };
      } catch (error) {
        attempts.push(`${command} (${error.message})`);
      }
    }
    const attemptsMessage = attempts.length ? ` Attempts: ${attempts.join('; ')}` : '';
    throw new Error(`Unable to start ${label}.${attemptsMessage}`);
  }

  get defaultSettings() {
    return {
      enabled: true,
      autoStart: true,
      openPaneOnLaunch: true,
      autoGenerate: true,
      repoPath: getDefaultRepoPath(),
      backendPort: DEFAULT_BACKEND_PORT,
      frontendPort: DEFAULT_FRONTEND_PORT,
      pythonCommand: 'python',
      nodeCommand: process.platform === 'win32' ? 'npm.cmd' : 'npm',
      provider: 'google',
      model: '',
      env: {},
    };
  }

  getSettings() {
    const saved = this.store.get(this.settingsKey, {});
    return {
      ...this.defaultSettings,
      ...saved,
      env: { ...(this.defaultSettings.env || {}), ...(saved.env || {}) },
    };
  }

  updateSettings(partial = {}) {
    const current = this.getSettings();
    const updated = {
      ...current,
      ...partial,
      env: { ...(current.env || {}), ...(partial.env || {}) },
    };
    this.store.set(this.settingsKey, updated);
    return updated;
  }

  shouldAutoStart() {
    const settings = this.getSettings();
    return settings.enabled && settings.autoStart;
  }

  getStatus() {
    return this.status;
  }

  buildStatus(state, message, extra = {}) {
    return {
      state,
      message,
      backendPid: this.backendProcess?.pid || null,
      frontendPid: this.frontendProcess?.pid || null,
      ports: {
        backend: this.currentSettings?.backendPort ?? this.defaultSettings.backendPort,
        frontend: this.currentSettings?.frontendPort ?? this.defaultSettings.frontendPort,
      },
      logs: this.logBuffer.slice(-20),
      ...extra,
    };
  }

  setStatus(state, message, extra = {}) {
    this.status = this.buildStatus(state, message, extra);
    this.emit('status', this.status);
    return this.status;
  }

  buildEnvOverrides(settings) {
    const overrides = {};
    const envSource = settings?.env || {};
    for (const key of ENV_FORWARD_KEYS) {
      const value = envSource[key];
      if (typeof value === 'string' && value.trim() !== '') {
        overrides[key] = value.trim();
      }
    }
    if (settings?.provider) {
      overrides.DEEPWIKI_DEFAULT_PROVIDER = settings.provider;
    }
    if (settings?.model) {
      overrides.DEEPWIKI_DEFAULT_MODEL = settings.model;
    }
    return overrides;
  }

  appendLog(source, chunk) {
    const lines = chunk.toString().split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      const stamped = `[${source}] ${line}`;
      this.logBuffer.push(stamped);
      if (this.logBuffer.length > LOG_BUFFER_LIMIT) {
        this.logBuffer.shift();
      }
    }
  }

  async verifyRepo(repoPath) {
    if (!repoPath) {
      throw new Error('DeepWiki repo path is not configured');
    }
    if (!fs.existsSync(repoPath)) {
      throw new Error(`DeepWiki repo not found at ${repoPath}`);
    }
    const packageJsonPath = path.join(repoPath, 'package.json');
    const apiPath = path.join(repoPath, 'api');
    if (!fs.existsSync(packageJsonPath) || !fs.existsSync(apiPath)) {
      throw new Error('DeepWiki repo is missing required folders (package.json/api)');
    }
  }

  monitorProcess(child, label) {
    child.stdout?.on('data', (data) => this.appendLog(label, data));
    child.stderr?.on('data', (data) => this.appendLog(label, data));
    child.on('error', (error) => {
      this.appendLog(label, `${label} error: ${error.message}`);
      if (!this.isStopping) {
        this.setStatus('error', `DeepWiki ${label} error: ${error.message}`);
        this.stop();
      }
    });
    child.on('exit', (code, signal) => {
      this.appendLog(label, `${label} exited with code ${code ?? 'null'} signal ${signal ?? 'null'}`);
      if (!this.isStopping && this.status.state === 'running') {
        this.setStatus('error', `DeepWiki ${label} exited unexpectedly (code ${code ?? 'unknown'})`);
        this.stop();
      }
    });
  }

  async start() {
    if (this.status.state === 'running') {
      return this.status;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.doStart();
    try {
      return await this.startPromise;
    } finally {
      this.startPromise = null;
    }
  }

  async doStart() {
    const settings = this.getSettings();
    this.currentSettings = settings;
    await this.verifyRepo(settings.repoPath);

    this.setStatus('starting', 'Booting DeepWiki services...');
    this.isStopping = false;

    try {
      await this.launchBackend(settings);
      await waitForUrl(`http://localhost:${settings.backendPort}/health`, {
        label: 'DeepWiki backend',
      });
      await this.launchFrontend(settings);
      await waitForUrl(`http://localhost:${settings.frontendPort}/ide-plugin`, {
        label: 'DeepWiki frontend',
      });
      return this.setStatus('running', `DeepWiki running on http://localhost:${settings.frontendPort}/ide-plugin`);
    } catch (error) {
      this.appendLog('manager', `Failed to start: ${error.message}`);
      await this.stop();
      return this.setStatus('error', error.message, { error: error.message });
    }
  }

  async launchBackend(settings) {
    if (this.backendProcess) {
      return;
    }
    const env = {
      ...process.env,
      ...this.buildEnvOverrides(settings),
      PORT: String(settings.backendPort),
      PYTHONUNBUFFERED: '1',
    };
    const { child, command } = await this.spawnFromCandidates(
      'DeepWiki backend',
      this.getPythonCandidates(settings),
      ['-m', 'api.main'],
      {
        cwd: settings.repoPath,
        env,
        stdio: 'pipe',
      }
    );
    this.backendProcess = child;
    this.currentSettings = { ...this.currentSettings, pythonCommand: command };
    this.monitorProcess(this.backendProcess, 'backend');
  }

  async launchFrontend(settings) {
    if (this.frontendProcess) {
      return;
    }
    const env = {
      ...process.env,
      ...this.buildEnvOverrides(settings),
      PORT: String(settings.frontendPort),
      FRONTEND_PORT: String(settings.frontendPort),
      BACKEND_PORT: String(settings.backendPort),
      SERVER_BASE_URL: `http://localhost:${settings.backendPort}`,
      PYTHON_BACKEND_HOST: `http://localhost:${settings.backendPort}`,
    };
    const args = ['run', 'dev', '--', '--port', String(settings.frontendPort)];
    const { child, command } = await this.spawnFromCandidates(
      'DeepWiki frontend',
      this.getNodeCandidates(settings),
      args,
      {
        cwd: settings.repoPath,
        env,
        stdio: 'pipe',
      }
    );
    this.frontendProcess = child;
    this.currentSettings = { ...this.currentSettings, nodeCommand: command };
    this.monitorProcess(this.frontendProcess, 'frontend');
  }

  async stop() {
    this.isStopping = true;
    const tasks = [];
    if (this.frontendProcess) {
      tasks.push(this.killProcess(this.frontendProcess));
      this.frontendProcess = null;
    }
    if (this.backendProcess) {
      tasks.push(this.killProcess(this.backendProcess));
      this.backendProcess = null;
    }
    await Promise.all(tasks);
    this.currentSettings = null;
    return this.setStatus('stopped', 'DeepWiki stopped');
  }

  async killProcess(child) {
    return new Promise((resolve) => {
      if (!child || child.killed) {
        return resolve();
      }
      child.once('exit', () => resolve());
      child.kill();
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
      }, 2000);
    });
  }
}
