<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import DeepWikiSettingsForm from './DeepWikiSettingsForm.svelte';

  export let settings;
  export let status;

  const dispatch = createEventDispatcher();

  onMount(() => {
    appStore.setOverlayVisible(true);
    window.electronAPI?.browsersHideForOverlay?.();
  });

  onDestroy(() => {
    appStore.setOverlayVisible(false);
    window.electronAPI?.browsersShowAfterOverlay?.();
  });

  function handleClose() {
    dispatch('close');
  }

  function handleSave(event) {
    dispatch('save', event.detail);
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="DeepWiki settings">
  <div class="modal">
    <DeepWikiSettingsForm
      {settings}
      {status}
      on:save={handleSave}
      on:cancel={handleClose}
    />
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 99999;
  }

  .modal {
    width: min(640px, 90%);
    max-height: calc(100vh - 80px);
    overflow-y: auto;
    background: var(--color-background);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  }
</style>
