<script>
  import { appStore } from '../stores/appStore.js';

  export let terminalVisible = false;
  export let onToggleTerminal = null;

  let activePanel = 'explorer';

  appStore.subscribe((state) => {
    activePanel = state.activePanel;
  });

  function handlePanelClick(panel) {
    appStore.setActivePanel(panel);
  }

  function handleTerminalClick() {
    if (onToggleTerminal) {
      onToggleTerminal();
    }
  }
</script>

<div class="activity-bar">
  <button
    class="activity-button"
    class:active={activePanel === 'explorer'}
    on:click={() => handlePanelClick('explorer')}
    title="Explorer"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
      />
    </svg>
  </button>
  
  <button
    class="activity-button"
    class:active={terminalVisible}
    on:click={handleTerminalClick}
    title="Terminal"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  </button>
</div>

<style>
  .activity-bar {
    width: 48px;
    height: 100%;
    background-color: var(--color-surface-secondary);
    border-right: 1px solid var(--color-border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--spacing-xs) 0;
    gap: var(--spacing-xs);
  }

  .activity-button {
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
    position: relative;
  }

  .activity-button::before {
    content: '';
    position: absolute;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 2px;
    height: 0;
    background-color: var(--color-accent);
    transition: height var(--transition-fast);
  }

  .activity-button:hover {
    color: var(--color-text-primary);
  }

  .activity-button.active {
    color: var(--color-text-primary);
  }

  .activity-button.active::before {
    height: 24px;
  }

  .activity-button svg {
    width: 24px;
    height: 24px;
  }
</style>
