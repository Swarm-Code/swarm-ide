const { app, BrowserWindow, BrowserView, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const videoService = require('./src/services/VideoService');
const languageServerManager = require('./src/services/LanguageServerManager');
const crashLogger = require('./src/services/CrashLogger');
const FileWatcherService = require('./src/services/FileWatcherService');

let mainWindow;
const browserViews = new Map(); // tabId -> BrowserView
const fileWatcher = new FileWatcherService(); // Global file watcher instance

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
      contextIsolation: true,
      nodeIntegration: false
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

ipcMain.handle('browser-create-view', async (event, tabId, bounds) => {
  try {
    console.log('[Main] Creating BrowserView for tab:', tabId, 'with bounds:', bounds);

    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        partition: `persist:browser-${tabId}` // Isolated session per tab
      }
    });

    // Set bounds
    view.setBounds({
      x: bounds.x || 0,
      y: bounds.y || 80,
      width: bounds.width || 800,
      height: bounds.height || 600
    });

    // Auto-resize with window
    view.setAutoResize({
      width: true,
      height: true,
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

app.whenReady().then(async () => {
  // Initialize crash logger
  await crashLogger.init();
  console.log('[MAIN] Crash logger initialized');

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
});
