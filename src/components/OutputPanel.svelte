<script>
  import { outputStore } from '../stores/outputStore.js';
  
  let outputState;
  let searchInput = '';
  let levelFilter = 'all';
  let sourceFilter = 'all';
  let logsContainer;

  outputStore.subscribe(state => {
    outputState = state;
  });

  $: filteredLogs = outputState.logs.filter(log => {
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
    const matchesSearch = !searchInput || 
      log.message.toLowerCase().includes(searchInput.toLowerCase()) ||
      log.timestamp.includes(searchInput);
    return matchesLevel && matchesSource && matchesSearch;
  });

  function handleCopyAll() {
    const allText = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`)
      .join('\n');
    
    navigator.clipboard.writeText(allText).then(() => {
      console.log('[OutputPanel] Copied to clipboard');
    });
  }

  function handleClearLogs() {
    outputStore.clearLogs();
  }

  function handleLevelChange(e) {
    levelFilter = e.target.value;
    outputStore.setLevelFilter(levelFilter);
  }

  function handleSourceChange(e) {
    sourceFilter = e.target.value;
    outputStore.setSourceFilter(sourceFilter);
  }

  function handleSearchChange(e) {
    searchInput = e.target.value;
  }

  // Don't auto-scroll - let user control their scroll position
  // New logs will appear but won't force scroll down

  function getLevelColor(level) {
    switch(level) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'log': return '#6b7280';
      default: return '#6b7280';
    }
  }
</script>

<div class="output-panel">
  <div class="output-header">
    <h2>Output</h2>
    <div class="header-actions">
      <button class="action-button" on:click={handleCopyAll} title="Copy all logs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>
      <button class="action-button" on:click={handleClearLogs} title="Clear logs">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  </div>

  <div class="output-filters">
    <div class="filter-group">
      <label for="level-filter">Level:</label>
      <select id="level-filter" value={levelFilter} on:change={handleLevelChange}>
        <option value="all">All</option>
        <option value="log">Log</option>
        <option value="warn">Warn</option>
        <option value="error">Error</option>
      </select>
    </div>
    
    <div class="filter-group">
      <label for="source-filter">Source:</label>
      <select id="source-filter" value={sourceFilter} on:change={handleSourceChange}>
        <option value="all">All</option>
        <option value="browser">🌐 Browser</option>
        <option value="renderer">Renderer</option>
        <option value="main">Main</option>
      </select>
    </div>
    
    <div class="filter-group search">
      <input 
        type="text" 
        placeholder="Search logs..." 
        value={searchInput} 
        on:input={handleSearchChange}
      />
    </div>
  </div>

  <div class="output-container" bind:this={logsContainer}>
    {#if filteredLogs.length === 0}
      <div class="empty-state">
        <p>No logs to display</p>
      </div>
    {/if}
    
    {#each filteredLogs as log (log.id)}
      <div class="log-entry" style="border-left-color: {getLevelColor(log.level)}">
        <span class="log-time">{log.timestamp}</span>
        <span class="log-level" data-level={log.level}>{log.level.toUpperCase()}</span>
        <span class="log-source">[{log.source}]</span>
        <span class="log-message">{log.message}</span>
      </div>
    {/each}
  </div>

  <div class="output-footer">
    <span class="log-count">{filteredLogs.length} / {outputState.logs.length} logs</span>
  </div>
</div>

<style>
  .output-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-background);
    border-left: 1px solid var(--color-border);
    padding-top: 4px;
  }

  .output-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg) var(--spacing-xl);
    border-bottom: 1px solid var(--color-border);
    background-color: var(--color-background);
  }

  .output-header h2 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
    letter-spacing: -0.5px;
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-sm);
  }

  .action-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .action-button:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .action-button svg {
    width: 16px;
    height: 16px;
  }

  .output-filters {
    display: flex;
    gap: var(--spacing-md);
    align-items: center;
    padding: var(--spacing-md) var(--spacing-lg);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
  }

  .filter-group label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .filter-group select,
  .filter-group input {
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    transition: all var(--transition-fast);
  }

  .filter-group select:focus,
  .filter-group input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.1);
  }

  .filter-group.search {
    flex: 1;
  }

  .filter-group input {
    width: 100%;
  }

  .output-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-md);
    background-color: var(--color-background);
    font-family: 'Courier New', monospace;
    font-size: var(--font-size-xs);
    line-height: 1.5;
  }

  .output-container::-webkit-scrollbar {
    width: 8px;
  }

  .output-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .output-container::-webkit-scrollbar-thumb {
    background-color: var(--color-border);
    border-radius: 4px;
  }

  .output-container::-webkit-scrollbar-thumb:hover {
    background-color: var(--color-text-tertiary);
  }

  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-tertiary);
  }

  .log-entry {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    border-left: 3px solid transparent;
    background-color: transparent;
    transition: background-color var(--transition-fast);
    word-break: break-word;
    white-space: pre-wrap;
  }

  .log-entry:hover {
    background-color: var(--color-surface-secondary);
  }

  .log-time {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: var(--font-weight-medium);
  }

  .log-level {
    color: var(--color-text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: var(--font-weight-semibold);
    font-size: 0.75rem;
    padding: 2px 6px;
    border-radius: 3px;
    background-color: var(--color-surface);
  }

  .log-level[data-level="error"] {
    background-color: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .log-level[data-level="warn"] {
    background-color: rgba(245, 158, 11, 0.1);
    color: #f59e0b;
  }

  .log-level[data-level="log"] {
    background-color: rgba(107, 114, 128, 0.1);
    color: #6b7280;
  }

  .log-source {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: var(--font-weight-medium);
    opacity: 0.7;
  }

  .log-message {
    color: var(--color-text-primary);
    flex: 1;
    word-break: break-word;
  }

  .output-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-lg);
    background-color: var(--color-surface-secondary);
    border-top: 1px solid var(--color-border);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .log-count {
    font-weight: var(--font-weight-medium);
  }
</style>
