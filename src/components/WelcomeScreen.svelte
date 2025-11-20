<script>
  import { onMount } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { sshStore } from '../stores/sshStore.js';
  import SSHConnectionDialog from './SSHConnectionDialog.svelte';
  import '@fontsource/press-start-2p';

  let recentProjects = [];
  let lastSession = null;
  let showSSHDialog = false;
  let showSSHMenu = false;
  let editingConnection = null;

  onMount(async () => {
    if (window.electronAPI) {
      recentProjects = await window.electronAPI.getRecentProjects();
      lastSession = await window.electronAPI.workspaceGetLastSession();
      
      const savedSSH = await window.electronAPI.sshGetConnections();
      if (savedSSH && savedSSH.length > 0) {
        sshStore.setConnections(savedSSH);
      }
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
    if (!window.electronAPI) return;
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
      
      const firstWorkspace = restoredWorkspaces[0];
      const folderName = firstWorkspace.path.split(/[\\/]/).pop();
      appStore.setCurrentProject({
        path: firstWorkspace.path,
        name: folderName,
        lastOpened: new Date().toISOString(),
      });
    }
  }

  async function handleQuickConnect(connection) {
    showSSHMenu = false;
    
    let credentials = connection.credentials;
    
    if (!credentials || (!credentials.password && !credentials.privateKey)) {
      showSSHDialog = true;
      return;
    }
    
    try {
      const testResult = await window.electronAPI.sshTestConnection(connection, credentials);
      
      if (!testResult.success) {
        alert(`SSH connection failed: ${testResult.error}`);
        return;
      }
    } catch (err) {
      alert(`Failed to test SSH connection: ${err.message}`);
      return;
    }
    
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const sshPath = `ssh://${connection.username}@${connection.host}:${connection.port}`;
    
    let existingWorkspace = null;
    const unsubscribe = workspaceStore.subscribe(state => {
      existingWorkspace = state.workspaces.find(w => w.path === sshPath);
    });
    unsubscribe();
    
    if (existingWorkspace) {
      workspaceStore.updateWorkspace(existingWorkspace.id, {
        isSSH: true,
        sshConnection: connection,
        color: '#ff9500'
      });
      
      workspaceStore.setActiveWorkspace(existingWorkspace.id);
      
      if (credentials && window.electronAPI) {
        await window.electronAPI.sshSetTempCredentials({
          workspaceId: existingWorkspace.id,
          credentials
        });
      }
      return;
    }
    
    const workspace = {
      id: workspaceId,
      path: sshPath,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    appStore.setCurrentProject({
      path: workspace.path,
      name: connection.name,
      lastOpened: new Date().toISOString(),
      isSSH: true
    });
    
    if (credentials && window.electronAPI) {
      await window.electronAPI.sshSetTempCredentials({
        workspaceId,
        credentials
      });
    }
    
    const dummyTerminalId = `terminal-${Date.now()}`;
    try {
      const result = await window.electronAPI.sshCreateTerminal({
        terminalId: dummyTerminalId,
        connection: connection,
        credentials: credentials,
        workspaceId: workspaceId
      });
      
      if (result.success) {
        await window.electronAPI.sshKill({ terminalId: dummyTerminalId });
      }
    } catch (err) {
      console.error('[WelcomeScreen] Error establishing SSH connection:', err);
    }
  }

  function handleNewSSHConnection() {
    showSSHMenu = false;
    editingConnection = null;
    showSSHDialog = true;
  }

  function handleEditConnection(connection, event) {
    event.stopPropagation();
    showSSHMenu = false;
    editingConnection = connection;
    showSSHDialog = true;
  }

  async function handleRemoveConnection(id, event) {
    event.stopPropagation();
    if (!confirm('Delete this SSH connection?')) return;
    
    if (window.electronAPI) {
      await window.electronAPI.sshRemoveConnection(id);
    }
    sshStore.removeConnection(id);
  }

  function handleDialogClose() {
    showSSHDialog = false;
    editingConnection = null;
  }

  async function handleSSHConnect(event) {
    const { connection, tempCredentials } = event.detail;
    
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const workspace = {
      id: workspaceId,
      path: `ssh://${connection.username}@${connection.host}:${connection.port}`,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    appStore.setCurrentProject({
      path: workspace.path,
      name: connection.name,
      lastOpened: new Date().toISOString(),
      isSSH: true
    });
    
    const credentialsToStore = tempCredentials || connection.credentials;
    if (credentialsToStore && window.electronAPI) {
      await window.electronAPI.sshSetTempCredentials({
        workspaceId,
        credentials: credentialsToStore
      });
    }
  }
</script>

<div class="welcome-container">
  <div class="welcome-content">
    <!-- Compact Header -->
    <header class="header">
      <div class="logo">
        <div class="logo-mark">
          <svg viewBox="0 0 24 24" fill="none">
            <path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z" fill="currentColor"/>
          </svg>
        </div>
        <span class="logo-text">SWARM<span class="logo-suffix">IDE</span></span>
      </div>
    </header>

    <!-- Start Section - Card Grid -->
    <section class="section">
      <h2 class="section-title">Start</h2>
      <div class="action-grid">
        <button class="action-card" on:click={handleOpenProject}>
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
          </div>
          <div class="card-content">
            <span class="card-title">Open Folder</span>
            <span class="card-desc">Browse local projects</span>
          </div>
        </button>

        <div class="action-card-wrapper">
          <button class="action-card" on:click={() => showSSHMenu = !showSSHMenu}>
            <div class="card-icon ssh">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
              </svg>
            </div>
            <div class="card-content">
              <span class="card-title">SSH Remote</span>
              <span class="card-desc">Connect to server</span>
            </div>
          </button>

          {#if showSSHMenu}
            <div class="dropdown-menu">
              {#if $sshStore.connections.length > 0}
                <div class="dropdown-section">
                  <div class="dropdown-label">Saved Connections</div>
                  {#each $sshStore.connections as connection}
                    <div class="dropdown-item-row">
                      <button class="dropdown-item" on:click={() => handleQuickConnect(connection)}>
                        <span class="item-name">{connection.name}</span>
                        <span class="item-meta">{connection.username}@{connection.host}</span>
                      </button>
                      <div class="item-actions">
                        <button class="action-btn edit" on:click={(e) => handleEditConnection(connection, e)} title="Edit">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button class="action-btn delete" on:click={(e) => handleRemoveConnection(connection.id, e)} title="Delete">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
              <button class="dropdown-item new" on:click={handleNewSSHConnection}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                <span>New Connection</span>
              </button>
            </div>
          {/if}
        </div>

        {#if lastSession && lastSession.workspaces && lastSession.workspaces.length > 0}
          <button class="action-card" on:click={handleRestoreSession}>
            <div class="card-icon restore">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </div>
            <div class="card-content">
              <span class="card-title">Restore Session</span>
              <span class="card-desc">{lastSession.workspaces.length} workspace{lastSession.workspaces.length > 1 ? 's' : ''}</span>
            </div>
          </button>
        {/if}
      </div>
    </section>

    <!-- Recent Projects Section -->
    {#if recentProjects.length > 0}
      <section class="section">
        <h2 class="section-title">Recent</h2>
        <div class="recent-grid">
          {#each recentProjects.slice(0, 6) as project}
            <button class="recent-card" on:click={() => handleOpenRecent(project)}>
              <div class="recent-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
              </div>
              <div class="recent-info">
                <span class="recent-name">{project.name}</span>
                <span class="recent-time">{formatRelativeTime(project.lastOpened)}</span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Footer -->
    <footer class="footer">
      <span class="shortcut"><kbd>⌘</kbd><kbd>O</kbd> Open</span>
      <span class="shortcut"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> Commands</span>
    </footer>
  </div>
</div>

<SSHConnectionDialog 
  bind:show={showSSHDialog}
  editConnection={editingConnection}
  on:connect={handleSSHConnect}
  on:update={handleDialogClose}
  on:close={handleDialogClose}
/>

<style>
  /* Animations */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .welcome-container {
    width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background);
    padding: var(--spacing-lg);
  }

  .welcome-content {
    max-width: 520px;
    width: 100%;
    animation: fadeIn 400ms ease-out;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: var(--spacing-xl);
    animation: fadeInUp 500ms ease-out;
  }

  .logo {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .logo-mark {
    width: 28px;
    height: 28px;
    color: var(--color-accent);
  }

  .logo-mark svg {
    width: 100%;
    height: 100%;
  }

  .logo-text {
    font-family: var(--font-family-mono);
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: -0.02em;
  }

  .logo-suffix {
    color: var(--color-accent);
    font-weight: 400;
  }

  /* Sections */
  .section {
    margin-bottom: var(--spacing-lg);
    animation: fadeInUp 500ms ease-out;
    animation-fill-mode: both;
  }

  .section:nth-child(2) {
    animation-delay: 100ms;
  }

  .section:nth-child(3) {
    animation-delay: 200ms;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-tertiary);
    margin-bottom: var(--spacing-sm);
    padding-left: var(--spacing-xs);
  }

  /* Action Grid */
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--spacing-sm);
  }

  .action-card-wrapper {
    position: relative;
  }

  .action-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 150ms ease;
    text-align: left;
  }

  .action-card:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .action-card:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .card-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-accent);
    border-radius: var(--radius-sm);
    color: white;
  }

  .card-icon.ssh {
    background: #ff9500;
  }

  .card-icon.restore {
    background: #30d158;
  }

  .card-icon svg {
    width: 18px;
    height: 18px;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .card-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-desc {
    font-size: 11px;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Dropdown Menu */
  .dropdown-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    z-index: 100;
    overflow: hidden;
    min-width: 220px;
    animation: scaleIn 150ms ease-out;
    transform-origin: top center;
  }

  .dropdown-section {
    padding: var(--spacing-xs) 0;
    border-bottom: 1px solid var(--color-border);
  }

  .dropdown-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-tertiary);
    padding: var(--spacing-xs) var(--spacing-sm);
  }

  .dropdown-item-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
  }

  .dropdown-item-row:hover {
    background: var(--color-surface-hover);
  }

  .dropdown-item {
    display: flex;
    flex-direction: column;
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-sm);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: background 100ms ease;
  }

  .dropdown-item-row .dropdown-item:hover {
    background: transparent;
  }

  .item-actions {
    display: flex;
    gap: 2px;
    padding-right: var(--spacing-xs);
  }

  .action-btn {
    width: 24px;
    height: 24px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 100ms ease;
  }

  .action-btn svg {
    width: 12px;
    height: 12px;
  }

  .action-btn.edit:hover {
    background: rgba(0, 113, 227, 0.1);
    color: var(--color-accent);
  }

  .action-btn.delete:hover {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
  }

  .dropdown-item.new {
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-xs);
    color: var(--color-accent);
    font-size: 12px;
    font-weight: 500;
    padding: var(--spacing-sm);
  }

  .dropdown-item.new svg {
    width: 14px;
    height: 14px;
  }

  .item-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .item-meta {
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  /* Recent Grid */
  .recent-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-xs);
  }

  .recent-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 100ms ease;
    text-align: left;
  }

  .recent-card:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border);
  }

  .recent-card:active {
    transform: scale(0.98);
  }

  .recent-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-tertiary);
  }

  .recent-icon svg {
    width: 16px;
    height: 16px;
  }

  .recent-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .recent-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-time {
    font-size: 10px;
    color: var(--color-text-tertiary);
  }

  /* Footer */
  .footer {
    display: flex;
    justify-content: center;
    gap: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
    animation: fadeIn 600ms ease-out;
    animation-delay: 300ms;
    animation-fill-mode: both;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font-family: var(--font-family-mono);
    font-size: 10px;
  }
</style>
