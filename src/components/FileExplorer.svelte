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
  
  // Search state
  let showSearch = false;
  let searchQuery = '';
  let searchResults = [];
  
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

  // Deep compare trees to check if anything actually changed
  function treesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i].name !== b[i].name || 
          a[i].path !== b[i].path || 
          a[i].isDirectory !== b[i].isDirectory) {
        return false;
      }
    }
    return true;
  }

  // Deep merge that preserves children and returns same reference if unchanged
  function mergeTreeItems(currentTree, newItems) {
    let hasChanges = false;
    
    if (currentTree.length !== newItems.length) {
      hasChanges = true;
    }
    
    const merged = newItems.map(newItem => {
      const existing = currentTree.find(f => f.path === newItem.path);
      
      if (!existing) {
        hasChanges = true;
        return newItem;
      }
      
      // Check if item properties changed
      if (existing.name !== newItem.name || 
          existing.isDirectory !== newItem.isDirectory) {
        hasChanges = true;
        return existing.children 
          ? { ...newItem, children: existing.children }
          : newItem;
      }
      
      // Return existing reference to prevent re-render
      return existing;
    });
    
    // Check for removed items
    if (!hasChanges) {
      for (const curr of currentTree) {
        if (!newItems.find(n => n.path === curr.path)) {
          hasChanges = true;
          break;
        }
      }
    }
    
    return hasChanges ? merged : null;
  }

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
    
    // Merge and only update if there are actual changes
    const merged = mergeTreeItems(fileTree, items);
    if (merged) {
      if (!silent) {
        console.log('[FileExplorer] 🔄 File tree changed, updating...');
      }
      fileExplorerStore.setFileTree(merged);
    }
  }
  
  async function loadSSHDirectorySilent(connectionId, remotePath) {
    if (!window.electronAPI) return;

    try {
      const result = await window.electronAPI.sshSftpReadDir(connectionId, remotePath);
      
      if (!result.success) return;

      // Merge and only update if there are actual changes
      const merged = mergeTreeItems(fileTree, result.items);
      if (merged) {
        console.log('[FileExplorer] 🔄 SSH file tree changed, updating...');
        fileExplorerStore.setFileTree(merged);
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

  // Search files recursively
  function searchFilesRecursive(items, query, results = []) {
    const lowerQuery = query.toLowerCase();
    for (const item of items) {
      if (item.name.toLowerCase().includes(lowerQuery)) {
        results.push(item);
      }
      if (item.children) {
        searchFilesRecursive(item.children, query, results);
      }
    }
    return results;
  }
  
  function handleSearch() {
    if (!searchQuery.trim()) {
      searchResults = [];
      return;
    }
    searchResults = searchFilesRecursive(fileTree, searchQuery.trim());
  }
  
  function handleSearchKeydown(e) {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      showSearch = false;
      searchQuery = '';
      searchResults = [];
    }
  }
  
  function handleSearchResultClick(item) {
    if (item.isDirectory) {
      fileExplorerStore.toggleFolder(item.path);
    } else {
      fileExplorerStore.selectFile(item);
      editorStore.openFile(item.path, item.name);
    }
    showSearch = false;
    searchQuery = '';
    searchResults = [];
  }
  
  $: if (searchQuery) {
    handleSearch();
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

  async function handleCreateFile() {
    if (!currentWorkspacePath) return;
    
    const fileName = prompt('Enter file name:');
    if (!fileName || !fileName.trim()) return;
    
    if (!window.electronAPI) return;
    
    try {
      const filePath = `${currentWorkspacePath}/${fileName.trim()}`;
      const result = await window.electronAPI.createFile(filePath);
      
      if (result.success) {
        await loadDirectory(currentWorkspacePath);
      } else {
        alert(`Failed to create file: ${result.error}`);
      }
    } catch (error) {
      alert(`Error creating file: ${error.message}`);
    }
  }

  async function handleCreateFolder() {
    if (!currentWorkspacePath) return;
    
    const folderName = prompt('Enter folder name:');
    if (!folderName || !folderName.trim()) return;
    
    if (!window.electronAPI) return;
    
    try {
      const folderPath = `${currentWorkspacePath}/${folderName.trim()}`;
      const result = await window.electronAPI.createFolder(folderPath);
      
      if (result.success) {
        await loadDirectory(currentWorkspacePath);
      } else {
        alert(`Failed to create folder: ${result.error}`);
      }
    } catch (error) {
      alert(`Error creating folder: ${error.message}`);
    }
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
      // For SSH workspaces, use SFTP upload
      if (activeWorkspace?.isSSH && activeWorkspace?.sshConnection?.id) {
        console.log('[FileExplorer] 🔌 SSH drag-drop, uploading files via SFTP');
        const connectionId = activeWorkspace.sshConnection.id;

        for (const file of files) {
          const fileName = file.name;
          let remoteDestPath = `${currentWorkspacePath}/${fileName}`;

          try {
            const result = await window.electronAPI.sshSftpUploadFile(
              connectionId,
              remoteDestPath,
              file.path
            );

            if (!result.success) {
              console.error('SSH upload failed:', result.error);
              alert(`Failed to upload ${fileName}: ${result.error}`);
            }
          } catch (uploadError) {
            console.error('SSH upload error:', uploadError);
            alert(`Error uploading ${fileName}: ${uploadError.message}`);
          }
        }

        // Reload directory after uploads
        await loadSSHDirectory(connectionId, currentWorkspacePath);
      } else {
        // Local drag-drop
        console.log('[FileExplorer] 📁 Local drag-drop, copying files');
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

          const result = await window.electronAPI.uploadFile({
            sourcePath: file.path,
            destinationPath: destinationPath
          });

          if (!result.success) {
            console.error('Copy failed:', result.error);
            alert(`Failed to copy ${fileName}: ${result.error}`);
          }
        }

        await loadDirectory(currentWorkspacePath);
      }
    } catch (error) {
      console.error('Drop error:', error);
      alert(`Failed to upload files: ${error.message}`);
    }
  }

  async function handlePasteScreenshot() {
    if (!currentWorkspacePath || !window.electronAPI) return;

    try {
      const imageResult = await window.electronAPI.getClipboardImage();
      if (!imageResult.success) {
        alert(imageResult.error || 'No image in clipboard');
        return;
      }

      const fileName = imageResult.filename;
      const sourcePath = imageResult.path;

      // Paste into workspace
      if (activeWorkspace?.isSSH && activeWorkspace?.sshConnection?.id) {
        console.log('[FileExplorer] 🔌 Pasting screenshot to SSH via SFTP');
        const connectionId = activeWorkspace.sshConnection.id;
        const remoteDestPath = `${currentWorkspacePath}/${fileName}`;

        const result = await window.electronAPI.sshSftpUploadFile(
          connectionId,
          remoteDestPath,
          sourcePath
        );

        if (result.success) {
          console.log('[FileExplorer] Screenshot saved to SSH:', remoteDestPath);
          await loadSSHDirectory(connectionId, currentWorkspacePath);
        } else {
          alert(`Failed to paste screenshot: ${result.error}`);
        }
      } else {
        console.log('[FileExplorer] 📁 Pasting screenshot to local workspace');
        const destinationPath = `${currentWorkspacePath}/${fileName}`;

        const result = await window.electronAPI.uploadFile({
          sourcePath: sourcePath,
          destinationPath: destinationPath
        });

        if (result.success) {
          console.log('[FileExplorer] Screenshot saved to:', destinationPath);
          await loadDirectory(currentWorkspacePath);
        } else {
          alert(`Failed to paste screenshot: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Paste screenshot error:', error);
      alert(`Error pasting screenshot: ${error.message}`);
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
    {
      label: 'Paste Screenshot',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
      action: handlePasteScreenshot,
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
  <div class="search-section">
    <div class="button-row">
      <button 
        class="search-toggle" 
        class:active={showSearch}
        on:click={() => showSearch = !showSearch}
        title="Search files (Ctrl+P)"
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 11l3 3m-4.5-2a4.5 4.5 0 110-9 4.5 4.5 0 010 9z" />
        </svg>
      </button>

      <button 
        class="action-button" 
        on:click={handleCreateFile}
        title="Create new file"
        disabled={!currentWorkspacePath}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 2v12M2 8h12" />
        </svg>
      </button>

      <button 
        class="action-button" 
        on:click={handleCreateFolder}
        title="Create new folder"
        disabled={!currentWorkspacePath}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2 4v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L7 4H3a1 1 0 00-1 1zM8 8v3m-1.5-1.5h3" />
        </svg>
      </button>
    </div>

    {#if showSearch}
      <div class="search-panel">
        <input
          type="text"
          class="search-input"
          bind:value={searchQuery}
          placeholder="Search files..."
          on:keydown={handleSearchKeydown}
          autofocus
        />
        {#if searchResults.length > 0}
          <div class="search-results">
            {#each searchResults.slice(0, 20) as item}
              <button class="search-result-item" on:click={() => handleSearchResultClick(item)}>
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  {#if item.isDirectory}
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M2 4v8a1 1 0 001 1h10a1 1 0 001-1V6a1 1 0 00-1-1H8L7 4H3a1 1 0 00-1 1z" />
                  {:else}
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 2v12h8V6l-4-4H4zm4 0v4h4" />
                  {/if}
                </svg>
                <span class="result-name">{item.name}</span>
              </button>
            {/each}
          </div>
        {:else if searchQuery}
          <div class="no-results">No files found</div>
        {/if}
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

  .search-section {
    padding: var(--spacing-xs);
    border-bottom: 1px solid var(--color-border);
  }

  .button-row {
    display: flex;
    gap: var(--spacing-xs);
    margin-bottom: var(--spacing-xs);
  }

  .search-toggle {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .search-toggle:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
    border-color: var(--color-border-secondary);
  }

  .search-toggle.active {
    background-color: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .search-toggle svg {
    width: 14px;
    height: 14px;
  }

  .action-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
    flex-shrink: 0;
  }

  .action-button:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
    border-color: var(--color-border-secondary);
  }

  .action-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-button svg {
    width: 14px;
    height: 14px;
  }

  .search-panel {
    margin-top: var(--spacing-xs);
  }

  .search-input {
    width: 100%;
    padding: var(--spacing-sm);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    outline: none;
  }

  .search-input:focus {
    border-color: var(--color-accent);
  }

  .search-results {
    margin-top: var(--spacing-xs);
    max-height: 200px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .search-result-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-align: left;
    transition: background var(--transition-fast);
  }

  .search-result-item:hover {
    background-color: var(--color-surface-hover);
  }

  .search-result-item svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--color-text-tertiary);
  }

  .result-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-results {
    padding: var(--spacing-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-align: center;
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
