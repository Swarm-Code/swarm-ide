<script>
  import { onMount, createEventDispatcher } from 'svelte';
  
  export let browserId = null;
  export let url = '';
  export let canGoBack = false;
  export let canGoForward = false;
  export let isLoading = false;
  
  const dispatch = createEventDispatcher();
  
  // History management
  let history = [];
  let historyIndex = -1;
  let showHistorySuggestions = false;
  let searchSuggestions = [];
  let selectedSuggestionIndex = -1;
  
  // URL input
  let urlInput = url;
  let inputElement;
  
  // Update input when URL changes
  $: urlInput = url;
  
  // Load history from localStorage
  onMount(() => {
    const savedHistory = localStorage.getItem('browserHistory');
    if (savedHistory) {
      try {
        history = JSON.parse(savedHistory);
      } catch (e) {
        console.error('Failed to load browser history:', e);
      }
    }
  });
  
  // Save history when it changes
  $: if (history.length > 0) {
    localStorage.setItem('browserHistory', JSON.stringify(history.slice(0, 100))); // Keep last 100 items
  }
  
  function addToHistory(url, title = '') {
    const historyItem = {
      url,
      title: title || url,
      visitedAt: new Date().toISOString(),
      visitCount: 1
    };
    
    // Check if URL already exists in history
    const existingIndex = history.findIndex(item => item.url === url);
    if (existingIndex >= 0) {
      history[existingIndex].visitCount++;
      history[existingIndex].visitedAt = new Date().toISOString();
      // Move to front
      const item = history.splice(existingIndex, 1)[0];
      history.unshift(item);
    } else {
      history.unshift(historyItem);
    }
    
    history = history.slice(0, 100); // Keep max 100 items
  }
  
  function handleUrlFocus() {
    // Select all text on focus
    inputElement?.select();
    updateSuggestions();
  }
  
  function handleUrlBlur() {
    // Delay to allow click on suggestions
    setTimeout(() => {
      showHistorySuggestions = false;
    }, 200);
  }
  
  function updateSuggestions() {
    const query = urlInput.toLowerCase().trim();
    if (!query) {
      searchSuggestions = history.slice(0, 10); // Show recent history
    } else {
      // Filter history based on query
      searchSuggestions = history
        .filter(item => 
          item.url.toLowerCase().includes(query) || 
          item.title.toLowerCase().includes(query)
        )
        .slice(0, 10);
      
      // Add search option if it's not a URL
      if (!query.includes('.') && !query.startsWith('http')) {
        searchSuggestions.unshift({
          url: `https://www.google.com/search?q=${encodeURIComponent(urlInput)}`,
          title: `Search Google for "${urlInput}"`,
          isSearch: true
        });
      }
    }
    
    showHistorySuggestions = true;
    selectedSuggestionIndex = -1;
  }
  
  function handleUrlInput() {
    updateSuggestions();
  }
  
  function handleKeyDown(event) {
    if (!showHistorySuggestions) return;
    
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, searchSuggestions.length - 1);
        if (selectedSuggestionIndex >= 0) {
          urlInput = searchSuggestions[selectedSuggestionIndex].url;
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
        if (selectedSuggestionIndex >= 0) {
          urlInput = searchSuggestions[selectedSuggestionIndex].url;
        } else {
          urlInput = url; // Reset to current URL
        }
        break;
      case 'Escape':
        showHistorySuggestions = false;
        selectedSuggestionIndex = -1;
        urlInput = url; // Reset to current URL
        break;
      case 'Enter':
        if (selectedSuggestionIndex >= 0) {
          navigateToUrl(searchSuggestions[selectedSuggestionIndex].url);
        } else {
          handleNavigate();
        }
        showHistorySuggestions = false;
        break;
    }
  }
  
  function navigateToUrl(targetUrl) {
    urlInput = targetUrl;
    handleNavigate();
  }
  
  function handleNavigate() {
    let targetUrl = urlInput.trim();
    
    // Add protocol if missing
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      // Check if it looks like a domain
      if (targetUrl.includes('.') && !targetUrl.includes(' ')) {
        targetUrl = 'https://' + targetUrl;
      } else {
        // Treat as search query
        targetUrl = 'https://www.google.com/search?q=' + encodeURIComponent(targetUrl);
      }
    }
    
    // Add to history
    addToHistory(targetUrl);
    
    // Dispatch navigation event
    dispatch('navigate', { url: targetUrl });
    
    // Hide suggestions
    showHistorySuggestions = false;
    selectedSuggestionIndex = -1;
    
    // Blur input
    inputElement?.blur();
  }
  
  function handleBack() {
    dispatch('back');
  }
  
  function handleForward() {
    dispatch('forward');
  }
  
  function handleReload() {
    dispatch('reload');
  }
  
  function handleStop() {
    dispatch('stop');
  }
  
  // Update history when navigation happens
  export function updateHistory(url, title) {
    addToHistory(url, title);
  }
