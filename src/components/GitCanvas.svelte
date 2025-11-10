<script>
  import { onMount, onDestroy } from 'svelte';
  import { gitStore, currentGitData } from '../stores/gitStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import * as monaco from 'monaco-editor';
  
  let gitData = null;
  let workspacePath = null;
  let selectedFile = null;
  let selectedFileStaged = false;
  let diffEditor = null;
  let diffEditorContainer = null;
  let commitMessage = '';
  let commitDescription = '';
  let isCommitting = false;
  
  const unsubscribeGit = currentGitData.subscribe((data) => {
    gitData = data;
    
    // If selected file no longer exists in changes, clear selection
    if (selectedFile && gitData) {
      const allFiles = [...(gitData.status?.files || [])];
      const fileStillExists = allFiles.some(f => f.path === selectedFile.path);
      if (!fileStillExists) {
        selectedFile = null;
        selectedFileStaged = false;
      }
    }
  });
  
  const unsubscribePath = activeWorkspacePath.subscribe((path) => {
    workspacePath = path;
  });
  
  onDestroy(() => {
    unsubscribeGit();
    unsubscribePath();
    if (diffEditor) {
      diffEditor.dispose();
    }
  });
  
  // Fix: Files with working_dir changes are unstaged, files with index changes are staged
  $: unstagedFiles = gitData?.status?.files?.filter(f => 
    f.working_dir && f.working_dir !== ' ' && f.working_dir !== '?'
  ) || [];
  $: stagedFiles = gitData?.status?.files?.filter(f => 
    f.index && f.index !== ' ' && f.index !== '?' && f.index !== '.'
  ) || [];
  $: allFiles = gitData?.status?.files || [];
  
  // Load diff when file is selected
  $: if (selectedFile && diffEditorContainer) {
    loadDiff(selectedFile);
  }
  
  async function loadDiff(file) {
    if (!file || !workspacePath) return;
    
    try {
      const diffContent = await gitStore.getDiff(file.path);
      
      // Create or update Monaco diff editor
      if (!diffEditor && diffEditorContainer) {
        diffEditor = monaco.editor.createDiffEditor(diffEditorContainer, {
          theme: 'vs-dark',
          readOnly: true,
          automaticLayout: true,
          renderSideBySide: true,
          scrollBeyondLastLine: false,
          minimap: { enabled: false },
        });
      }
      
      if (diffEditor) {
        // Parse diff to get original and modified content
        // For now, show diff content in modified, empty in original
        const originalModel = monaco.editor.createModel('', getLanguageFromPath(file.path));
        const modifiedModel = monaco.editor.createModel(diffContent || '', getLanguageFromPath(file.path));
        
        diffEditor.setModel({
          original: originalModel,
          modified: modifiedModel,
        });
      }
    } catch (error) {
      console.error('Failed to load diff:', error);
    }
  }
  
  function getLanguageFromPath(path) {
    const ext = path.split('.').pop();
    const langMap = {
      'js': 'javascript',
      'ts': 'typescript',
      'jsx': 'javascript',
      'tsx': 'typescript',
      'json': 'json',
      'html': 'html',
      'css': 'css',
      'scss': 'scss',
      'md': 'markdown',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'sh': 'shell',
      'yaml': 'yaml',
      'yml': 'yaml',
      'xml': 'xml',
      'sql': 'sql',
    };
    return langMap[ext] || 'plaintext';
  }
  
  function handleFileClick(file, isStaged) {
    selectedFile = file;
    selectedFileStaged = isStaged;
  }
  
  async function handleStageFile(file) {
    await gitStore.stageFile(file.path);
  }
  
  async function handleUnstageFile(file) {
    await gitStore.unstageFile(file.path);
  }
  
  async function handleStageAll() {
    await gitStore.stageAll();
  }
  
  async function handleUnstageAll() {
    await gitStore.unstageAll();
  }
  
  async function handleCommit() {
    if (!commitMessage.trim() || stagedFiles.length === 0 || isCommitting) return;
    
    isCommitting = true;
    try {
      const fullMessage = commitDescription.trim() 
        ? `${commitMessage.trim()}\n\n${commitDescription.trim()}`
        : commitMessage.trim();
      
      await gitStore.commit(fullMessage);
      
      // Clear form on success
      commitMessage = '';
      commitDescription = '';
      selectedFile = null;
    } catch (error) {
      console.error('Commit failed:', error);
      alert('Commit failed: ' + error.message);
    } finally {
      isCommitting = false;
    }
  }
  
  function getStatusIcon(file) {
    const status = file.working_dir || file.index;
    switch (status) {
      case 'M': return '●';
      case 'A': return '+';
      case 'D': return '−';
      case 'R': return '→';
      case '?': return '?';
      default: return '●';
    }
  }
  
  function getStatusColor(file) {
    const status = file.working_dir || file.index;
    switch (status) {
      case 'M': return 'var(--color-warning)';
      case 'A': return 'var(--color-success)';
      case 'D': return 'var(--color-error)';
      case 'R': return 'var(--color-info)';
      case '?': return 'var(--color-text-secondary)';
      default: return 'var(--color-text-primary)';
    }
  }
  
  onMount(() => {
    // Initialize diff editor after mount
    if (diffEditorContainer && selectedFile) {
      loadDiff(selectedFile);
    }
  });
