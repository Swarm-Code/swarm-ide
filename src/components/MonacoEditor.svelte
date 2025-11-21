<script>
  import { onMount, onDestroy } from 'svelte';
  import * as monaco from 'monaco-editor';
  import { zoomStore } from '../stores/zoomStore.js';
  import { lspManager } from '../lsp/LspManager.js';
  import { monacoLspAdapter } from '../lsp/MonacoLspAdapter.js';
  import { getLspConfig, hasLspSupport } from '../lsp/lsp-config.js';

  export let content = '';
  export let language = 'javascript';
  export let onChange = null;
  export let onSave = null; // Callback when Ctrl+S is pressed
  export let readOnly = false;
  export let filePath = null; // File path for LSP
  export let scrollSync = null; // { onEditorScroll: (percent) => void }

  let editorContainer;
  let editor;
  let currentContent = content;
  let lspInitialized = false;
  let currentLanguage = language;
  let isScrolling = false;
  let saveCallback = onSave; // Track save callback for updates
  let currentZoom = 1;
  const BASE_FONT_SIZE = 14;

  async function initializeLsp() {
    if (!hasLspSupport(language)) {
      console.log(`[MonacoEditor] No LSP support for ${language}`);
      return;
    }

    if (lspInitialized && currentLanguage === language) {
      return;
    }

    try {
      const lspConfig = getLspConfig(language);
      
      // Start LSP server if not already running
      if (!lspManager.servers.has(language)) {
        console.log(`[MonacoEditor] Starting LSP server for ${language}`);
        await lspManager.startServer(language, lspConfig);
        
        // Initialize the server
        const workspaceFolder = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) : null;
        await lspManager.initialize(language, workspaceFolder);
        
        // Register Monaco language providers
        monacoLspAdapter.registerLanguage(language);
      }

      // Notify LSP of document open
      const model = editor.getModel();
      if (model && filePath) {
        const uri = `file://${filePath}`;
        monacoLspAdapter.onModelAdded(model, language);
        lspManager.didOpenTextDocument(language, uri, model.getValue());
      }

      lspInitialized = true;
      currentLanguage = language;
    } catch (error) {
      console.error('[MonacoEditor] Failed to initialize LSP:', error);
    }
  }

  onMount(async () => {
    // Create Monaco editor
    editor = monaco.editor.create(editorContainer, {
      value: content,
      language: language,
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs',
      automaticLayout: true,
      minimap: { enabled: true },
      fontSize: 14,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace",
      lineNumbers: 'on',
      readOnly: readOnly,
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      tabSize: 2,
      insertSpaces: true,
    });

    // Override Alt+Arrow keys for app-level navigation (tab/pane switching)
    // Alt+Left: Previous tab
    editor.addCommand(
      monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow,
      () => {
        console.log('[MonacoEditor] Alt+Left intercepted, dispatching to app');
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowLeft',
          code: 'ArrowLeft',
          altKey: true,
          bubbles: true
        }));
      }
    );
    
    // Alt+Right: Next tab
    editor.addCommand(
      monaco.KeyMod.Alt | monaco.KeyCode.RightArrow,
      () => {
        console.log('[MonacoEditor] Alt+Right intercepted, dispatching to app');
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowRight',
          code: 'ArrowRight',
          altKey: true,
          bubbles: true
        }));
      }
    );
    
    // Alt+Up: Previous pane
    editor.addCommand(
      monaco.KeyMod.Alt | monaco.KeyCode.UpArrow,
      () => {
        console.log('[MonacoEditor] Alt+Up intercepted, dispatching to app');
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowUp',
          code: 'ArrowUp',
          altKey: true,
          bubbles: true
        }));
      }
    );
    
    // Alt+Down: Next pane
    editor.addCommand(
      monaco.KeyMod.Alt | monaco.KeyCode.DownArrow,
      () => {
        console.log('[MonacoEditor] Alt+Down intercepted, dispatching to app');
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          code: 'ArrowDown',
          altKey: true,
          bubbles: true
        }));
      }
    );
    
    // Ctrl+S: Save file
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      () => {
        console.log('[MonacoEditor] Ctrl+S pressed, saveCallback:', !!saveCallback);
        if (saveCallback) {
          saveCallback(editor.getValue());
        }
      }
    );
    
    // Ctrl+Z: Undo (Monaco handles this natively)
    // Ctrl+Shift+Z or Ctrl+Y: Redo (Monaco handles this natively)

    // Listen for content changes
    editor.onDidChangeModelContent(() => {
      const newContent = editor.getValue();
      if (newContent !== currentContent) {
        currentContent = newContent;
        if (onChange) {
          onChange(newContent);
        }
      }
    });

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleThemeChange = (e) => {
      monaco.editor.setTheme(e.matches ? 'vs-dark' : 'vs');
    };
    mediaQuery.addEventListener('change', handleThemeChange);

    // Listen for scroll changes
    editor.onDidScrollChange((e) => {
      if (!scrollSync || isScrolling) return;
      
      const model = editor.getModel();
      if (!model) return;
      
      const visibleRange = editor.getVisibleRanges()[0];
      if (!visibleRange) return;
      
      const totalLines = model.getLineCount();
      const topLine = visibleRange.startLineNumber;
      const scrollPercent = (topLine - 1) / Math.max(1, totalLines - 1);
      
      scrollSync.onEditorScroll?.(scrollPercent);
    });

    // Initialize LSP if supported
    await initializeLsp();

    // Subscribe to zoom level changes
    const unsubscribeZoom = zoomStore.subscribe((state) => {
      console.log(`[MonacoEditor] Store update - editorZoomLevel: ${state.editorZoomLevel}, currentZoom: ${currentZoom}, editor exists: ${!!editor}`);
      
      if (state.editorZoomLevel !== currentZoom && editor) {
        currentZoom = state.editorZoomLevel;
        const newFontSize = BASE_FONT_SIZE * currentZoom;
        console.log(`[MonacoEditor] 🔍 Applying zoom: ${(currentZoom * 100).toFixed(0)}% (font: ${newFontSize.toFixed(1)}px)`);
        
        editor.updateOptions({ fontSize: newFontSize });
        console.log(`[MonacoEditor] ✅ Updated editor fontSize to ${newFontSize}`);
      } else {
        if (!editor) {
          console.log(`[MonacoEditor] ⚠️ Editor not yet initialized`);
        } else {
          console.log(`[MonacoEditor] No zoom change - levels match or already applied`);
        }
      }
    });

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
      unsubscribeZoom();
    };
  });

  // Export method to scroll editor from outside
  export function scrollToPercent(percent) {
    if (!editor) return;
    
    const model = editor.getModel();
    if (!model) return;
    
    isScrolling = true;
    const totalLines = model.getLineCount();
    const targetLine = Math.max(1, Math.floor(percent * totalLines));
    
    editor.revealLineInCenter(targetLine);
    
    setTimeout(() => {
      isScrolling = false;
    }, 100);
  }

  onDestroy(() => {
    // Notify LSP of document close
    if (lspInitialized && filePath) {
      const model = editor?.getModel();
      if (model) {
        monacoLspAdapter.onModelRemoved(model, language);
        lspManager.didCloseTextDocument(language, `file://${filePath}`);
      }
    }

    if (editor) {
      editor.dispose();
    }
  });

  // Update editor when content changes externally
  $: if (editor && content !== currentContent) {
    currentContent = content;
    const position = editor.getPosition();
    const model = editor.getModel();
    if (model) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: content }],
        () => []
      );
    } else {
      editor.setValue(content);
    }
    if (position) {
      editor.setPosition(position);
    }
  }

  // Update language when it changes
  $: if (editor && language && language !== currentLanguage) {
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
      // Re-initialize LSP for new language
      lspInitialized = false;
      initializeLsp();
    }
  }

  // Update readOnly state
  $: if (editor && editor.updateOptions) {
    editor.updateOptions({ readOnly });
  }

  // Update save callback when onSave prop changes
  $: saveCallback = onSave;
</script>

<div class="monaco-editor-wrapper" bind:this={editorContainer}></div>

<style>
  .monaco-editor-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
