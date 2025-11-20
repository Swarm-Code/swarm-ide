<script>
  import { outputStore } from '../stores/outputStore.js';
  
  let outputState;
  let searchInput = '';
  let levelFilter = 'all';
  let sourceFilter = 'all';
  let logsContainer;
  let compactMode = true;
  let copied = null;
  let showIconDebug = false;
  let showPdfDebug = false;

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
    
    navigator.clipboard.writeText(allText);
  }

  function handleCopyLog(log) {
    navigator.clipboard.writeText(log.message);
    copied = log.id;
    setTimeout(() => { copied = null; }, 1500);
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

  function getLevelColor(level) {
    switch(level) {
      case 'error': return '#ef4444';
      case 'warn': return '#f59e0b';
      case 'log': return '#6b7280';
      default: return '#6b7280';
    }
  }

  function getLevelBgColor(level) {
    switch(level) {
      case 'error': return 'rgba(239, 68, 68, 0.1)';
      case 'warn': return 'rgba(245, 158, 11, 0.1)';
      case 'log': return 'rgba(107, 114, 128, 0.1)';
      default: return 'transparent';
    }
  }
</script>

<div class="output-panel">
  <div class="output-top">
    <div class="output-header">
      <h2>Output</h2>
      <div class="header-actions">
        <button class="icon-button compact" on:click={handleCopyAll} title="Copy all logs">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M5.5 1.5h-3a1 1 0 00-1 1v9a1 1 0 001 1h7a1 1 0 001-1v-2M10 2.5h3a1 1 0 011 1v9a1 1 0 01-1 1h-7a1 1 0 01-1-1v-2" />
          </svg>
        </button>
        <button class="icon-button compact" on:click={handleClearLogs} title="Clear logs">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 4h12M6.5 7v4M9.5 7v4M3 4l.75 9.75a1 1 0 001 .75h7.5a1 1 0 001-.75L13 4M5 4V2.5a.5.5 0 01.5-.5h5a.5.5 0 01.5.5V4" />
          </svg>
        </button>
      </div>
    </div>

    <div class="output-filters">
      <div class="filter-item">
        <select value={levelFilter} on:change={handleLevelChange} title="Filter by level">
          <option value="all">All Levels</option>
          <option value="error">🔴 Error</option>
          <option value="warn">🟡 Warn</option>
          <option value="log">⚪ Log</option>
        </select>
      </div>
      
      <div class="filter-item">
        <select value={sourceFilter} on:change={handleSourceChange} title="Filter by source">
          <option value="all">All Sources</option>
          <option value="browser">🌐 Browser</option>
          <option value="renderer">📄 Renderer</option>
          <option value="main">⚙️ Main</option>
          <option value="icon-debug">🎨 Icon Debug</option>
          <option value="pdf-debug">📕 PDF Debug</option>
        </select>
      </div>
      
      <input 
        type="text" 
        class="search-input"
        placeholder="Search..." 
        value={searchInput} 
        on:input={handleSearchChange}
      />
      
      <span class="log-badge">{filteredLogs.length}/{outputState.logs.length}</span>
    </div>
  </div>

  <div class="output-container" bind:this={logsContainer}>
    {#if outputState.pdfDebugLogs && outputState.pdfDebugLogs.length > 0}
      <div class="pdf-debug-section">
        <div class="pdf-debug-header">
          <button class="toggle-btn pdf" on:click={() => showPdfDebug = !showPdfDebug}>
            {showPdfDebug ? '▼' : '▶'} 📕 PDF Debug ({outputState.pdfDebugLogs.length})
          </button>
          <button class="copy-all-btn" on:click={() => {
            const text = outputState.pdfDebugLogs
              .map(log => `[${log.timestamp}] [${log.level}] ${log.message}`)
              .join('\n');
            navigator.clipboard.writeText(text);
          }} title="Copy all PDF debug logs">
            📋 Copy All
          </button>
        </div>
        {#if showPdfDebug}
          <div class="pdf-debug-logs">
            {#each outputState.pdfDebugLogs as log (log.id)}
              <div class="pdf-debug-entry" data-level={log.level}>
                <span class="log-time">{log.timestamp}</span>
                <span class="log-badge-level" data-level={log.level}>{log.level[0].toUpperCase()}</span>
                <span class="log-message">{log.message}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if outputState.iconDebugLogs && outputState.iconDebugLogs.length > 0}
      <div class="icon-debug-section">
        <div class="icon-debug-header">
          <button class="toggle-btn" on:click={() => showIconDebug = !showIconDebug}>
            {showIconDebug ? '▼' : '▶'} 🎨 Icon Debug ({outputState.iconDebugLogs.length})
          </button>
          <button class="copy-all-btn" on:click={() => {
            const text = outputState.iconDebugLogs
              .map(log => `[${log.timestamp}] ${log.message}`)
              .join('\n');
            navigator.clipboard.writeText(text);
          }} title="Copy all icon debug logs">
            📋 Copy All
          </button>
        </div>
        {#if showIconDebug}
          <div class="icon-debug-logs">
            {#each outputState.iconDebugLogs as log (log.id)}
              <div class="icon-debug-entry" data-level={log.level}>
                <span class="log-time">{log.timestamp}</span>
                <span class="log-badge-level" data-level={log.level}>{log.level[0].toUpperCase()}</span>
                <span class="log-message">{log.message}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if filteredLogs.length === 0}
      <div class="empty-state">
        <p>No logs to display</p>
      </div>
    {/if}
    
    {#each filteredLogs as log, idx (log.id)}
      <div 
        class="log-entry" 
        data-level={log.level}
        on:mouseenter={(e) => e.currentTarget.classList.add('hovered')}
        on:mouseleave={(e) => e.currentTarget.classList.remove('hovered')}
      >
        <span class="log-line-num">{filteredLogs.length - idx}</span>
        <span class="log-badge-level" data-level={log.level}>{log.level[0].toUpperCase()}</span>
        <span class="log-time" title={log.timestamp}>{log.timestamp}</span>
        <span class="log-source">{log.source}</span>
        <span class="log-message">{log.message}</span>
        <button 
          class="log-copy-btn"
          class:copied={copied === log.id}
          on:click={() => handleCopyLog(log)}
          title="Copy message"
        >
          {copied === log.id ? '✓' : '📋'}
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .output-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-background);
    border-left: 1px solid var(--color-border);
  }

  .output-top {
    display: flex;
    flex-direction: column;
    background-color: var(--color-background);
    border-bottom: 1px solid var(--color-border);
  }

  .output-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    gap: 8px;
  }

  .output-header h2 {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .icon-button {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 150ms ease-out;
    padding: 0;
  }

  .icon-button:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-accent);
    color: var(--color-text-primary);
  }

  .icon-button svg {
    width: 14px;
    height: 14px;
  }

  .output-filters {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 6px 12px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .filter-item {
    display: flex;
  }

  .filter-item select {
    padding: 4px 8px;
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font-size: 11px;
    color: var(--color-text-primary);
    cursor: pointer;
    transition: all 150ms ease-out;
  }

  .filter-item select:hover {
    border-color: var(--color-text-secondary);
  }

  .filter-item select:focus {
    outline: none;
    border-color: var(--color-accent);
    background-color: var(--color-background);
  }

  .search-input {
    flex: 1;
    padding: 4px 8px;
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font-size: 11px;
    color: var(--color-text-primary);
    transition: all 150ms ease-out;
    min-width: 120px;
  }

  .search-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .search-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .log-badge {
    font-size: 10px;
    padding: 3px 6px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    color: var(--color-text-secondary);
    font-weight: 500;
    white-space: nowrap;
  }

  .output-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    background-color: var(--color-background);
    font-family: 'Courier New', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.4;
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
    font-size: 12px;
  }

  .log-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 2px 8px;
    background-color: transparent;
    border-left: 2px solid transparent;
    transition: background-color 100ms ease-out;
    min-height: 20px;
  }

  .log-entry[data-level="error"] {
    border-left-color: #ef4444;
  }

  .log-entry[data-level="warn"] {
    border-left-color: #f59e0b;
  }

  .log-entry[data-level="log"] {
    border-left-color: #6b7280;
  }

  .log-entry:hover {
    background-color: var(--color-surface-secondary);
  }

  .log-entry.hovered .log-copy-btn {
    opacity: 1;
  }

  .log-line-num {
    color: var(--color-text-tertiary);
    font-size: 10px;
    width: 32px;
    text-align: right;
    flex-shrink: 0;
    opacity: 0.6;
    font-weight: 500;
  }

  .log-badge-level {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .log-badge-level[data-level="error"] {
    background-color: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }

  .log-badge-level[data-level="warn"] {
    background-color: rgba(245, 158, 11, 0.15);
    color: #f59e0b;
  }

  .log-badge-level[data-level="log"] {
    background-color: rgba(107, 114, 128, 0.15);
    color: #6b7280;
  }

  .log-time {
    color: var(--color-text-tertiary);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 500;
    font-size: 11px;
  }

  .log-source {
    color: var(--color-text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
    font-weight: 500;
    font-size: 10px;
    opacity: 0.75;
  }

  .log-message {
    color: var(--color-text-primary);
    flex: 1;
    word-break: break-word;
    white-space: pre-wrap;
    font-size: 12px;
    min-width: 0;
  }

  .log-copy-btn {
    width: 18px;
    height: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: transparent;
    border: none;
    cursor: pointer;
    color: var(--color-text-secondary);
    font-size: 12px;
    opacity: 0;
    transition: opacity 100ms ease-out, color 100ms ease-out;
    flex-shrink: 0;
    padding: 0;
  }

  .log-copy-btn:hover {
    color: var(--color-accent);
  }

  .log-copy-btn.copied {
    opacity: 1;
    color: #10b981;
  }

  .pdf-debug-section {
    border-bottom: 2px solid #ef4444;
    margin-bottom: 8px;
    background-color: rgba(239, 68, 68, 0.05);
  }

  .pdf-debug-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background-color: rgba(239, 68, 68, 0.1);
    border-bottom: 1px solid #ef4444;
    gap: 8px;
  }

  .pdf-debug-logs {
    max-height: 400px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .pdf-debug-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-left: 2px solid #ef4444;
    transition: background-color 100ms ease;
    min-height: 18px;
  }

  .pdf-debug-entry[data-level="error"] {
    border-left-color: #ef4444;
  }

  .pdf-debug-entry[data-level="warn"] {
    border-left-color: #f59e0b;
  }

  .pdf-debug-entry[data-level="log"] {
    border-left-color: #0071e3;
  }

  .pdf-debug-entry:hover {
    background-color: rgba(239, 68, 68, 0.1);
  }

  .icon-debug-section {
    border-bottom: 2px solid var(--color-accent);
    margin-bottom: 8px;
    background-color: rgba(7, 113, 227, 0.05);
  }

  .icon-debug-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background-color: rgba(7, 113, 227, 0.1);
    border-bottom: 1px solid var(--color-accent);
    gap: 8px;
  }

  .toggle-btn {
    flex: 1;
    background: none;
    border: none;
    color: var(--color-accent);
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    text-align: left;
    padding: 0;
    transition: all 100ms ease;
  }

  .toggle-btn:hover {
    color: var(--color-accent-hover);
  }

  .copy-all-btn {
    padding: 4px 8px;
    background-color: var(--color-accent);
    border: none;
    border-radius: 3px;
    color: white;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 100ms ease;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .copy-all-btn:hover {
    background-color: var(--color-accent-hover);
  }

  .icon-debug-logs {
    max-height: 300px;
    overflow-y: auto;
    padding: 4px 0;
  }

  .icon-debug-entry {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-left: 2px solid var(--color-accent);
    transition: background-color 100ms ease;
    min-height: 18px;
  }

  .icon-debug-entry[data-level="error"] {
    border-left-color: #ef4444;
  }

  .icon-debug-entry[data-level="warn"] {
    border-left-color: #f59e0b;
  }

  .icon-debug-entry[data-level="log"] {
    border-left-color: #0071e3;
  }

  .icon-debug-entry:hover {
    background-color: rgba(7, 113, 227, 0.1);
  }
</style>
