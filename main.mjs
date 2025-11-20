import { app, BrowserWindow, ipcMain, dialog, WebContentsView, Menu, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Store from 'electron-store';
import os from 'os';
import pty from 'node-pty';
import { simpleGit } from 'simple-git';
import { lspServerManager } from './lsp-server-manager.mjs';
import { Client } from 'ssh2';
import crypto from 'crypto';
import SSHConnectionManager from './src/services/SSHConnectionManager.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

// SSH connection management - using proper architecture
const sshConnectionManager = new SSHConnectionManager();
const sshTerminals = new Map(); // terminalId -> { stream, connectionId }
const sshTempCredentials = new Map(); // workspaceId -> credentials

// Encryption for stored credentials
// IMPORTANT: This key is generated at runtime and changes each app restart
// This means credentials are only valid for the current session
// For production, you'd want to use a persistent key stored securely
let ENCRYPTION_KEY = null;
const ENCRYPTION_IV_LENGTH = 16;

function getEncryptionKey() {
  if (!ENCRYPTION_KEY) {
    // Try to load existing key from store, or create new one
    const storedKey = store.get('encryptionKey');
    if (storedKey) {
      ENCRYPTION_KEY = Buffer.from(storedKey, 'hex');
    } else {
      ENCRYPTION_KEY = crypto.randomBytes(32);
      store.set('encryptionKey', ENCRYPTION_KEY.toString('hex'));
    }
  }
  return ENCRYPTION_KEY;
}

function encrypt(text) {
  if (!text) return undefined;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(ENCRYPTION_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(text) {
  if (!text) return undefined;
  try {
    const key = getEncryptionKey();
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = parts.join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Decrypt] Failed to decrypt:', err.message);
    return undefined;
  }
}

// Browser management
const browsers = new Map(); // browserId -> WebContentsView
const browserBounds = new Map(); // Track last bounds for each browser
const workspaceBrowsers = new Map(); // Track which browsers belong to which workspace
let currentlyFocusedBrowserId = null; // Track which browser has focus (prevents event interception)

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  });

  // Prevent Ctrl+R and F5 from reloading the entire Electron app
  // BUT: Only intercept when main window has focus, not when browser views are focused
  mainWindow.webContents.on('before-input-event', (event, input) => {

    
    // CRITICAL FIX: If a browser view is focused, don't intercept ANY events
    // Let the WebContentsView handle all keyboard input
    if (currentlyFocusedBrowserId !== null) {

      return; // Don't intercept - let browser handle it
    }
    
    // Only block reload keys when main window has focus
    if ((input.control || input.meta) && input.key.toLowerCase() === 'r') {

      event.preventDefault();
    }
    if (input.key === 'F5') {

      event.preventDefault();
    }
  });
  
  // Clear focus tracking when main window regains focus
  mainWindow.webContents.on('focus', () => {
    if (currentlyFocusedBrowserId !== null) {

      currentlyFocusedBrowserId = null;
    }
  });

  // Set CSP ONLY for the main window's HTML (not for browser WebContentsView)
  // This prevents the restrictive CSP from blocking external websites
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    // Only apply CSP to our own app files (dist/index.html)
    // Don't apply to external websites loaded in WebContentsView
    const isAppFile = details.url.startsWith('file://');
    
    if (isAppFile) {

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self'; " +
            "script-src 'self'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self' data:"
          ]
        }
      });
    } else {
      // External website - don't modify CSP
      callback({
        responseHeaders: details.responseHeaders
      });
    }
  });

  // Always load from dist folder (production build)
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  mainWindow.webContents.openDevTools();
}

// IPC Handlers
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    const folderPath = result.filePaths[0];
    const folderName = path.basename(folderPath);
    
    const project = {
      path: folderPath,
      name: folderName,
      lastOpened: new Date().toISOString(),
    };
    
    // Save to recent projects
    const recentProjects = store.get('recentProjects', []);
    const filtered = recentProjects.filter((p) => p.path !== folderPath);
    filtered.unshift(project);
    store.set('recentProjects', filtered.slice(0, 10)); // Keep last 10
    
    return project;
  }
  
  return null;
});

ipcMain.handle('store:getRecentProjects', () => {
  return store.get('recentProjects', []);
});

// Workspace IPC Handlers
ipcMain.handle('workspace:getAll', () => {
  return store.get('workspaces', []);
});

ipcMain.handle('workspace:save', (event, workspaces) => {
  store.set('workspaces', workspaces);
  // Also save to lastSession for restore functionality
  store.set('lastSession', {
    workspaces,
    timestamp: new Date().toISOString(),
  });
  return true;
});

ipcMain.handle('workspace:getActive', () => {
  return store.get('activeWorkspaceId', null);
});

ipcMain.handle('workspace:setActive', (event, workspaceId) => {
  store.set('activeWorkspaceId', workspaceId);
  return true;
});

ipcMain.handle('workspace:clear', () => {
  store.set('workspaces', []);
  store.set('activeWorkspaceId', null);
  return true;
});

ipcMain.handle('workspace:getLastSession', () => {
  return store.get('lastSession', null);
});

ipcMain.handle('workspace:restoreSession', () => {
  const lastSession = store.get('lastSession', null);
  if (lastSession && lastSession.workspaces) {
    store.set('workspaces', lastSession.workspaces);
    // Set first workspace as active
    if (lastSession.workspaces.length > 0) {
      store.set('activeWorkspaceId', lastSession.workspaces[0].id);
    }
    return lastSession.workspaces;
  }
  return null;
});

ipcMain.handle('fs:readDirectory', async (event, dirPath) => {
  try {
    // Skip if SSH path
    if (dirPath && dirPath.startsWith('ssh://')) {
      return [];
    }
    
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const items = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
        };
      })
    );
    
    // Sort: directories first, then files
    return items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    console.error('Error reading directory:', error);
    return [];
  }
});

// List of text-based file extensions that are safe to open
const TEXT_FILE_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.sass',
  '.html', '.htm', '.xml', '.svg', '.vue', '.py', '.rb', '.php', '.java', '.c',
  '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.swift', '.kt', '.scala', '.sh',
  '.bash', '.zsh', '.fish', '.ps1', '.yaml', '.yml', '.toml', '.ini', '.conf',
  '.config', '.env', '.gitignore', '.gitattributes', '.editorconfig', '.sql',
  '.graphql', '.gql', '.proto', '.dockerfile', '.r', '.lua', '.vim', '.el',
  '.clj', '.ex', '.exs', '.erl', '.hrl', '.ml', '.fs', '.fsx', '.pl', '.pm',
  '.t', '.cgi', '.psgi', '.rake', '.gemfile', '.podfile', '.gradle', '.sbt',
  '.cmake', '.mk', '.mak', '.makefile', '.asm', '.s', '.diff', '.patch',
  '.log', '.csv', '.tsv', '.properties', '.plist', '.xsd', '.dtd', '.rss',
  '.atom', '.opml', '.tex', '.latex', '.bib', '.rst', '.asciidoc', '.adoc',
  '.textile', '.wiki', '.mediawiki', '.org', '.markdown', '.mdown', '.mkd',
  '.cjs', '.mjs', '.cts', '.mts', '.svelte'
]);

// Maximum file size to attempt reading (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

