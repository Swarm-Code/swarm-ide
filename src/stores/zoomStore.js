import { writable } from 'svelte/store';

function createZoomStore() {
  const { subscribe, set, update } = writable({
    editorZoomLevel: 1,
  });

  return {
    subscribe,

    setEditorZoomLevel: (level) => update((state) => {
      const clampedLevel = Math.max(0.5, Math.min(2.0, level));
      return { ...state, editorZoomLevel: clampedLevel };
    }),

    incrementEditorZoom: () => update((state) => {
      const newLevel = Math.max(0.5, Math.min(2.0, state.editorZoomLevel + 0.1));
      return { ...state, editorZoomLevel: newLevel };
    }),

    decrementEditorZoom: () => update((state) => {
      const newLevel = Math.max(0.5, Math.min(2.0, state.editorZoomLevel - 0.1));
      return { ...state, editorZoomLevel: newLevel };
    }),
  };
}

export const zoomStore = createZoomStore();
