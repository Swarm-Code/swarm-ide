<script>
  import { onMount } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import '@fontsource/press-start-2p';

  let recentProjects = [];
  let lastSession = null;

  onMount(async () => {
    if (window.electronAPI) {
      recentProjects = await window.electronAPI.getRecentProjects();
      lastSession = await window.electronAPI.workspaceGetLastSession();
    }
  });

  function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  async function handleOpenProject() {
    if (!window.electronAPI) {
      console.error('Electron API not available');
      return;
    }

    const project = await window.electronAPI.openFolder();
    if (project) {
      appStore.setCurrentProject(project);
    }
  }

  function handleOpenRecent(project) {
    appStore.setCurrentProject(project);
  }

  async function handleRestoreSession() {
    if (!window.electronAPI) return;
    
    const restoredWorkspaces = await window.electronAPI.workspaceRestoreSession();
    if (restoredWorkspaces && restoredWorkspaces.length > 0) {
      workspaceStore.setWorkspaces(restoredWorkspaces);
      workspaceStore.setActiveWorkspace(restoredWorkspaces[0].id);
      
      // Set the first workspace as current project
      const firstWorkspace = restoredWorkspaces[0];
      const folderName = firstWorkspace.path.split(/[\\/]/).pop();
      appStore.setCurrentProject({
        path: firstWorkspace.path,
        name: folderName,
        lastOpened: new Date().toISOString(),
      });
    }
  }
</script>

<div class="welcome-container">
  <div class="welcome-content">
    <div class="header">
      <div class="logo">
        <div class="swarm-line">
          <span class="terminal-prompt">&gt;</span>
          <span class="swarm-text">SWARM</span>
        </div>
        <div class="ide-line">IDE</div>
      </div>
      <p class="subtitle">Build amazing things</p>
    </div>

    <div class="actions-section">
      <button class="primary-button" on:click={handleOpenProject}>
        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        Open Project
      </button>

      {#if lastSession && lastSession.workspaces && lastSession.workspaces.length > 0}
        <button class="secondary-button-large" on:click={handleRestoreSession}>
          <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Restore Last Session
        </button>
      {/if}
    </div>

    {#if recentProjects.length > 0}
      <div class="recent-section">
        <h2 class="section-title">Recent Projects</h2>
        <div class="recent-list">
          {#each recentProjects as project}
            <button
              class="recent-item"
              on:click={() => handleOpenRecent(project)}
            >
              <div class="recent-item-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                  />
                </svg>
              </div>
              <div class="recent-item-content">
                <div class="recent-item-name">{project.name}</div>
                <div class="recent-item-path">{project.path}</div>
              </div>
              <div class="recent-item-time">
                {formatRelativeTime(project.lastOpened)}
              </div>
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .welcome-container {
    width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-background);
    padding: var(--spacing-xl);
  }

  .welcome-content {
    max-width: 640px;
    width: 100%;
  }

  .header {
    text-align: center;
    margin-bottom: var(--spacing-3xl);
  }

  .logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    margin-bottom: var(--spacing-lg);
  }

  .swarm-line {
    display: flex;
    align-items: center;
    gap: 16px;
    line-height: 1;
  }

  .terminal-prompt {
    font-family: var(--font-family-terminal);
    color: var(--color-text-secondary);
    font-size: 48px;
  }

  .swarm-text {
    font-family: var(--font-family-terminal);
    color: #0071e3;
    font-size: 48px;
    text-shadow: 3px 3px 0px rgba(0, 113, 227, 0.2);
    letter-spacing: 0.05em;
  }

  .ide-line {
    font-family: var(--font-family-base);
    color: var(--color-text-primary);
    font-size: 72px;
    font-weight: var(--font-weight-bold);
    line-height: 1;
    letter-spacing: -0.03em;
  }

  .subtitle {
    font-size: var(--font-size-xl);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-regular);
  }

  .actions-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-3xl);
  }

  .primary-button {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md) var(--spacing-xl);
    background-color: var(--color-accent);
    color: white;
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    border-radius: var(--radius-lg);
    transition: all var(--transition-base);
    box-shadow: var(--shadow-sm);
  }

  .primary-button:hover {
    background-color: var(--color-accent-hover);
    transform: translateY(-1px);
    box-shadow: var(--shadow-md);
  }

  .primary-button:active {
    background-color: var(--color-accent-active);
    transform: translateY(0);
    box-shadow: var(--shadow-sm);
  }

  .primary-button .icon {
    width: 20px;
    height: 20px;
  }

  .secondary-button-large {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-lg);
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    transition: all var(--transition-base);
  }

  .secondary-button-large:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
    transform: translateY(-1px);
  }

  .secondary-button-large:active {
    transform: translateY(0);
  }

  .secondary-button-large .icon {
    width: 18px;
    height: 18px;
  }

  .recent-section {
    margin-top: var(--spacing-2xl);
  }

  .section-title {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-md);
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    padding: var(--spacing-md);
    background-color: var(--color-surface);
    border: 1px solid var(--color-border-secondary);
    border-radius: var(--radius-md);
    transition: all var(--transition-fast);
    text-align: left;
    width: 100%;
  }

  .recent-item:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-border);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);
  }

  .recent-item:active {
    transform: translateY(0);
  }

  .recent-item-icon {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: var(--color-background-secondary);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
  }

  .recent-item-icon svg {
    width: 20px;
    height: 20px;
  }

  .recent-item-content {
    flex: 1;
    min-width: 0;
  }

  .recent-item-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-xs);
  }

  .recent-item-path {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-family-mono);
  }

  .recent-item-time {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }
</style>
