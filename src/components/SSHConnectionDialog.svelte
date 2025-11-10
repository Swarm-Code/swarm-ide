<script>
  import { createEventDispatcher } from 'svelte';
  import { sshStore } from '../stores/sshStore.js';

  export let show = false;
  
  const dispatch = createEventDispatcher();
  
  let formData = {
    name: '',
    host: '',
    port: '22',
    username: '',
    authMethod: 'password', // 'password' or 'key'
    password: '',
    privateKey: '',
    saveCredentials: false
  };
  
  let errors = {};

  function validateForm() {
    errors = {};
    if (!formData.name.trim()) errors.name = 'Name is required';
    if (!formData.host.trim()) errors.host = 'Host is required';
    if (!formData.username.trim()) errors.username = 'Username is required';
    if (formData.authMethod === 'password' && !formData.password) {
      errors.password = 'Password is required';
    }
    if (formData.authMethod === 'key' && !formData.privateKey) {
      errors.privateKey = 'Private key is required';
    }
    return Object.keys(errors).length === 0;
  }

  async function handleConnect() {
    if (!validateForm()) return;
    
    const connection = {
      id: `ssh-${Date.now()}`,
      name: formData.name,
      host: formData.host,
      port: parseInt(formData.port),
      username: formData.username,
      authMethod: formData.authMethod,
      savedCredentials: formData.saveCredentials,
      timestamp: new Date().toISOString()
    };
    
    console.log('[SSHDialog] Creating connection:', connection);
    console.log('[SSHDialog] Save credentials?', formData.saveCredentials);
    
    // Always include credentials in the connection object for immediate use
    const credentials = {
      password: formData.authMethod === 'password' ? formData.password : undefined,
      privateKey: formData.authMethod === 'key' ? formData.privateKey : undefined
    };
    
    // If save is toggled, add to connection object for storage
    if (formData.saveCredentials) {
      connection.credentials = credentials;
      console.log('[SSHDialog] Credentials will be saved');
    }
    
    // Save to electron store (will encrypt if credentials present)
    if (window.electronAPI) {
      const result = await window.electronAPI.sshSaveConnection(connection);
      console.log('[SSHDialog] Save result:', result);
    }
    
    // Update local store
    sshStore.addConnection(connection);
    
    // Dispatch with credentials (either saved or temp)
    dispatch('connect', {
      connection,
      tempCredentials: !formData.saveCredentials ? credentials : undefined
    });
    
    console.log('[SSHDialog] Dispatched connect event');
    
    handleClose();
  }

  function handleClose() {
    show = false;
    formData = {
      name: '',
      host: '',
      port: '22',
      username: '',
      authMethod: 'password',
      password: '',
      privateKey: '',
      saveCredentials: false
    };
    errors = {};
    dispatch('close');
  }

  async function handleSelectKeyFile() {
    if (window.electronAPI) {
      const result = await window.electronAPI.sshSelectKeyFile();
      if (result) {
        formData.privateKey = result;
      }
    }
  }
</script>

