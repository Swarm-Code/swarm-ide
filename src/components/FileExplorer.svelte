<script>
  import { onMount, onDestroy } from 'svelte';
  import { fileExplorerStore } from '../stores/fileExplorerStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { workspaceStore, activeWorkspacePath } from '../stores/workspaceStore.js';
  import { sshService } from '../services/SSHService.js';
  import FileTreeNode from './FileTreeNode.svelte';
  import ContextMenu from './ContextMenu.svelte';

  export let projectPath = null;

  let fileTree = [];
  let expandedFolders = new Set();
  let selectedFile = null;
  let currentWorkspacePath = null;
  let contextMenuVisible = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let isDragOver = false;
  let showMindPanel = false;
  let mindFiles = [];
  let newMindName = '';
  
  // Auto-refresh interval
  let refreshInterval = null;
  const REFRESH_INTERVAL_MS = 500;

  fileExplorerStore.subscribe((state) => {
    console.log('[FileExplorer] 📊 Store updated:', {
      fileTreeLength: state.fileTree.length,
      expandedFolders: state.expandedFolders.size,
      selectedFile: state.selectedFile?.name
    });
    fileTree = state.fileTree;
    expandedFolders = state.expandedFolders;
    selectedFile = state.selectedFile;
  });

  let activeWorkspace = null;
  
  workspaceStore.subscribe((state) => {
    const workspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    const workspaceChanged = workspace?.id !== activeWorkspace?.id;
    const sshMetadataChanged = workspace && activeWorkspace && 
                                workspace.id === activeWorkspace.id && 
                                workspace.isSSH !== activeWorkspace.isSSH;
    
    if (workspaceChanged || sshMetadataChanged) {
      console.log('[FileExplorer] 🔄 Workspace state changed:', {
        oldId: activeWorkspace?.id,
        newId: workspace?.id,
        oldIsSSH: activeWorkspace?.isSSH,
        newIsSSH: workspace?.isSSH,
        path: workspace?.path,
        connectionId: workspace?.sshConnection?.id,
        changed: workspaceChanged ? 'workspace' : 'metadata'
      });
      activeWorkspace = workspace;
      
      // When workspace changes or SSH metadata updates, load its directory
      if (workspace?.isSSH && workspace?.sshConnection?.id) {
        console.log('[FileExplorer] 🚀 SSH workspace detected, loading directory...');
        console.log('[FileExplorer] Connection ID:', workspace.sshConnection.id);
        console.log('[FileExplorer] Workspace path:', workspace.path);
        
        // Extract remote path from workspace
        let remotePath = workspace.path;
        
        // If path starts with ssh://, it's from WelcomeScreen (format: ssh://user@host:port)
        // Otherwise it's a direct path like /root/test from "Open in Workspace"
        if (remotePath.startsWith('ssh://')) {
          // Extract path after port, or default to /root
          // Format: ssh://user@host:port/path or ssh://user@host:port
          const afterProto = remotePath.split('://')[1]; // user@host:port/path
          const pathStart = afterProto.indexOf('/');
          remotePath = pathStart >= 0 ? afterProto.substring(pathStart) : '/root';
        }
        
        console.log('[FileExplorer] Extracted remote path:', remotePath);
        loadSSHDirectory(workspace.sshConnection.id, remotePath);
      } else if (workspace?.path && !workspace.path.startsWith('ssh://')) {
        console.log('[FileExplorer] 📂 Local workspace detected, loading directory...');
        loadDirectory(workspace.path);
      } else {
        console.log('[FileExplorer] ⚠️ Workspace state unclear:', {
          hasPath: !!workspace?.path,
          isSSHPath: workspace?.path?.startsWith('ssh://'),
          hasSSHFlag: workspace?.isSSH,
          hasConnection: !!workspace?.sshConnection
        });
      }
    }
  });

  // Subscribe to workspace path changes and reload tree
  activeWorkspacePath.subscribe(async (path) => {
    console.log('[FileExplorer] 📍 Path changed:', path, 'Current:', currentWorkspacePath);
    if (path && path !== currentWorkspacePath) {
      currentWorkspacePath = path;
      // Clear selected file when switching workspaces
      fileExplorerStore.clearSelection();
      
      console.log('[FileExplorer] Active workspace:', activeWorkspace);
      
      // Check if this is an SSH workspace
      if (activeWorkspace?.isSSH) {
        console.log('[FileExplorer] 🔌 SSH workspace detected, loading via SFTP');
        console.log('[FileExplorer] Workspace path:', activeWorkspace.path);
        
        // Extract remote path from workspace
        let remotePath = activeWorkspace.path;
        
        // If path starts with ssh://, extract the path portion
        if (remotePath.startsWith('ssh://')) {
          const afterProto = remotePath.split('://')[1]; // user@host:port/path
          const pathStart = afterProto.indexOf('/');
          remotePath = pathStart >= 0 ? afterProto.substring(pathStart) : '/root';
        }
        
        console.log('[FileExplorer] Extracted remote path:', remotePath);
        await loadSSHDirectory(activeWorkspace.sshConnection.id, remotePath);
      } else if (!path.startsWith('ssh://')) {
        console.log('[FileExplorer] 💻 Local workspace detected');
        await loadDirectory(path);
      } else {
        console.log('[FileExplorer] ⚠️ SSH path but not marked as SSH workspace, clearing tree');
        fileTree = [];
      }
    }
  });

  onMount(async () => {
    console.log('[FileExplorer] 🎬 MOUNTED');
    const initialPath = currentWorkspacePath || projectPath;
    console.log('[FileExplorer] Initial path:', initialPath);
    console.log('[FileExplorer] Active workspace:', activeWorkspace);
    
    // Get current workspace state
    let currentState;
    const unsub = workspaceStore.subscribe(s => { currentState = s; });
    unsub();
    
    console.log('[FileExplorer] Workspace store state:', {
      workspaceCount: currentState?.workspaces?.length,
      activeId: currentState?.activeWorkspaceId,
      allWorkspaces: currentState?.workspaces?.map(w => ({ id: w.id, isSSH: w.isSSH, path: w.path }))
    });
    
    if (activeWorkspace?.isSSH) {
      console.log('[FileExplorer] 🔌 Loading SSH directory on mount');
      console.log('[FileExplorer] Loading SSH dir for connection:', activeWorkspace.sshConnection.id);
      console.log('[FileExplorer] Workspace path on mount:', activeWorkspace.path);
      
      // Extract remote path from workspace
      let remotePath = activeWorkspace.path;
      
      // If path starts with ssh://, extract the path portion
      if (remotePath.startsWith('ssh://')) {
        const afterProto = remotePath.split('://')[1]; // user@host:port/path
        const pathStart = afterProto.indexOf('/');
        remotePath = pathStart >= 0 ? afterProto.substring(pathStart) : '/root';
      }
      
      console.log('[FileExplorer] Extracted remote path on mount:', remotePath);
      await loadSSHDirectory(activeWorkspace.sshConnection.id, remotePath);
    } else if (initialPath && !initialPath.startsWith('ssh://')) {
      console.log('[FileExplorer] 💻 Loading local directory on mount');
      await loadDirectory(initialPath);
    }
    
    // Start auto-refresh for file system changes
    startAutoRefresh();
  });
  
  onDestroy(() => {
    stopAutoRefresh();
  });

  async function loadDirectory(path, silent = false) {
    if (!window.electronAPI) {
      console.error('Electron API not available');
      return;
    }
    
    // Skip if SSH path
    if (path.startsWith('ssh://')) {
      return;
    }
    const items = await window.electronAPI.readDirectory(path);
    
    // Only update if there are actual changes (compare stringified versions)
    const currentTreeString = JSON.stringify(fileTree);
    const newTreeString = JSON.stringify(items);
    
    if (currentTreeString !== newTreeString) {
      if (!silent) {
        console.log('[FileExplorer] 🔄 File tree changed, updating...');
      }
      fileExplorerStore.setFileTree(items);
    }
  }
  
  async function loadSSHDirectorySilent(connectionId, remotePath) {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.sshSftpReadDir(connectionId, remotePath);
      
      if (!result.success) return;

      // Only update if there are actual changes
      const currentTreeString = JSON.stringify(fileTree);
      const newTreeString = JSON.stringify(result.items);
      
      if (currentTreeString !== newTreeString) {
        console.log('[FileExplorer] 🔄 SSH file tree changed, updating...');
        fileExplorerStore.setFileTree(result.items);
      }
    } catch (error) {
      // Silently fail on refresh errors
    }
  }
  
  function startAutoRefresh() {
    stopAutoRefresh();
    
    refreshInterval = setInterval(async () => {
      if (activeWorkspace?.isSSH && activeWorkspace?.sshConnection?.id) {
        // SSH workspace refresh
        let remotePath = activeWorkspace.path;
        if (remotePath.startsWith('ssh://')) {
          const afterProto = remotePath.split('://')[1];
          const pathStart = afterProto.indexOf('/');
          remotePath = pathStart >= 0 ? afterProto.substring(pathStart) : '/root';
        }
        await loadSSHDirectorySilent(activeWorkspace.sshConnection.id, remotePath);
      } else if (currentWorkspacePath && !currentWorkspacePath.startsWith('ssh://')) {
        // Local workspace refresh
        await loadDirectory(currentWorkspacePath, true);
      }
    }, REFRESH_INTERVAL_MS);
  }
  
  function stopAutoRefresh() {
    if (refreshInterval) {
      clearInterval(refreshInterval);
      refreshInterval = null;
    }
  }

  async function loadSSHDirectory(connectionId, remotePath, retryCount = 0) {
    if (!window.electronAPI) {
      console.error('[FileExplorer] ❌ Electron API not available');
      return;
    }

    try {
      console.log('[FileExplorer] 📂 Loading SSH directory:', remotePath, 'for connection:', connectionId, '(attempt', retryCount + 1, ')');
      const result = await window.electronAPI.sshSftpReadDir(connectionId, remotePath);
      
      console.log('[FileExplorer] 📦 SFTP readdir result:', result);
      
      if (!result.success) {
        // If connection not found and this is an early retry, wait and retry
        if (result.error.includes('not found') && retryCount < 5) {
          const delay = 500 * (retryCount + 1); // Exponential backoff: 500ms, 1s, 1.5s, 2s, 2.5s
          console.log('[FileExplorer] ⏳ Connection not ready, retrying in', delay, 'ms...');
          setTimeout(() => {
            loadSSHDirectory(connectionId, remotePath, retryCount + 1);
          }, delay);
          return;
        }
        
        console.error('[FileExplorer] ❌ Failed to load SSH directory after', retryCount + 1, 'attempts:', result.error);
        return;
      }

      console.log('[FileExplorer] ✅ Loaded', result.items.length, 'items');
      console.log('[FileExplorer] 🔍 Item structure sample:', result.items[0]);
      console.log('[FileExplorer] 🔍 All items:', result.items.map(i => ({ name: i.name, isDirectory: i.isDirectory, path: i.path })));
      
      console.log('[FileExplorer] 🎯 About to call setFileTree with', result.items.length, 'items');
      fileExplorerStore.setFileTree(result.items);
      console.log('[FileExplorer] ✨ setFileTree called successfully');
    } catch (error) {
      console.error('[FileExplorer] ❌ Error loading SSH directory:', error);
    }
  }

  async function loadMindFiles() {
    if (!window.electronAPI || !currentWorkspacePath) return;
    
    const result = await window.electronAPI.mindList(currentWorkspacePath);
    if (result.success) {
      mindFiles = result.files;
    }
  }

  async function handleCreateMind() {
    if (!newMindName.trim() || !currentWorkspacePath || !window.electronAPI) return;
    
    const name = newMindName.trim();
    
    const result = await window.electronAPI.mindWrite({
      workspacePath: currentWorkspacePath,
      name,
      content: '<p>Start writing...</p>'
    });
    
    if (result.success) {
      editorStore.openMind(name, '<p>Start writing...</p>');
      await loadMindFiles();
      newMindName = '';
    }
  }

  async function handleOpenMind(name) {
    if (!currentWorkspacePath || !window.electronAPI) return;
    
    const result = await window.electronAPI.mindRead({
      workspacePath: currentWorkspacePath,
      name
    });
    
    if (result.success) {
      editorStore.openMind(name, result.content);
    }
  }

  async function handleDeleteMind(name, event) {
    event.stopPropagation();
    
    if (!confirm(`Delete mind "${name}"?`)) return;
    
    if (!currentWorkspacePath || !window.electronAPI) return;
    
    const result = await window.electronAPI.mindDelete({
      workspacePath: currentWorkspacePath,
      name
    });
    
    if (result.success) {
      await loadMindFiles();
    }
  }

  $: if (showMindPanel && currentWorkspacePath) {
    loadMindFiles();
  }

  function handleContextMenu(event) {
    event.preventDefault();
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuVisible = true;
  }

  function closeContextMenu() {
    contextMenuVisible = false;
  }

  async function handleGoToParent() {
    let currentWorkspaces = [];
    let activeWorkspaceId = null;
    let workspacePath = null;
    
    const unsubscribe = workspaceStore.subscribe((state) => {
      currentWorkspaces = state.workspaces;
      activeWorkspaceId = state.activeWorkspaceId;
      const activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      workspacePath = activeWorkspace?.path;
    });
    unsubscribe();
    
    if (!workspacePath) return;
    
    const separator = workspacePath.includes('\\') ? '\\' : '/';
    const parts = workspacePath.split(/[\\/]/);
    parts.pop();
    const parentPath = parts.join(separator);
    
    if (!parentPath) return;
    
    if (activeWorkspaceId) {
      workspaceStore.updateWorkspace(activeWorkspaceId, { path: parentPath });
      
      if (window.electronAPI) {
        const updatedWorkspaces = currentWorkspaces.map(w => 
          w.id === activeWorkspaceId ? { ...w, path: parentPath } : w
        );
        await window.electronAPI.workspaceSave(updatedWorkspaces);
      }
    }
    
    closeContextMenu();
  }

  async function handleOpenInExplorer() {
    if (!window.electronAPI || !currentWorkspacePath) return;
    await window.electronAPI.openInExplorer(currentWorkspacePath);
    closeContextMenu();
  }

  // Drag and drop handlers for root-level drops
  function handleExplorerDragEnter(event) {
    event.preventDefault();
    event.stopPropagation();
    isDragOver = true;
  }

  function handleExplorerDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleExplorerDragLeave(event) {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      isDragOver = false;
    }
  }

  async function handleExplorerDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    isDragOver = false;

    if (!window.electronAPI || !currentWorkspacePath) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    try {
      const existingContents = await window.electronAPI.readDirectory(currentWorkspacePath);
      const existingNames = new Set(existingContents.map(f => f.name));

      for (const file of files) {
        const fileName = file.name;
        let destinationPath = `${currentWorkspacePath}/${fileName}`;
        let finalFileName = fileName;

        if (existingNames.has(fileName)) {
          let counter = 1;
          const nameParts = fileName.split('.');
          const hasExtension = nameParts.length > 1;
          const ext = hasExtension ? nameParts.pop() : '';
          const baseName = nameParts.join('.');

          while (existingNames.has(finalFileName)) {
            if (hasExtension) {
              finalFileName = `${baseName} (${counter}).${ext}`;
            } else {
              finalFileName = `${fileName} (${counter})`;
            }
            counter++;
          }
          destinationPath = `${currentWorkspacePath}/${finalFileName}`;
          existingNames.add(finalFileName);
        }

        const result = await window.electronAPI.copyPath({
          sourcePath: file.path,
          destinationPath: destinationPath
        });

        if (!result.success) {
          console.error('Copy failed:', result.error);
          alert(`Failed to copy ${fileName}: ${result.error}`);
        }
      }

      await loadDirectory(currentWorkspacePath);
    } catch (error) {
      console.error('Drop error:', error);
      alert(`Failed to copy files: ${error.message}`);
    }
  }

  $: explorerContextMenuItems = [
    {
      label: 'Open in File Explorer',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
      action: handleOpenInExplorer,
    },
    {
      label: 'Go to Parent Folder',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>',
      action: handleGoToParent,
    },
  ];