</script>

<div class="git-canvas">
  <!-- Left panel: Changes list -->
  <div class="changes-panel">
    <div class="panel-header">
      <h3>Changes</h3>
      <div class="header-actions">
        {#if unstagedFiles.length > 0}
          <button class="icon-button" on:click={handleStageAll} title="Stage All Changes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        {/if}
      </div>
    </div>
    
    <div class="panel-content">
      {#if unstagedFiles.length > 0}
        <div class="file-section">
          <div class="section-title">Unstaged ({unstagedFiles.length})</div>
          <div class="file-list">
            {#each unstagedFiles as file}
              <div 
                class="file-item" 
                class:selected={selectedFile?.path === file.path && !selectedFileStaged}
                on:click={() => handleFileClick(file, false)}
              >
                <span class="status-icon" style="color: {getStatusColor(file)}">{getStatusIcon(file)}</span>
                <span class="file-path">{file.path}</span>
                <button class="stage-button" on:click|stopPropagation={() => handleStageFile(file)} title="Stage">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      {#if stagedFiles.length > 0}
        <div class="file-section">
          <div class="section-title">
            Staged ({stagedFiles.length})
            <button class="icon-button" on:click={handleUnstageAll} title="Unstage All">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
              </svg>
            </button>
          </div>
          <div class="file-list">
            {#each stagedFiles as file}
              <div 
                class="file-item" 
                class:selected={selectedFile?.path === file.path && selectedFileStaged}
                on:click={() => handleFileClick(file, true)}
              >
                <span class="status-icon" style="color: {getStatusColor(file)}">{getStatusIcon(file)}</span>
                <span class="file-path">{file.path}</span>
                <button class="unstage-button" on:click|stopPropagation={() => handleUnstageFile(file)} title="Unstage">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/if}
      
      {#if allFiles.length === 0}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          <p>No changes</p>
        </div>
      {/if}
    </div>
  </div>
  
  <!-- Center panel: Diff viewer -->
  <div class="diff-panel">
    {#if selectedFile}
      <div class="diff-header">
        <span class="status-icon" style="color: {getStatusColor(selectedFile)}">{getStatusIcon(selectedFile)}</span>
        <span class="file-path">{selectedFile.path}</span>
        <div class="diff-actions">
          {#if selectedFileStaged}
            <button class="action-button" on:click={() => handleUnstageFile(selectedFile)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
              </svg>
              Unstage
            </button>
          {:else}
            <button class="action-button" on:click={() => handleStageFile(selectedFile)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Stage
            </button>
          {/if}
        </div>
      </div>
      <div class="diff-editor" bind:this={diffEditorContainer}></div>
    {:else}
      <div class="diff-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>Select a file to view changes</p>
      </div>
    {/if}
  </div>
  
  <!-- Right panel: Commit panel -->
  <div class="commit-panel">
    <div class="panel-header">
      <h3>Commit</h3>
    </div>
    
    <div class="panel-content">
      {#if stagedFiles.length > 0}
        <div class="commit-form">
          <div class="form-group">
            <label for="commit-message">Message</label>
            <input
              id="commit-message"
              type="text"
              bind:value={commitMessage}
              placeholder="Commit message (required)"
              maxlength="72"
              disabled={isCommitting}
            />
            <div class="char-counter" class:warning={commitMessage.length > 50}>
              {commitMessage.length}/72
            </div>
          </div>
          
          <div class="form-group">
            <label for="commit-description">Description (optional)</label>
            <textarea
              id="commit-description"
              bind:value={commitDescription}
              placeholder="Extended description..."
              rows="4"
              disabled={isCommitting}
            ></textarea>
          </div>
          
          <div class="staged-files-preview">
            <div class="preview-title">Staged files ({stagedFiles.length})</div>
            {#each stagedFiles as file}
              <div class="preview-file">
                <span class="status-icon" style="color: {getStatusColor(file)}">{getStatusIcon(file)}</span>
                <span class="file-path">{file.path}</span>
              </div>
            {/each}
          </div>
          
          <button 
            class="commit-button" 
            on:click={handleCommit}
            disabled={!commitMessage.trim() || isCommitting}
          >
            {#if isCommitting}
              <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              Committing...
            {:else}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
              Commit
            {/if}
          </button>
        </div>
      {:else}
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
          </svg>
          <p>Stage changes to commit</p>
        </div>
      {/if}
    </div>
  </div>
</div>

<style>
  .git-canvas {
    display: grid;
    grid-template-columns: 300px 1fr 350px;
    height: 100%;
    background-color: var(--color-background);
    overflow: hidden;
  }
  
  .changes-panel,
  .commit-panel {
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-secondary);
    border-right: 1px solid var(--color-border);
    overflow: hidden;
  }
  
  .commit-panel {
    border-right: none;
    border-left: 1px solid var(--color-border);
  }
  
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }
  
  .panel-header h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }
  
  .header-actions {
    display: flex;
    gap: var(--spacing-xs);
  }
  
  .icon-button {
    width: 28px;
    height: 28px;
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .icon-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  
  .icon-button svg {
    width: 100%;
    height: 100%;
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
  }
  
  .file-section {
    margin-bottom: var(--spacing-lg);
  }
  
  .section-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--spacing-sm);
    padding: 0 var(--spacing-xs);
  }
  
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .file-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .file-item:hover {
    background-color: var(--color-surface-hover);
  }
  
  .file-item.selected {
    background-color: rgba(var(--color-accent-rgb, 0, 113, 227), 0.15);
    color: var(--color-accent);
  }
  
  .status-icon {
    font-weight: bold;
    font-size: var(--font-size-md);
    flex-shrink: 0;
  }
  
  .file-path {
    flex: 1;
    font-size: var(--font-size-sm);
    font-family: var(--font-family-mono);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .stage-button,
  .unstage-button {
    width: 20px;
    height: 20px;
    padding: 2px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    opacity: 0;
    transition: all 150ms ease;
    flex-shrink: 0;
  }
  
  .file-item:hover .stage-button,
  .file-item:hover .unstage-button {
    opacity: 1;
  }
  
  .stage-button:hover,
  .unstage-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  
  .stage-button svg,
  .unstage-button svg {
    width: 100%;
    height: 100%;
  }
  
  .diff-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  
  .diff-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }
  
  .diff-header .file-path {
    flex: 1;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }
  
  .diff-actions {
    display: flex;
    gap: var(--spacing-xs);
  }
  
  .action-button {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: transparent;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .action-button:hover {
    background-color: var(--color-surface-hover);
    border-color: var(--color-text-secondary);
  }
  
  .action-button svg {
    width: 16px;
    height: 16px;
  }
  
  .diff-editor {
    flex: 1;
    overflow: hidden;
  }
  
  .diff-empty,
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }
  
  .diff-empty svg,
  .empty-state svg {
    width: 64px;
    height: 64px;
    opacity: 0.4;
  }
  
  .diff-empty p,
  .empty-state p {
    font-size: var(--font-size-base);
    margin: 0;
  }
  
  .commit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }
  
  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }
  
  .form-group label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }
  
  .form-group input,
  .form-group textarea {
    padding: var(--spacing-sm);
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-base);
    transition: all 150ms ease;
  }
  
  .form-group input:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 3px rgba(var(--color-accent-rgb, 0, 113, 227), 0.1);
  }
  
  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }
  
  .char-counter {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    text-align: right;
  }
  
  .char-counter.warning {
    color: var(--color-warning);
  }
  
  .staged-files-preview {
    padding: var(--spacing-sm);
    background-color: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }
  
  .preview-title {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: var(--spacing-sm);
  }
  
  .preview-file {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs);
    font-size: var(--font-size-sm);
  }
  
  .preview-file .file-path {
    font-family: var(--font-family-mono);
  }
  
  .commit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-accent);
    border: none;
    border-radius: var(--radius-sm);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .commit-button:hover:not(:disabled) {
    background-color: var(--color-accent-hover, #0077ed);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }
  
  .commit-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .commit-button svg {
    width: 18px;
    height: 18px;
  }
  
  .spinner {
    animation: spin 1s linear infinite;
  }
  
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
