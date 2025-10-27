const { app, BrowserWindow, BrowserView, ipcMain, dialog, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const videoService = require('./src/services/VideoService');
const languageServerManager = require('./src/services/LanguageServerManager');
const crashLogger = require('./src/services/CrashLogger');
const FileWatcherService = require('./src/services/FileWatcherService');
const pty = require('node-pty');
const os = require('os');

// ========================================
// BROWSER EXTENSIONS CONFIGURATION
// ========================================
const BROWSER_EXTENSIONS = [
  {
    name: 'Claude',
    id: 'fcoeoabgfenejglbffodgkkbkcdhcgfn',
    enabled: true
  }
  // Add more extensions here as needed
];

// ========================================
// MEMORY OPTIMIZATION: Disable GPU acceleration
// This saves ~400-500MB of memory by preventing duplicate GPU processes
// Trade-off: Slightly slower rendering, but acceptable for an IDE
// ========================================
app.disableHardwareAcceleration();
console.log('[MAIN] GPU acceleration disabled for memory optimization');

let mainWindow;
const browserViews = new Map(); // tabId -> BrowserView
const fileWatcher = new FileWatcherService(); // Global file watcher instance
const terminals = new Map(); // ptyId -> pty instance
const sshTerminals = new Map(); // sshTerminalId -> { stream, connectionId }

// Console log buffer for crash reports
const consoleLogBuffer = [];
const MAX_LOG_BUFFER = 200;

// Parse command line arguments for folder path
const args = process.argv.slice(2);
const folderArg = args.find(arg => arg.startsWith('--folder='));
const initialFolder = folderArg ? folderArg.replace('--folder=', '') : null;

if (initialFolder) {
  console.log('[MAIN] Initial folder from command line:', initialFolder);
}

function createWindow() {
  // Disable native application menu
  Menu.setApplicationMenu(null);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      nodeIntegration: true
    }
  });

  mainWindow.loadFile('index.html');

  // Open DevTools in development
  mainWindow.webContents.openDevTools();

  // Add crash handlers
  mainWindow.webContents.on('crashed', async (event, killed) => {
    console.error('[MAIN] ========================================');
    console.error('[MAIN] RENDERER PROCESS CRASHED!');
    console.error('[MAIN] Killed:', killed);
    console.error('[MAIN] ========================================');

    // Log crash to file
    const crashInfo = {
      type: 'renderer-crash',
      processType: 'renderer',
      killed: killed,
      timestamp: new Date().toISOString(),
      consoleLogs: [...consoleLogBuffer],
      memory: process.memoryUsage(),
      additionalInfo: {
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
        nodeVersion: process.versions.node,
        platform: process.platform,
        arch: process.arch
      }
    };

    const logFile = await crashLogger.logCrash(crashInfo);

    const options = {
      type: 'error',
      title: 'Renderer Crashed',
      message: 'The renderer process has crashed.',
      detail: `This may be due to a GTK dialog issue on Linux.\n\nCrash log saved to:\n${logFile || 'Failed to save crash log'}\n\nTo avoid this:\n• Use --folder=/path/to/folder when starting\n• Or click Restart to try again`,
      buttons: ['Restart', 'Open Crash Logs', 'Quit'],
      defaultId: 0,
      cancelId: 2
    };

    const choice = dialog.showMessageBoxSync(mainWindow, options);
    if (choice === 0) {
      console.log('[MAIN] User chose to restart');
      mainWindow.reload();
    } else if (choice === 1) {
      console.log('[MAIN] User chose to open crash logs');
      const logsDir = crashLogger.getCrashLogsDirectory();
      if (logsDir) {
        require('electron').shell.openPath(logsDir);
      }
      mainWindow.reload();
    } else {
      console.log('[MAIN] User chose to quit');
      app.quit();
    }
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('[MAIN] Renderer process became unresponsive!');
    dialog.showErrorBox('Window Unresponsive', 'The window has become unresponsive.');
  });

  mainWindow.webContents.on('responsive', () => {
    console.log('[MAIN] Renderer process became responsive again');
  });

  // Log all console messages from renderer and buffer them for crash reports
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['verbose', 'info', 'warning', 'error'];
    const logMessage = `[RENDERER ${levels[level]}] ${message}`;
    console.log(logMessage);

    // Buffer log for crash reports
    consoleLogBuffer.push(`[${new Date().toISOString()}] ${logMessage}`);
    if (consoleLogBuffer.length > MAX_LOG_BUFFER) {
      consoleLogBuffer.shift(); // Remove oldest
    }
  });
}

// IPC handlers for file system operations
ipcMain.handle('read-directory', async (event, dirPath) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      success: true,
      entries: entries.map(entry => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: path.join(dirPath, entry.name)
      }))
    };
  } catch (error) {
    console.error('Error reading directory:', error);
    return { success: false, error: error.message, entries: [] };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-home-dir', () => {
  return app.getPath('home');
});

ipcMain.handle('get-initial-folder', () => {
  return initialFolder;
});

// Crash logging IPC handlers
ipcMain.handle('get-crash-logs', async () => {
  const logs = await crashLogger.getCrashLogs();
  return logs;
});

ipcMain.handle('read-crash-log', async (event, filename) => {
  const content = await crashLogger.readCrashLog(filename);
  return content;
});

ipcMain.handle('get-crash-logs-directory', () => {
  return crashLogger.getCrashLogsDirectory();
});

ipcMain.handle('log-renderer-error', async (event, errorInfo) => {
  // Log non-crashing errors from renderer
  console.error('[MAIN] Renderer error reported:', errorInfo);

  const crashInfo = {
    type: 'renderer-error',
    processType: 'renderer',
    error: errorInfo,
    timestamp: new Date().toISOString(),
    consoleLogs: [...consoleLogBuffer],
    memory: process.memoryUsage()
  };

  const logFile = await crashLogger.logCrash(crashInfo);
  return logFile;
});

ipcMain.handle('select-folder', async () => {
  try {
    console.log('[MAIN] Opening folder selection dialog...');

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });

    console.log('[MAIN] Dialog result:', result);

    if (result.canceled) {
      console.log('[MAIN] Folder selection canceled');
      return { canceled: true };
    }

    console.log('[MAIN] Folder selected:', result.filePaths[0]);
    return { canceled: false, path: result.filePaths[0] };
  } catch (error) {
    // Catch GTK/native dialog errors on Linux
    console.error('[MAIN] ERROR in select-folder dialog:', error);
    console.error('[MAIN] Error name:', error.name);
    console.error('[MAIN] Error message:', error.message);
    console.error('[MAIN] Error stack:', error.stack);

    // Return error to renderer so it can handle gracefully
    return {
      canceled: true,
      error: true,
      errorMessage: `Dialog error: ${error.message}. Try using command line to specify folder.`
    };
  }
});

