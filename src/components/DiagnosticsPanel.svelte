<script>
  import { onMount, onDestroy } from 'svelte';
  import * as monaco from 'monaco-editor';

  let diagnostics = [];
  let errorCount = 0;
  let warningCount = 0;
  let infoCount = 0;
  let markerListener;

  function updateDiagnostics() {
    const allMarkers = monaco.editor.getModelMarkers({});
    
    diagnostics = allMarkers.map(marker => ({
      severity: marker.severity,
      severityText: getSeverityText(marker.severity),
      message: marker.message,
      source: marker.source || 'LSP',
      line: marker.startLineNumber,
      column: marker.startColumn,
      endLine: marker.endLineNumber,
      endColumn: marker.endColumn,
      uri: marker.resource.toString(),
      code: marker.code
    }));

    // Count by severity
    errorCount = diagnostics.filter(d => d.severity === monaco.MarkerSeverity.Error).length;
    warningCount = diagnostics.filter(d => d.severity === monaco.MarkerSeverity.Warning).length;
    infoCount = diagnostics.filter(d => d.severity === monaco.MarkerSeverity.Info).length;
  }

  function getSeverityText(severity) {
    const MarkerSeverity = monaco.MarkerSeverity;
    switch (severity) {
      case MarkerSeverity.Error: return 'Error';
      case MarkerSeverity.Warning: return 'Warning';
      case MarkerSeverity.Info: return 'Info';
      case MarkerSeverity.Hint: return 'Hint';
      default: return 'Unknown';
    }
  }

  function getSeverityClass(severity) {
    const MarkerSeverity = monaco.MarkerSeverity;
    switch (severity) {
      case MarkerSeverity.Error: return 'error';
      case MarkerSeverity.Warning: return 'warning';
      case MarkerSeverity.Info: return 'info';
      case MarkerSeverity.Hint: return 'hint';
      default: return '';
    }
  }

  function handleDiagnosticClick(diagnostic) {
    // Find all editor instances
    const editors = monaco.editor.getEditors();
    
    for (const editor of editors) {
      const model = editor.getModel();
      if (model && model.uri.toString() === diagnostic.uri) {
        // Focus the editor and navigate to the diagnostic location
        editor.focus();
        editor.revealLineInCenterIfOutsideViewport(diagnostic.line);
        editor.setPosition({
          lineNumber: diagnostic.line,
          column: diagnostic.column
        });
        
        // Select the range
        editor.setSelection({
          startLineNumber: diagnostic.line,
          startColumn: diagnostic.column,
          endLineNumber: diagnostic.endLine,
          endColumn: diagnostic.endColumn
        });
        
        break;
      }
    }
  }

  function getFileNameFromUri(uri) {
    try {
      const parts = uri.split('/');
      return parts[parts.length - 1];
    } catch {
      return uri;
    }
  }

  onMount(() => {
    // Listen for marker changes
    markerListener = monaco.editor.onDidChangeMarkers(() => {
      updateDiagnostics();
    });

    // Initial update
    updateDiagnostics();
  });

  onDestroy(() => {
    if (markerListener) {
      markerListener.dispose();
    }
  });
</script>

<div class="diagnostics-panel">
  <div class="diagnostics-header">
    <div class="diagnostics-title">Problems</div>
    <div class="diagnostics-counts">
      {#if errorCount > 0}
        <span class="count error-count">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="8" cy="8" r="6" stroke-width="1.5" />
            <path d="M8 5v3" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="8" cy="11" r="0.5" fill="currentColor" />
          </svg>
          {errorCount}
        </span>
      {/if}
      {#if warningCount > 0}
        <span class="count warning-count">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M8 2L2 14h12L8 2z" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M8 6v3" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
          </svg>
          {warningCount}
        </span>
      {/if}
      {#if infoCount > 0}
        <span class="count info-count">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="8" cy="8" r="6" stroke-width="1.5" />
            <path d="M8 7v4" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="8" cy="5" r="0.5" fill="currentColor" />
          </svg>
          {infoCount}
        </span>
      {/if}
    </div>
  </div>

  <div class="diagnostics-list">
    {#if diagnostics.length === 0}
      <div class="diagnostics-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p>No problems detected</p>
      </div>
    {:else}
      {#each diagnostics as diagnostic (diagnostic.uri + diagnostic.line + diagnostic.column + diagnostic.message)}
        <button
          class="diagnostic-item {getSeverityClass(diagnostic.severity)}"
          on:click={() => handleDiagnosticClick(diagnostic)}
        >
          <div class="diagnostic-icon">
            {#if diagnostic.severity === 8}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="8" cy="8" r="6" stroke-width="1.5" />
                <path d="M8 5v3" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="8" cy="11" r="0.5" fill="currentColor" />
              </svg>
            {:else if diagnostic.severity === 4}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <path d="M8 2L2 14h12L8 2z" stroke-width="1.5" stroke-linejoin="round" />
                <path d="M8 6v3" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="8" cy="11.5" r="0.5" fill="currentColor" />
              </svg>
            {:else}
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
                <circle cx="8" cy="8" r="6" stroke-width="1.5" />
                <path d="M8 7v4" stroke-width="1.5" stroke-linecap="round" />
                <circle cx="8" cy="5" r="0.5" fill="currentColor" />
              </svg>
            {/if}
          </div>
          <div class="diagnostic-content">
            <div class="diagnostic-message">{diagnostic.message}</div>
            <div class="diagnostic-location">
              {getFileNameFromUri(diagnostic.uri)} [{diagnostic.line}, {diagnostic.column}]
              {#if diagnostic.source}
                <span class="diagnostic-source">• {diagnostic.source}</span>
              {/if}
            </div>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .diagnostics-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    border-top: 1px solid var(--color-border);
  }

  .diagnostics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    height: 36px;
  }

  .diagnostics-title {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .diagnostics-counts {
    display: flex;
    gap: var(--spacing-md);
  }

  .count {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .count svg {
    width: 14px;
    height: 14px;
  }

  .error-count {
    color: #ff3b30;
  }

  .warning-count {
    color: #ff9500;
  }

  .info-count {
    color: #007aff;
  }

  .diagnostics-list {
    flex: 1;
    overflow-y: auto;
  }

  .diagnostics-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .diagnostics-empty svg {
    width: 48px;
    height: 48px;
  }

  .diagnostics-empty p {
    font-size: var(--font-size-base);
  }

  .diagnostic-item {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    width: 100%;
    text-align: left;
    border-bottom: 1px solid var(--color-border);
    transition: background-color var(--transition-fast);
    cursor: pointer;
  }

  .diagnostic-item:hover {
    background-color: var(--color-surface-hover);
  }

  .diagnostic-icon {
    flex-shrink: 0;
    padding-top: 2px;
  }

  .diagnostic-icon svg {
    width: 16px;
    height: 16px;
  }

  .diagnostic-item.error .diagnostic-icon {
    color: #ff3b30;
  }

  .diagnostic-item.warning .diagnostic-icon {
    color: #ff9500;
  }

  .diagnostic-item.info .diagnostic-icon,
  .diagnostic-item.hint .diagnostic-icon {
    color: #007aff;
  }

  .diagnostic-content {
    flex: 1;
    min-width: 0;
  }

  .diagnostic-message {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-xs);
    word-wrap: break-word;
  }

  .diagnostic-location {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
  }

  .diagnostic-source {
    color: var(--color-text-tertiary);
  }
</style>