{#if show}
  <div class="overlay" on:click={handleClose}>
    <div class="dialog" on:click|stopPropagation>
      <div class="dialog-header">
        <h2>SSH Connection</h2>
        <button class="close-btn" on:click={handleClose}>×</button>
      </div>
      
      <div class="dialog-content">
        <div class="form-group">
          <label for="name">Connection Name</label>
          <input
            id="name"
            type="text"
            bind:value={formData.name}
            placeholder="My Server"
            class:error={errors.name}
          />
          {#if errors.name}<span class="error-text">{errors.name}</span>{/if}
        </div>

        <div class="form-row">
          <div class="form-group">
            <label for="host">Host</label>
            <input
              id="host"
              type="text"
              bind:value={formData.host}
              placeholder="example.com"
              class:error={errors.host}
            />
            {#if errors.host}<span class="error-text">{errors.host}</span>{/if}
          </div>

          <div class="form-group">
            <label for="port">Port</label>
            <input
              id="port"
              type="number"
              bind:value={formData.port}
              placeholder="22"
            />
          </div>
        </div>

        <div class="form-group">
          <label for="username">Username</label>
          <input
            id="username"
            type="text"
            bind:value={formData.username}
            placeholder="user"
            class:error={errors.username}
          />
          {#if errors.username}<span class="error-text">{errors.username}</span>{/if}
        </div>

        <div class="form-group">
          <label>Authentication Method</label>
          <div class="auth-tabs">
            <button
              class="auth-tab"
              class:active={formData.authMethod === 'password'}
              on:click={() => formData.authMethod = 'password'}
            >
              Password
            </button>
            <button
              class="auth-tab"
              class:active={formData.authMethod === 'key'}
              on:click={() => formData.authMethod = 'key'}
            >
              Private Key
            </button>
          </div>
        </div>

        {#if formData.authMethod === 'password'}
          <div class="form-group">
            <label for="password">Password</label>
            <input
              id="password"
              type="password"
              bind:value={formData.password}
              placeholder="••••••••"
              class:error={errors.password}
            />
            {#if errors.password}<span class="error-text">{errors.password}</span>{/if}
          </div>
        {:else}
          <div class="form-group">
            <label for="privateKey">Private Key Path</label>
            <div class="key-input-group">
              <input
                id="privateKey"
                type="text"
                bind:value={formData.privateKey}
                placeholder="/home/user/.ssh/id_rsa"
                class:error={errors.privateKey}
              />
              <button class="browse-btn" on:click={handleSelectKeyFile}>
                Browse
              </button>
            </div>
            {#if errors.privateKey}<span class="error-text">{errors.privateKey}</span>{/if}
          </div>
        {/if}

        <div class="form-group">
          <label class="checkbox-label">
            <input
              type="checkbox"
              bind:checked={formData.saveCredentials}
            />
            <span>Save credentials (encrypted)</span>
          </label>
          <p class="hint">Credentials will be stored securely on your local machine</p>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="secondary-btn" on:click={handleClose}>Cancel</button>
        <button class="primary-btn" on:click={handleConnect}>Connect</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    backdrop-filter: blur(4px);
  }

  .dialog {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 500px;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--color-border);
  }

  .dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .dialog-header h2 {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .close-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
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

  .dialog-content {
    padding: var(--spacing-lg);
    max-height: 60vh;
    overflow-y: auto;
  }

  .form-group {
    margin-bottom: var(--spacing-md);
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--spacing-md);
  }

  .form-row .form-group:last-child {
    width: 120px;
  }

  label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    margin-bottom: var(--spacing-xs);
  }

  input[type="text"],
  input[type="password"],
  input[type="number"] {
    width: 100%;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-base);
    transition: all var(--transition-fast);
  }

  input[type="text"]:focus,
  input[type="password"]:focus,
  input[type="number"]:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(0, 113, 227, 0.1);
  }

  input.error {
    border-color: #ff3b30;
  }

  .error-text {
    display: block;
    font-size: var(--font-size-xs);
    color: #ff3b30;
    margin-top: var(--spacing-xs);
  }

  .auth-tabs {
    display: flex;
    gap: var(--spacing-xs);
  }

  .auth-tab {
    flex: 1;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .auth-tab:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .auth-tab.active {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .key-input-group {
    display: flex;
    gap: var(--spacing-xs);
  }

  .browse-btn {
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
    white-space: nowrap;
  }

  .browse-btn:hover {
    background: var(--color-surface-hover);
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    cursor: pointer;
    font-weight: var(--font-weight-regular);
  }

  .checkbox-label input[type="checkbox"] {
    cursor: pointer;
  }

  .hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-top: var(--spacing-xs);
    margin-bottom: 0;
  }

  .dialog-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    padding: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
  }

  .secondary-btn,
  .primary-btn {
    padding: var(--spacing-sm) var(--spacing-lg);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .secondary-btn {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .secondary-btn:hover {
    background: var(--color-surface-hover);
  }

  .primary-btn {
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    color: white;
  }

  .primary-btn:hover {
    background: var(--color-accent-hover);
  }
</style>