</script>

<div class="browser-navigation">
  <div class="nav-controls">
    <button 
      class="nav-button" 
      on:click={handleBack}
      disabled={!canGoBack}
      title="Go back"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"></polyline>
      </svg>
    </button>
    
    <button 
      class="nav-button" 
      on:click={handleForward}
      disabled={!canGoForward}
      title="Go forward"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    </button>
    
    <button 
      class="nav-button" 
      on:click={isLoading ? handleStop : handleReload}
      title={isLoading ? "Stop loading" : "Reload"}
    >
      {#if isLoading}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
      {/if}
    </button>
  </div>
  
  <div class="url-container">
    <input
      bind:this={inputElement}
      bind:value={urlInput}
      on:focus={handleUrlFocus}
      on:blur={handleUrlBlur}
      on:input={handleUrlInput}
      on:keydown={handleKeyDown}
      type="text"
      class="url-input"
      placeholder="Search or enter URL"
    />
    
    {#if showHistorySuggestions && searchSuggestions.length > 0}
      <div class="suggestions-dropdown">
        {#each searchSuggestions as suggestion, index}
          <div 
            class="suggestion-item"
            class:selected={index === selectedSuggestionIndex}
            on:click={() => navigateToUrl(suggestion.url)}
          >
            <div class="suggestion-icon">
              {#if suggestion.isSearch}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle>
                  <path d="m21 21-4.35-4.35"></path>
                </svg>
              {:else}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                  <polyline points="9 22 9 12 15 12 15 22"></polyline>
                </svg>
              {/if}
            </div>
            <div class="suggestion-content">
              <div class="suggestion-title">{suggestion.title}</div>
              {#if !suggestion.isSearch}
                <div class="suggestion-url">{suggestion.url}</div>
              {/if}
            </div>
            {#if suggestion.visitCount > 1}
              <div class="visit-count">{suggestion.visitCount}</div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .browser-navigation {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px;
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
  }
  
  .nav-controls {
    display: flex;
    gap: 4px;
  }
  
  .nav-button {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: background-color 0.2s;
  }
  
  .nav-button:hover:not(:disabled) {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }
  
  .nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
  
  .nav-button svg {
    width: 18px;
    height: 18px;
  }
  
  .url-container {
    flex: 1;
    position: relative;
  }
  
  .url-input {
    width: 100%;
    height: 32px;
    padding: 0 12px;
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: 16px;
    color: var(--color-text-primary);
    font-size: 13px;
    font-family: var(--font-family);
    transition: border-color 0.2s, background-color 0.2s;
  }
  
  .url-input:focus {
    outline: none;
    border-color: var(--color-accent);
    background: var(--color-surface);
  }
  
  .url-input::placeholder {
    color: var(--color-text-tertiary);
  }
  
  .suggestions-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    max-height: 400px;
    overflow-y: auto;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
    z-index: 1000;
  }
  
  .suggestion-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    cursor: pointer;
    transition: background-color 0.15s;
  }
  
  .suggestion-item:hover,
  .suggestion-item.selected {
    background: var(--color-surface-hover);
  }
  
  .suggestion-icon {
    width: 20px;
    height: 20px;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
  
  .suggestion-icon svg {
    width: 100%;
    height: 100%;
  }
  
  .suggestion-content {
    flex: 1;
    min-width: 0;
  }
  
  .suggestion-title {
    font-size: 13px;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .suggestion-url {
    font-size: 11px;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .visit-count {
    padding: 2px 6px;
    background: var(--color-accent);
    color: white;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 600;
  }
</style>