</script>

<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="file-explorer"
  class:drag-over={isDragOver}
  on:contextmenu={handleContextMenu}
  on:dragenter={handleExplorerDragEnter}
  on:dragover={handleExplorerDragOver}
  on:dragleave={handleExplorerDragLeave}
  on:drop={handleExplorerDrop}
  role="tree"
  tabindex="-1"
>
  <div class="mind-section">
    <button 
      class="mind-toggle" 
      class:active={showMindPanel}
      on:click={() => showMindPanel = !showMindPanel}
    >
      <svg class="chevron" class:open={showMindPanel} viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 4l4 4-4 4" />
      </svg>
      <span>🧠 Mind</span>
    </button>

    {#if showMindPanel}
      <div class="mind-panel">
        <div class="mind-create">
          <input
            type="text"
            class="mind-input"
            bind:value={newMindName}
            placeholder="New mind note..."
            on:keydown={(e) => e.key === 'Enter' && handleCreateMind()}
          />
          <button class="mind-create-btn" on:click={handleCreateMind} disabled={!newMindName.trim()}>
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 4v8m-4-4h8" />
            </svg>
          </button>
        </div>

        <div class="mind-list">
          {#each mindFiles as mind}
            <button class="mind-item" on:click={() => handleOpenMind(mind.name)}>
              <span class="mind-name">{mind.name}</span>
              <button class="mind-delete" on:click={(e) => handleDeleteMind(mind.name, e)} title="Delete">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4l8 8m0-8l-8 8" />
                </svg>
              </button>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <div class="file-list">
    {#if fileTree.length === 0}
      <div class="empty-state">
        <p>No files found</p>
      </div>
    {:else}
      {#each fileTree as item}
        <FileTreeNode {item} {selectedFile} level={0} />
      {/each}
    {/if}
  </div>
  
  <!-- Debug overlay -->
  {#if fileTree.length > 0}
    <div style="position: fixed; bottom: 10px; right: 10px; background: rgba(0,0,0,0.8); color: white; padding: 10px; font-size: 12px; border-radius: 4px; z-index: 9999;">
      <div>FileTree items: {fileTree.length}</div>
      <div>Active workspace: {activeWorkspace?.id || 'none'}</div>
      <div>Is SSH: {activeWorkspace?.isSSH || false}</div>
    </div>
  {/if}
</div>

<ContextMenu
  visible={contextMenuVisible}
  x={contextMenuX}
  y={contextMenuY}
  items={explorerContextMenuItems}
  on:close={closeContextMenu}
/>

<style>
  .file-explorer {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface);
    transition: all var(--transition-fast);
  }

  .file-explorer.drag-over {
    background-color: var(--color-accent);
    opacity: 0.3;
    border: 3px dashed var(--color-accent);
  }

  .mind-section {
    border-bottom: 1px solid var(--color-border);
  }

  .mind-toggle {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: transparent;
    border: none;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mind-toggle:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .mind-toggle.active {
    color: var(--color-text-primary);
  }

  .chevron {
    width: 12px;
    height: 12px;
    transition: transform var(--transition-fast);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .mind-panel {
    padding: var(--spacing-sm);
    background-color: var(--color-surface-hover);
  }

  .mind-create {
    display: flex;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-sm);
  }

  .mind-input {
    flex: 1;
    padding: var(--spacing-xs);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    outline: none;
  }

  .mind-input:focus {
    border-color: var(--color-accent);
  }

  .mind-create-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-accent);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mind-create-btn:hover:not(:disabled) {
    background-color: var(--color-accent-hover);
  }

  .mind-create-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .mind-create-btn svg {
    width: 14px;
    height: 14px;
  }

  .mind-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mind-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: var(--color-surface);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mind-item:hover {
    background-color: var(--color-surface-secondary);
  }

  .mind-name {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mind-delete {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    opacity: 0;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .mind-item:hover .mind-delete {
    opacity: 1;
  }

  .mind-delete:hover {
    background-color: var(--color-error);
    color: white;
  }

  .mind-delete svg {
    width: 12px;
    height: 12px;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-xs);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-xl);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }
</style>
