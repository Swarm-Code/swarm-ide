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
  let contextMenuVisible = false;
  let contextMenuX = 0;
  let contextMenuY = 0;

  fileExplorerStore.subscribe((state) => {
    expandedFolders = state.expandedFolders;
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
      const contents = await window.electronAPI.readDirectory(folderItem.path);
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
    
    // Get current workspaces
    let currentWorkspaces = [];
    let activeWorkspaceId = null;
    
    workspaceStore.subscribe((state) => {
      currentWorkspaces = state.workspaces;
      activeWorkspaceId = state.activeWorkspaceId;
    })();
    
    // Find active workspace and update its path
    if (activeWorkspaceId) {
      workspaceStore.updateWorkspace(activeWorkspaceId, { path: item.path });
      
      // Save to electron-store
      if (window.electronAPI) {
        await window.electronAPI.workspaceSave(currentWorkspaces.map(w => 
          w.id === activeWorkspaceId ? { ...w, path: item.path } : w
        ));
      }
    }
    
    closeContextMenu();
  }

  async function handleOpenAsNewWorkspace() {
    if (!item.isDirectory) return;
    
    const workspace = {
      id: Date.now().toString(),
      path: item.path,
      color: getRandomColor(),
    };
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspace.id);
    
    if (window.electronAPI) {
      let allWorkspaces = [];
      workspaceStore.subscribe((state) => {
        allWorkspaces = state.workspaces;
      })();
      
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

  $: contextMenuItems = item.isDirectory ? [
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
      // TODO: Implement create new file in folder
      label: 'New File',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
      action: () => console.log('New file'),
      disabled: true,
    },
    {
      // TODO: Implement create new folder
      label: 'New Folder',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>',
      action: () => console.log('New folder'),
      disabled: true,
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
      // TODO: Implement file opening in Monaco editor
      label: 'Open File',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
      action: () => console.log('Open file'),
      disabled: true,
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
  style="padding-left: {level * 16 + 8}px"
  on:click={() => handleItemClick(item)}
  on:contextmenu={handleContextMenu}
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
</style>