ipcMain.handle('fs:readFile', async (event, filePath) => {
  try {
    // Get file extension
    const ext = path.extname(filePath).toLowerCase();
    
    // Check if file extension is supported
    if (!TEXT_FILE_EXTENSIONS.has(ext)) {
      return {
        error: 'unsupported',
        message: `Cannot open ${ext} files. Only text-based files are supported.`
      };
    }
    
    // Check file size
    const stats = await fs.stat(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      return {
        error: 'too_large',
        message: `File is too large (${(stats.size / 1024 / 1024).toFixed(2)}MB). Maximum size is 5MB.`
      };
    }
    
    // Read file content
    const content = await fs.readFile(filePath, 'utf-8');
    return { content };
  } catch (error) {
    console.error('Error reading file:', error);
    return {
      error: 'read_error',
      message: `Error reading file: ${error.message}`
    };
  }
});

// Read file as binary (for PDFs, Word docs, Excel, etc.)
ipcMain.handle('fs:readFileBinary', async (event, filePath) => {
  try {
    const buffer = await fs.readFile(filePath);
    return { 
      success: true, 
      data: Array.from(buffer) // Convert buffer to array for IPC transfer
    };
  } catch (error) {
    console.error('Error reading binary file:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Mind file management (stored in .swarm/mind/)
ipcMain.handle('mind:list', async (event, workspacePath) => {
  try {
    const mindDir = path.join(workspacePath, '.swarm', 'mind');
    
    // Create directory if it doesn't exist
    await fs.mkdir(mindDir, { recursive: true });
    
    const entries = await fs.readdir(mindDir, { withFileTypes: true });
    const mindFiles = entries
      .filter(entry => entry.isFile() && entry.name.endsWith('.html'))
      .map(entry => ({
        name: entry.name.replace('.html', ''),
        path: path.join(mindDir, entry.name),
      }));
    
    return { success: true, files: mindFiles };
  } catch (error) {
    console.error('Error listing mind files:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mind:read', async (event, { workspacePath, name }) => {
  try {
    const mindPath = path.join(workspacePath, '.swarm', 'mind', `${name}.html`);
    const content = await fs.readFile(mindPath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('Error reading mind file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mind:write', async (event, { workspacePath, name, content }) => {
  try {
    const mindDir = path.join(workspacePath, '.swarm', 'mind');
    await fs.mkdir(mindDir, { recursive: true });
    
    const mindPath = path.join(mindDir, `${name}.html`);
    await fs.writeFile(mindPath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('Error writing mind file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mind:delete', async (event, { workspacePath, name }) => {
  try {
    const mindPath = path.join(workspacePath, '.swarm', 'mind', `${name}.html`);
    await fs.unlink(mindPath);
    return { success: true };
  } catch (error) {
    console.error('Error deleting mind file:', error);
    return { success: false, error: error.message };
  }
});

// Terminal management
const terminals = new Map();

// Get default shell based on OS
function getDefaultShell() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return process.env.COMSPEC || 'cmd.exe';
  }
  
  // Unix-like systems
  return process.env.SHELL || '/bin/bash';
}

// Create terminal
ipcMain.handle('terminal:create', (event, { cwd, terminalId }) => {
  try {
    const shell = getDefaultShell();
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: cwd || os.homedir(),
      env: process.env,
    });

    terminals.set(terminalId, ptyProcess);

    // Send data from PTY to renderer
    ptyProcess.onData((data) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.webContents.send('terminal:data', { terminalId, data });
      }
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.webContents.send('terminal:exit', { terminalId, exitCode, signal });
      }
      terminals.delete(terminalId);
    });

    return { success: true, terminalId };
  } catch (error) {
    console.error('Error creating terminal:', error);
    return { success: false, error: error.message };
  }
});

// Write to terminal
ipcMain.handle('terminal:write', (event, { terminalId, data }) => {
  const terminal = terminals.get(terminalId);
  if (terminal) {
    terminal.write(data);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Resize terminal
ipcMain.handle('terminal:resize', (event, { terminalId, cols, rows }) => {
  const terminal = terminals.get(terminalId);
  if (terminal) {
    terminal.resize(cols, rows);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Kill terminal
ipcMain.handle('terminal:kill', (event, { terminalId }) => {
  const terminal = terminals.get(terminalId);
  if (terminal) {
    terminal.kill();
    terminals.delete(terminalId);
    return { success: true };
  }
  return { success: false, error: 'Terminal not found' };
});

// Browser IPC Handlers
ipcMain.handle('browser:create', (event, { browserId, url, workspaceId }) => {
  try {
    // 🔧 FIX: Prevent duplicate browser creation when tabs are dragged between panes
    // Check if browser already exists in the browsers Map
    if (browsers.has(browserId)) {
      console.log('[browser:create] ✓ Browser already exists, skipping duplicate creation:', browserId);
      return { success: true, alreadyExists: true };
    }
    
    // 🔧 PERSISTENT BROWSERS: Set up persistent session with cookies
    // Use app's userData directory for persistent storage
    const userDataPath = app.getPath('userData');
    const browserProfilePath = path.join(userDataPath, 'browser-profiles', 'default');
    
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        // 🔧 FIX: Enable automatic zoom adjustment to fit content to view bounds
        zoomFactor: 1.0,
        // 🔧 PERSISTENT SESSION: Enable persistent cookies and storage
        partition: 'persist:browserprofile', // This creates a persistent session
        webSecurity: true,
      }
    });

    // Set User-Agent to Chrome on Windows to prevent content blocking
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    view.webContents.setUserAgent(userAgent);
    
    // 🔧 FIX: Set visual zoom level to fit browser content within pane bounds
    // This ensures web pages render at the right scale for the container
    view.webContents.setVisualZoomLevelLimits(0.5, 3.0).catch(err => {
      console.log('[Browser] Could not set zoom limits:', err);
    });

    // Prevent Ctrl+R from reloading the main Electron app (should only reload the browser page)
    view.webContents.on('before-input-event', (event, input) => {
      // Intercept Alt+Arrow keys for app-level navigation (tab/pane switching)
      if (input.type === 'keyDown' && input.alt && 
          (input.key === 'ArrowLeft' || input.key === 'ArrowRight' || 
           input.key === 'ArrowUp' || input.key === 'ArrowDown')) {
        console.log('[Browser] Alt+Arrow intercepted, sending to main window:', input.key);
        event.preventDefault();
        
        // Send to main window renderer for navigation
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          mainWindow.webContents.send('browser:keyboard-nav', {
            key: input.key,
            code: input.code,
            altKey: true
          });
        }
        return;
      }
      
      // Allow Ctrl+R and F5 in browser views (they reload the page, not the app)
      // But prevent Ctrl+Shift+R (hard reload) to avoid confusion
      if ((input.control || input.meta) && input.shift && input.key.toLowerCase() === 'r') {
        console.log('[Browser] Blocked Ctrl+Shift+R hard reload');
        event.preventDefault();
      }
      // Ctrl+R and F5 are allowed - they reload the browser page only
    });

    // Load the URL
    view.webContents.loadURL(url).catch(err => {
      console.error('Error loading URL:', err);
      // Try to load error page or about:blank
      view.webContents.loadURL('about:blank');
    });

    browsers.set(browserId, view);
    
    // Track which workspace this browser belongs to
    if (workspaceId) {
      if (!workspaceBrowsers.has(workspaceId)) {
        workspaceBrowsers.set(workspaceId, new Set());
      }
      workspaceBrowsers.get(workspaceId).add(browserId);
    }

    // 🔧 FIX: Handle middle-click and target="_blank" - open in new tab instead of new window
    view.webContents.setWindowOpenHandler(({ url, frameName, disposition }) => {
      console.log(`[Browser] Window open request: ${url}, disposition: ${disposition}`);
      
      // disposition can be: 'new-window', 'foreground-tab', 'background-tab', 'save-to-disk', 'other'
      // IMPORTANT: 'other' is often middle-click, so we need to handle it too
      // Only allow 'save-to-disk' and 'current-tab' to proceed normally
      if (disposition !== 'save-to-disk' && disposition !== 'current-tab') {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
          // Send request to renderer to create a new browser tab in the current pane
          mainWindow.webContents.send('browser:open-in-tab', { 
            url,
            sourceId: browserId,
            background: disposition === 'background-tab'
          });
        }
        // Deny the window creation - we'll handle it as a tab
        return { action: 'deny' };
      }
      
      // Allow save-to-disk and current-tab dispositions
      return { action: 'allow' };
    });

    // Navigation events - send to renderer
    view.webContents.on('did-navigate', (event, url) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('browser:navigation', { 
          browserId, 
          url,
          canGoBack: view.webContents.canGoBack(),
          canGoForward: view.webContents.canGoForward()
        });
      }
    });

    view.webContents.on('did-navigate-in-page', (event, url) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('browser:navigation', { 
          browserId, 
          url,
          canGoBack: view.webContents.canGoBack(),
          canGoForward: view.webContents.canGoForward()
        });
      }
    });

    view.webContents.on('page-title-updated', (event, title) => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('browser:title', { browserId, title });
      }
    });

    view.webContents.on('did-start-loading', () => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('browser:loading', { browserId, isLoading: true });
      }
    });

    view.webContents.on('did-stop-loading', () => {
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('browser:loading', { browserId, isLoading: false });
      }
    });

    // Add context menu with DevTools support
    view.webContents.on('context-menu', (event, params) => {
      const menuTemplate = [];

      // Link-specific items
      if (params.linkURL) {
        menuTemplate.push(
          {
            label: 'Open Link in New Tab',
            click: () => {
              shell.openExternal(params.linkURL);
            }
          },
          {
            label: 'Copy Link Address',
            click: () => {
              // Note: clipboard requires importing from electron
              const { clipboard } = require('electron');
              clipboard.writeText(params.linkURL);
            }
          },
          { type: 'separator' }
        );
      }

      // Image-specific items
      if (params.mediaType === 'image') {
        menuTemplate.push(
          {
            label: 'Open Image in New Tab',
            click: () => {
              shell.openExternal(params.srcURL);
            }
          },
          {
            label: 'Copy Image Address',
            click: () => {
              const { clipboard } = require('electron');
              clipboard.writeText(params.srcURL);
            }
          },
          { type: 'separator' }
        );
      }

      // Editable field items
      if (params.isEditable) {
        menuTemplate.push(
          {
            label: 'Undo',
            role: 'undo'
          },
          {
            label: 'Redo',
            role: 'redo'
          },
          { type: 'separator' },
          {
            label: 'Cut',
            role: 'cut'
          },
          {
            label: 'Copy',
            role: 'copy'
          },
          {
            label: 'Paste',
            role: 'paste'
          },
          {
            label: 'Select All',
            role: 'selectAll'
          },
          { type: 'separator' }
        );
      } else if (params.selectionText) {
        // Text selected but not in editable field
        menuTemplate.push(
          {
            label: 'Copy',
            role: 'copy'
          },
          { type: 'separator' }
        );
      }

      // Standard browser actions
      menuTemplate.push(
        {
          label: 'Back',
          enabled: view.webContents.canGoBack(),
          click: () => {
            view.webContents.goBack();
          }
        },
        {
          label: 'Forward',
          enabled: view.webContents.canGoForward(),
          click: () => {
            view.webContents.goForward();
          }
        },
        {
          label: 'Reload',
          click: () => {
            view.webContents.reload();
          }
        },
        { type: 'separator' }
      );

      // DevTools items
      menuTemplate.push(
        {
          label: 'Inspect Element',
          click: () => {
            view.webContents.inspectElement(params.x, params.y);
          }
        },
        {
          label: 'Open DevTools',
          click: () => {
            view.webContents.openDevTools();
          }
        },
        { type: 'separator' },
        {
          label: 'View Page Source',
          click: () => {
            view.webContents.executeJavaScript(`
              const newWindow = window.open('', '_blank');
              newWindow.document.write('<pre>' + document.documentElement.outerHTML.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>');
              newWindow.document.close();
            `);
          }
        }
      );

      const menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup();
    });

    return { success: true, browserId };
  } catch (error) {
    console.error('Error creating browser:', error);
    return { success: false, error: error.message };
  }
});

