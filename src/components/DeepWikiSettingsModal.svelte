<script>
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { appStore } from '../stores/appStore.js';

  export let settings;
  export let status;

  const dispatch = createEventDispatcher();

  let form = {
    repoPath: settings?.repoPath || '',
    backendPort: settings?.backendPort || 8001,
    frontendPort: settings?.frontendPort || 3007,
    enabled: settings?.enabled ?? true,
    autoStart: settings?.autoStart ?? true,
    openPaneOnLaunch: settings?.openPaneOnLaunch ?? true,
    autoGenerate: settings?.autoGenerate ?? true,
  };

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

  function handleSubmit(event) {
    event.preventDefault();
    dispatch('save', {
      repoPath: form.repoPath.trim(),
      backendPort: Number(form.backendPort) || 8001,
      frontendPort: Number(form.frontendPort) || 3007,
      enabled: form.enabled,
      autoStart: form.autoStart,
      openPaneOnLaunch: form.openPaneOnLaunch,
      autoGenerate: form.autoGenerate,
    });
  }
</script>

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="DeepWiki settings">
  <div class="modal">
    <div class="modal-header">
      <h2>DeepWiki Plugin Settings</h2>
      <button class="icon-button" on:click={handleClose} aria-label="Close settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
    <p class="modal-description">Configure how the Swarm IDE launches the DeepWiki service.</p>
    <form class="settings-form" on:submit={handleSubmit}>
      <label>
        <span>DeepWiki repository path</span>
        <input type="text" bind:value={form.repoPath} placeholder="/Users/me/GitHub/swarm/swarm-wiki" required />
      </label>
      <div class="field-row">
        <label>
          <span>Backend port</span>
          <input type="number" min="1000" max="65000" bind:value={form.backendPort} />
        </label>
        <label>
          <span>Frontend port</span>
          <input type="number" min="1000" max="65000" bind:value={form.frontendPort} />
        </label>
      </div>
      <div class="checkbox-grid">
        <label>
          <input type="checkbox" bind:checked={form.enabled} /> Enable DeepWiki plugin
        </label>
        <label>
          <input type="checkbox" bind:checked={form.autoStart} /> Auto-start with IDE
        </label>
        <label>
          <input type="checkbox" bind:checked={form.openPaneOnLaunch} /> Focus pane when ready
        </label>
        <label>
          <input type="checkbox" bind:checked={form.autoGenerate} /> Auto-generate on open
        </label>
      </div>
      {#if status?.state === 'error'}
        <div class="modal-error">
          <strong>Latest error:</strong>
          <p>{status.message}</p>
        </div>
      {/if}
      <div class="modal-actions">
        <button type="button" class="secondary" on:click={handleClose}>Cancel</button>
        <button type="submit">Save & Apply</button>
      </div>
    </form>
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
    width: min(560px, 90%);
    background: var(--color-background);
    border-radius: var(--radius-lg);
    padding: var(--spacing-lg);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.3);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-sm);
  }

  .icon-button {
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary);
  }

  .icon-button svg {
    width: 20px;
    height: 20px;
  }

  .modal-description {
    margin-bottom: var(--spacing-md);
    color: var(--color-text-secondary);
  }

  .settings-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    font-size: var(--font-size-sm);
  }

  input[type="text"],
  input[type="number"] {
    width: 100%;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  .field-row {
    display: flex;
    gap: var(--spacing-md);
  }

  .field-row label {
    flex: 1;
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-sm);
  }

  .checkbox-grid label {
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .modal-error {
    background: rgba(255, 59, 48, 0.1);
    border: 1px solid rgba(255, 59, 48, 0.4);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
  }

  .modal-actions button {
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-background);
    cursor: pointer;
  }

  .modal-actions button.secondary {
    background: transparent;
  }

  .modal-actions button[type="submit"] {
    background: var(--color-accent);
    color: #fff;
    border-color: var(--color-accent);
  }
</style>
