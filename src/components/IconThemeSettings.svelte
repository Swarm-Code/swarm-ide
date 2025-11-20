<script>
  import { appStore } from '../stores/appStore.js';
  import { ICON_THEMES, loadIconTheme, unloadIconTheme } from '../utils/iconTheme.js';
  import { onMount } from 'svelte';

  let currentTheme = 'material';
  let showSettings = false;

  onMount(async () => {
    const unsub = appStore.subscribe((state) => {
      currentTheme = state.iconTheme;
      if (typeof document !== 'undefined') {
        loadIconTheme(state.iconTheme);
      }
    });

    return unsub;
  });

  function handleThemeChange(themeId) {
    appStore.setIconTheme(themeId);
    currentTheme = themeId;

    if (typeof window !== 'undefined' && window.electronAPI) {
      window.electronAPI.saveAppSettings?.({ iconTheme: themeId });
    }
  }

  function toggleSettings() {
    showSettings = !showSettings;
  }
</script>

<div class="icon-settings">
  <button
    class="settings-toggle"
    on:click={toggleSettings}
    title="Icon Theme Settings"
    aria-label="Icon Theme Settings"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="12" cy="12" r="1"/>
      <circle cx="12" cy="5" r="1"/>
      <circle cx="12" cy="19" r="1"/>
    </svg>
  </button>

  {#if showSettings}
    <div class="settings-backdrop" on:click={() => showSettings = false}></div>
    <div class="settings-panel">
      <div class="settings-header">
        <h3>Icon Theme</h3>
        <button class="close-btn" on:click={() => showSettings = false}>×</button>
      </div>

      <div class="settings-content">
        <p class="settings-description">Choose your preferred icon theme</p>
        
        <div class="theme-options">
          {#each Object.values(ICON_THEMES) as theme (theme.id)}
            <button
              class="theme-option"
              class:active={currentTheme === theme.id}
              on:click={() => handleThemeChange(theme.id)}
            >
              <div class="option-header">
                <span class="option-name">{theme.name}</span>
                {#if currentTheme === theme.id}
                  <span class="checkmark">✓</span>
                {/if}
              </div>
              <p class="option-description">{theme.description}</p>
            </button>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .icon-settings {
    position: relative;
  }

  .settings-toggle {
    width: 32px;
    height: 32px;
    padding: 0;
    background: none;
    border: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .settings-toggle:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .settings-toggle svg {
    width: 16px;
    height: 16px;
  }

  .settings-backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .settings-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    z-index: 100;
    min-width: 280px;
    max-width: 320px;
    animation: slideDown 150ms ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }

  .settings-header h3 {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .settings-content {
    padding: var(--spacing-md);
  }

  .settings-description {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--spacing-md) 0;
  }

  .theme-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .theme-option {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-background);
    border: 2px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
    text-align: left;
  }

  .theme-option:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
  }

  .theme-option.active {
    background: rgba(0, 113, 227, 0.1);
    border-color: var(--color-accent);
  }

  .option-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .option-name {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .checkmark {
    color: var(--color-accent);
    font-weight: bold;
    font-size: 14px;
  }

  .option-description {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin: 0;
  }
</style>
