<script>
  import { onMount, onDestroy } from 'svelte';
  import * as monaco from 'monaco-editor';
  import { lspManager } from '../lsp/LspManager.js';
  import { monacoLspAdapter } from '../lsp/MonacoLspAdapter.js';
  import { getLspConfig, hasLspSupport } from '../lsp/lsp-config.js';

  export let content = '';
  export let language = 'javascript';
  export let onChange = null;
  export let readOnly = false;
  export let filePath = null; // File path for LSP

  let editorContainer;
  let editor;
  let currentContent = content;
  let lspInitialized = false;
  let currentLanguage = language;

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

    // Initialize LSP if supported
    await initializeLsp();

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  });

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
    editor.setValue(content);
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
</script>

<div class="monaco-editor-wrapper" bind:this={editorContainer}></div>

<style>
  .monaco-editor-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