// File operation handlers
ipcMain.handle('create-file', async (event, filePath) => {
  try {
    await fs.writeFile(filePath, '', { flag: 'wx' }); // wx = write, fail if exists
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-folder', async (event, folderPath) => {
  try {
    await fs.mkdir(folderPath, { recursive: false });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('rename-item', async (event, oldPath, newPath) => {
  try {
    await fs.rename(oldPath, newPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('delete-item', async (event, itemPath) => {
  try {
    const stats = await fs.stat(itemPath);
    if (stats.isDirectory()) {
      await fs.rm(itemPath, { recursive: true, force: true });
    } else {
      await fs.unlink(itemPath);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-path-exists', async (event, itemPath) => {
  try {
    await fs.access(itemPath);
    return { exists: true };
  } catch (error) {
    return { exists: false };
  }
});

// Copy file or directory recursively
ipcMain.handle('copy-item-recursive', async (event, sourcePath, destPath) => {
  try {
    const stats = await fs.stat(sourcePath);

    if (stats.isDirectory()) {
      // Recursively copy directory
      await copyDirectory(sourcePath, destPath);
    } else {
      // Copy file
      await fs.copyFile(sourcePath, destPath);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Helper function to recursively copy directory
async function copyDirectory(source, destination) {
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, destPath);
    } else {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}

// Reveal in system file explorer
ipcMain.handle('reveal-in-explorer', async (event, itemPath) => {
  try {
    const { shell } = require('electron');
    shell.showItemInFolder(itemPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Open path with default system application
ipcMain.handle('shell-open-path', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    const error = await shell.openPath(filePath);
    if (error) {
      return { success: false, error };
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Show item in folder
ipcMain.handle('shell-show-item-in-folder', async (event, filePath) => {
  try {
    const { shell } = require('electron');
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Write text to clipboard
ipcMain.handle('write-to-clipboard', async (event, text) => {
  try {
    const { clipboard } = require('electron');
    clipboard.writeText(text);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Search in files handler using ripgrep
ipcMain.handle('search-in-files', async (event, dirPath, query, options = {}) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execPromise = promisify(exec);

    const maxResults = options.maxResults || 500;
    const caseSensitive = options.caseSensitive || false;
    const useRegex = options.regex || false;

    // Build ripgrep command
    let rgCmd = 'rg --line-number --no-heading --color=never';

    // Add case insensitive flag if needed
    if (!caseSensitive) {
      rgCmd += ' --ignore-case';
    }

    // Add regex flag if needed
    if (!useRegex) {
      // Use fixed strings for literal search
      rgCmd += ' --fixed-strings';
    }

    // Exclude common directories (ripgrep respects .gitignore by default)
    rgCmd += ' --glob "!node_modules/**"';
    rgCmd += ' --glob "!.git/**"';
    rgCmd += ' --glob "!dist/**"';
    rgCmd += ' --glob "!build/**"';
    rgCmd += ' --glob "!.next/**"';
    rgCmd += ' --glob "!*.min.js"';
    rgCmd += ' --glob "!*.map"';

    // Add max count
    rgCmd += ` --max-count=${maxResults}`;

    // Escape query for shell
    const escapedQuery = query.replace(/'/g, "'\\''");

    // Build full command
    const fullCmd = `${rgCmd} '${escapedQuery}' "${dirPath}" 2>/dev/null || true`;

    console.log('[Main] Executing search command:', fullCmd);

    const { stdout } = await execPromise(fullCmd, { maxBuffer: 10 * 1024 * 1024 }); // 10MB buffer

    // Parse ripgrep output
    const matches = [];
    if (stdout.trim()) {
      const lines = stdout.trim().split('\n');

      for (const line of lines) {
        // Ripgrep output format: filepath:linenum:text
        const match = line.match(/^([^:]+):(\d+):(.+)$/);
        if (match) {
          matches.push({
            file: match[1],
            line: parseInt(match[2]),
            text: match[3].trim()
          });
        }
      }
    }

    return { success: true, matches };
  } catch (error) {
    console.error('[Main] Error searching in files:', error);
    return { success: false, error: error.message, matches: [] };
  }
});

// Save file handler
ipcMain.handle('save-file', async (event, filePath, content) => {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error saving file:', error);
    return { success: false, error: error.message };
  }
});

// Replace in files handler - VS Code/Zed-inspired find and replace
ipcMain.handle('replace-in-files', async (event, searchPattern, replaceText, filePaths, options = {}) => {
  try {
    const { regex = false, caseSensitive = false } = options;
    const MAX_FILE_SIZE = 256 * 1024 * 1024; // 256MB heap protection like VS Code

    let totalMatches = 0;
    let filesModified = 0;
    const results = [];

    console.log('[Main] Replace in files:', {
      pattern: searchPattern,
      replacement: replaceText,
      fileCount: filePaths.length,
      regex,
      caseSensitive
    });

    for (const filePath of filePaths) {
      try {
        // Check file size before reading (heap protection)
        const stats = await fs.stat(filePath);
        if (stats.size > MAX_FILE_SIZE) {
          console.warn('[Main] File too large for replacement:', filePath, stats.size);
          results.push({
            file: filePath,
            success: false,
            error: 'File too large for replacement (>256MB)',
            matches: 0
          });
          continue;
        }

        // Read file content
        const content = await fs.readFile(filePath, 'utf-8');
        let modifiedContent = content;
        let matchCount = 0;

        // Perform replacement
        if (regex) {
          // Regex mode: use pattern as-is
          try {
            const flags = caseSensitive ? 'g' : 'gi';
            const regexPattern = new RegExp(searchPattern, flags);

            // Count matches first
            const matches = content.match(regexPattern);
            matchCount = matches ? matches.length : 0;

            // Perform replacement
            if (matchCount > 0) {
              modifiedContent = content.replace(regexPattern, replaceText);
            }
          } catch (regexError) {
            console.error('[Main] Invalid regex pattern:', regexError);
            results.push({
              file: filePath,
              success: false,
              error: 'Invalid regex pattern: ' + regexError.message,
              matches: 0
            });
            continue;
          }
        } else {
          // Literal string mode: escape special regex characters
          const escapedPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const flags = caseSensitive ? 'g' : 'gi';
          const searchRegex = new RegExp(escapedPattern, flags);

          // Count matches
          const matches = content.match(searchRegex);
          matchCount = matches ? matches.length : 0;

          // Perform replacement
          if (matchCount > 0) {
            modifiedContent = content.replace(searchRegex, replaceText);
          }
        }

        // Write back if content changed
        if (modifiedContent !== content) {
          await fs.writeFile(filePath, modifiedContent, 'utf-8');
          filesModified++;
          totalMatches += matchCount;

          results.push({
            file: filePath,
            success: true,
            matches: matchCount,
            modified: true
          });

          console.log('[Main] ✓ Replaced', matchCount, 'matches in', filePath);
        } else {
          results.push({
            file: filePath,
            success: true,
            matches: 0,
            modified: false
          });
        }

      } catch (fileError) {
        console.error('[Main] Error processing file:', filePath, fileError);
        results.push({
          file: filePath,
          success: false,
          error: fileError.message,
          matches: 0
        });
      }
    }

    console.log('[Main] Replace completed:', {
      filesModified,
      totalMatches,
      filesProcessed: filePaths.length
    });

    return {
      success: true,
      filesModified,
      totalMatches,
      results
    };

  } catch (error) {
    console.error('[Main] Error in replace-in-files:', error);
    return {
      success: false,
      error: error.message,
      filesModified: 0,
      totalMatches: 0
    };
  }
});

// File Watcher IPC handlers
ipcMain.handle('watch-directory', async (event, dirPath) => {
  try {
    console.log('[Main] Setting up file watcher for:', dirPath);

    const success = fileWatcher.watch(dirPath, (events) => {
      // Send events to renderer process
      console.log('[Main] File watcher detected', events.length, 'changes in', dirPath);
      mainWindow.webContents.send('file-watcher-event', {
        rootPath: dirPath,
        events
      });
    });

    return { success };
  } catch (error) {
    console.error('[Main] Error setting up file watcher:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('unwatch-directory', async (event, dirPath) => {
  try {
    console.log('[Main] Removing file watcher for:', dirPath);
    fileWatcher.unwatch(dirPath);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error removing file watcher:', error);
    return { success: false, error: error.message };
  }
});

// SQLite IPC handlers
ipcMain.handle('sqlite-list-tables', async (event, dbPath) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }

      db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name", [], (err, rows) => {
        db.close();

        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, tables: rows.map(row => row.name) });
        }
      });
    });
  });
});

ipcMain.handle('sqlite-get-schema', async (event, dbPath, tableName) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }

      db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
        db.close();

        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, schema: rows });
        }
      });
    });
  });
});

ipcMain.handle('sqlite-query-table', async (event, dbPath, tableName, limit = 100, offset = 0) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }

      // Get total count
      db.get(`SELECT COUNT(*) as count FROM ${tableName}`, [], (err, countRow) => {
        if (err) {
          db.close();
          resolve({ success: false, error: err.message });
          return;
        }

        // Get data
        db.all(`SELECT * FROM ${tableName} LIMIT ? OFFSET ?`, [limit, offset], (err, rows) => {
          db.close();

          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, data: rows, total: countRow.count });
          }
        });
      });
    });
  });
});

