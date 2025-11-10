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

  onMount(async () => {
    if (window.electronAPI) {
      recentProjects = await window.electronAPI.getRecentProjects();
      lastSession = await window.electronAPI.workspaceGetLastSession();
      
      // Load saved SSH connections
      const savedSSH = await window.electronAPI.sshGetConnections();
      console.log('[WelcomeScreen] Loaded SSH connections:', savedSSH);
      if (savedSSH && savedSSH.length > 0) {
        sshStore.setConnections(savedSSH);
        console.log('[WelcomeScreen] Set SSH connections in store:', savedSSH.length);
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

  async function handleQuickConnect(connection) {
    showSSHMenu = false;
    
    console.log('[WelcomeScreen] 🔌 Quick connect to:', connection);
    console.log('[WelcomeScreen] Connection details:', JSON.stringify(connection, null, 2));
    let credentials = connection.credentials;
    console.log('[WelcomeScreen] Has credentials?', !!credentials);
    
    if (credentials) {
      console.log('[WelcomeScreen] Credentials object:', {
        hasPassword: !!credentials.password,
        hasPrivateKey: !!credentials.privateKey,
        passwordLength: credentials.password?.length,
        privateKeyLength: credentials.privateKey?.length
      });
    }
    
    // If no saved credentials, prompt for them
    if (!credentials || (!credentials.password && !credentials.privateKey)) {
      console.log('[WelcomeScreen] ❌ No credentials found, opening dialog');
      showSSHDialog = true;
      return;
    }
    
    console.log('[WelcomeScreen] ✅ Using saved credentials');
    
    // Test connection first
    console.log('[WelcomeScreen] 🧪 Testing SSH connection...');
    try {
      const testResult = await window.electronAPI.sshTestConnection(connection, credentials);
      console.log('[WelcomeScreen] Test result:', testResult);
      
      if (!testResult.success) {
        console.error('[WelcomeScreen] ❌ Connection test failed:', testResult.error);
        alert(`SSH connection failed: ${testResult.error}\n\nPlease check your credentials and try again.`);
        return;
      }
      
      console.log('[WelcomeScreen] ✅ Connection test successful:', testResult.message);
    } catch (err) {
      console.error('[WelcomeScreen] ❌ Connection test error:', err);
      alert(`Failed to test SSH connection: ${err.message}`);
      return;
    }
    
    console.log('[WelcomeScreen] 🚀 Creating SSH workspace...');
    
    // Create SSH terminal workspace with saved credentials
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const sshPath = `ssh://${connection.username}@${connection.host}:${connection.port}`;
    
    // Check if workspace with this path already exists
    let existingWorkspace = null;
    const unsubscribe = workspaceStore.subscribe(state => {
      existingWorkspace = state.workspaces.find(w => w.path === sshPath);
    });
    unsubscribe();
    
    if (existingWorkspace) {
      console.log('[WelcomeScreen] ⚠️ Found existing workspace with same path:', existingWorkspace.id);
      console.log('[WelcomeScreen] Existing workspace BEFORE update:', JSON.stringify(existingWorkspace));
      
      // Update it with SSH info instead of creating new one
      console.log('[WelcomeScreen] 🔄 Updating existing workspace with SSH metadata');
      workspaceStore.updateWorkspace(existingWorkspace.id, {
        isSSH: true,
        sshConnection: connection,
        color: '#ff9500'
      });
      
      // Verify the update
      let updatedWorkspace = null;
      const unsub2 = workspaceStore.subscribe(state => {
        updatedWorkspace = state.workspaces.find(w => w.id === existingWorkspace.id);
      });
      unsub2();
      console.log('[WelcomeScreen] Existing workspace AFTER update:', JSON.stringify(updatedWorkspace));
      
      workspaceStore.setActiveWorkspace(existingWorkspace.id);
      
      // Store credentials for existing workspace
      if (credentials && window.electronAPI) {
        console.log('[WelcomeScreen] 🔑 Storing credentials for workspace:', existingWorkspace.id);
        await window.electronAPI.sshSetTempCredentials({
          workspaceId: existingWorkspace.id,
          credentials
        });
      }
      
      console.log('[WelcomeScreen] ✨ SSH workspace setup complete (reused existing)!');
      return;
    }
    
    const workspace = {
      id: workspaceId,
      path: sshPath,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    console.log('[WelcomeScreen] 📦 Adding workspace:', workspaceId);
    console.log('[WelcomeScreen] Workspace object:', workspace);
    workspaceStore.addWorkspace(workspace);
    
    console.log('[WelcomeScreen] 🎯 Setting active workspace:', workspaceId);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    // Set as current project
    console.log('[WelcomeScreen] 📂 Setting current project');
    appStore.setCurrentProject({
      path: workspace.path,
      name: connection.name,
      lastOpened: new Date().toISOString(),
      isSSH: true
    });
    
    // Store credentials for this session
    if (credentials && window.electronAPI) {
      console.log('[WelcomeScreen] 🔑 Storing credentials for workspace:', workspaceId);
      await window.electronAPI.sshSetTempCredentials({
        workspaceId,
        credentials
      });
      console.log('[WelcomeScreen] ✅ Credentials stored successfully');
    }
    
    // Establish SSH connection by creating a dummy terminal (this creates the persistent connection)
    // The connection will be reused by SFTP and other terminals
    console.log('[WelcomeScreen] 🔌 Establishing persistent SSH connection...');
    const dummyTerminalId = `terminal-${Date.now()}`;
    try {
      const result = await window.electronAPI.sshCreateTerminal({
        terminalId: dummyTerminalId,
        connection: connection,
        credentials: credentials,
        workspaceId: workspaceId
      });
      
      if (result.success) {
        console.log('[WelcomeScreen] ✅ SSH connection established');
        // Kill the dummy terminal immediately - we just needed the connection
        await window.electronAPI.sshKill({ terminalId: dummyTerminalId });
        console.log('[WelcomeScreen] 🗑️ Closed dummy terminal, connection remains active');
      } else {
        console.error('[WelcomeScreen] ❌ Failed to establish SSH connection:', result.error);
      }
    } catch (err) {
      console.error('[WelcomeScreen] ❌ Error establishing SSH connection:', err);
    }
    
    console.log('[WelcomeScreen] ✨ SSH workspace setup complete!');
  }

  function handleNewSSHConnection() {
    showSSHMenu = false;
    showSSHDialog = true;
  }

  async function handleSSHConnect(event) {
    console.log('[WelcomeScreen] SSH Connect event:', event);
    const { connection, tempCredentials } = event.detail;
    
    // Create SSH terminal workspace
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const workspace = {
      id: workspaceId,
      path: `ssh://${connection.username}@${connection.host}:${connection.port}`,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    console.log('[WelcomeScreen] Creating SSH workspace:', workspace);
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    // Set as current project
    appStore.setCurrentProject({
      path: workspace.path,
      name: connection.name,
      lastOpened: new Date().toISOString(),
      isSSH: true
    });
    
    // Store credentials for this session (temp or saved)
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
      <div class="primary-actions">
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

        <div class="ssh-button-wrapper">
          <button class="primary-button ssh-button" on:click={() => showSSHMenu = !showSSHMenu}>
            <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            SSH Connection
          </button>

          {#if showSSHMenu}
            <div class="ssh-menu">
              <div class="ssh-menu-header">
                <span>SSH Connections</span>
                <button class="close-menu" on:click={() => showSSHMenu = false}>×</button>
              </div>

              {#if $sshStore.connections.length > 0}
                <div class="ssh-connections-list">
                  {#each $sshStore.connections as connection}
                    <button 
                      class="ssh-connection-item"
                      on:click={() => handleQuickConnect(connection)}
                    >
                      <div class="connection-info">
                        <div class="connection-name">{connection.name}</div>
                        <div class="connection-details">
                          {connection.username}@{connection.host}:{connection.port}
                        </div>
                      </div>
                      <svg class="arrow-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  {/each}
                </div>
                <div class="menu-divider"></div>
              {/if}

              <button class="new-ssh-button" on:click={handleNewSSHConnection}>
                <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                </svg>
                New SSH Connection
              </button>
            </div>
          {/if}
        </div>
      </div>

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

<SSHConnectionDialog 
  bind:show={showSSHDialog}
  on:connect={handleSSHConnect}
/>

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

  .primary-actions {
    display: flex;
    gap: var(--spacing-md);
    width: 100%;
    justify-content: center;
  }

  .primary-actions .primary-button {
    flex: 1;
    max-width: 250px;
  }

  .ssh-button-wrapper {
    position: relative;
    flex: 1;
    max-width: 250px;
  }

  .ssh-menu {
    position: absolute;
    top: calc(100% + var(--spacing-sm));
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    z-index: 1000;
    overflow: hidden;
    min-width: 320px;
  }

  .ssh-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-background);
    border-bottom: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .close-menu {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 20px;
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

  .close-menu:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .ssh-connections-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .ssh-connection-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: var(--spacing-md);
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    transition: all var(--transition-fast);
    gap: var(--spacing-md);
  }

  .ssh-connection-item:hover {
    background: var(--color-surface-hover);
  }

  .connection-info {
    flex: 1;
    min-width: 0;
  }

  .connection-name {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connection-details {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .arrow-icon {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    color: var(--color-text-tertiary);
  }

  .menu-divider {
    height: 1px;
    background: var(--color-border);
    margin: var(--spacing-xs) 0;
  }

  .new-ssh-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md);
    background: none;
    border: none;
    color: var(--color-accent);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .new-ssh-button:hover {
    background: var(--color-surface-hover);
  }

  .new-ssh-button .icon {
    width: 18px;
    height: 18px;
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
