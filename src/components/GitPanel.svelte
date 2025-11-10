<script>
  import { onMount, onDestroy } from 'svelte';
  import { gitStore, currentGitData } from '../stores/gitStore.js';
  import { editorStore } from '../stores/editorStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  
  let gitData = null;
  let workspacePath = null;
  let expandedSections = {
    unstaged: true,
    staged: true,
    branches: false,
    commits: false
  };
  
  const unsubscribeGit = currentGitData.subscribe((data) => {
    gitData = data;
  });
  
  const unsubscribePath = activeWorkspacePath.subscribe((path) => {
    workspacePath = path;
  });
  
  onDestroy(() => {
    unsubscribeGit();
    unsubscribePath();
  });
  
  $: sortedBranches = gitData?.branches?.all?.map(name => ({
    name,
    current: name === gitData.branches.current
  })).sort((a, b) => {
    if (a.current) return -1;
    if (b.current) return 1;
    return a.name.localeCompare(b.name);
  }) || [];
  
  $: unstagedFiles = gitData?.status?.files?.filter(f => !f.index || f.index === ' ') || [];
  $: stagedFiles = gitData?.status?.files?.filter(f => f.index && f.index !== ' ' && f.index !== '?') || [];
  
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
  
  function handleFileClick(file, isStaged) {
    // Open diff view in editor canvas
    editorStore.openGitDiff(file.path, isStaged);
  }
  
  function handleCommitClick() {
    // Open commit view in editor canvas
    editorStore.openCommitView();
  }
  
  async function handleCheckout(branch) {
    try {
      await gitStore.checkout(branch.name);
    } catch (error) {
      console.error('Checkout failed:', error);
    }
  }
  
  function handleCommitHistoryClick(commit) {
    console.log('View commit:', commit.hash);
    // TODO: Implement commit detail view
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
  
  function toggleSection(section) {
    expandedSections[section] = !expandedSections[section];
  }
</script>

<div class="git-panel">
  <div class="panel-header">
    <h3>Source Control</h3>
    {#if workspacePath}
      <div class="workspace-path">{workspacePath.split('/').pop()}</div>
    {/if}
  </div>
  
  <div class="panel-content">
    {#if !gitData}
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>Loading git repository...</p>
      </div>
    {:else}
      <!-- Changes Section -->
      <div class="section">
        <button class="section-header" on:click={() => toggleSection('unstaged')}>
          <svg class="chevron" class:expanded={expandedSections.unstaged} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span>Changes ({unstagedFiles.length})</span>
          {#if unstagedFiles.length > 0}
            <button class="action-button" on:click|stopPropagation={handleStageAll} title="Stage All Changes">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
            </button>
          {/if}
        </button>
        
        {#if expandedSections.unstaged && unstagedFiles.length > 0}
          <div class="file-list">
            {#each unstagedFiles as file}
              <div class="file-item">
                <button class="file-info" on:click={() => handleFileClick(file, false)}>
                  <span class="status-icon" style="color: {getStatusColor(file)}">{getStatusIcon(file)}</span>
                  <span class="file-path">{file.path}</span>
                </button>
                <button class="stage-button" on:click={() => handleStageFile(file)} title="Stage Change">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else if expandedSections.unstaged}
          <div class="empty-message">No unstaged changes</div>
        {/if}
      </div>
      
      <!-- Staged Changes Section -->
      <div class="section">
        <button class="section-header" on:click={() => toggleSection('staged')}>
          <svg class="chevron" class:expanded={expandedSections.staged} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span>Staged Changes ({stagedFiles.length})</span>
          {#if stagedFiles.length > 0}
            <button class="action-button" on:click|stopPropagation={handleUnstageAll} title="Unstage All">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
              </svg>
            </button>
            <button class="action-button commit" on:click|stopPropagation={handleCommitClick} title="Commit">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </button>
          {/if}
        </button>
        
        {#if expandedSections.staged && stagedFiles.length > 0}
          <div class="file-list">
            {#each stagedFiles as file}
              <div class="file-item">
                <button class="file-info" on:click={() => handleFileClick(file, true)}>
                  <span class="status-icon" style="color: {getStatusColor(file)}">{getStatusIcon(file)}</span>
                  <span class="file-path">{file.path}</span>
                </button>
                <button class="unstage-button" on:click={() => handleUnstageFile(file)} title="Unstage">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"/>
                  </svg>
                </button>
              </div>
            {/each}
          </div>
        {:else if expandedSections.staged}
          <div class="empty-message">No staged changes</div>
        {/if}
      </div>
      
      <!-- Branches Section -->
      <div class="section">
        <button class="section-header" on:click={() => toggleSection('branches')}>
          <svg class="chevron" class:expanded={expandedSections.branches} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span>Branches ({sortedBranches.length})</span>
        </button>
        
        {#if expandedSections.branches}
          <div class="branch-list">
            {#each sortedBranches as branch}
              <button 
                class="branch-item"
                class:current={branch.current}
                on:click={() => handleCheckout(branch)}
                disabled={branch.current}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"/>
                </svg>
                <span>{branch.name}</span>
                {#if branch.current}
                  <svg class="check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
      
      <!-- Commit History Section -->
      <div class="section">
        <button class="section-header" on:click={() => toggleSection('commits')}>
          <svg class="chevron" class:expanded={expandedSections.commits} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
          </svg>
          <span>Commits ({gitData.log?.all?.length || 0})</span>
        </button>
        
        {#if expandedSections.commits}
          <div class="commit-list">
            {#each (gitData.log?.all || []) as commit}
              <button
                class="commit-item"
                on:click={() => handleCommitHistoryClick(commit)}
              >
                <div class="commit-graph">
                  <div class="commit-dot"></div>
                  <div class="commit-line"></div>
                </div>
                <div class="commit-content">
                  <div class="commit-message">{commit.message}</div>
                  <div class="commit-meta">
                    <span class="commit-hash">{commit.hash.substring(0, 7)}</span>
                    <span class="commit-author">{commit.author_name}</span>
                    <span class="commit-date">{new Date(commit.date).toLocaleDateString()}</span>
                  </div>
                </div>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .git-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: var(--color-surface-secondary);
  }
  
  .panel-header {
    padding: var(--spacing-md);
    border-bottom: 1px solid var(--color-border);
  }
  
  .panel-header h3 {
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0 0 var(--spacing-xs) 0;
  }
  
  .workspace-path {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
  }
  
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-sm);
  }
  
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--color-text-secondary);
  }
  
  .empty-state svg {
    width: 48px;
    height: 48px;
    margin-bottom: var(--spacing-md);
    opacity: 0.5;
  }
  
  .section {
    margin-bottom: var(--spacing-md);
  }
  
  .section-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-xs) var(--spacing-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .section-header:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  
  .chevron {
    width: 14px;
    height: 14px;
    transition: transform 150ms ease;
  }
  
  .chevron.expanded {
    transform: rotate(90deg);
  }
  
  .action-button {
    margin-left: auto;
    width: 24px;
    height: 24px;
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: all 150ms ease;
  }
  
  .action-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  
  .action-button.commit {
    color: var(--color-accent);
  }
  
  .action-button.commit:hover {
    background-color: rgba(var(--color-accent-rgb, 0, 113, 227), 0.1);
  }
  
  .action-button svg {
    width: 100%;
    height: 100%;
  }
  
  .file-list,
  .branch-list,
  .commit-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  
  .empty-message {
    padding: var(--spacing-md);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-style: italic;
  }
  
  .file-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    border-radius: var(--radius-sm);
    transition: all 150ms ease;
  }
  
  .file-item:hover {
    background-color: var(--color-surface-hover);
  }
  
  .file-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex: 1;
    padding: var(--spacing-xs) var(--spacing-sm);
    background: transparent;
    border: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-align: left;
    border-radius: var(--radius-sm);
    transition: all 150ms ease;
  }
  
  .status-icon {
    font-weight: bold;
    font-size: var(--font-size-md);
  }
  
  .file-path {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-family-mono);
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
  
  .branch-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 150ms ease;
    position: relative;
  }
  
  .branch-item:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
  }
  
  .branch-item.current {
    background-color: rgba(var(--color-accent-rgb, 0, 113, 227), 0.1);
    color: var(--color-accent);
    font-weight: var(--font-weight-medium);
    cursor: default;
  }
  
  .branch-item svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
  }
  
  .branch-item span {
    flex: 1;
  }
  
  .check-icon {
    color: var(--color-accent);
    margin-left: auto;
  }
  
  .commit-item {
    display: flex;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: transparent;
    border: none;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 150ms ease;
    text-align: left;
  }
  
  .commit-item:hover {
    background-color: var(--color-surface-hover);
  }
  
  .commit-graph {
    position: relative;
    width: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 4px;
  }
  
  .commit-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background-color: var(--color-accent);
    border: 2px solid var(--color-surface-secondary);
    z-index: 1;
  }
  
  .commit-line {
    position: absolute;
    top: 12px;
    width: 2px;
    height: 100%;
    background-color: var(--color-border);
  }
  
  .commit-item:last-child .commit-line {
    display: none;
  }
  
  .commit-content {
    flex: 1;
    min-width: 0;
  }
  
  .commit-message {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .commit-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }
  
  .commit-hash {
    font-family: var(--font-family-mono);
    background-color: var(--color-surface-hover);
    padding: 2px 6px;
    border-radius: 3px;
  }
  
  .commit-author,
  .commit-date {
    white-space: nowrap;
  }
</style>