ipcMain.handle('sqlite-execute-query', async (event, dbPath, query) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }

      // Check if it's a SELECT query
      const isSelect = query.trim().toUpperCase().startsWith('SELECT');

      if (isSelect) {
        db.all(query, [], (err, rows) => {
          db.close();

          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, data: rows });
          }
        });
      } else {
        // UPDATE, INSERT, DELETE
        db.run(query, [], function(err) {
          db.close();

          if (err) {
            resolve({ success: false, error: err.message });
          } else {
            resolve({ success: true, changes: this.changes, lastID: this.lastID });
          }
        });
      }
    });
  });
});

// Video IPC handlers
ipcMain.handle('video-get-metadata', async (event, videoPath) => {
  try {
    const metadata = await videoService.getMetadata(videoPath);
    return { success: true, metadata };
  } catch (error) {
    console.error('[Main] Error getting video metadata:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video-generate-thumbnail', async (event, videoPath, timestamp = 1) => {
  try {
    const thumbnailPath = await videoService.generateThumbnail(videoPath, timestamp);
    return { success: true, thumbnailPath };
  } catch (error) {
    console.error('[Main] Error generating thumbnail:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video-generate-seek-thumbnails', async (event, videoPath, count = 10) => {
  try {
    const thumbnails = await videoService.generateSeekThumbnails(videoPath, count);
    return { success: true, thumbnails };
  } catch (error) {
    console.error('[Main] Error generating seek thumbnails:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video-get-file-path', async (event, videoPath) => {
  try {
    // Validate that the file exists and is accessible
    await fs.access(videoPath);
    // Return the file:// URL for the video
    return { success: true, filePath: `file://${videoPath}` };
  } catch (error) {
    console.error('[Main] Error accessing video file:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video-clear-cache', async () => {
  try {
    videoService.clearAllCaches();
    return { success: true };
  } catch (error) {
    console.error('[Main] Error clearing video cache:', error);
    return { success: false, error: error.message };
  }
});

// LSP IPC handlers
ipcMain.handle('lsp-request', async (event, languageId, method, params, rootPath) => {
  try {
    const server = await languageServerManager.getServer(languageId, rootPath);
    const result = await languageServerManager.sendRequest(server, method, params);
    return { success: true, result };
  } catch (error) {
    console.error('[Main] LSP request error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('lsp-notification', async (event, languageId, method, params, rootPath) => {
  try {
    const server = await languageServerManager.getServer(languageId, rootPath);
    languageServerManager.sendNotification(server, method, params);
    return { success: true };
  } catch (error) {
    console.error('[Main] LSP notification error:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// Browser IPC handlers
// ========================================

ipcMain.handle('browser-create-view', async (event, tabId, bounds, profileId = null) => {
  try {
    console.log('[Main] Creating BrowserView for tab:', tabId, 'with bounds:', bounds, 'profileId:', profileId);

    // Use profile-based partition for cookie isolation, fallback to default profile
    const partition = profileId ? `persist:profile-${profileId}` : 'persist:profile-default';

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: partition // Isolated session per profile
      }
    });

    console.log('[Main] Using partition:', partition);

    // CRITICAL: Set user agent to look like a normal Chrome browser
    // Remove Electron identifier to prevent websites from detecting it's an Electron app
    const userAgent = view.webContents.getUserAgent();
    const normalUserAgent = userAgent.replace(/\s+Electron\/[\d.]+/g, '');
    view.webContents.setUserAgent(normalUserAgent);
    console.log('[Main] Set user agent (removed Electron identifier):', normalUserAgent);

    // Set bounds
    view.setBounds({
      x: bounds.x || 0,
      y: bounds.y || 80,
      width: bounds.width || 800,
      height: bounds.height || 600
    });

    // CRITICAL: Disable auto-resize to prevent BrowserView from covering the toolbar
    // We manually manage bounds via ResizeObserver in Browser.js
    // Auto-resize was causing the BrowserView to expand over the HTML toolbar after page load
    view.setAutoResize({
      width: false,
      height: false,
      horizontal: false,
      vertical: false
    });

    // Add to window
    mainWindow.addBrowserView(view);

    // Store reference
    browserViews.set(tabId, view);

    // Listen for navigation events
    view.webContents.on('did-navigate', (event, url) => {
      console.log('[Main] Browser navigated to:', url);
      mainWindow.webContents.send('browser-did-navigate', { tabId, url });
    });

    view.webContents.on('did-navigate-in-page', (event, url) => {
      mainWindow.webContents.send('browser-did-navigate', { tabId, url });
    });

    // Listen for page title updates
    view.webContents.on('page-title-updated', (event, title) => {
      console.log('[Main] Browser title updated:', title);
      mainWindow.webContents.send('browser-title-updated', { tabId, title });
    });

    // Listen for loading state
    view.webContents.on('did-start-loading', () => {
      mainWindow.webContents.send('browser-loading', { tabId, loading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      mainWindow.webContents.send('browser-loading', { tabId, loading: false });
    });

    // Intercept keyboard input to handle Ctrl+E
    view.webContents.on('before-input-event', (event, input) => {
      // Ctrl+E / Cmd+E - Open Claude extension
      const isMac = process.platform === 'darwin';
      const ctrlOrCmd = isMac ? input.meta : input.control;

      if (ctrlOrCmd && input.key.toLowerCase() === 'e' && !input.shift && !input.alt) {
        console.log('[Main] Ctrl+E pressed in BrowserView - opening Claude extension');
        event.preventDefault();
        mainWindow.webContents.send('extension:open-claude');
        return;
      }
    });

    // Enable context menu (right-click) for copy/paste functionality
    view.webContents.on('context-menu', (params) => {
      const template = [
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
        { type: 'separator' },
        { label: 'Select All', role: 'selectAll' },
      ];

      const menu = Menu.buildFromTemplate(template);
      menu.popup();
    });

    console.log('[Main] BrowserView created successfully');
    return { success: true, tabId };
  } catch (error) {
    console.error('[Main] Error creating BrowserView:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-destroy-view', async (event, tabId) => {
  try {
    console.log('[Main] Destroying BrowserView for tab:', tabId);

    const view = browserViews.get(tabId);
    if (view) {
      mainWindow.removeBrowserView(view);
      view.webContents.destroy();
      browserViews.delete(tabId);
      console.log('[Main] BrowserView destroyed');
      return { success: true };
    } else {
      return { success: false, error: 'View not found' };
    }
  } catch (error) {
    console.error('[Main] Error destroying BrowserView:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-navigate', async (event, tabId, url) => {
  try {
    console.log('[Main] Navigating tab', tabId, 'to:', url);

    const view = browserViews.get(tabId);
    if (view) {
      await view.webContents.loadURL(url);
      return { success: true };
    } else {
      return { success: false, error: 'View not found' };
    }
  } catch (error) {
    console.error('[Main] Navigation error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-go-back', async (event, tabId) => {
  try {
    const view = browserViews.get(tabId);
    if (view && view.webContents.canGoBack()) {
      view.webContents.goBack();
      return { success: true };
    }
    return { success: false, error: 'Cannot go back' };
  } catch (error) {
    console.error('[Main] Go back error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-go-forward', async (event, tabId) => {
  try {
    const view = browserViews.get(tabId);
    if (view && view.webContents.canGoForward()) {
      view.webContents.goForward();
      return { success: true };
    }
    return { success: false, error: 'Cannot go forward' };
  } catch (error) {
    console.error('[Main] Go forward error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-reload', async (event, tabId) => {
  try {
    const view = browserViews.get(tabId);
    if (view) {
      view.webContents.reload();
      return { success: true };
    }
    return { success: false, error: 'View not found' };
  } catch (error) {
    console.error('[Main] Reload error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-toggle-devtools', async (event, tabId) => {
  try {
    const view = browserViews.get(tabId);
    if (view) {
      if (view.webContents.isDevToolsOpened()) {
        view.webContents.closeDevTools();
      } else {
        view.webContents.openDevTools();
      }
      return { success: true };
    }
    return { success: false, error: 'View not found' };
  } catch (error) {
    console.error('[Main] Toggle DevTools error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-update-bounds', async (event, tabId, bounds) => {
  try {
    const view = browserViews.get(tabId);
    if (view) {
      view.setBounds({
        x: bounds.x || 0,
        y: bounds.y || 80,
        width: bounds.width || 800,
        height: bounds.height || 600
      });
      return { success: true };
    }
    return { success: false, error: 'View not found' };
  } catch (error) {
    console.error('[Main] Update bounds error:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// Browser Profile & Cookie IPC Handlers
// ========================================

ipcMain.handle('browser-get-cookies', async (event, profileId) => {
  try {
    console.log('[Main] Getting cookies for profile:', profileId);

    const partition = profileId ? `persist:profile-${profileId}` : 'persist:profile-default';
    const { session } = require('electron');
    const profileSession = session.fromPartition(partition);

    const cookies = await profileSession.cookies.get({});
    console.log('[Main] Retrieved', cookies.length, 'cookies');

    return { success: true, cookies };
  } catch (error) {
    console.error('[Main] Get cookies error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-set-cookie', async (event, profileId, cookie) => {
  try {
    console.log('[Main] Setting cookie for profile:', profileId, 'cookie:', cookie);

    const partition = profileId ? `persist:profile-${profileId}` : 'persist:profile-default';
    const { session } = require('electron');
    const profileSession = session.fromPartition(partition);

    await profileSession.cookies.set(cookie);
    console.log('[Main] Cookie set successfully');

    return { success: true };
  } catch (error) {
    console.error('[Main] Set cookie error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-clear-cookies', async (event, profileId) => {
  try {
    console.log('[Main] Clearing cookies for profile:', profileId);

    const partition = profileId ? `persist:profile-${profileId}` : 'persist:profile-default';
    const { session } = require('electron');
    const profileSession = session.fromPartition(partition);

    await profileSession.clearStorageData({
      storages: ['cookies']
    });
    console.log('[Main] Cookies cleared successfully');

    return { success: true };
  } catch (error) {
    console.error('[Main] Clear cookies error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-export-cookies', async (event, profileId) => {
  try {
    console.log('[Main] Exporting cookies for profile:', profileId);

    const partition = profileId ? `persist:profile-${profileId}` : 'persist:profile-default';
    const { session } = require('electron');
    const profileSession = session.fromPartition(partition);

    const cookies = await profileSession.cookies.get({});
    console.log('[Main] Exported', cookies.length, 'cookies');

    return { success: true, cookies };
  } catch (error) {
    console.error('[Main] Export cookies error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('browser-import-cookies', async (event, profileId, cookies) => {
  try {
    console.log('[Main] Importing', cookies.length, 'cookies for profile:', profileId);

    const partition = profileId ? `persist:profile-${profileId}` : 'persist:profile-default';
    const { session } = require('electron');
    const profileSession = session.fromPartition(partition);

    // Import each cookie
    for (const cookie of cookies) {
      // Remove properties that can't be set
      const { hostOnly, session: isSession, ...cookieToSet } = cookie;
      await profileSession.cookies.set(cookieToSet);
    }

    console.log('[Main] Cookies imported successfully');

    return { success: true };
  } catch (error) {
    console.error('[Main] Import cookies error:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// Browser Extensions IPC Handlers
// ========================================

/**
 * Get list of available browser extensions
 */
ipcMain.handle('browser-get-extensions', async (event) => {
  try {
    // Return the list of extensions from BROWSER_EXTENSIONS
    const extensions = BROWSER_EXTENSIONS.map(ext => ({
      name: ext.name,
      id: ext.id,
      enabled: ext.enabled
    }));

    console.log('[Main] Returning extensions list:', extensions);
    return extensions;
  } catch (error) {
    console.error('[Main] Error getting extensions:', error);
    return [];
  }
});

/**
 * Toggle extension enabled/disabled state
 * Note: Extensions are loaded at startup, so changes require app restart
 */
ipcMain.handle('browser-toggle-extension', async (event, extensionId, enabled) => {
  try {
    console.log(`[Main] Toggling extension ${extensionId}: ${enabled}`);

    // Find and update the extension in BROWSER_EXTENSIONS
    const ext = BROWSER_EXTENSIONS.find(e => e.id === extensionId);
    if (!ext) {
      return { success: false, error: 'Extension not found' };
    }

    ext.enabled = enabled;

    console.log(`[Main] Extension ${ext.name} ${enabled ? 'enabled' : 'disabled'}`);
    console.log('[Main] Note: Changes will take effect after app restart or browser tab reload');

    return {
      success: true,
      requiresRestart: true,
      message: 'Extension state updated. Please restart the app or reload browser tabs for changes to take effect.'
    };
  } catch (error) {
    console.error('[Main] Error toggling extension:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// Git IPC Handlers
// ========================================

const { spawn } = require('child_process');

// SSH Connection Manager
const sshConnectionManager = require('./src/services/SSHConnectionManager');

/**
 * Execute a git command in the main process
 * @param {string} gitPath - Git binary path
 * @param {string[]} args - Git arguments
 * @param {Object} options - Execution options
 * @returns {Promise<{success: boolean, stdout?: string, stderr?: string, exitCode?: number, error?: string}>}
 */
async function executeGitCommand(gitPath, args, options = {}) {
  const cwd = options.cwd || process.cwd();
  const timeout = options.timeout || 30000;
  const encoding = options.encoding || 'utf8';
  const input = options.input;

  return new Promise((resolve) => {
    const gitProcess = spawn(gitPath, args, {
      cwd: cwd,
      env: {
        ...process.env,
        LANG: 'en_US.UTF-8',
        LC_ALL: 'en_US.UTF-8'
      }
    });

    let stdout = '';
    let stderr = '';
    let didTimeout = false;

    // Set up timeout
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      gitProcess.kill('SIGTERM');
      setTimeout(() => {
        if (!gitProcess.killed) {
          gitProcess.kill('SIGKILL');
        }
      }, 5000);
    }, timeout);

    // Collect stdout
    gitProcess.stdout.setEncoding(encoding);
    gitProcess.stdout.on('data', (chunk) => {
      stdout += chunk;
    });

    // Collect stderr
    gitProcess.stderr.setEncoding(encoding);
    gitProcess.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    // Handle process completion
    gitProcess.on('close', (code) => {
      clearTimeout(timeoutId);

      if (didTimeout) {
        resolve({
          success: false,
          error: `Git command timed out after ${timeout}ms`,
          stderr: stderr,
          exitCode: code
        });
        return;
      }

      if (code !== 0) {
        resolve({
          success: false,
          error: `Git command failed with exit code ${code}`,
          stderr: stderr,
          exitCode: code
        });
        return;
      }

      // Success
      resolve({
        success: true,
        stdout: stdout,
        stderr: stderr,
        exitCode: 0
      });
    });

    // Handle process errors
    gitProcess.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: `Failed to spawn git process: ${error.message}`,
        stderr: stderr
      });
    });

    // Write stdin if provided
    if (input) {
      gitProcess.stdin.write(input);
      gitProcess.stdin.end();
    }
  });
}

ipcMain.handle('git-execute', async (event, gitPath, args, options) => {
  try {
    const result = await executeGitCommand(gitPath, args, options);
    return result;
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
});

// ========================================
// SSH IPC Handlers
// ========================================

// Initialize SSH Connection Manager
ipcMain.handle('ssh-init', async () => {
  try {
    await sshConnectionManager.init();
    return { success: true };
  } catch (error) {
    console.error('[Main] Error initializing SSH manager:', error);
    return { success: false, error: error.message };
  }
});

// Create SSH connection
ipcMain.handle('ssh-create-connection', async (event, connectionConfig) => {
  try {
    const connectionId = await sshConnectionManager.createConnection(connectionConfig);
    return { success: true, connectionId };
  } catch (error) {
    console.error('[Main] Error creating SSH connection:', error);
    return { success: false, error: error.message };
  }
});

// Connect to SSH server
ipcMain.handle('ssh-connect', async (event, connectionId) => {
  try {
    await sshConnectionManager.connect(connectionId);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error connecting SSH:', error);
    return { success: false, error: error.message };
  }
});

// Disconnect from SSH server
ipcMain.handle('ssh-disconnect', async (event, connectionId) => {
  try {
    await sshConnectionManager.disconnect(connectionId);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error disconnecting SSH:', error);
    return { success: false, error: error.message };
  }
});

// Remove SSH connection
ipcMain.handle('ssh-remove-connection', async (event, connectionId) => {
  try {
    await sshConnectionManager.removeConnection(connectionId);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error removing SSH connection:', error);
    return { success: false, error: error.message };
  }
});

// Get all SSH connections
ipcMain.handle('ssh-get-connections', async () => {
  try {
    const connections = sshConnectionManager.getAllConnections();
    return { success: true, connections };
  } catch (error) {
    console.error('[Main] Error getting SSH connections:', error);
    return { success: false, error: error.message };
  }
});

// Get SSH connection info
ipcMain.handle('ssh-get-connection', async (event, connectionId) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection) {
      return { success: false, error: 'Connection not found' };
    }
    // Return full config including password (user is authenticated to use the app)
    return {
      success: true,
      connection: {
        ...connection.getInfo(),
        password: connection.config.password,
        privateKeyPath: connection.config.privateKeyPath,
        passphrase: connection.config.passphrase,
        name: connection.config.name
      }
    };
  } catch (error) {
    console.error('[Main] Error getting SSH connection:', error);
    return { success: false, error: error.message };
  }
});

// Execute SSH command
ipcMain.handle('ssh-exec-command', async (event, connectionId, command, options = {}) => {
  try {
    const result = await sshConnectionManager.execCommand(connectionId, command, options);
    return { success: true, result };
  } catch (error) {
    console.error('[Main] Error executing SSH command:', error);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - List directory
ipcMain.handle('ssh-list-directory', async (event, connectionId, remotePath) => {
  console.log('[Main][SSH] ========================================');
  console.log('[Main][SSH] ssh-list-directory IPC handler called');
  console.log('[Main][SSH] connectionId:', connectionId);
  console.log('[Main][SSH] remotePath:', remotePath);
  console.log('[Main][SSH] ========================================');

  try {
    console.log('[Main][SSH] Getting connection from manager...');
    const connection = sshConnectionManager.getConnection(connectionId);

    if (!connection) {
      console.error('[Main][SSH] ❌ Connection not found!');
      throw new Error('SSH connection not found');
    }

    console.log('[Main][SSH] ✅ Connection found');
    console.log('[Main][SSH] Connection status:', connection.status);
    console.log('[Main][SSH] Has SFTP?', !!connection.sftp);

    if (!connection.sftp) {
      console.error('[Main][SSH] ❌ SFTP not available for this connection!');
      throw new Error('SFTP not available for this connection');
    }

    console.log('[Main][SSH] ✅ SFTP available, calling readdir...');

    return new Promise((resolve) => {
      connection.sftp.readdir(remotePath, (err, list) => {
        if (err) {
          console.error('[Main][SSH] ❌ SFTP readdir error:', err);
          console.error('[Main][SSH] Error code:', err.code);
          console.error('[Main][SSH] Error message:', err.message);
          resolve({ success: false, error: err.message });
        } else {
          console.log('[Main][SSH] ✅ SFTP readdir succeeded');
          console.log('[Main][SSH] Raw entries count:', list.length);
          console.log('[Main][SSH] First 5 entries:', list.slice(0, 5).map(item => item.filename));

          const entries = list.map(item => ({
            name: item.filename,
            isDirectory: item.attrs.isDirectory(),
            isFile: item.attrs.isFile(),
            size: item.attrs.size,
            mode: item.attrs.mode,
            mtime: new Date(item.attrs.mtime * 1000),
            path: remotePath.endsWith('/') ? remotePath + item.filename : remotePath + '/' + item.filename
          }));

          console.log('[Main][SSH] ✅ Mapped entries:', entries.length);
          console.log('[Main][SSH] Returning success with', entries.length, 'entries');

          resolve({ success: true, entries });
        }
      });
    });
  } catch (error) {
    console.error('[Main][SSH] ❌ Exception in ssh-list-directory:', error);
    console.error('[Main][SSH] Error stack:', error.stack);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - Read file
ipcMain.handle('ssh-read-file', async (event, connectionId, remotePath, encoding = 'utf8') => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection || !connection.sftp) {
      throw new Error('SFTP not available for this connection');
    }

    return new Promise((resolve) => {
      connection.sftp.readFile(remotePath, encoding, (err, data) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true, content: data });
        }
      });
    });
  } catch (error) {
    console.error('[Main] Error reading SSH file:', error);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - Write file
ipcMain.handle('ssh-write-file', async (event, connectionId, remotePath, content, encoding = 'utf8') => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection || !connection.sftp) {
      throw new Error('SFTP not available for this connection');
    }

    return new Promise((resolve) => {
      connection.sftp.writeFile(remotePath, content, encoding, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Main] Error writing SSH file:', error);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - Create directory
ipcMain.handle('ssh-create-directory', async (event, connectionId, remotePath) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection || !connection.sftp) {
      throw new Error('SFTP not available for this connection');
    }

    return new Promise((resolve) => {
      connection.sftp.mkdir(remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Main] Error creating SSH directory:', error);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - Delete file/directory
ipcMain.handle('ssh-delete-item', async (event, connectionId, remotePath, isDirectory = false) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection || !connection.sftp) {
      throw new Error('SFTP not available for this connection');
    }

    return new Promise((resolve) => {
      const operation = isDirectory ? connection.sftp.rmdir : connection.sftp.unlink;
      operation.call(connection.sftp, remotePath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Main] Error deleting SSH item:', error);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - Rename/move item
ipcMain.handle('ssh-rename-item', async (event, connectionId, oldPath, newPath) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection || !connection.sftp) {
      throw new Error('SFTP not available for this connection');
    }

    return new Promise((resolve) => {
      connection.sftp.rename(oldPath, newPath, (err) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  } catch (error) {
    console.error('[Main] Error renaming SSH item:', error);
    return { success: false, error: error.message };
  }
});

// SSH SFTP operations - Get file stats
ipcMain.handle('ssh-get-stats', async (event, connectionId, remotePath) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection || !connection.sftp) {
      throw new Error('SFTP not available for this connection');
    }

    return new Promise((resolve) => {
      connection.sftp.stat(remotePath, (err, stats) => {
        if (err) {
          resolve({ success: false, error: err.message });
        } else {
          resolve({
            success: true,
            stats: {
              isFile: stats.isFile(),
              isDirectory: stats.isDirectory(),
              size: stats.size,
              mode: stats.mode,
              mtime: new Date(stats.mtime * 1000),
              atime: new Date(stats.atime * 1000)
            }
          });
        }
      });
    });
  } catch (error) {
    console.error('[Main] Error getting SSH stats:', error);
    return { success: false, error: error.message };
  }
});

// SSH download file
ipcMain.handle('ssh-download-file', async (event, connectionId, remotePath, localPath) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error('SSH connection not found');
    }

    await connection.ssh.getFile(localPath, remotePath);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error downloading SSH file:', error);
    return { success: false, error: error.message };
  }
});

// SSH upload file
ipcMain.handle('ssh-upload-file', async (event, connectionId, localPath, remotePath) => {
  try {
    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection) {
      throw new Error('SSH connection not found');
    }

    await connection.ssh.putFile(localPath, remotePath);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error uploading SSH file:', error);
    return { success: false, error: error.message };
  }
});

// Get SSH health status
ipcMain.handle('ssh-get-health-status', async () => {
  try {
    const status = sshConnectionManager.getHealthStatus();
    return { success: true, status };
  } catch (error) {
    console.error('[Main] Error getting SSH health status:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// SSH Media Cache IPC Handlers
// ========================================

// SSH Media Cache directory and metadata storage
let sshMediaCacheDir = null;
let sshMediaCacheMetadata = null;

// Initialize SSH Media Cache
ipcMain.handle('ssh-media-cache-init', async () => {
  try {
    // Get cache directory path
    sshMediaCacheDir = path.join(app.getPath('temp'), 'swarm-ssh-cache');

    // Ensure cache directory exists
    await fs.mkdir(sshMediaCacheDir, { recursive: true });

    console.log('[Main] SSH Media Cache initialized:', sshMediaCacheDir);
    return { success: true, cacheDir: sshMediaCacheDir };
  } catch (error) {
    console.error('[Main] Error initializing SSH media cache:', error);
    return { success: false, error: error.message };
  }
});

// Get local path for cached file
ipcMain.handle('ssh-media-cache-get-local-path', async (event, connectionId, fileName) => {
  try {
    if (!sshMediaCacheDir) {
      throw new Error('SSH Media Cache not initialized');
    }

    // Create unique filename with connection ID prefix
    const timestamp = Date.now();
    const uniqueFileName = `${connectionId}_${timestamp}_${fileName}`;
    const localPath = path.join(sshMediaCacheDir, uniqueFileName);

    return { success: true, path: localPath };
  } catch (error) {
    console.error('[Main] Error getting local path for cache:', error);
    return { success: false, error: error.message };
  }
});

// Check if cached file exists
ipcMain.handle('ssh-media-cache-file-exists', async (event, filePath) => {
  try {
    await fs.access(filePath);
    return { success: true, exists: true };
  } catch (error) {
    return { success: true, exists: false };
  }
});

// Delete cached file
ipcMain.handle('ssh-media-cache-delete-file', async (event, filePath) => {
  try {
    await fs.unlink(filePath);
    console.log('[Main] Deleted cached file:', filePath);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error deleting cached file:', error);
    return { success: false, error: error.message };
  }
});

// Clear all cache
ipcMain.handle('ssh-media-cache-clear-all', async () => {
  try {
    if (!sshMediaCacheDir) {
      throw new Error('SSH Media Cache not initialized');
    }

    // Remove all files in cache directory
    const files = await fs.readdir(sshMediaCacheDir);
    for (const file of files) {
      const filePath = path.join(sshMediaCacheDir, file);
      await fs.unlink(filePath);
    }

    console.log('[Main] All SSH media cache cleared');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error clearing SSH media cache:', error);
    return { success: false, error: error.message };
  }
});

// Load cache metadata
ipcMain.handle('ssh-media-cache-load-metadata', async () => {
  try {
    if (!sshMediaCacheDir) {
      return { success: true, metadata: null };
    }

    const metadataPath = path.join(sshMediaCacheDir, 'cache-metadata.json');

    try {
      const data = await fs.readFile(metadataPath, 'utf8');
      sshMediaCacheMetadata = JSON.parse(data);
      console.log('[Main] Loaded SSH media cache metadata');
      return { success: true, metadata: sshMediaCacheMetadata };
    } catch (error) {
      // Metadata file doesn't exist yet, that's okay
      return { success: true, metadata: null };
    }
  } catch (error) {
    console.error('[Main] Error loading SSH media cache metadata:', error);
    return { success: false, error: error.message };
  }
});

// Save cache metadata
ipcMain.handle('ssh-media-cache-save-metadata', async (event, metadata) => {
  try {
    if (!sshMediaCacheDir) {
      throw new Error('SSH Media Cache not initialized');
    }

    const metadataPath = path.join(sshMediaCacheDir, 'cache-metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
    sshMediaCacheMetadata = metadata;

    console.log('[Main] Saved SSH media cache metadata');
    return { success: true };
  } catch (error) {
    console.error('[Main] Error saving SSH media cache metadata:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// Terminal IPC Handlers
// ========================================

// Create terminal (PTY)
ipcMain.handle('terminal-create', async (event, cols, rows, terminalId) => {
  try {
    console.log('[Main] Creating terminal:', { cols, rows, terminalId });

    // Determine shell based on platform
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');
    const cwd = process.env.HOME || process.cwd();

    // Generate unique PTY ID
    const ptyId = `pty-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Spawn PTY
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols,
      rows: rows,
      cwd: cwd,
      env: process.env
    });

    // Store PTY process
    terminals.set(ptyId, ptyProcess);

    // Handle PTY data - send to renderer
    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:data', {
          ptyId: ptyId,
          data: data
        });
      }
    });

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode, signal }) => {
      console.log('[Main] Terminal exited:', { ptyId, exitCode, signal });
      terminals.delete(ptyId);

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('terminal:exit', {
          ptyId: ptyId,
          exitCode: exitCode
        });
      }
    });

    console.log('[Main] Terminal created successfully:', ptyId);
    return { success: true, ptyId: ptyId };
  } catch (error) {
    console.error('[Main] Error creating terminal:', error);
    return { success: false, error: error.message };
  }
});

// Write data to terminal
ipcMain.handle('terminal-write', async (event, ptyId, data) => {
  try {
    const ptyProcess = terminals.get(ptyId);
    if (!ptyProcess) {
      return { success: false, error: 'Terminal not found' };
    }

    ptyProcess.write(data);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error writing to terminal:', error);
    return { success: false, error: error.message };
  }
});

// Resize terminal
ipcMain.handle('terminal-resize', async (event, ptyId, cols, rows) => {
  try {
    const ptyProcess = terminals.get(ptyId);
    if (!ptyProcess) {
      return { success: false, error: 'Terminal not found' };
    }

    ptyProcess.resize(cols, rows);
    console.log('[Main] Terminal resized:', { ptyId, cols, rows });
    return { success: true };
  } catch (error) {
    console.error('[Main] Error resizing terminal:', error);
    return { success: false, error: error.message };
  }
});

// Close terminal
ipcMain.handle('terminal-close', async (event, ptyId) => {
  try {
    const ptyProcess = terminals.get(ptyId);
    if (!ptyProcess) {
      return { success: false, error: 'Terminal not found' };
    }

    ptyProcess.kill();
    terminals.delete(ptyId);
    console.log('[Main] Terminal closed:', ptyId);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error closing terminal:', error);
    return { success: false, error: error.message };
  }
});

// ========================================
// SSH Terminal IPC Handlers
// ========================================

// Create SSH terminal (shell session)
ipcMain.handle('ssh-terminal-create', async (event, connectionId, cols, rows, terminalId) => {
  try {
    console.log('[Main] Creating SSH terminal:', { connectionId, cols, rows, terminalId });

    const connection = sshConnectionManager.getConnection(connectionId);
    if (!connection) {
      console.error('[Main] SSH connection not found:', connectionId);
      return { success: false, error: 'SSH connection not found' };
    }

    // Get underlying ssh2 client from node-ssh wrapper
    const ssh2Client = connection.ssh.connection;

    if (!ssh2Client) {
      console.error('[Main] SSH2 client not available');
      return { success: false, error: 'SSH connection not established' };
    }

    return new Promise((resolve, reject) => {
      ssh2Client.shell({ cols, rows, term: 'xterm-256color' }, (err, stream) => {
        if (err) {
          console.error('[Main] Error creating SSH shell:', err);
          return resolve({ success: false, error: err.message });
        }

        const sshTermId = `ssh-term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        sshTerminals.set(sshTermId, { stream, connectionId, closed: false });

        // Forward SSH stream data to renderer
        stream.on('data', (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', {
              ptyId: sshTermId,
              data: data.toString('utf-8')
            });
          }
        });

        // Handle stream close
        stream.on('close', () => {
          console.log('[Main] SSH terminal closed:', sshTermId);
          const terminal = sshTerminals.get(sshTermId);
          if (terminal) {
            terminal.closed = true;
          }
          sshTerminals.delete(sshTermId);
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:exit', {
              ptyId: sshTermId,
              exitCode: 0
            });
          }
        });

        // Handle stream errors (including EPIPE)
        stream.on('error', (error) => {
          console.error('[Main] SSH terminal stream error:', sshTermId, error.message);
          const terminal = sshTerminals.get(sshTermId);
          if (terminal) {
            terminal.closed = true;
          }
          // Don't delete terminal here, let close event handle it
        });

        // Handle stderr data
        stream.stderr.on('data', (data) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('terminal:data', {
              ptyId: sshTermId,
              data: data.toString('utf-8')
            });
          }
        });

        console.log('[Main] SSH terminal created successfully:', sshTermId);
        resolve({ success: true, ptyId: sshTermId });
      });
    });
  } catch (error) {
    console.error('[Main] Error creating SSH terminal:', error);
    return { success: false, error: error.message };
  }
});

// Write data to SSH terminal
ipcMain.handle('ssh-terminal-write', async (event, sshTermId, data) => {
  try {
    const terminal = sshTerminals.get(sshTermId);
    if (!terminal) {
      return { success: false, error: 'SSH terminal not found' };
    }

    // Check if stream is closed (EPIPE protection)
    if (terminal.closed || terminal.stream.destroyed) {
      console.warn('[Main] Attempted to write to closed SSH terminal:', sshTermId);
      return { success: false, error: 'Terminal closed' };
    }

    // Check if stream is writable
    if (!terminal.stream.writable) {
      console.warn('[Main] SSH terminal stream not writable:', sshTermId);
      return { success: false, error: 'Stream not writable' };
    }

    terminal.stream.write(data);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error writing to SSH terminal:', error);
    // Mark as closed if we get EPIPE
    const terminal = sshTerminals.get(sshTermId);
    if (terminal && error.code === 'EPIPE') {
      terminal.closed = true;
    }
    return { success: false, error: error.message };
  }
});

// Resize SSH terminal
ipcMain.handle('ssh-terminal-resize', async (event, sshTermId, cols, rows) => {
  try {
    const terminal = sshTerminals.get(sshTermId);
    if (!terminal) {
      return { success: false, error: 'SSH terminal not found' };
    }

    // Check if stream is closed (EPIPE protection)
    if (terminal.closed || terminal.stream.destroyed) {
      console.warn('[Main] Attempted to resize closed SSH terminal:', sshTermId);
      return { success: false, error: 'Terminal closed' };
    }

    terminal.stream.setWindow(rows, cols);
    console.log('[Main] SSH terminal resized:', { sshTermId, cols, rows });
    return { success: true };
  } catch (error) {
    console.error('[Main] Error resizing SSH terminal:', error);
    // Mark as closed if we get EPIPE
    const terminal = sshTerminals.get(sshTermId);
    if (terminal && error.code === 'EPIPE') {
      terminal.closed = true;
    }
    return { success: false, error: error.message };
  }
});

// Close SSH terminal
ipcMain.handle('ssh-terminal-close', async (event, sshTermId) => {
  try {
    const terminal = sshTerminals.get(sshTermId);
    if (!terminal) {
      return { success: false, error: 'SSH terminal not found' };
    }

    terminal.stream.close();
    sshTerminals.delete(sshTermId);
    console.log('[Main] SSH terminal closed:', sshTermId);
    return { success: true };
  } catch (error) {
    console.error('[Main] Error closing SSH terminal:', error);
    return { success: false, error: error.message };
  }
});


// Track loaded extensions per session
const loadedExtensions = new Map(); // session -> Set of extension IDs

/**
 * Load browser extensions into a specific session
 */
async function loadBrowserExtensionsForSession(sessionInstance, sessionName = 'default') {
  const homeDir = os.homedir();
  const extensionBasePath = path.join(homeDir, '.config', 'chromium', 'Default', 'Extensions');

  if (!loadedExtensions.has(sessionName)) {
    loadedExtensions.set(sessionName, new Set());
  }

  for (const ext of BROWSER_EXTENSIONS) {
    if (!ext.enabled) {
      console.log(`[MAIN] Skipping disabled extension: ${ext.name} for session ${sessionName}`);
      continue;
    }

    // Skip if already loaded for this session
    if (loadedExtensions.get(sessionName).has(ext.id)) {
      console.log(`[MAIN] Extension already loaded: ${ext.name} for session ${sessionName}`);
      continue;
    }

    try {
      const extPath = path.join(extensionBasePath, ext.id);

      // Check if extension directory exists
      const extDirExists = await fs.access(extPath).then(() => true).catch(() => false);
      if (!extDirExists) {
        console.warn(`[MAIN] Extension not found: ${ext.name} at ${extPath}`);
        continue;
      }

      // Find the version directory (usually only one)
      const versions = await fs.readdir(extPath);
      if (versions.length === 0) {
        console.warn(`[MAIN] No version found for extension: ${ext.name}`);
        continue;
      }

      // Use the first (and usually only) version
      const versionPath = path.join(extPath, versions[0]);

      // Load the extension into the specific session
      await sessionInstance.loadExtension(versionPath, {
        allowFileAccess: true
      });

      loadedExtensions.get(sessionName).add(ext.id);
      console.log(`[MAIN] ✅ Loaded browser extension: ${ext.name} (${ext.id}) into session ${sessionName}`);
    } catch (error) {
      console.error(`[MAIN] Failed to load extension ${ext.name} into session ${sessionName}:`, error.message);
    }
  }
}

/**
 * Load browser extensions into all common sessions
 */
async function loadBrowserExtensions() {
  // Load into default session
  await loadBrowserExtensionsForSession(session.defaultSession, 'default');

  // Load into default profile session (used by BrowserViews)
  const profileSession = session.fromPartition('persist:profile-default');
  await loadBrowserExtensionsForSession(profileSession, 'profile-default');
}

app.whenReady().then(async () => {
  // Initialize crash logger
  await crashLogger.init();
  console.log('[MAIN] Crash logger initialized');

  // Load browser extensions
  await loadBrowserExtensions();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('quit', async () => {
  await languageServerManager.shutdownAll();
  await sshConnectionManager.shutdown();
});

// Dialog IPC handlers for SSH Import/Export
ipcMain.handle('show-open-dialog', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return result;
  } catch (error) {
    console.error('[Main] Error showing open dialog:', error);
    return { canceled: true, error: error.message };
  }
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return result;
  } catch (error) {
    console.error('[Main] Error showing save dialog:', error);
    return { canceled: true, error: error.message };
  }
});

// Browse for file dialog - used for SSH key selection
ipcMain.handle('browse-for-file', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options.title || 'Select File',
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
      properties: ['openFile']
    });
    return result;
  } catch (error) {
    console.error('[Main] Error showing file browser:', error);
    return { canceled: true, error: error.message };
  }
});
