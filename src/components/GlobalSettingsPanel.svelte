<script>
  import { createEventDispatcher } from 'svelte';
  import { deepWikiStore } from '../stores/deepWikiStore.js';
  import DeepWikiSettingsForm from './DeepWikiSettingsForm.svelte';

  export let selectedActivityId = null;

  const dispatch = createEventDispatcher();

  const activities = [
    {
      id: 'explorer',
      title: 'Explorer',
      description: 'File tree layout, auto-reveal, and workspace defaults.',
      icon: 'folders',
      hasSettings: false,
    },
    {
      id: 'browser',
      title: 'Browser Tabs',
      description: 'Embedded browsers, homepage, and devtools.',
      icon: 'globe',
      hasSettings: false,
    },
    {
      id: 'terminal',
      title: 'Terminal',
      description: 'Shell integration, font, and focus rules.',
      icon: 'terminal',
      hasSettings: false,
    },
    {
      id: 'deepwiki',
      title: 'DeepWiki',
      description: 'Plugin process, ports, and API credentials.',
      icon: 'wiki',
      hasSettings: true,
    },
    {
      id: 'chat',
      title: 'Chat',
      description: 'Agents, personas, and context handling.',
      icon: 'chat',
      hasSettings: false,
    },
  ];

  let deepWikiState;
  let internalActivityId = selectedActivityId;
  let lastPropValue = selectedActivityId;
  $: if (selectedActivityId !== lastPropValue) {
    lastPropValue = selectedActivityId;
    internalActivityId = selectedActivityId;
  }
  $: activeActivity = activities.find((activity) => activity.id === internalActivityId) || null;

  deepWikiStore.subscribe((state) => {
    deepWikiState = state;
  });

  function closePanel() {
    dispatch('close');
  }

  function handleBack() {
    updateActivity(null);
  }

  async function handleDeepWikiSave(event) {
    await deepWikiStore.saveSettings(event.detail);
  }

  function handleDeepWikiCancel() {
    updateActivity(null);
  }

  function activityIcon(id) {
    switch (id) {
      case 'explorer':
        return 'folders';
      case 'browser':
        return 'globe';
      case 'terminal':
        return 'terminal';
      case 'deepwiki':
        return 'wiki';
      case 'chat':
        return 'chat';
      default:
        return 'circle';
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      if (internalActivityId) {
        handleBack();
        return;
      }
      closePanel();
    }
  }

  function updateActivity(id) {
    internalActivityId = id;
    dispatch('activityChange', { activityId: id });
  }

  function selectActivity(id) {
    updateActivity(id);
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="global-settings-panel">
  <header class="settings-header">
    <div>
      <p class="eyebrow">Swarm IDE</p>
      <h1>Global Settings</h1>
      <p>Configure activities, plugins, and workspace defaults from one place.</p>
    </div>
    <button class="icon-button" on:click={closePanel} aria-label="Close settings">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </header>

  {#if activeActivity}
    <section class="activity-detail">
      <button class="back-button" type="button" on:click={handleBack}>
        ← All activities
      </button>
      <div class="detail-header">
        <div class="icon-ring">{#if activityIcon(activeActivity.id) === 'wiki'}📘{:else if activityIcon(activeActivity.id) === 'terminal'}⌨️{:else if activityIcon(activeActivity.id) === 'globe'}🌐{:else if activityIcon(activeActivity.id) === 'chat'}💬{:else}📁{/if}</div>
        <div>
          <h2>{activeActivity.title}</h2>
          <p>{activeActivity.description}</p>
        </div>
      </div>

      {#if activeActivity.id === 'deepwiki'}
        <DeepWikiSettingsForm
          settings={deepWikiState?.settings}
          status={deepWikiState?.status}
          on:save={handleDeepWikiSave}
          on:cancel={handleDeepWikiCancel}
        />
      {:else}
        <div class="placeholder">
          <p>Settings for {activeActivity.title} are coming soon.</p>
          <p class="muted">Command-click from the Activity Bar to jump straight here once they land.</p>
        </div>
      {/if}
    </section>
  {:else}
    <section class="activity-grid" aria-label="Settings activities">
      {#each activities as activity}
        <button
          class="activity-card"
          type="button"
          on:click={() => selectActivity(activity.id)}
        >
          <div class="card-icon">
            {#if activity.icon === 'wiki'}📘{:else if activity.icon === 'terminal'}⌨️{:else if activity.icon === 'globe'}🌐{:else if activity.icon === 'chat'}💬{:else}📁{/if}
          </div>
          <div class="card-body">
            <h3>{activity.title}</h3>
            <p>{activity.description}</p>
          </div>
          {#if !activity.hasSettings}
            <span class="badge">Soon</span>
          {/if}
        </button>
      {/each}
    </section>
  {/if}
</div>

<style>
  .global-settings-panel {
    flex: 1;
    height: 100%;
    padding: var(--spacing-xl);
    background: var(--color-background);
    color: var(--color-text-primary);
    overflow-y: auto;
  }

  .settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-md);
    margin-bottom: var(--spacing-xl);
  }

  .settings-header h1 {
    margin: 4px 0;
    font-size: clamp(1.8rem, 2.8vw, 2.5rem);
  }

  .settings-header p {
    margin: 0;
    color: var(--color-text-secondary);
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .icon-button {
    border: 1px solid var(--color-border);
    background: transparent;
    border-radius: var(--radius-full);
    width: 40px;
    height: 40px;
    display: grid;
    place-items: center;
    color: var(--color-text-secondary);
  }

  .activity-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-md);
  }

  .activity-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    background: var(--color-surface);
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    position: relative;
    cursor: pointer;
    transition: border-color var(--transition-fast), transform var(--transition-fast);
  }

  .activity-card:hover {
    border-color: var(--color-accent);
    transform: translateY(-2px);
  }

  .card-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--color-surface-secondary);
    display: grid;
    place-items: center;
    font-size: 1.5rem;
  }

  .card-body h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .card-body p {
    margin: 4px 0 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .badge {
    position: absolute;
    top: var(--spacing-sm);
    right: var(--spacing-sm);
    font-size: var(--font-size-xs);
    background: var(--color-surface-secondary);
    padding: 2px 8px;
    border-radius: var(--radius-full);
    color: var(--color-text-secondary);
  }

  .activity-detail {
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-lg);
  }

  .back-button {
    align-self: flex-start;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
    font-size: var(--font-size-sm);
  }

  .detail-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
  }

  .detail-header h2 {
    margin: 0 0 4px;
  }

  .detail-header p {
    margin: 0;
    color: var(--color-text-secondary);
  }

  .icon-ring {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-full);
    border: 1px solid var(--color-border);
    display: grid;
    place-items: center;
    font-size: 1.5rem;
    background: var(--color-surface-secondary);
  }

  .placeholder {
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-xl);
    text-align: center;
    background: var(--color-surface);
  }

  .placeholder p {
    margin: 0 0 8px;
  }

  .placeholder .muted {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }
</style>
