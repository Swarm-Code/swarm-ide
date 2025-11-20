<script>
  export let isOpen = false;
  export let title = 'Confirm';
  export let message = 'Are you sure?';
  export let confirmText = 'Confirm';
  export let cancelText = 'Cancel';
  export let onConfirm = null;
  export let onCancel = null;
  export let isDangerous = false;

  function handleConfirm() {
    if (onConfirm) {
      onConfirm();
    }
    isOpen = false;
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
    }
    isOpen = false;
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) {
      handleCancel();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      handleCancel();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click={handleBackdropClick}>
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h2>{title}</h2>
      </div>
      <div class="modal-content">
        <p>{message}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" on:click={handleCancel}>
          {cancelText}
        </button>
        <button class="btn btn-primary" class:btn-danger={isDangerous} on:click={handleConfirm}>
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal-dialog {
    background-color: var(--color-surface);
    border-radius: var(--radius-lg);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
    width: 90%;
    max-width: 400px;
    border: 1px solid var(--color-border);
    animation: slideUp 300ms ease-out;
  }

  @keyframes slideUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .modal-header {
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .modal-header h2 {
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .modal-content {
    padding: var(--spacing-lg);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .modal-content p {
    margin: 0;
  }

  .modal-footer {
    padding: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
    display: flex;
    gap: var(--spacing-md);
    justify-content: flex-end;
  }

  .btn {
    padding: 8px 16px;
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    border: none;
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .btn-secondary {
    background-color: var(--color-surface-secondary);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border);
  }

  .btn-secondary:hover {
    background-color: var(--color-surface-hover);
  }

  .btn-primary {
    background-color: var(--color-accent);
    color: var(--color-background);
  }

  .btn-primary:hover {
    opacity: 0.9;
  }

  .btn-danger {
    background-color: #ef4444;
  }

  .btn-danger:hover {
    background-color: #dc2626;
  }
</style>