// Set browser bounds (position and size)
ipcMain.handle('browser:setBounds', (event, { browserId, bounds }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      return { success: false, error: 'Main window not found' };
    }

    // Check if contentView API is available (Electron 30+)
    if (!mainWindow.contentView) {
      return { success: false, error: 'WebContentsView requires Electron 30+. Please upgrade Electron.' };
    }

    // 🔧 FIX 1: Check if bounds have actually changed
    const oldBounds = browserBounds.get(browserId);
    if (oldBounds && 
        oldBounds.x === bounds.x && 
        oldBounds.y === bounds.y && 
        oldBounds.width === bounds.width && 
        oldBounds.height === bounds.height) {

      return { success: true };
    }

    // Store new bounds for future comparison
    browserBounds.set(browserId, bounds);

    // 🔧 CRITICAL FIX: Validate and clamp bounds to window dimensions
    // WebContentsView.setBounds() accepts absolute window-relative coordinates
    // and does NOT validate against window boundaries
    // We must ensure bounds never exceed the window
    const windowBounds = mainWindow.getContentBounds();
    
    // 🔧 FIX (Linux): Don't clamp x/y positions - they come from getBoundingClientRect()
    // and are already correct. Only clamp width/height to fit within window.
    // The old logic was: Math.min(bounds.x, windowBounds.width) which caused
    // browsers to render off-screen when panes were on the right side.
    const clampedBounds = {
      x: Math.max(0, bounds.x),
      y: Math.max(0, bounds.y),
      // Clamp width so x + width doesn't exceed window width
      width: Math.max(0, Math.min(bounds.width, Math.max(0, windowBounds.width - bounds.x))),
      // Clamp height so y + height doesn't exceed window height
      height: Math.max(0, Math.min(bounds.height, Math.max(0, windowBounds.height - bounds.y)))
    };
    
    // 🔧 FIX: Set bounds BEFORE adding to hierarchy (Linux fix)
    // On Linux, if view is added to contentView without bounds first,
    // it might render at (0,0) with undefined size and not update properly
    const roundedBounds = {
      x: Math.round(clampedBounds.x),
      y: Math.round(clampedBounds.y),
      width: Math.round(clampedBounds.width),
      height: Math.round(clampedBounds.height)
    };
    
    // DETAILED LOGGING for browser bounds (goes to terminal)
    console.log('[🌐 BROWSER:SET_BOUNDS] ========================================');
    console.log(`[🌐 BROWSER:SET_BOUNDS] Browser ID: ${browserId}`);
    console.log('[🌐 BROWSER:SET_BOUNDS] RECEIVED from renderer:');
    console.log(`[🌐 BROWSER:SET_BOUNDS]   x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height}`);
    console.log('[🌐 BROWSER:SET_BOUNDS] WINDOW bounds:');
    console.log(`[🌐 BROWSER:SET_BOUNDS]   w=${windowBounds.width} h=${windowBounds.height}`);
    
    const wasClamped = clampedBounds.x !== bounds.x || 
                       clampedBounds.y !== bounds.y || 
                       clampedBounds.width !== bounds.width || 
                       clampedBounds.height !== bounds.height;
    
    if (wasClamped) {
      console.log('[🌐 BROWSER:SET_BOUNDS] ⚠️  CLAMPED:');
      console.log(`[🌐 BROWSER:SET_BOUNDS]   x=${clampedBounds.x} y=${clampedBounds.y} w=${clampedBounds.width} h=${clampedBounds.height}`);
    }
    
    console.log('[🌐 BROWSER:SET_BOUNDS] ROUNDED FINAL:');
    console.log(`[🌐 BROWSER:SET_BOUNDS]   x=${roundedBounds.x} y=${roundedBounds.y} w=${roundedBounds.width} h=${roundedBounds.height}`);
    console.log(`[🌐 BROWSER:SET_BOUNDS] Platform: ${process.platform}`);
    console.log('[🌐 BROWSER:SET_BOUNDS] FITS CHECK:');
    console.log(`[🌐 BROWSER:SET_BOUNDS]   Right:  ${roundedBounds.x} + ${roundedBounds.width} = ${roundedBounds.x + roundedBounds.width} (≤ ${windowBounds.width}? ${roundedBounds.x + roundedBounds.width <= windowBounds.width})`);
    console.log(`[🌐 BROWSER:SET_BOUNDS]   Bottom: ${roundedBounds.y} + ${roundedBounds.height} = ${roundedBounds.y + roundedBounds.height} (≤ ${windowBounds.height}? ${roundedBounds.y + roundedBounds.height <= windowBounds.height})`);
    console.log('[🌐 BROWSER:SET_BOUNDS] ========================================');
    
    // Set bounds FIRST
    view.setBounds(roundedBounds);
    
    // 🔧 FIX: Dynamically adjust zoom factor based on container size
    // This helps the browser content fit properly within the pane
    // Calculate zoom based on typical viewport width (1920px) vs actual width
    const idealWidth = 1920;
    const zoomFactor = Math.min(1.5, Math.max(0.5, roundedBounds.width / idealWidth));
    view.webContents.setZoomFactor(zoomFactor);
    console.log(`[🌐 BROWSER:SET_BOUNDS] Applied zoom factor: ${zoomFactor.toFixed(2)} (width: ${roundedBounds.width}px)`);
    
    // THEN add view to hierarchy at index 0 to keep it BELOW main window's webContents
    // This allows DOM elements (dropdowns, modals) to render ABOVE the browser
    const contentView = mainWindow.contentView;
    
    // 🔧 FIX 2: Only add view if not already present - REMOVE the re-order cycle
    if (!contentView.children.includes(view)) {
      contentView.addChildView(view, 0);
      console.log(`[🌐 BROWSER:SET_BOUNDS] Added view to contentView hierarchy`);
    }

    return { success: true };
  } catch (error) {
    console.error('Error setting browser bounds:', error);
    return { success: false, error: error.message };
  }
});

