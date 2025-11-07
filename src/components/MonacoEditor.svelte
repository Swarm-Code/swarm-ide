<script>
  import { onMount, onDestroy } from 'svelte';
  import * as monaco from 'monaco-editor';

  export let content = '';
  export let language = 'javascript';
  export let onChange = null;
  export let readOnly = false;

  let editorContainer;
  let editor;
  let currentContent = content;

  onMount(() => {
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

    return () => {
      mediaQuery.removeEventListener('change', handleThemeChange);
    };
  });

  onDestroy(() => {
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
  $: if (editor && language) {
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, language);
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
