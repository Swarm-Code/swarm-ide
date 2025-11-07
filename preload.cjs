const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getRecentProjects: () => ipcRenderer.invoke('store:getRecentProjects'),
  readDirectory: (path) => ipcRenderer.invoke('fs:readDirectory', path),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
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
});