// Hide browser (remove from window)
ipcMain.handle('browser:hide', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      return { success: false, error: 'Main window not found' };
    }

    // Check if contentView API is available
    if (!mainWindow.contentView) {
      return { success: false, error: 'WebContentsView requires Electron 30+' };
    }

    const contentView = mainWindow.contentView;
    if (contentView.children.includes(view)) {
      contentView.removeChildView(view);
    }

    // CRITICAL FIX: Clear focus tracking when browser is hidden
    // This prevents main window from thinking browser still has focus
    if (currentlyFocusedBrowserId === browserId) {

      currentlyFocusedBrowserId = null;
      
      // Focus main window to ensure keyboard events work
      mainWindow.webContents.focus();

    }

    // Clear cached bounds when hiding - will force re-add with new bounds when shown
    browserBounds.delete(browserId);

    return { success: true };
  } catch (error) {
    console.error('Error hiding browser:', error);
    return { success: false, error: error.message };
  }
});

// Navigate browser to URL
ipcMain.handle('browser:navigate', (event, { browserId, url }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    view.webContents.loadURL(url).catch(err => {
      console.error('Error navigating:', err);
      // Send error to renderer
      const mainWindow = BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('browser:error', { 
          browserId, 
          error: err.message 
        });
      }
    });

    return { success: true };
  } catch (error) {
    console.error('Error navigating browser:', error);
    return { success: false, error: error.message };
  }
});

// Go back
ipcMain.handle('browser:goBack', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    if (view.webContents.canGoBack()) {
      view.webContents.goBack();
      return { success: true };
    }
    
    return { success: false, error: 'Cannot go back' };
  } catch (error) {
    console.error('Error going back:', error);
    return { success: false, error: error.message };
  }
});

// Go forward
ipcMain.handle('browser:goForward', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    if (view.webContents.canGoForward()) {
      view.webContents.goForward();
      return { success: true };
    }
    
    return { success: false, error: 'Cannot go forward' };
  } catch (error) {
    console.error('Error going forward:', error);
    return { success: false, error: error.message };
  }
});

// Reload
ipcMain.handle('browser:reload', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    view.webContents.reload();
    return { success: true };
  } catch (error) {
    console.error('Error reloading browser:', error);
    return { success: false, error: error.message };
  }
});

// Stop loading
ipcMain.handle('browser:stop', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    view.webContents.stop();
    return { success: true };
  } catch (error) {
    console.error('Error stopping browser:', error);
    return { success: false, error: error.message };
  }
});

// Focus browser (bring WebContentsView to front and focus it)
ipcMain.handle('browser:focus', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      console.log('[browser:focus] ❌ Browser not found:', browserId);
      return { success: false, error: 'Browser not found' };
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow) {
      console.log('[browser:focus] ❌ Main window not found');
      return { success: false, error: 'Main window not found' };
    }

    // Track which browser is focused (prevents main window from intercepting events)
    currentlyFocusedBrowserId = browserId;
    
    // Focus the WebContentsView so it can receive keyboard input
    view.webContents.focus();
    

    
    return { success: true };
  } catch (error) {
    console.error('[browser:focus] ❌ Error focusing browser:', error);
    return { success: false, error: error.message };
  }
});

// Destroy browser (now just hides it for persistence)
ipcMain.handle('browser:destroy', (event, { browserId }) => {
  try {
    const view = browsers.get(browserId);
    if (!view) {
      return { success: false, error: 'Browser not found' };
    }

    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow && mainWindow.contentView) {
      const contentView = mainWindow.contentView;
      if (contentView.children.includes(view)) {
        contentView.removeChildView(view);
      }
    }

    // 🔧 PERSISTENT BROWSERS: Don't actually destroy, just remove from view
    // This keeps the browser session alive with cookies and state
    // The browser remains in the browsers Map for reuse
    console.log(`[browser:destroy] Browser ${browserId} hidden but kept alive for persistence`);

    // Clean up cached bounds
    browserBounds.delete(browserId);
    
    // Clear focus tracking if this browser was focused
    if (currentlyFocusedBrowserId === browserId) {
      currentlyFocusedBrowserId = null;
    }
    
    // 🔧 PERSISTENT BROWSERS: Don't delete from Map, keep it alive
    // browsers.delete(browserId); // COMMENTED OUT - Keep browser instance alive
    
    return { success: true };
  } catch (error) {
    console.error('Error destroying browser:', error);
    return { success: false, error: error.message };
  }
});

