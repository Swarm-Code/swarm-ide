const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getRecentProjects: () => ipcRenderer.invoke('store:getRecentProjects'),
  readDirectory: (path) => ipcRenderer.invoke('fs:readDirectory', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  openInExplorer: (path) => ipcRenderer.invoke('fs:openInExplorer', path),
  // Workspace APIs
  workspaceGetAll: () => ipcRenderer.invoke('workspace:getAll'),
  workspaceSave: (workspaces) => ipcRenderer.invoke('workspace:save', workspaces),
  workspaceGetActive: () => ipcRenderer.invoke('workspace:getActive'),
  workspaceSetActive: (workspaceId) => ipcRenderer.invoke('workspace:setActive', workspaceId),
  workspaceClear: () => ipcRenderer.invoke('workspace:clear'),
  workspaceGetLastSession: () => ipcRenderer.invoke('workspace:getLastSession'),
  workspaceRestoreSession: () => ipcRenderer.invoke('workspace:restoreSession'),
  // Terminal APIs
  terminalCreate: (opts) => ipcRenderer.invoke('terminal:create', opts),
  terminalWrite: (opts) => ipcRenderer.invoke('terminal:write', opts),
  terminalResize: (opts) => ipcRenderer.invoke('terminal:resize', opts),
  terminalKill: (opts) => ipcRenderer.invoke('terminal:kill', opts),
  onTerminalData: (callback) => ipcRenderer.on('terminal:data', (event, data) => callback(data)),
  onTerminalExit: (callback) => ipcRenderer.on('terminal:exit', (event, data) => callback(data)),
  // LSP APIs
  lspStartServer: (opts) => ipcRenderer.invoke('lsp:startServer', opts),
  lspSendMessage: (opts) => ipcRenderer.invoke('lsp:sendMessage', opts),
  lspStopServer: (opts) => ipcRenderer.invoke('lsp:stopServer', opts),
  onLspMessage: (callback) => ipcRenderer.on('lsp:message', (event, data) => callback(data)),
  // Browser APIs
  browserCreate: (opts) => ipcRenderer.invoke('browser:create', opts),
  browserSetBounds: (opts) => ipcRenderer.invoke('browser:setBounds', opts),
  browserHide: (opts) => ipcRenderer.invoke('browser:hide', opts),
  browserNavigate: (opts) => ipcRenderer.invoke('browser:navigate', opts),
  browserGoBack: (opts) => ipcRenderer.invoke('browser:goBack', opts),
  browserGoForward: (opts) => ipcRenderer.invoke('browser:goForward', opts),
  browserReload: (opts) => ipcRenderer.invoke('browser:reload', opts),
  browserStop: (opts) => ipcRenderer.invoke('browser:stop', opts),
  browserDestroy: (opts) => ipcRenderer.invoke('browser:destroy', opts),
  browserFocus: (opts) => ipcRenderer.invoke('browser:focus', opts),
  onBrowserNavigation: (callback) => ipcRenderer.on('browser:navigation', (event, data) => callback(data)),
  onBrowserTitle: (callback) => ipcRenderer.on('browser:title', (event, data) => callback(data)),
  onBrowserLoading: (callback) => ipcRenderer.on('browser:loading', (event, data) => callback(data)),
  onBrowserError: (callback) => ipcRenderer.on('browser:error', (event, data) => callback(data)),
  onBrowserKeyboardNav: (callback) => ipcRenderer.on('browser:keyboard-nav', (event, data) => callback(data)),
  // Overlay management
  browsersHideForOverlay: () => ipcRenderer.invoke('browsers:hideForOverlay'),
  browsersShowAfterOverlay: () => ipcRenderer.invoke('browsers:showAfterOverlay'),
  onBrowsersRepositionAfterOverlay: (callback) => ipcRenderer.on('browsers:repositionAfterOverlay', () => callback()),
  // Mind file APIs
  mindList: (workspacePath) => ipcRenderer.invoke('mind:list', workspacePath),
  mindRead: (opts) => ipcRenderer.invoke('mind:read', opts),
  mindWrite: (opts) => ipcRenderer.invoke('mind:write', opts),
  mindDelete: (opts) => ipcRenderer.invoke('mind:delete', opts),
});
