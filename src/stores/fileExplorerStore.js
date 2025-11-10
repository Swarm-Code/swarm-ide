import { writable } from 'svelte/store';

// File explorer state store
function createFileExplorerStore() {
  const { subscribe, set, update } = writable({
    fileTree: [],
    expandedFolders: new Set(),
    selectedFile: null,
  });

  return {
    subscribe,
    setFileTree: (tree) => {
      console.log('[fileExplorerStore] 📝 setFileTree called with:', tree);
      console.log('[fileExplorerStore] Tree length:', tree?.length);
      console.log('[fileExplorerStore] First 3 items:', tree?.slice(0, 3));
      
      update((state) => {
        console.log('[fileExplorerStore] Previous tree length:', state.fileTree.length);
        const newState = { ...state, fileTree: tree };
        console.log('[fileExplorerStore] New tree length:', newState.fileTree.length);
        return newState;
      });
    },
    toggleFolder: (folderPath) => update((state) => {
      const expanded = new Set(state.expandedFolders);
      if (expanded.has(folderPath)) {
        expanded.delete(folderPath);
      } else {
        expanded.add(folderPath);
      }
      return { ...state, expandedFolders: expanded };
    }),
    addFolderContents: (folderPath, contents) => update((state) => {
      const updatedTree = addContentsToTree(state.fileTree, folderPath, contents);
      return { ...state, fileTree: updatedTree };
    }),
    selectFile: (filePathOrObject) => update((state) => {
      // Handle both string path and full object
      let selectedFile;
      if (typeof filePathOrObject === 'string') {
        // Find the file in the tree to get full object
        selectedFile = findFileInTree(state.fileTree, filePathOrObject);
      } else {
        selectedFile = filePathOrObject;
      }
      
      return { ...state, selectedFile };
    }),
    clearSelection: () => update((state) => ({ ...state, selectedFile: null })),
  };
}

function addContentsToTree(tree, folderPath, contents) {
  return tree.map((item) => {
    if (item.path === folderPath) {
      return { ...item, children: contents };
    }
    if (item.children) {
      return { ...item, children: addContentsToTree(item.children, folderPath, contents) };
    }
    return item;
  });
}

// Helper to find a file in the tree by path
function findFileInTree(tree, filePath) {
  for (const item of tree) {
    if (item.path === filePath) {
      return item;
    }
    if (item.children) {
      const found = findFileInTree(item.children, filePath);
      if (found) return found;
    }
  }
  return null;
}

export const fileExplorerStore = createFileExplorerStore();