// Overlay management - hide/show all browsers
let hiddenBrowsersForOverlay = new Set();

ipcMain.handle('browsers:hideForOverlay', async () => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow || !mainWindow.contentView) {
      return { success: false, error: 'Main window not found' };
    }


    hiddenBrowsersForOverlay.clear();

    const contentView = mainWindow.contentView;
    
    // Wait 350ms for blur animation to complete before hiding
    await new Promise(resolve => setTimeout(resolve, 350));
    
    // Hide all browser views currently visible
    for (const [browserId, view] of browsers.entries()) {
      if (contentView.children.includes(view)) {
        contentView.removeChildView(view);
        hiddenBrowsersForOverlay.add(browserId);

      }
    }

    return { success: true, hiddenCount: hiddenBrowsersForOverlay.size };
  } catch (error) {
    console.error('Error hiding browsers for overlay:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browsers:showAfterOverlay', async () => {
  try {

    
    // Trigger browser repositioning by sending message to renderer
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (mainWindow) {
      mainWindow.webContents.send('browsers:repositionAfterOverlay');
    }

    hiddenBrowsersForOverlay.clear();
    return { success: true };
  } catch (error) {
    console.error('Error showing browsers after overlay:', error);
    return { success: false, error: error.message };
  }
});

// 🔧 PERSISTENT BROWSERS: Workspace-specific browser management
ipcMain.handle('browsers:hideWorkspace', async (event, { workspaceId }) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow || !mainWindow.contentView) {
      return { success: false, error: 'Main window not found' };
    }

    const workspaceBrowserSet = workspaceBrowsers.get(workspaceId);
    if (!workspaceBrowserSet) {
      return { success: true }; // No browsers for this workspace
    }

    const contentView = mainWindow.contentView;
    for (const browserId of workspaceBrowserSet) {
      const view = browsers.get(browserId);
      if (view && contentView.children.includes(view)) {
        contentView.removeChildView(view);
        console.log(`[browsers:hideWorkspace] Hidden browser ${browserId} for workspace ${workspaceId}`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error('Error hiding workspace browsers:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browsers:showWorkspace', async (event, { workspaceId }) => {
  try {
    const mainWindow = BrowserWindow.getAllWindows()[0];
    if (!mainWindow || !mainWindow.contentView) {
      return { success: false, error: 'Main window not found' };
    }

    const workspaceBrowserSet = workspaceBrowsers.get(workspaceId);
    if (!workspaceBrowserSet) {
      return { success: true }; // No browsers for this workspace
    }

    // Note: Browsers will be re-added when their bounds are set
    // This just ensures they're available for display
    console.log(`[browsers:showWorkspace] Ready to show browsers for workspace ${workspaceId}`);
    
    return { success: true };
  } catch (error) {
    console.error('Error showing workspace browsers:', error);
    return { success: false, error: error.message };
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  // Clean up LSP servers
  lspServerManager.stopAll();
  
  // Clean up browsers
  for (const [browserId, view] of browsers.entries()) {
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }
    browsers.delete(browserId);
  }
  
  // Clean up SSH connections
  sshConnectionManager.disconnectAll();
  
  // Clean up SSH terminals
  for (const [terminalId, terminal] of sshTerminals.entries()) {
    if (terminal.stream) {
      terminal.stream.close();
    }
    sshTerminals.delete(terminalId);
  }
  
  if (process.platform !== 'darwin') app.quit();
});

// Open in file explorer
ipcMain.handle('fs:openInExplorer', async (event, filePath) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    console.error('Error opening in file explorer:', error);
    return { success: false, error: error.message };
  }
});

// Helper function to check if workspace path is SSH
function isSSHWorkspace(workspacePath) {
  if (!workspacePath) return false;
  if (workspacePath.startsWith('ssh://')) return true;
  
  // Check electron-store for SSH flag
  try {
    const workspaces = store.get('workspaces', []);
    const workspace = workspaces.find(w => w.path === workspacePath);
    return workspace?.isSSH || false;
  } catch (e) {
    return false;
  }
}

// Git IPC Handlers
ipcMain.handle('git:status', async (event, { cwd }) => {
  try {
    // Skip if SSH workspace
    if (isSSHWorkspace(cwd)) {
      process.stdout.write(`[GIT] Skipping git:status for SSH workspace: ${cwd}\n`);
      return { files: [], staged: [], modified: [], not_added: [], deleted: [], renamed: [] };
    }
    
    const git = simpleGit(cwd);
    const status = await git.status();
    // Serialize to plain object to avoid IPC cloning errors
    return JSON.parse(JSON.stringify(status));
  } catch (error) {
    console.error('Git status error:', error);
    throw error;
  }
});

ipcMain.handle('git:branches', async (event, { cwd }) => {
  try {
    // Skip if SSH workspace
    if (isSSHWorkspace(cwd)) {
      process.stdout.write(`[GIT] Skipping git:branches for SSH workspace: ${cwd}\n`);
      return { all: [], branches: {}, current: '' };
    }
    
    const git = simpleGit(cwd);
    const branches = await git.branch();
    // Serialize to plain object to avoid IPC cloning errors
    return JSON.parse(JSON.stringify(branches));
  } catch (error) {
    console.error('Git branches error:', error);
    throw error;
  }
});

ipcMain.handle('git:log', async (event, { cwd, maxCount = 50 }) => {
  try {
    // Skip if SSH workspace
    if (isSSHWorkspace(cwd)) {
      process.stdout.write(`[GIT] Skipping git:log for SSH workspace: ${cwd}\n`);
      return { all: [], latest: null, total: 0 };
    }
    
    const git = simpleGit(cwd);
    const log = await git.log({ maxCount });
    // Serialize to plain object to avoid IPC cloning errors
    return JSON.parse(JSON.stringify(log));
  } catch (error) {
    console.error('Git log error:', error);
    throw error;
  }
});

ipcMain.handle('git:add', async (event, { cwd, files }) => {
  try {
    const git = simpleGit(cwd);
    await git.add(files);
    return { success: true };
  } catch (error) {
    console.error('Git add error:', error);
    throw error;
  }
});

ipcMain.handle('git:reset', async (event, { cwd, files }) => {
  try {
    const git = simpleGit(cwd);
    if (files && files.length > 0) {
      await git.reset(['HEAD', '--', ...files]);
    } else {
      await git.reset(['HEAD']);
    }
    return { success: true };
  } catch (error) {
    console.error('Git reset error:', error);
    throw error;
  }
});

ipcMain.handle('git:commit', async (event, { cwd, message }) => {
  try {
    const git = simpleGit(cwd);
    const result = await git.commit(message);
    return result;
  } catch (error) {
    console.error('Git commit error:', error);
    throw error;
  }
});

ipcMain.handle('git:checkout', async (event, { cwd, branch }) => {
  try {
    const git = simpleGit(cwd);
    await git.checkout(branch);
    return { success: true };
  } catch (error) {
    console.error('Git checkout error:', error);
    throw error;
  }
});

ipcMain.handle('git:diff', async (event, { cwd, file }) => {
  try {
    const git = simpleGit(cwd);
    const diff = await git.diff(['--', file]);
    return diff;
  } catch (error) {
    console.error('Git diff error:', error);
    throw error;
  }
});

ipcMain.handle('git:pull', async (event, { cwd }) => {
  try {
    const git = simpleGit(cwd);
    const result = await git.pull();
    return result;
  } catch (error) {
    console.error('Git pull error:', error);
    throw error;
  }
});

ipcMain.handle('git:push', async (event, { cwd }) => {
  try {
    const git = simpleGit(cwd);
    const result = await git.push();
    return result;
  } catch (error) {
    console.error('Git push error:', error);
    throw error;
  }
});

// LSP IPC Handlers
ipcMain.handle('lsp:startServer', (event, { languageId, serverConfig }) => {
  return lspServerManager.startServer(languageId, serverConfig);
});

ipcMain.handle('lsp:sendMessage', (event, { languageId, message }) => {
  return lspServerManager.sendMessage(languageId, message);
});

ipcMain.handle('lsp:stopServer', (event, { languageId }) => {
  return lspServerManager.stopServer(languageId);
});

// SSH IPC Handlers
ipcMain.handle('ssh:getConnections', () => {
  const connections = store.get('sshConnections', []);
  console.log('[SSH] Loading connections from store:', connections.length);
  
  const validConnections = [];
  const failedConnections = [];
  
  // Decrypt credentials if saved
  for (const conn of connections) {
    console.log('[SSH] Processing connection:', conn.id, 'hasCredentials:', !!conn.credentials);
    
    if (conn.credentials) {
      console.log('[SSH] Connection has credentials object:', {
        hasPassword: !!conn.credentials.password,
        hasPrivateKey: !!conn.credentials.privateKey
      });
      
      try {
        const decryptedCreds = {};
        let decryptionFailed = false;
        
        if (conn.credentials.password) {
          const decrypted = decrypt(conn.credentials.password);
          if (decrypted) {
            decryptedCreds.password = decrypted;
            console.log('[SSH] Password decrypted successfully');
          } else {
            console.log('[SSH] Password decryption failed - removing stale credentials');
            decryptionFailed = true;
          }
        }
        
        if (conn.credentials.privateKey && !decryptionFailed) {
          const decrypted = decrypt(conn.credentials.privateKey);
          if (decrypted) {
            decryptedCreds.privateKey = decrypted;
            console.log('[SSH] Private key decrypted successfully');
          } else {
            console.log('[SSH] Private key decryption failed - removing stale credentials');
            decryptionFailed = true;
          }
        }
        
        if (decryptionFailed) {
          // Credentials were encrypted with old key, remove them
          failedConnections.push(conn.id);
          validConnections.push({
            ...conn,
            credentials: undefined,
            savedCredentials: false // Mark as no longer having saved credentials
          });
        } else {
          validConnections.push({
            ...conn,
            credentials: Object.keys(decryptedCreds).length > 0 ? decryptedCreds : undefined,
            savedCredentials: Object.keys(decryptedCreds).length > 0
          });
        }
      } catch (err) {
        console.error('[SSH] Error decrypting credentials:', err);
        failedConnections.push(conn.id);
        validConnections.push({ 
          ...conn, 
          credentials: undefined,
          savedCredentials: false
        });
      }
    } else {
      console.log('[SSH] Connection has no credentials to decrypt');
      validConnections.push(conn);
    }
  }
  
  // Clean up failed connections from store
  if (failedConnections.length > 0) {
    console.log('[SSH] Cleaning up', failedConnections.length, 'connections with failed decryption');
    const cleanedConnections = connections.map(conn => {
      if (failedConnections.includes(conn.id)) {
        // Remove stale encrypted credentials
        const { credentials, ...rest } = conn;
        return { ...rest, savedCredentials: false };
      }
      return conn;
    });
    store.set('sshConnections', cleanedConnections);
  }
  
  return validConnections;
});

ipcMain.handle('ssh:saveConnection', (event, connection) => {
  const connections = store.get('sshConnections', []);
  
  console.log('[SSH] Saving connection:', connection.id, 'hasCredentials:', !!connection.credentials);
  if (connection.credentials) {
    console.log('[SSH] Credentials:', {
      hasPassword: !!connection.credentials.password,
      hasPrivateKey: !!connection.credentials.privateKey
    });
  }
  
  // Create a copy to avoid mutating the original
  const connectionToSave = { ...connection };
  
  // Encrypt credentials if present
  if (connectionToSave.credentials) {
    console.log('[SSH] Encrypting credentials...');
    const encryptedCreds = {};
    
    if (connectionToSave.credentials.password) {
      encryptedCreds.password = encrypt(connectionToSave.credentials.password);
      console.log('[SSH] Password encrypted');
    }
    
    if (connectionToSave.credentials.privateKey) {
      encryptedCreds.privateKey = encrypt(connectionToSave.credentials.privateKey);
      console.log('[SSH] Private key encrypted');
    }
    
    connectionToSave.credentials = encryptedCreds;
  }
  
  const existing = connections.findIndex(c => c.id === connectionToSave.id);
  if (existing >= 0) {
    console.log('[SSH] Updating existing connection');
    connections[existing] = connectionToSave;
  } else {
    console.log('[SSH] Adding new connection');
    connections.push(connectionToSave);
  }
  
  store.set('sshConnections', connections);
  console.log('[SSH] Saved. Total connections:', connections.length);
  return { success: true };
});

ipcMain.handle('ssh:updateConnection', (event, { id, updates }) => {
  const connections = store.get('sshConnections', []);
  const index = connections.findIndex(c => c.id === id);
  
  if (index === -1) {
    return { success: false, error: 'Connection not found' };
  }
  
  console.log('[SSH] Updating connection:', id, 'updates:', Object.keys(updates));
  
  // Create updated connection
  const updatedConnection = { ...connections[index], ...updates };
  
  // Handle credentials update
  if (updates.credentials) {
    console.log('[SSH] Encrypting updated credentials...');
    const encryptedCreds = {};
    
    if (updates.credentials.password) {
      encryptedCreds.password = encrypt(updates.credentials.password);
    }
    
    if (updates.credentials.privateKey) {
      encryptedCreds.privateKey = encrypt(updates.credentials.privateKey);
    }
    
    updatedConnection.credentials = encryptedCreds;
    updatedConnection.savedCredentials = true;
  } else if (updates.clearCredentials) {
    // Explicitly clear credentials
    delete updatedConnection.credentials;
    updatedConnection.savedCredentials = false;
  }
  
  connections[index] = updatedConnection;
  store.set('sshConnections', connections);
  
  console.log('[SSH] Connection updated successfully');
  return { success: true };
});

ipcMain.handle('ssh:removeConnection', (event, id) => {
  const connections = store.get('sshConnections', []);
  store.set('sshConnections', connections.filter(c => c.id !== id));
  return { success: true };
});

ipcMain.handle('ssh:clearAllConnections', () => {
  store.set('sshConnections', []);
  console.log('[SSH] Cleared all saved connections');
  return { success: true };
});

ipcMain.handle('ssh:setTempCredentials', (event, { workspaceId, credentials }) => {
  process.stdout.write(`[SSH] Setting temp credentials for workspace: ${workspaceId}\n`);
  process.stdout.write(`[SSH] Credentials: ${JSON.stringify({
    hasPassword: !!credentials?.password,
    hasPrivateKey: !!credentials?.privateKey,
    passwordLength: credentials?.password?.length,
    privateKeyLength: credentials?.privateKey?.length
  })}\n`);
  sshTempCredentials.set(workspaceId, credentials);
  return { success: true };
});

// Test SSH connection (doesn't save, just tests connectivity)
ipcMain.handle('ssh:testConnection', async (event, { connection, credentials }) => {
  process.stdout.write(`[SSH TEST] Testing connection to: ${JSON.stringify({
    host: connection.host,
    port: connection.port,
    username: connection.username,
    hasPassword: !!credentials.password,
    hasPrivateKey: !!credentials.privateKey
  })}\n`);

  const client = new Client();
  
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      client.end();
      process.stdout.write('[SSH TEST] Connection timeout\n');
      resolve({ success: false, error: 'Connection timeout (20s)' });
    }, 20000);

    client.on('ready', () => {
      clearTimeout(timeout);
      process.stdout.write('[SSH TEST] ✅ Connection successful\n');
      
      // Test SFTP
      client.sftp((err, sftp) => {
        if (err) {
          process.stderr.write(`[SSH TEST] ❌ SFTP failed: ${err.message}\n`);
          client.end();
          resolve({ 
            success: true, 
            sftpAvailable: false,
            message: 'SSH connected but SFTP unavailable'
          });
          return;
        }

        process.stdout.write('[SSH TEST] ✅ SFTP available\n');
        
        // Test reading home directory
        sftp.readdir('.', (err, list) => {
          client.end();
          
          if (err) {
            process.stdout.write(`[SSH TEST] ⚠️ Cannot read directory: ${err.message}\n`);
            resolve({
              success: true,
              sftpAvailable: true,
              filesystemAccess: false,
              message: 'SSH and SFTP work but filesystem access limited'
            });
          } else {
            process.stdout.write(`[SSH TEST] ✅ Filesystem accessible, found ${list.length} items\n`);
            resolve({
              success: true,
              sftpAvailable: true,
              filesystemAccess: true,
              fileCount: list.length,
              message: 'All systems operational'
            });
          }
        });
      });
    });

    client.on('error', (err) => {
      clearTimeout(timeout);
      process.stderr.write(`[SSH TEST] ❌ Connection error: ${err.message}\n`);
      resolve({ 
        success: false, 
        error: err.message,
        code: err.code,
        level: err.level
      });
    });

    // Connect with credentials
    const config = {
      host: connection.host,
      port: connection.port,
      username: connection.username,
      readyTimeout: 20000
    };

    if (credentials.privateKey) {
      // Check if it's a path or actual key content
      if (credentials.privateKey.includes('BEGIN')) {
        config.privateKey = credentials.privateKey;
        process.stdout.write('[SSH TEST] Using private key (content)\n');
        client.connect(config);
      } else {
        // It's a path, read it
        fs.readFile(credentials.privateKey, 'utf8')
          .then(privateKey => {
            config.privateKey = privateKey;
            process.stdout.write('[SSH TEST] Using private key (file)\n');
            client.connect(config);
          })
          .catch(err => {
            clearTimeout(timeout);
            process.stderr.write(`[SSH TEST] ❌ Failed to read private key: ${err.message}\n`);
            resolve({ success: false, error: `Failed to read private key: ${err.message}` });
          });
      }
    } else if (credentials.password) {
      config.password = credentials.password;
      process.stdout.write('[SSH TEST] Using password authentication\n');
      client.connect(config);
    } else {
      clearTimeout(timeout);
      process.stderr.write('[SSH TEST] ❌ No credentials provided\n');
      resolve({ success: false, error: 'No valid credentials provided' });
    }
  });
});

