<script>
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';

  export let content = '';
  export let onChange = null;
  export let editable = true;

  let element;
  let editor;

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [1, 2, 3, 4, 5, 6],
          },
          codeBlock: {
            HTMLAttributes: {
              class: 'code-block',
            },
          },
        }),
      ],
      content: content,
      editable: editable,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        if (onChange) {
          onChange(html);
        }
      },
      editorProps: {
        attributes: {
          class: 'tiptap-editor',
        },
      },
    });
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  $: if (editor && editor.isEditable !== editable) {
    editor.setEditable(editable);
  }
</script>

<div class="editor-wrapper">
  <div class="editor-container" bind:this={element}></div>
</div>

<style>
  .editor-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .editor-container {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-lg);
  }

  .editor-container :global(.tiptap-editor) {
    outline: none;
    min-height: 100%;
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
    line-height: var(--line-height-relaxed);
    color: var(--color-text-primary);
  }

  /* Headings */
  .editor-container :global(.tiptap-editor h1) {
    font-size: var(--font-size-3xl);
    font-weight: var(--font-weight-bold);
    margin-top: var(--spacing-xl);
    margin-bottom: var(--spacing-md);
    line-height: var(--line-height-tight);
  }

  .editor-container :global(.tiptap-editor h2) {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-semibold);
    margin-top: var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
    line-height: var(--line-height-tight);
  }

  .editor-container :global(.tiptap-editor h3) {
    font-size: var(--font-size-xl);
    font-weight: var(--font-weight-semibold);
    margin-top: var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
    line-height: var(--line-height-normal);
  }

  .editor-container :global(.tiptap-editor h4) {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    margin-top: var(--spacing-md);
    margin-bottom: var(--spacing-xs);
  }

  .editor-container :global(.tiptap-editor h5),
  .editor-container :global(.tiptap-editor h6) {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    margin-top: var(--spacing-md);
    margin-bottom: var(--spacing-xs);
  }

  /* Paragraphs */
  .editor-container :global(.tiptap-editor p) {
    margin-bottom: var(--spacing-md);
  }

  /* Lists */
  .editor-container :global(.tiptap-editor ul),
  .editor-container :global(.tiptap-editor ol) {
    margin-bottom: var(--spacing-md);
    padding-left: var(--spacing-lg);
  }

  .editor-container :global(.tiptap-editor li) {
    margin-bottom: var(--spacing-xs);
  }

  /* Code blocks */
  .editor-container :global(.tiptap-editor .code-block) {
    background-color: var(--color-surface-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    margin-bottom: var(--spacing-md);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    overflow-x: auto;
  }

  .editor-container :global(.tiptap-editor code) {
    background-color: var(--color-surface-secondary);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
  }

  .editor-container :global(.tiptap-editor pre code) {
    background: none;
    padding: 0;
  }

  /* Blockquotes */
  .editor-container :global(.tiptap-editor blockquote) {
    border-left: 3px solid var(--color-accent);
    padding-left: var(--spacing-md);
    margin-left: 0;
    margin-bottom: var(--spacing-md);
    color: var(--color-text-secondary);
    font-style: italic;
  }

  /* Horizontal rule */
  .editor-container :global(.tiptap-editor hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: var(--spacing-xl) 0;
  }

  /* Strong and emphasis */
  .editor-container :global(.tiptap-editor strong) {
    font-weight: var(--font-weight-semibold);
  }

  .editor-container :global(.tiptap-editor em) {
    font-style: italic;
  }

  /* Links */
  .editor-container :global(.tiptap-editor a) {
    color: var(--color-accent);
    text-decoration: none;
  }

  .editor-container :global(.tiptap-editor a:hover) {
    text-decoration: underline;
  }

  /* Selection */
  .editor-container :global(.tiptap-editor ::selection) {
    background-color: var(--color-accent);
    color: var(--color-background);
  }

  /* Placeholder */
  .editor-container :global(.tiptap-editor.is-empty::before) {
    content: attr(data-placeholder);
    color: var(--color-text-tertiary);
    pointer-events: none;
    position: absolute;
  }
</style>
