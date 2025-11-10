<script>
  import { createEventDispatcher } from 'svelte';
  import { fileExplorerStore } from '../stores/fileExplorerStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import ContextMenu from './ContextMenu.svelte';

  export let item;
  export let level = 0;
  export let selectedFile = null;

  const dispatch = createEventDispatcher();

  let expandedFolders = new Set();
  let clipboard = null;
  let contextMenuVisible = false;
  let contextMenuX = 0;
  let contextMenuY = 0;
  let isCreatingNew = false;
  let newItemName = '';
  let newItemType = null; // 'file' or 'folder'
  let isDragOver = false; // Track drag over state for external files

  fileExplorerStore.subscribe((state) => {
    expandedFolders = state.expandedFolders;
    clipboard = state.clipboard;
  });

  function handleClick() {
    dispatch('click', item);
  }

  function isExpanded(path) {
    return expandedFolders.has(path);
  }

  async function handleFolderClick(folderItem) {
    const wasExpanded = expandedFolders.has(folderItem.path);
    fileExplorerStore.toggleFolder(folderItem.path);
    
    // Load contents when expanding (not collapsing) and if not already loaded
    if (!wasExpanded && !folderItem.children) {
      if (!window.electronAPI) {
        console.error('Electron API not available');
        return;
      }
      
      // Check if current workspace is SSH
      let activeWorkspace = null;
      const unsubscribe = workspaceStore.subscribe((state) => {
        activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      });
      unsubscribe();
      
      let contents = [];
      
      if (activeWorkspace?.isSSH && activeWorkspace.sshConnection) {
        // Use SFTP for SSH workspaces
        const connectionId = activeWorkspace.sshConnection.id;
        console.log('[FileTreeNode] Loading SSH folder:', { connectionId, path: folderItem.path });
        const result = await window.electronAPI.sshSftpReadDir(connectionId, folderItem.path);
        
        if (result.success) {
          contents = result.items;
        } else {
          console.error('[FileTreeNode] Failed to load SSH folder:', result.error);
          return;
        }
      } else {
        // Use local filesystem
        contents = await window.electronAPI.readDirectory(folderItem.path);
      }
      
      fileExplorerStore.addFolderContents(folderItem.path, contents);
    }
  }

  function handleItemClick(clickedItem) {
    if (clickedItem.isDirectory) {
      handleFolderClick(clickedItem);
    } else {
      fileExplorerStore.selectFile(clickedItem.path);
    }
  }

  function handleContextMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    contextMenuX = event.clientX;
    contextMenuY = event.clientY;
    contextMenuVisible = true;
  }

  function closeContextMenu() {
    contextMenuVisible = false;
  }

  async function handleOpenInWorkspace() {
    if (!item.isDirectory) return;
    
    console.log('[FileTreeNode] 📂 Opening folder in workspace:', item.path);
    
    // Get current workspaces and active workspace
    let currentWorkspaces = [];
    let activeWorkspaceId = null;
    let activeWorkspace = null;
    
    const unsubscribe = workspaceStore.subscribe((state) => {
      currentWorkspaces = state.workspaces;
      activeWorkspaceId = state.activeWorkspaceId;
      activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    });
    unsubscribe();
    
    console.log('[FileTreeNode] Current workspace:', {
      id: activeWorkspaceId,
      isSSH: activeWorkspace?.isSSH,
      oldPath: activeWorkspace?.path
    });
    
    // Find active workspace and update its path
    if (activeWorkspaceId && activeWorkspace) {
      const isSSH = activeWorkspace.isSSH;
      const sshConnection = activeWorkspace.sshConnection;
      
      // Use the folder's actual path directly
      let newPath = item.path;
      
      console.log('[FileTreeNode] Updating workspace path to:', newPath);
      
      workspaceStore.updateWorkspace(activeWorkspaceId, { path: newPath });
      
      // Save to electron-store
      if (window.electronAPI) {
        const updatedWorkspaces = currentWorkspaces.map(w => 
          w.id === activeWorkspaceId ? { ...w, path: newPath } : w
        );
        console.log('[FileTreeNode] Saving workspace with new path:', newPath);
        await window.electronAPI.workspaceSave(updatedWorkspaces);
      }
    }
    
    closeContextMenu();
  }

  async function handleOpenAsNewWorkspace() {
    if (!item.isDirectory) return;
    
    console.log('[FileTreeNode] 🆕 Opening folder as new workspace:', item.path);
    
    // Check if we're in an SSH workspace
    let activeWorkspace = null;
    const unsubscribe = workspaceStore.subscribe((state) => {
      activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
    });
    unsubscribe();
    
    console.log('[FileTreeNode] Current workspace isSSH:', activeWorkspace?.isSSH);
    
    const workspace = {
      id: Date.now().toString(),
      path: item.path,
      color: getRandomColor(),
    };
    
    // If current workspace is SSH, copy SSH metadata to new workspace
    if (activeWorkspace?.isSSH && activeWorkspace.sshConnection) {
      workspace.isSSH = true;
      workspace.sshConnection = activeWorkspace.sshConnection;
      
      console.log('[FileTreeNode] Creating new SSH workspace:', {
        path: workspace.path,
        connectionId: workspace.sshConnection.id,
        host: workspace.sshConnection.host
      });
    }
    
    console.log('[FileTreeNode] New workspace object:', workspace);
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspace.id);
    
    if (window.electronAPI) {
      let allWorkspaces = [];
      const unsubscribe2 = workspaceStore.subscribe((state) => {
        allWorkspaces = state.workspaces;
      });
      unsubscribe2();
      
      console.log('[FileTreeNode] Saving new workspace to electron-store');
      await window.electronAPI.workspaceSave(allWorkspaces);
      await window.electronAPI.workspaceSetActive(workspace.id);
    }
    
    closeContextMenu();
  }

  async function handleGoToParent() {
    // Get the current workspace path
    let currentWorkspaces = [];
    let activeWorkspaceId = null;
    let currentWorkspacePath = null;
    
    const unsubscribe = workspaceStore.subscribe((state) => {
      currentWorkspaces = state.workspaces;
      activeWorkspaceId = state.activeWorkspaceId;
      const activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      currentWorkspacePath = activeWorkspace?.path;
    });
    unsubscribe();
    
    if (!currentWorkspacePath) return;
    
    // Get parent of current workspace path (not item path)
    const separator = currentWorkspacePath.includes('\\') ? '\\' : '/';
    const parts = currentWorkspacePath.split(/[\\/]/);
    parts.pop();
    const parentPath = parts.join(separator);
    
    if (!parentPath) return;
    
    // Update workspace to parent directory
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

  function getRandomColor() {
    const colors = ['#0071e3', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5856D6'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function handleCopy() {
    fileExplorerStore.copyToClipboard(item.path, item.name, item.isDirectory);
    closeContextMenu();
  }

  function handleCut() {
    fileExplorerStore.cutToClipboard(item.path, item.name, item.isDirectory);
    closeContextMenu();
  }

  async function handlePaste() {
    if (!clipboard || !item.isDirectory) return;

    if (!window.electronAPI) {
      console.error('Electron API not available');
      return;
    }

    try {
      const destinationPath = `${item.path}/${clipboard.name}`;
      let finalDestinationPath = destinationPath;
      let counter = 1;

      try {
        const destDir = await window.electronAPI.readDirectory(item.path);
        const destNames = new Set(destDir.map(d => d.name));

        while (destNames.has(clipboard.name) || destNames.has(`${clipboard.name} (${counter})`)) {
          const nameParts = clipboard.name.split('.');
          if (nameParts.length > 1 && !clipboard.isDirectory) {
            const ext = nameParts.pop();
            const baseName = nameParts.join('.');
            finalDestinationPath = `${item.path}/${baseName} (${counter}).${ext}`;
          } else {
            finalDestinationPath = `${item.path}/${clipboard.name} (${counter})`;
          }
          counter++;
        }
      } catch (err) {
        console.error('Error checking destination:', err);
      }

      if (clipboard.type === 'copy') {
        const result = await window.electronAPI.copyPath({
          sourcePath: clipboard.path,
          destinationPath: finalDestinationPath
        });

        if (result.success) {
          const contents = await window.electronAPI.readDirectory(item.path);
          fileExplorerStore.addFolderContents(item.path, contents);

          if (!expandedFolders.has(item.path)) {
            fileExplorerStore.toggleFolder(item.path);
          }
        } else {
          console.error('Copy failed:', result.error);
          alert(`Failed to copy: ${result.error}`);
        }
      } else if (clipboard.type === 'cut') {
        const result = await window.electronAPI.movePath({
          sourcePath: clipboard.path,
          destinationPath: finalDestinationPath
        });

        if (result.success) {
          fileExplorerStore.clearClipboard();

          let workspacePath = null;
          const unsubscribe = workspaceStore.subscribe((state) => {
            const activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
            workspacePath = activeWorkspace?.path;
          });
          unsubscribe();

          if (workspacePath) {
            const tree = await window.electronAPI.readDirectory(workspacePath);
            fileExplorerStore.refreshTree(tree);
          }

          if (!expandedFolders.has(item.path)) {
            fileExplorerStore.toggleFolder(item.path);
          }
        } else {
          console.error('Move failed:', result.error);
          alert(`Failed to move: ${result.error}`);
        }
      }
    } catch (error) {
      console.error('Paste error:', error);
      alert(`Failed to paste: ${error.message}`);
    }

    closeContextMenu();
  }

  function handleNewFile() {
    if (!item.isDirectory) return;

    if (!expandedFolders.has(item.path)) {
      fileExplorerStore.toggleFolder(item.path);
    }

    newItemType = 'file';
    newItemName = '';
    isCreatingNew = true;
    closeContextMenu();

    setTimeout(() => {
      const input = document.querySelector('.new-item-input');
      if (input) input.focus();
    }, 0);
  }

  function handleNewFolder() {
    if (!item.isDirectory) return;

    if (!expandedFolders.has(item.path)) {
      fileExplorerStore.toggleFolder(item.path);
    }

    newItemType = 'folder';
    newItemName = '';
    isCreatingNew = true;
    closeContextMenu();

    setTimeout(() => {
      const input = document.querySelector('.new-item-input');
      if (input) input.focus();
    }, 0);
  }

  async function handleOpenInExplorer() {
    if (!window.electronAPI) return;
    await window.electronAPI.openInExplorer(item.path);
    closeContextMenu();
  }

  async function confirmNewItem() {
    if (!newItemName.trim() || !window.electronAPI) {
      cancelNewItem();
      return;
    }

    const separator = item.path.includes('\\') ? '\\' : '/';
    const newPath = `${item.path}${separator}${newItemName.trim()}`;

    try {
      let result;
      if (newItemType === 'file') {
        result = await window.electronAPI.createFile({ filePath: newPath, content: '' });
      } else {
        result = await window.electronAPI.createFolder({ folderPath: newPath });
      }

      if (result.success) {
        const contents = await window.electronAPI.readDirectory(item.path);
        fileExplorerStore.addFolderContents(item.path, contents);
        isCreatingNew = false;
        newItemName = '';
        newItemType = null;
      } else {
        alert(`Failed to create ${newItemType}: ${result.error}`);
      }
    } catch (error) {
      console.error('Error creating item:', error);
      alert(`Failed to create ${newItemType}: ${error.message}`);
    }
  }

  function cancelNewItem() {
    isCreatingNew = false;
    newItemName = '';
    newItemType = null;
  }

  function handleNewItemKeydown(event) {
    if (event.key === 'Enter') {
      confirmNewItem();
    } else if (event.key === 'Escape') {
      cancelNewItem();
    }
  }

  // Drag and drop handlers for external files
  function handleDragEnter(event) {
    if (!item.isDirectory) return;
    event.preventDefault();
    event.stopPropagation();
    isDragOver = true;
  }

  function handleDragOver(event) {
    if (!item.isDirectory) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleDragLeave(event) {
    if (!item.isDirectory) return;
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX;
    const y = event.clientY;
    if (x < rect.left || x >= rect.right || y < rect.top || y >= rect.bottom) {
      isDragOver = false;
    }
  }

  async function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    isDragOver = false;

    if (!item.isDirectory || !window.electronAPI) return;

    const files = Array.from(event.dataTransfer.files);
    if (files.length === 0) return;

    try {
      const existingContents = await window.electronAPI.readDirectory(item.path);
      const existingNames = new Set(existingContents.map(f => f.name));

      for (const file of files) {
        const fileName = file.name;
        let destinationPath = `${item.path}/${fileName}`;
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
          destinationPath = `${item.path}/${finalFileName}`;
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

      const contents = await window.electronAPI.readDirectory(item.path);
      fileExplorerStore.addFolderContents(item.path, contents);

      if (!expandedFolders.has(item.path)) {
        fileExplorerStore.toggleFolder(item.path);
      }
    } catch (error) {
      console.error('Drop error:', error);
      alert(`Failed to copy files: ${error.message}`);
    }
  }

  $: contextMenuItems = item.isDirectory ? [
    {
      label: 'Open in File Explorer',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
      action: handleOpenInExplorer,
    },
    { separator: true },
    {
      label: 'Open in Workspace',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
      action: handleOpenInWorkspace,
    },
    {
      label: 'Open as New Workspace',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>',
      action: handleOpenAsNewWorkspace,
    },
    {
      label: 'Go to Parent Folder',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>',
      action: handleGoToParent,
    },
    { separator: true },
    {
      label: 'Copy',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>',
      action: handleCopy,
    },
    {
      label: 'Cut',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"/></svg>',
      action: handleCut,
    },
    {
      label: 'Paste',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>',
      action: handlePaste,
      disabled: !clipboard,
    },
    { separator: true },
    {
      label: 'New File',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
      action: handleNewFile,
    },
    {
      label: 'New Folder',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
      action: handleNewFolder,
    },
    { separator: true },
    {
      // TODO: Implement rename folder with inline editing
      label: 'Rename',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
      action: () => console.log('Rename'),
      disabled: true,
    },
    {
      // TODO: Implement delete folder with confirmation dialog
      label: 'Delete',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
      action: () => console.log('Delete'),
      danger: true,
      disabled: true,
    },
  ] : [
    {
      label: 'Open in File Explorer',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
      action: handleOpenInExplorer,
    },
    { separator: true },
    {
      label: 'Copy',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>',
      action: handleCopy,
    },
    {
      label: 'Cut',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z"/></svg>',
      action: handleCut,
    },
    { separator: true },
    {
      // TODO: Implement rename file with inline editing
      label: 'Rename',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
      action: () => console.log('Rename'),
      disabled: true,
    },
    {
      // TODO: Implement delete file with confirmation dialog
      label: 'Delete',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>',
      action: () => console.log('Delete'),
      danger: true,
      disabled: true,
    },
  ];
</script>

<button
  class="file-item"
  class:selected={selectedFile === item.path}
  class:cut={clipboard && clipboard.type === 'cut' && clipboard.path === item.path}
  class:drag-over={isDragOver}
  style="padding-left: {level * 16 + 8}px"
  on:click={() => handleItemClick(item)}
  on:contextmenu={handleContextMenu}
  on:dragenter={handleDragEnter}
  on:dragover={handleDragOver}
  on:dragleave={handleDragLeave}
  on:drop={handleDrop}
>
  {#if item.isDirectory}
    <span class="chevron" class:expanded={isExpanded(item.path)}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 5l7 7-7 7"
        />
      </svg>
    </span>
  {:else}
    <span class="chevron-spacer"></span>
  {/if}
  
  <div class="file-icon">
    {#if item.isDirectory}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
        />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    {/if}
  </div>
  <span class="file-name">{item.name}</span>
</button>

{#if item.isDirectory && item.children && isExpanded(item.path)}
  {#if isCreatingNew}
    <div class="new-item-container" style="padding-left: {(level + 1) * 16 + 8}px">
      <span class="chevron-spacer"></span>
      <div class="file-icon">
        {#if newItemType === 'folder'}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
            />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        {/if}
      </div>
      <input
        type="text"
        class="new-item-input"
        bind:value={newItemName}
        on:keydown={handleNewItemKeydown}
        on:blur={confirmNewItem}
        placeholder={newItemType === 'folder' ? 'New folder name' : 'New file name'}
      />
    </div>
  {/if}
  {#each item.children as child}
    <svelte:self item={child} level={level + 1} {selectedFile} />
  {/each}
{/if}

<ContextMenu
  visible={contextMenuVisible}
  x={contextMenuX}
  y={contextMenuY}
  items={contextMenuItems}
  on:close={closeContextMenu}
/>

<style>
  .file-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    width: 100%;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
    text-align: left;
  }

  .file-item:hover {
    background-color: var(--color-surface-hover);
  }

  .file-item.selected {
    background-color: var(--color-accent);
    color: white;
  }

  .chevron {
    width: 12px;
    height: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: transform var(--transition-fast);
  }

  .chevron.expanded {
    transform: rotate(90deg);
  }

  .chevron svg {
    width: 12px;
    height: 12px;
  }

  .chevron-spacer {
    width: 12px;
    height: 12px;
  }

  .file-icon {
    width: 16px;
    height: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
  }

  .file-item.selected .file-icon,
  .file-item.selected .chevron {
    color: white;
  }

  .file-icon svg {
    width: 16px;
    height: 16px;
  }

  .file-name {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .file-item.selected .file-name {
    color: white;
  }

  .file-item.cut {
    opacity: 0.5;
  }

  .file-item.cut .file-name {
    text-decoration: line-through;
  }

  .file-item.drag-over {
    background-color: var(--color-accent);
    opacity: 0.7;
    border: 2px dashed var(--color-accent);
    color: white;
  }

  .file-item.drag-over .file-icon,
  .file-item.drag-over .chevron,
  .file-item.drag-over .file-name {
    color: white;
  }

  .new-item-container {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    width: 100%;
  }

  .new-item-input {
    flex: 1;
    padding: 2px 6px;
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-sm);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    outline: none;
  }

  .new-item-input:focus {
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.1);
  }
</style>