ipcMain.handle('ssh:selectKeyFile', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [
      { name: 'SSH Keys', extensions: ['*'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    defaultPath: path.join(os.homedir(), '.ssh')
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
});

// Create or get SSH connection with SFTP using SSHConnectionManager
async function getOrCreateSSHConnection(connectionId, connection, credentials) {
  // Check if connection already exists
  if (sshConnectionManager.isConnected(connectionId)) {
    process.stdout.write(`[SSH] Reusing existing connection: ${connectionId}\n`);
    return sshConnectionManager.getConnection(connectionId);
  }

  process.stdout.write(`[SSH] Creating new connection via SSHConnectionManager: ${connectionId}\n`);

  // If private key path provided, read the file content
  const creds = { ...credentials };
  if (creds.privateKey && !creds.privateKey.includes('BEGIN')) {
    // It's a path, read the file
    try {
      creds.privateKey = await fs.readFile(creds.privateKey, 'utf8');
    } catch (err) {
      throw new Error(`Failed to read private key: ${err.message}`);
    }
  }

  // Setup event handlers for connection lifecycle
  const handleDisconnect = (id) => {
    if (id === connectionId) {
      process.stdout.write(`[SSH] Connection closed, notifying terminals: ${connectionId}\n`);
      
      // Notify all terminals using this connection
      for (const [termId, termData] of sshTerminals.entries()) {
        if (termData.connectionId === connectionId) {
          const window = BrowserWindow.getAllWindows()[0];
          if (window) {
            window.webContents.send('terminal:exit', { 
              terminalId: termId, 
              exitCode: 1, 
              signal: 'SIGHUP' 
            });
          }
          sshTerminals.delete(termId);
        }
      }
    }
  };

  // Listen for disconnect events
  sshConnectionManager.once(`disconnected`, handleDisconnect);

  try {
    await sshConnectionManager.connect(connection, creds, Client);
    return sshConnectionManager.getConnection(connectionId);
  } catch (err) {
    sshConnectionManager.off(`disconnected`, handleDisconnect);
    throw err;
  }
}

// Create SSH terminal with PTY using SSHConnectionManager
ipcMain.handle('ssh:createTerminal', async (event, { terminalId, connection, credentials, workspaceId }) => {
  try {
    process.stdout.write(`[SSH] 🚀 Creating terminal: ${terminalId}\n`);
    process.stdout.write(`[SSH] Connection: ${JSON.stringify({
      id: connection.id,
      host: connection.host,
      port: connection.port,
      username: connection.username
    })}\n`);
    process.stdout.write(`[SSH] Has credentials passed? ${!!credentials}\n`);
    process.stdout.write(`[SSH] WorkspaceId: ${workspaceId}\n`);
    
    // Get credentials from temp store if not provided
    if (!credentials && workspaceId) {
      process.stdout.write(`[SSH] Looking up credentials from temp store for workspace: ${workspaceId}\n`);
      credentials = sshTempCredentials.get(workspaceId);
      process.stdout.write(`[SSH] Found credentials in temp store? ${!!credentials}\n`);
      if (credentials) {
        process.stdout.write(`[SSH] Temp credentials: ${JSON.stringify({
          hasPassword: !!credentials.password,
          hasPrivateKey: !!credentials.privateKey
        })}\n`);
      }
    } else if (credentials) {
      process.stdout.write(`[SSH] Using provided credentials: ${JSON.stringify({
        hasPassword: !!credentials.password,
        hasPrivateKey: !!credentials.privateKey
      })}\n`);
    }
    
    if (!credentials) {
      process.stderr.write('[SSH] ❌ No credentials available\n');
      return { success: false, error: 'No credentials provided' };
    }

    process.stdout.write('[SSH] 🔌 Getting or creating SSH connection...\n');
    // Get or create SSH connection (with SFTP)
    const connectionId = connection.id;
    const connData = await getOrCreateSSHConnection(connectionId, connection, credentials);
    process.stdout.write(`[SSH] ✅ Connection ready: ${connectionId}\n`);
    
    // Now request a shell PTY channel via SSHConnectionManager
    process.stdout.write('[SSH] 📡 Requesting PTY shell channel...\n');
    const stream = await sshConnectionManager.createShellChannel(connectionId, {
      term: 'xterm-256color',
      cols: 80,
      rows: 30
    });

    process.stdout.write('[SSH] ✅ Shell channel established\n');
    
    // Store terminal stream
    sshTerminals.set(terminalId, { stream, connectionId });

    // Send data from SSH to renderer
    stream.on('data', (data) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.webContents.send('terminal:data', { terminalId, data: data.toString() });
      }
    });

    stream.on('close', () => {
      process.stdout.write(`[SSH] 🔚 Shell stream closed: ${terminalId}\n`);
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.webContents.send('terminal:exit', { terminalId, exitCode: 0, signal: null });
      }
      sshTerminals.delete(terminalId);
    });

    stream.stderr.on('data', (data) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (window) {
        window.webContents.send('terminal:data', { terminalId, data: data.toString() });
      }
    });

    process.stdout.write(`[SSH] ✨ Terminal creation complete: ${terminalId}\n`);
    return { success: true, terminalId, connectionId };
  } catch (error) {
    process.stderr.write(`[SSH] ❌ Error creating terminal: ${error}\n`);
    return { success: false, error: error.message };
  }
});

