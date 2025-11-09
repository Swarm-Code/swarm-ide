<script>
  import { onMount } from 'svelte';
  import { fileExplorerStore } from '../stores/fileExplorerStore.js';
  import { workspaceStore, activeWorkspacePath } from '../stores/workspaceStore.js';
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
  let isDragOver = false; // Track drag over state for external files

  fileExplorerStore.subscribe((state) => {
    fileTree = state.fileTree;
    expandedFolders = state.expandedFolders;
    selectedFile = state.selectedFile;
  });

  // Subscribe to workspace path changes and reload tree
  activeWorkspacePath.subscribe(async (path) => {
    if (path && path !== currentWorkspacePath) {
      currentWorkspacePath = path;
      // Clear selected file when switching workspaces
      fileExplorerStore.clearSelection();
      await loadDirectory(path);
    }
  });

  onMount(async () => {
    const initialPath = currentWorkspacePath || projectPath;
    if (initialPath) {
      await loadDirectory(initialPath);
    }
  });

  async function loadDirectory(path) {
    if (!window.electronAPI) {
      console.error('Electron API not available');
      return;
    }
    const items = await window.electronAPI.readDirectory(path);
    fileExplorerStore.setFileTree(items);
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
