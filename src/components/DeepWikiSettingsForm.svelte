<script>
  import { createEventDispatcher } from 'svelte';

  export let settings;
  export let status;

  const dispatch = createEventDispatcher();

  const PROVIDER_OPTIONS = [
    { value: 'google', label: 'Google (Gemini)' },
    { value: 'openai', label: 'OpenAI' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'azure', label: 'Azure OpenAI' },
    { value: 'ollama', label: 'Ollama' },
  ];

  const ENV_FIELDS = [
    { key: 'OPENAI_API_KEY', label: 'OpenAI API Key', type: 'password', placeholder: 'sk-...' },
    { key: 'OPENAI_BASE_URL', label: 'OpenAI Base URL (optional)', type: 'text', placeholder: 'https://api.openai.com/v1' },
    { key: 'GOOGLE_API_KEY', label: 'Google API Key', type: 'password', placeholder: 'AI...' },
    { key: 'OPENROUTER_API_KEY', label: 'OpenRouter API Key', type: 'password', placeholder: 'or-' },
    { key: 'AZURE_OPENAI_API_KEY', label: 'Azure OpenAI Key', type: 'password', placeholder: 'xxxxxxxx' },
    { key: 'AZURE_OPENAI_ENDPOINT', label: 'Azure OpenAI Endpoint', type: 'text', placeholder: 'https://example.openai.azure.com' },
    { key: 'AZURE_OPENAI_VERSION', label: 'Azure API Version', type: 'text', placeholder: '2024-02-01' },
    { key: 'DEEPWIKI_EMBEDDER_TYPE', label: 'Embedder Type', type: 'text', placeholder: 'openai | google | lmstudio | ollama' },
    { key: 'OLLAMA_HOST', label: 'Ollama Host', type: 'text', placeholder: 'http://localhost:11434' },
    { key: 'LM_STUDIO_BASE_URL', label: 'LM Studio Base URL', type: 'text', placeholder: 'http://localhost:1234/v1' },
    { key: 'LM_STUDIO_API_KEY', label: 'LM Studio API Key', type: 'password', placeholder: 'lm-studio' },
  ];

  const buildEnvDefaults = (initialSettings) => {
    const env = {};
    for (const field of ENV_FIELDS) {
      env[field.key] = initialSettings?.env?.[field.key] || '';
    }
    return env;
  };

  const buildFormState = (initialSettings = {}) => ({
    repoPath: initialSettings.repoPath || '',
    backendPort: initialSettings.backendPort || 8001,
    frontendPort: initialSettings.frontendPort || 3007,
    enabled: initialSettings.enabled ?? true,
    autoStart: initialSettings.autoStart ?? true,
    openPaneOnLaunch: initialSettings.openPaneOnLaunch ?? true,
    autoGenerate: initialSettings.autoGenerate ?? true,
    provider: initialSettings.provider || 'google',
    model: initialSettings.model || '',
    pythonCommand: initialSettings.pythonCommand || '',
    nodeCommand: initialSettings.nodeCommand || '',
    env: buildEnvDefaults(initialSettings),
  });

  let form = buildFormState(settings);
  let lastSettingsRef = settings;

  $: if (settings && settings !== lastSettingsRef) {
    lastSettingsRef = settings;
    form = buildFormState(settings);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const env = {};
    for (const field of ENV_FIELDS) {
      env[field.key] = (form.env[field.key] || '').trim();
    }

    dispatch('save', {
      repoPath: form.repoPath.trim(),
      backendPort: Number(form.backendPort) || 8001,
      frontendPort: Number(form.frontendPort) || 3007,
      enabled: form.enabled,
      autoStart: form.autoStart,
      openPaneOnLaunch: form.openPaneOnLaunch,
      autoGenerate: form.autoGenerate,
      provider: form.provider,
      model: form.model.trim(),
      pythonCommand: form.pythonCommand.trim(),
      nodeCommand: form.nodeCommand.trim(),
      env,
    });
  }

  function handleCancel() {
    dispatch('cancel');
  }
</script>