// Write to SSH terminal
ipcMain.handle('ssh:write', (event, { terminalId, data }) => {
  const terminal = sshTerminals.get(terminalId);
  if (terminal && terminal.stream) {
    terminal.stream.write(data);
    return { success: true };
  }
  return { success: false, error: 'SSH terminal not found' };
});

// Resize SSH terminal
ipcMain.handle('ssh:resize', (event, { terminalId, cols, rows }) => {
  const terminal = sshTerminals.get(terminalId);
  if (terminal && terminal.stream) {
    terminal.stream.setWindow(rows, cols, rows * 24, cols * 80);
    return { success: true };
  }
  return { success: false, error: 'SSH terminal not found' };
});

// Kill SSH terminal
ipcMain.handle('ssh:kill', (event, { terminalId }) => {
  const terminal = sshTerminals.get(terminalId);
  if (terminal) {
    if (terminal.stream) {
      terminal.stream.close();
    }
    sshTerminals.delete(terminalId);
    return { success: true };
  }
  return { success: false, error: 'SSH terminal not found' };
});

// SFTP Operations - Read Directory
ipcMain.handle('ssh:sftp:readdir', async (event, { connectionId, remotePath }) => {
  try {
    process.stdout.write(`[SFTP] 📂 Reading directory: ${remotePath} for connection: ${connectionId}\n`);
    
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      process.stderr.write(`[SFTP] ❌ SFTP session not found for connection: ${connectionId}\n`);
      process.stdout.write(`[SFTP] Available connections: ${JSON.stringify(sshConnectionManager.getAllConnections())}\n`);
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    process.stdout.write('[SFTP] ✅ SFTP session found, reading directory...\n');

    return new Promise((resolve) => {
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          process.stderr.write(`[SFTP] ❌ Error reading directory: ${err.message}\n`);
          resolve({ success: false, error: err.message });
          return;
        }

        process.stdout.write(`[SFTP] ✅ Directory read successfully, found ${list.length} items\n`);

        const items = list.map(item => ({
          name: item.filename,
          path: `${remotePath}/${item.filename}`,
          isDirectory: item.longname.startsWith('d'),
          size: item.attrs.size,
          modified: new Date(item.attrs.mtime * 1000),
          permissions: item.attrs.mode
        }));

        process.stdout.write(`[SFTP] First 5 items: ${JSON.stringify(items.slice(0, 5).map(i => ({ name: i.name, isDir: i.isDirectory })), null, 2)}\n`);
        resolve({ success: true, items });
      });
    });
  } catch (error) {
    process.stderr.write(`[SFTP] ❌ Exception in readdir: ${error}\n`);
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Read File
ipcMain.handle('ssh:sftp:readFile', async (event, { connectionId, remotePath }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.readFile(remotePath, 'utf8', (err, data) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ success: true, content: data });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Read Binary File
ipcMain.handle('ssh:sftp:readFileBinary', async (event, { connectionId, remotePath }) => {
  try {
    process.stdout.write(`[SFTP] 📄 Reading binary file: ${remotePath} for connection: ${connectionId}\n`);
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      process.stdout.write(`[SFTP] ❌ SFTP session not found for connection: ${connectionId}\n`);
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.readFile(remotePath, (err, data) => {
        if (err) {
          process.stdout.write(`[SFTP] ❌ Error reading binary file: ${err.message}\n`);
          resolve({ success: false, error: err.message });
          return;
        }

        // Convert Buffer to ArrayBuffer for transfer
        const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        process.stdout.write(`[SFTP] ✅ Binary file read successfully, size: ${data.length} bytes\n`);
        resolve({ success: true, data: Array.from(data) }); // Convert to array for IPC transfer
      });
    });
  } catch (error) {
    process.stdout.write(`[SFTP] ❌ Exception reading binary file: ${error.message}\n`);
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Write File
ipcMain.handle('ssh:sftp:writeFile', async (event, { connectionId, remotePath, content }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.writeFile(remotePath, content, 'utf8', (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ success: true });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Create Directory
ipcMain.handle('ssh:sftp:mkdir', async (event, { connectionId, remotePath }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.mkdir(remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ success: true });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Delete File
ipcMain.handle('ssh:sftp:unlink', async (event, { connectionId, remotePath }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.unlink(remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ success: true });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Delete Directory
ipcMain.handle('ssh:sftp:rmdir', async (event, { connectionId, remotePath }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.rmdir(remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ success: true });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Rename/Move
ipcMain.handle('ssh:sftp:rename', async (event, { connectionId, oldPath, newPath }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ success: true });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// SFTP Operations - Get Stats
ipcMain.handle('ssh:sftp:stat', async (event, { connectionId, remotePath }) => {
  try {
    const sftp = sshConnectionManager.getSftpSession(connectionId);
    if (!sftp) {
      return { success: false, error: 'SSH connection or SFTP session not found' };
    }

    return new Promise((resolve) => {
      sftp.stat(remotePath, (err, stats) => {
        if (err) {
          resolve({ success: false, error: err.message });
          return;
        }

        resolve({ 
          success: true, 
          stats: {
            size: stats.size,
            mode: stats.mode,
            mtime: stats.mtime,
            atime: stats.atime,
            isDirectory: stats.isDirectory(),
            isFile: stats.isFile()
          }
        });
      });
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});
