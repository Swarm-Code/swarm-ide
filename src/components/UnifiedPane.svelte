<script>
  import { onMount, onDestroy } from 'svelte';
  import { editorStore } from '../stores/editorStore.js';
  import { browserStore } from '../stores/browserStore.js';
  import { terminalStore } from '../stores/terminalStore.js';
  import { appStore } from '../stores/appStore.js';
  import { activeWorkspacePath } from '../stores/workspaceStore.js';
  import { browserLogger } from '../utils/browserLogger.js';
  import EditorTab from './EditorTab.svelte';
  import MonacoEditor from './MonacoEditor.svelte';
  import MediaViewer from './MediaViewer.svelte';
  import DocumentViewer from './DocumentViewer.svelte';
  import MarkdownPreview from './MarkdownPreview.svelte';
  import TipTapEditor from './TipTapEditor.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
import { workspaceStore } from '../stores/workspaceStore.js';

  export let pane;
  export let isActive = false;

  let allBrowsers = [];
  const createdBrowsers = new Set();
  let dragOverIndex = null;
  let overlayVisible = false;
  let confirmDialogOpen = false;
  let closeTabPending = null;
  let activeWorkspace = null;

  browserStore.subscribe((state) => {
    allBrowsers = state.browsers;
  });

  workspaceStore.subscribe((state) => {
    activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
  });

  appStore.subscribe((state) => {
    overlayVisible = state.overlayVisible;
  });

  // Create browser instances for browser tabs
  $: browserTabs = pane.tabs.filter(t => t.type === 'browser');
  $: if (browserTabs.length > 0 && window.electronAPI) {
    browserTabs.forEach(tab => {
      const browser = allBrowsers.find(b => b.id === tab.browserId);
      if (browser && !createdBrowsers.has(tab.browserId)) {
        createBrowserInstance(browser, tab);
      }
    });
  }

  async function createBrowserInstance(browser, tab) {
    try {
      const result = await window.electronAPI.browserCreate({
        browserId: browser.id,
        url: browser.url || tab.url,
        workspaceId: browser.workspaceId
      });
      
      if (result.success) {
        createdBrowsers.add(browser.id);
        console.log('[UnifiedPane] ✅ Created browser instance:', browser.id);
      }
    } catch (error) {
      console.error('[UnifiedPane] ❌ Error creating browser:', error);
    }
  }

  // Setup browser event listeners
  onMount(() => {
    if (!window.electronAPI) return;

    window.electronAPI.onBrowserNavigation((data) => {
      const tab = pane.tabs.find(t => t.type === 'browser' && t.browserId === data.browserId);
      if (tab) {
        tab.url = data.url;
      }
      browserStore.updateBrowserState(data.browserId, {
        url: data.url,
        canGoBack: data.canGoBack,
        canGoForward: data.canGoForward
      });
    });

    window.electronAPI.onBrowserTitle((data) => {
      const tab = pane.tabs.find(t => t.type === 'browser' && t.browserId === data.browserId);
      if (tab) {
        tab.title = data.title;
      }
      browserStore.updateBrowserState(data.browserId, {
        title: data.title
      });
    });

    window.electronAPI.onBrowserLoading((data) => {
      browserStore.updateBrowserState(data.browserId, {
        isLoading: data.isLoading
      });
    });

    // 🔧 FIX: Handle middle-click and target="_blank" - create new tab in current pane
    window.electronAPI.onBrowserOpenInTab((data) => {
      console.log('[UnifiedPane] Browser open-in-tab request:', data);
      
      // Find the source browser's tab to get its pane
      const sourceTab = pane.tabs.find(t => t.type === 'browser' && t.browserId === data.sourceId);
      
      // Only handle if this pane contains the source browser
      if (sourceTab) {
        // Generate new browser ID
        const newBrowserId = `browser-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        // Add browser to store
        browserStore.addBrowser(newBrowserId, data.url, $activeWorkspacePath);
        
        // Add tab to this pane
        editorStore.addBrowserTab(pane.id, newBrowserId);
        
        // If not a background tab, activate it
        if (!data.background) {
          // Small delay to ensure tab is created
          setTimeout(() => {
            const newTab = pane.tabs.find(t => t.type === 'browser' && t.browserId === newBrowserId);
            if (newTab) {
              editorStore.setActiveTab(pane.id, newTab.id);
            }
          }, 10);
        }
      }
    });
  });

  onDestroy(() => {
    if (window.electronAPI) {
      browserTabs.forEach(tab => {
        if (createdBrowsers.has(tab.browserId)) {
          window.electronAPI.browserDestroy({ browserId: tab.browserId });
          createdBrowsers.delete(tab.browserId);
        }
      });
    }
  });

  $: activeTab = pane.tabs.find(t => t.id === pane.activeTabId);
  $: activeBrowser = activeTab?.type === 'browser' ? allBrowsers.find(b => b.id === activeTab.browserId) : null;
  
  // Log browser tab rendering
  $: if (activeTab?.type === 'browser' && activeBrowser) {
    browserLogger.logTabRender(activeBrowser.id, {
      id: activeTab.id,
      name: activeTab.title || 'Untitled'
    }, {
      id: pane.id,
      isActive: isActive
    });
    
    // Log content div dimensions on next tick
    setTimeout(() => {
      const contentDiv = document.querySelector(`[data-pane-id="${pane.id}"] .browser-content`);
      if (contentDiv) {
        const rect = contentDiv.getBoundingClientRect();
        browserLogger.logContentDiv(activeBrowser.id, pane.id, {
          isVisible: contentDiv.offsetParent !== null,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          clientWidth: contentDiv.clientWidth,
          clientHeight: contentDiv.clientHeight
        });
        
        browserLogger.logVisibility(activeBrowser.id, contentDiv.offsetParent !== null, 'tab rendered');
      }
    }, 0);
  }

  function handlePaneClick() {
    editorStore.setActivePane(pane.id);
  }

  function handleTabSelect(event) {
    editorStore.setActiveTab(pane.id, event.detail.tabId);
  }

  function handleTabClose(event) {
    const tab = pane.tabs.find(t => t.id === event.detail.tabId);
    if (!tab) return;

    // Check for unsaved changes in editor tabs
    if (tab.type === 'editor' && tab.isDirty) {
      closeTabPending = { tabId: tab.id, tab };
      confirmDialogOpen = true;
      return;
    }

    // Proceed with closing
    closeTabInternal(tab);
  }

  function closeTabInternal(tab) {
    if (tab.type === 'browser' && window.electronAPI && createdBrowsers.has(tab.browserId)) {
      window.electronAPI.browserDestroy({ browserId: tab.browserId });
      createdBrowsers.delete(tab.browserId);
      browserStore.removeBrowser(tab.browserId);
    } else if (tab.type === 'terminal') {
      terminalStore.removeTerminal(tab.terminalId);
    }
    editorStore.closeTab(pane.id, tab.id);
  }

  function handleConfirmClose() {
    if (closeTabPending) {
      closeTabInternal(closeTabPending.tab);
      closeTabPending = null;
    }
  }

  function handleCancelClose() {
    closeTabPending = null;
  }

  function handleSplitHorizontal() {
    editorStore.splitPane(pane.id, 'horizontal');
  }

  function handleSplitVertical() {
    editorStore.splitPane(pane.id, 'vertical');
  }

  function handleClosePane() {
    editorStore.closePane(pane.id);
  }

  function handleDragOver(event, index) {
    event.preventDefault();
    dragOverIndex = index;
  }

  function handleDragLeave() {
    dragOverIndex = null;
  }

  function handleDrop(event, toIndex) {
    event.preventDefault();
    dragOverIndex = null;

    const editorData = event.dataTransfer.getData('application/x-editor-tab');
    if (editorData) {
      const { tabId, paneId: fromPaneId } = JSON.parse(editorData);
      if (fromPaneId === pane.id) {
        const fromIndex = pane.tabs.findIndex(t => t.id === tabId);
        if (fromIndex !== -1 && fromIndex !== toIndex) {
          editorStore.reorderTabs(pane.id, fromIndex, toIndex);
        }
      } else {
        editorStore.moveTab(fromPaneId, pane.id, tabId, toIndex);
      }
      return;
    }

    // Handle terminal drops - add as tab
    const terminalData = event.dataTransfer.getData('application/x-terminal-tab');
    if (terminalData) {
      const { terminalId } = JSON.parse(terminalData);
      // Add terminal as a tab (like browsers and editors)
      editorStore.addTerminalTab(pane.id, terminalId);
    }
  }

  function handleTabBarDrop(event) {
    event.preventDefault();
    dragOverIndex = null;

    const editorData = event.dataTransfer.getData('application/x-editor-tab');
    if (editorData) {
      const { tabId, paneId: fromPaneId } = JSON.parse(editorData);
      if (fromPaneId !== pane.id) {
        editorStore.moveTab(fromPaneId, pane.id, tabId);
      }
      return;
    }

    // Handle terminal drops - add as tab
    const terminalData = event.dataTransfer.getData('application/x-terminal-tab');
    if (terminalData) {
      const { terminalId } = JSON.parse(terminalData);
      // Add terminal as a tab (like browsers and editors)
      editorStore.addTerminalTab(pane.id, terminalId);
    }
  }

  // Media file detection
  const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.apng'
  ]);

  const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'
  ]);

  const DOCUMENT_EXTENSIONS = new Set([
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.ppt', '.pptx', '.env', '.log'
  ]);

  function isMediaFile(filename) {
    if (!filename) return false;
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
  }

  function isDocumentFile(filename) {
    if (!filename) return false;
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    const baseName = filename.substring(filename.lastIndexOf('/') + 1);
    
    if (DOCUMENT_EXTENSIONS.has(ext)) return true;
    if (baseName === '.env' || baseName.startsWith('.env.')) return true;
    if (baseName === '.gitignore' || baseName === '.gitattributes') return true;
    if (baseName.endsWith('.log')) return true;
    
    return false;
  }

  function getLanguageFromFilename(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase() || '';
    const languageMap = {
      js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
      json: 'json', html: 'html', css: 'css', scss: 'scss', md: 'markdown',
      py: 'python', rb: 'ruby', php: 'php', java: 'java', cpp: 'cpp',
      c: 'c', cs: 'csharp', go: 'go', rs: 'rust', sh: 'shell', bash: 'shell',
      yaml: 'yaml', yml: 'yaml', xml: 'xml', sql: 'sql', cjs: 'javascript',
      mjs: 'javascript', svelte: 'html',
    };
    return languageMap[ext] || 'plaintext';
  }

  function handleEditorChange(newContent) {
    if (activeTab && activeTab.type === 'editor') {
      editorStore.setTabDirty(pane.id, activeTab.id, true);
      // Update content for live preview
      activeTab.content = newContent;
    }
  }

  async function handleEditorSave(content) {
    if (!activeTab || activeTab.type !== 'editor') return;
    
    console.log('[UnifiedPane] Saving file:', activeTab.path);
    
    if (!window.electronAPI) return;
    
    let result;
    
    // Check if SSH workspace
    if (activeWorkspace?.isSSH && activeWorkspace?.sshConnection?.id) {
      console.log('[UnifiedPane] 🔌 SSH workspace detected, using SFTP');
      const connectionId = activeWorkspace.sshConnection.id;
      result = await window.electronAPI.sshSftpWriteFile(connectionId, activeTab.path, content);
    } else {
      console.log('[UnifiedPane] 📁 Local workspace, using local FS');
      result = await window.electronAPI.writeFile(activeTab.path, content);
    }
    
    if (result.success) {
      editorStore.setTabDirty(pane.id, activeTab.id, false);
      console.log('[UnifiedPane] File saved successfully:', activeTab.path);
    } else {
      console.error('[UnifiedPane] Failed to save file:', result.error);
    }
  }

  // Mind editor handling
  let mindSaveTimeout;
  async function handleMindChange(newContent) {
    if (activeTab && activeTab.type === 'mind') {
      activeTab.content = newContent;
      editorStore.setTabDirty(pane.id, activeTab.id, true);
      
      // Auto-save after 500ms of no changes
      clearTimeout(mindSaveTimeout);
      mindSaveTimeout = setTimeout(async () => {
        if (window.electronAPI && $activeWorkspacePath) {
          const result = await window.electronAPI.mindWrite({
            workspacePath: $activeWorkspacePath,
            name: activeTab.name,
            content: newContent
          });
          
          if (result.success) {
            editorStore.setTabDirty(pane.id, activeTab.id, false);
            console.log('[Mind] Auto-saved:', activeTab.name);
          }
        }
      }, 500);
    }
  }

  function isMarkdownFile(filename) {
    return filename?.toLowerCase().endsWith('.md');
  }

  function cyclePreviewMode() {
    if (activeTab && activeTab.type === 'editor') {
      const currentMode = activeTab.previewMode || 'off';
      const modes = ['off', 'split', 'preview'];
      const currentIndex = modes.indexOf(currentMode);
      const nextMode = modes[(currentIndex + 1) % modes.length];
      editorStore.setPreviewMode(pane.id, activeTab.id, nextMode);
    }
  }

  // Scroll synchronization for split view
  let monacoEditor;
  let markdownPreview;
  
  const scrollSync = {
    onEditorScroll: (percent) => {
      if (markdownPreview?.scrollToPercent) {
        markdownPreview.scrollToPercent(percent);
      }
    },
    onPreviewScroll: (percent) => {
      if (monacoEditor?.scrollToPercent) {
        monacoEditor.scrollToPercent(percent);
      }
    }
  };

  // Browser navigation
  let urlInput = '';
  let urlInputFocused = false;
  
  // Only update URL input when browser changes AND input is not focused
  $: if (activeBrowser && !urlInputFocused) {
    urlInput = activeBrowser.url || '';
  }

  function handleUrlFocus() {
    urlInputFocused = true;
    console.log('[UnifiedPane] 🎯 URL input focused');
  }
  
  function handleUrlBlur() {
    urlInputFocused = false;
    // Restore actual browser URL when unfocusing
    if (activeBrowser) {
      urlInput = activeBrowser.url || '';
    }
    console.log('[UnifiedPane] 💤 URL input blurred');
  }
  
  async function handleUrlSubmit(event) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!activeBrowser || !window.electronAPI) return;
    
    let url = urlInput.trim();
    if (!url) return;
    
    console.log('[UnifiedPane] 🌐 Navigating to:', url);
    
    // Auto-prepend https:// if needed
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        // Search query
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }
    
    await window.electronAPI.browserNavigate({ browserId: activeBrowser.id, url });
    browserStore.navigate(activeBrowser.id, url);
    
    // Blur and focus browser
    event.target.blur();
    await window.electronAPI.browserFocus?.({ browserId: activeBrowser.id });
  }
  
  async function handleUrlKeydown(event) {
    if (event.key === 'Enter') {
      await handleUrlSubmit(event);
    } else if (event.key === 'Escape') {
      // Reset to actual URL on Escape
      event.target.blur();
    }
  }

  async function handleGoBack() {
    if (activeBrowser && window.electronAPI) {
      await window.electronAPI.browserGoBack({ browserId: activeBrowser.id });
    }
  }

  async function handleGoForward() {
    if (activeBrowser && window.electronAPI) {
      await window.electronAPI.browserGoForward({ browserId: activeBrowser.id });
    }
  }

  async function handleReload() {
    if (activeBrowser && window.electronAPI) {
      await window.electronAPI.browserReload({ browserId: activeBrowser.id });
    }
  }
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div
  class="unified-pane"
  class:active={isActive}
  data-pane-id={pane.id}
  on:click={handlePaneClick}
  role="tabpanel"
  tabindex="-1"
>
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="tab-bar" on:dragover={(e) => e.preventDefault()} on:drop={handleTabBarDrop} role="toolbar" tabindex="-1">
    <div class="tab-list" role="tablist">
      {#each pane.tabs as tab, index (tab.id)}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="tab-wrapper"
          class:drag-over={dragOverIndex === index}
          on:dragover={(e) => handleDragOver(e, index)}
          on:dragleave={handleDragLeave}
          on:drop={(e) => handleDrop(e, index)}
          role="presentation"
        >
          <EditorTab
            tab={{
              id: tab.id,
              name: tab.type === 'browser' ? tab.title : (tab.type === 'terminal' ? tab.title : (tab.type === 'mind' ? `🧠 ${tab.name}` : tab.name)),
              path: tab.path,
              isDirty: tab.isDirty
            }}
            paneId={pane.id}
            isActive={tab.id === pane.activeTabId}
            on:select={handleTabSelect}
            on:close={handleTabClose}
          />
        </div>
      {/each}
    </div>
    <div class="tab-actions">
      {#if activeTab && activeTab.type === 'editor' && isMarkdownFile(activeTab.name)}
        <button 
          class="action-button preview-mode-button" 
          class:active={activeTab.previewMode !== 'off'}
          on:click={cyclePreviewMode} 
          title={activeTab.previewMode === 'off' ? 'Show split view' : activeTab.previewMode === 'split' ? 'Preview only' : 'Hide preview'}
        >
          {#if activeTab.previewMode === 'off'}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z" />
              <circle cx="8" cy="8" r="2" stroke-width="1.5" />
            </svg>
          {:else if activeTab.previewMode === 'split'}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="2" y="2" width="5" height="12" stroke-width="1.5" />
              <rect x="9" y="2" width="5" height="12" stroke-width="1.5" />
            </svg>
          {:else}
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
              <line x1="4" y1="6" x2="12" y2="6" stroke-width="1.5" />
              <line x1="4" y1="9" x2="10" y2="9" stroke-width="1.5" />
            </svg>
          {/if}
        </button>
      {/if}
      <button class="action-button" on:click={handleSplitHorizontal} title="Split horizontally">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
          <line x1="2" y1="8" x2="14" y2="8" stroke-width="1.5" />
        </svg>
      </button>
      <button class="action-button" on:click={handleSplitVertical} title="Split vertically">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <rect x="2" y="2" width="12" height="12" stroke-width="1.5" />
          <line x1="8" y1="2" x2="8" y2="14" stroke-width="1.5" />
        </svg>
      </button>
      <button class="action-button" on:click={handleClosePane} title="Close pane">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4l8 8m0-8l-8 8" />
        </svg>
      </button>
    </div>
  </div>

  {#if activeTab?.type === 'browser' && activeBrowser}
    <div class="browser-toolbar">
      <button class="nav-button" disabled={!activeBrowser.canGoBack} on:click={handleGoBack} title="Back">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 12L6 8l4-4" />
        </svg>
      </button>
      <button class="nav-button" disabled={!activeBrowser.canGoForward} on:click={handleGoForward} title="Forward">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 12l4-4-4-4" />
        </svg>
      </button>
      <button class="nav-button" on:click={handleReload} title="Reload">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 8a4 4 0 017.5-2m.5 6a4 4 0 01-7.5 2m0-4V4m0 0h4M12 12V8m0 4H8" />
        </svg>
      </button>
      <form on:submit={handleUrlSubmit} style="flex: 1; display: flex;">
        <input 
          type="text" 
          class="url-input" 
          bind:value={urlInput} 
          on:focus={handleUrlFocus}
          on:blur={handleUrlBlur}
          on:keydown={handleUrlKeydown}
          placeholder="Enter URL or search..." 
          autocomplete="off"
          spellcheck="false"
        />
      </form>
    </div>
  {/if}

  <div class="content">
    {#if activeTab}
      {#if activeTab.type === 'editor'}
        {#key activeTab.id}
          {#if isMediaFile(activeTab.name)}
            <MediaViewer
              filePath={activeTab.path}
              fileName={activeTab.name}
            />
          {:else if isDocumentFile(activeTab.name)}
            <DocumentViewer
              filePath={activeTab.path}
              fileName={activeTab.name}
            />
          {:else if isMarkdownFile(activeTab.name) && activeTab.previewMode === 'split'}
            <div class="split-editor">
              <div class="editor-section">
                <MonacoEditor
                  bind:this={monacoEditor}
                  content={activeTab.content || ''}
                  language={getLanguageFromFilename(activeTab.name)}
                  onChange={handleEditorChange}
                  onSave={handleEditorSave}
                  readOnly={false}
                  scrollSync={scrollSync}
                />
              </div>
              <div class="preview-section">
                <MarkdownPreview
                  bind:this={markdownPreview}
                  content={activeTab.content || ''}
                  isDarkTheme={true}
                  scrollSync={scrollSync}
                />
              </div>
            </div>
          {:else if isMarkdownFile(activeTab.name) && activeTab.previewMode === 'preview'}
            <MarkdownPreview
              content={activeTab.content || ''}
              isDarkTheme={true}
            />
          {:else}
            <MonacoEditor
              content={activeTab.content || ''}
              language={getLanguageFromFilename(activeTab.name)}
              onChange={handleEditorChange}
              onSave={handleEditorSave}
              readOnly={false}
            />
          {/if}
        {/key}
      {:else if activeTab.type === 'browser'}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div 
          class="browser-content" 
          data-browser-location="canvas-pane" 
          data-pane-id={pane.id}
          data-active-browser={activeTab.browserId}
          on:click={async () => {
            // When user clicks in browser area, focus the WebContentsView
            if (window.electronAPI && activeTab.browserId) {
              const browser = allBrowsers.find(b => b.id === activeTab.browserId);
              console.log('[UnifiedPane] 🖱️ Browser area clicked:', {
                browserId: activeTab.browserId,
                paneId: pane.id,
                browserURL: browser?.url,
                isActive: pane.activeTabId === activeTab.id
              });
              await window.electronAPI.browserFocus?.({ browserId: activeTab.browserId });
            }
          }}
          on:keydown={(e) => {
            console.log('[UnifiedPane] 🎹 Keydown on browser-content div:', {
              key: e.key,
              code: e.code,
              browserId: activeTab.browserId,
              paneId: pane.id,
              target: e.target.className
            });
          }}
        >
          <!-- WebContentsView renders here -->
          {#if overlayVisible}
            <div class="browser-blur-overlay"></div>
          {/if}
        </div>
      {:else if activeTab.type === 'terminal'}
        <div 
          class="terminal-content" 
          data-terminal-location="canvas-pane" 
          data-pane-id={pane.id}
          data-active-terminal={activeTab.terminalId}
        >
          <!-- Terminal renders here via IDEWindow positioning -->
          {#if overlayVisible}
            <div class="terminal-blur-overlay"></div>
          {/if}
        </div>
      {:else if activeTab.type === 'mind'}
        {#key activeTab.id}
          <TipTapEditor
            content={activeTab.content || ''}
            onChange={handleMindChange}
            editable={true}
          />
        {/key}
      {/if}
    {:else}
      <div class="empty-pane">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p>No file or browser open</p>
      </div>
    {/if}
  </div>
</div>

<ConfirmDialog
  isOpen={confirmDialogOpen}
  title="Close without saving?"
  message={closeTabPending ? `The file "${closeTabPending.tab.name}" has unsaved changes. Are you sure you want to close it without saving?` : ''}
  confirmText="Close"
  cancelText="Cancel"
  isDangerous={true}
  onConfirm={handleConfirmClose}
  onCancel={handleCancelClose}
/>

<style>
  .unified-pane {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    border: 2px solid transparent;
    transition: border-color var(--transition-fast);
  }

  .unified-pane.active {
    border-color: var(--color-accent);
  }

  .tab-bar {
    display: flex;
    align-items: center;
    height: 36px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .tab-list {
    display: flex;
    flex: 1;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .tab-list::-webkit-scrollbar {
    display: none;
  }

  .tab-wrapper {
    position: relative;
  }

  .tab-wrapper.drag-over::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: var(--color-accent);
    z-index: var(--z-base);
  }

  .tab-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 var(--spacing-xs);
    border-left: 1px solid var(--color-border);
  }

  .action-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
  }

  .action-button:hover {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .action-button svg {
    width: 14px;
    height: 14px;
  }

  .action-button.active {
    background-color: var(--color-accent);
    color: var(--color-background);
  }

  .split-editor {
    display: flex;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .editor-section {
    flex: 1;
    min-width: 0;
    height: 100%;
    border-right: 1px solid var(--color-border);
  }

  .preview-section {
    flex: 1;
    min-width: 0;
    height: 100%;
    overflow: hidden;
  }

  .browser-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
  }

  .nav-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    transition: all var(--transition-fast);
  }

  .nav-button:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .nav-button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .nav-button svg {
    width: 16px;
    height: 16px;
  }

  .url-input {
    flex: 1;
    height: 28px;
    padding: 0 12px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .url-input:focus {
    outline: none;
    border-color: var(--color-accent);
  }

  .content {
    flex: 1;
    overflow: hidden;
    display: flex;
    /* Don't center - let children fill space naturally */
  }

  .browser-content {
    width: 100%;
    height: 100%;
    position: relative;
    /* Strict containment - prevents browser from overflowing */
    contain: strict;
    overflow: hidden;
    box-sizing: border-box;
  }

  .terminal-content {
    width: 100%;
    height: 100%;
    position: relative;
    overflow: hidden;
  }

  .browser-blur-overlay,
  .terminal-blur-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(135deg, 
      rgba(140, 140, 140, 0.06) 0%, 
      rgba(160, 160, 160, 0.1) 100%);
    backdrop-filter: blur(16px);
    z-index: 10;
    pointer-events: none;
    animation: blurOverlayFadeIn 350ms cubic-bezier(0.4, 0, 0.2, 1) forwards;
  }

  @keyframes blurOverlayFadeIn {
    0% {
      opacity: 0;
      backdrop-filter: blur(0px);
    }
    30% {
      opacity: 0.2;
      backdrop-filter: blur(3px);
    }
    60% {
      opacity: 0.6;
      backdrop-filter: blur(8px);
    }
    100% {
      opacity: 1;
      backdrop-filter: blur(16px);
    }
  }

  .empty-pane {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
  }

  .empty-pane svg {
    width: 48px;
    height: 48px;
  }

  .empty-pane p {
    font-size: var(--font-size-base);
  }
</style>