<div class="deepwiki-settings">
  <div class="form-header">
    <div>
      <p class="eyebrow">Plugin</p>
      <h2>DeepWiki Plugin Settings</h2>
      <p class="description">Configure how Swarm IDE launches and authenticates the DeepWiki services.</p>
    </div>
    <button class="secondary-button" type="button" on:click={handleCancel}>Back</button>
  </div>

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

    <div class="field-row">
      <label>
        <span>Model provider</span>
        <select bind:value={form.provider}>
          {#each PROVIDER_OPTIONS as option}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>Preferred model (optional)</span>
        <input type="text" bind:value={form.model} placeholder="e.g. gpt-4o-mini, gemini-1.5-flash" />
      </label>
    </div>

    <div class="field-row">
      <label>
        <span>Python command (optional)</span>
        <input type="text" bind:value={form.pythonCommand} placeholder="/Users/me/project/.venv/bin/python" />
      </label>
      <label>
        <span>Node command (optional)</span>
        <input type="text" bind:value={form.nodeCommand} placeholder="npm, pnpm, bun..." />
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

    <div class="env-section">
      <div class="env-header">
        <h3>API keys & .env overrides</h3>
        <p>Values are written to the DeepWiki process environment (never synced to Git). Leave blank to inherit your shell defaults.</p>
      </div>
      <div class="env-grid">
        {#each ENV_FIELDS as field}
          <label>
            <span>{field.label}</span>
            {#if field.type === 'password'}
              <input
                type="password"
                bind:value={form.env[field.key]}
                placeholder={field.placeholder}
                autocomplete="off"
              />
            {:else}
              <input
                type="text"
                bind:value={form.env[field.key]}
                placeholder={field.placeholder}
                autocomplete="off"
              />
            {/if}
          </label>
        {/each}
      </div>
    </div>

    {#if status?.state === 'error'}
      <div class="form-error">
        <strong>Latest error:</strong>
        <p>{status?.message}</p>
      </div>
    {/if}

    <div class="form-actions">
      <button type="button" class="secondary-button" on:click={handleCancel}>Cancel</button>
      <button type="submit">Save & Apply</button>
    </div>
  </form>
</div>

<style>
  .deepwiki-settings {
    width: min(800px, 100%);
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .form-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
  }

  .eyebrow {
    margin: 0 0 4px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .form-header h2 {
    margin: 0;
    font-size: clamp(1.5rem, 2vw, 2rem);
  }

  .description {
    margin: 4px 0 0;
    color: var(--color-text-secondary);
  }

  .settings-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    padding-bottom: var(--spacing-xl);
  }

  label {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
    font-size: var(--font-size-sm);
  }

  input[type="text"],
  input[type="number"],
  input[type="password"],
  select {
    width: 100%;
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
  }

  .field-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-md);
  }

  .field-row label {
    flex: 1 1 240px;
  }

  .checkbox-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--spacing-sm);
  }

  .checkbox-grid label {
    flex-direction: row;
    align-items: center;
    gap: var(--spacing-sm);
    background: var(--color-surface);
    padding: var(--spacing-sm);
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
  }

  .env-section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    background: var(--color-surface);
  }

  .env-header h3 {
    margin: 0;
    font-size: var(--font-size-md);
  }

  .env-header p {
    margin: 4px 0 0;
    color: var(--color-text-secondary);
  }

  .env-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--spacing-sm);
  }

  .form-error {
    border: 1px solid rgba(255, 59, 48, 0.4);
    border-radius: var(--radius-sm);
    padding: var(--spacing-sm);
    background: rgba(255, 59, 48, 0.08);
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-sm);
    position: sticky;
    bottom: 0;
    padding: var(--spacing-sm) 0;
    background: linear-gradient(180deg, transparent, var(--color-background) 35%);
  }

  .secondary-button {
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-primary);
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .form-actions button[type="submit"] {
    background: var(--color-accent);
    color: #fff;
    border: none;
    padding: 8px 20px;
    border-radius: var(--radius-sm);
    cursor: pointer;
  }

  .form-actions button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
