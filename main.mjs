import { app, BrowserWindow, ipcMain, dialog, WebContentsView, Menu, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import Store from 'electron-store';
import os from 'os';
import pty from 'node-pty';
import { lspServerManager } from './lsp-server-manager.mjs';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

// Browser management
const browsers = new Map(); // browserId -> WebContentsView
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
    
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      }
    });

    // Set User-Agent to Chrome on Windows to prevent content blocking
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
    view.webContents.setUserAgent(userAgent);

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

// Track previous bounds to avoid redundant updates
const browserBounds = new Map(); // browserId -> bounds

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
    
    // Use exact bounds - no safety inset (browser-content div already has containment)
    const clampedBounds = {
      x: Math.max(0, Math.min(bounds.x, windowBounds.width)),
      y: Math.max(0, Math.min(bounds.y, windowBounds.height)),
      width: Math.max(0, Math.min(bounds.width, windowBounds.width - bounds.x)),
      height: Math.max(0, Math.min(bounds.height, windowBounds.height - bounds.y))
    };
    
    // Log if clamping was necessary
    if (clampedBounds.x !== bounds.x || 
        clampedBounds.y !== bounds.y || 
        clampedBounds.width !== bounds.width || 
        clampedBounds.height !== bounds.height) {

    }

    // Add view at index 0 to keep it BELOW main window's webContents
    // This allows DOM elements (dropdowns, modals) to render ABOVE the browser
    const contentView = mainWindow.contentView;
    

    
    // 🔧 FIX 2: Only add view if not already present - REMOVE the re-order cycle
    if (!contentView.children.includes(view)) {

      contentView.addChildView(view, 0);
    } else {

    }

    // Set bounds (using clamped values to ensure they fit in window)
    const roundedBounds = {
      x: Math.round(clampedBounds.x),
      y: Math.round(clampedBounds.y),
      width: Math.round(clampedBounds.width),
      height: Math.round(clampedBounds.height)
    };
    
    view.setBounds(roundedBounds);
    


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

// Destroy browser
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

    // Close the webContents
    if (!view.webContents.isDestroyed()) {
      view.webContents.close();
    }

    // Clean up cached bounds
    browserBounds.delete(browserId);
    
    // Clear focus tracking if this browser was focused
    if (currentlyFocusedBrowserId === browserId) {

      currentlyFocusedBrowserId = null;
    }
    
    browsers.delete(browserId);
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
