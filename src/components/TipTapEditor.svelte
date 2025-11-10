<script>
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';

  export let content = '';
  export let filePath = '';
  export let onContentChange = null;

  let element;
  let editor;
  let saveTimeout = null;

  console.log('[TipTapEditor] Component created with props:', { content: content?.substring(0, 50), filePath });

  onMount(() => {
    console.log('[TipTapEditor] onMount called, initializing editor with content:', content?.substring(0, 50), 'filePath:', filePath);
    editor = new Editor({
      element: element,
      extensions: [StarterKit],
      content: content || '<p>Start writing...</p>',
      editable: true,
      autofocus: true,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        console.log('[TipTapEditor] Editor content updated, html length:', html.length);
        if (onContentChange) {
          onContentChange(html);
        }
        
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
          console.log('[TipTapEditor] Auto-save triggered after 1s');
          saveContent(html);
        }, 1000);
      },
      onTransaction: () => {
        editor = editor;
      },
      editorProps: {
        attributes: {
          class: 'tiptap-editor',
          spellcheck: 'true',
        },
      },
    });
  });

  onDestroy(() => {
    if (saveTimeout) {
      clearTimeout(saveTimeout);
    }
    if (editor) {
      editor.destroy();
    }
  });

  // Only update editor content when filePath changes (new file opened)
  // Don't react to content changes from typing
  let lastFilePath = '';
  $: if (editor && filePath && filePath !== lastFilePath) {
    console.log('[TipTapEditor] File changed, loading new content:', content?.substring(0, 50), 'filePath:', filePath);
    editor.commands.setContent(content);
    lastFilePath = filePath;
  }

  $: console.log('[TipTapEditor] Props updated:', { filePath, contentLength: content?.length });

  async function saveContent(html) {
    if (!filePath || !window.electronAPI) return;
    
    console.log('[TipTapEditor] Saving content, filePath:', filePath);
    
    const match = filePath.match(/(.*)\/\.swarm\/mind\/(.+)\.html$/);
    if (!match) {
      console.error('[TipTapEditor] Failed to parse filePath:', filePath);
      return;
    }
    
    const workspacePath = match[1];
    const filename = match[2];
    
    console.log('[TipTapEditor] Saving:', { workspacePath, filename });
    
    const result = await window.electronAPI.mindWrite({
      workspacePath,
      name: filename,
      content: html,
    });
    
    console.log('[TipTapEditor] Save result:', result);
  }

  function handleKeydown(event) {
    // Ctrl+S or Cmd+S to save
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (editor) {
        saveContent(editor.getHTML());
      }
    }
  }
</script>

<div class="mind-editor" on:keydown={handleKeydown}>
  {#if editor}
    <div class="toolbar">
      <div class="toolbar-group">
        <button
          on:click={() => editor.chain().focus().toggleBold().run()}
          class:active={editor.isActive('bold')}
          aria-label="Bold"
          title="Bold (⌘B)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 12h9a4 4 0 010 8H6zM6 4h8a4 4 0 010 8H6z" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleItalic().run()}
          class:active={editor.isActive('italic')}
          aria-label="Italic"
          title="Italic (⌘I)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="19" y1="4" x2="10" y2="4" stroke-linecap="round" />
            <line x1="14" y1="20" x2="5" y2="20" stroke-linecap="round" />
            <line x1="15" y1="4" x2="9" y2="20" stroke-linecap="round" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleStrike().run()}
          class:active={editor.isActive('strike')}
          aria-label="Strikethrough"
          title="Strikethrough"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 12h16M9 5h6M9 19h6" stroke-linecap="round" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleCode().run()}
          class:active={editor.isActive('code')}
          aria-label="Code"
          title="Inline Code"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          on:click={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          class:active={editor.isActive('heading', { level: 1 })}
          aria-label="Heading 1"
          title="Heading 1"
          class="text-button"
        >
          H1
        </button>
        <button
          on:click={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          class:active={editor.isActive('heading', { level: 2 })}
          aria-label="Heading 2"
          title="Heading 2"
          class="text-button"
        >
          H2
        </button>
        <button
          on:click={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          class:active={editor.isActive('heading', { level: 3 })}
          aria-label="Heading 3"
          title="Heading 3"
          class="text-button"
        >
          H3
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          on:click={() => editor.chain().focus().toggleBulletList().run()}
          class:active={editor.isActive('bulletList')}
          aria-label="Bullet List"
          title="Bullet List"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="9" y1="6" x2="20" y2="6" stroke-linecap="round" />
            <line x1="9" y1="12" x2="20" y2="12" stroke-linecap="round" />
            <line x1="9" y1="18" x2="20" y2="18" stroke-linecap="round" />
            <circle cx="4" cy="6" r="1" fill="currentColor" />
            <circle cx="4" cy="12" r="1" fill="currentColor" />
            <circle cx="4" cy="18" r="1" fill="currentColor" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleOrderedList().run()}
          class:active={editor.isActive('orderedList')}
          aria-label="Numbered List"
          title="Numbered List"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="10" y1="6" x2="21" y2="6" stroke-linecap="round" />
            <line x1="10" y1="12" x2="21" y2="12" stroke-linecap="round" />
            <line x1="10" y1="18" x2="21" y2="18" stroke-linecap="round" />
            <path d="M4 6h1v4" stroke-linecap="round" stroke-linejoin="round" />
            <path d="M4 14h2v4H4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleCodeBlock().run()}
          class:active={editor.isActive('codeBlock')}
          aria-label="Code Block"
          title="Code Block"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M8 10l-2 2 2 2M16 10l2 2-2 2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleBlockquote().run()}
          class:active={editor.isActive('blockquote')}
          aria-label="Quote"
          title="Blockquote"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 21v-4a4 4 0 014-4h2a4 4 0 004-4V7a4 4 0 00-4-4H7a4 4 0 00-4 4v4M15 21v-4a4 4 0 014-4h2a4 4 0 004-4V7a4 4 0 00-4-4h-2a4 4 0 00-4 4v4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          on:click={() => editor.chain().focus().setHorizontalRule().run()}
          aria-label="Divider"
          title="Horizontal Rule"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="12" x2="20" y2="12" stroke-linecap="round" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          aria-label="Undo"
          title="Undo (⌘Z)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 10h10a8 8 0 018 8M3 10l6 6M3 10l6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
        <button
          on:click={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          aria-label="Redo"
          title="Redo (⌘⇧Z)"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10h-10a8 8 0 00-8 8M21 10l-6 6M21 10l-6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  {/if}

  <div class="editor-content" bind:this={element}></div>
</div>

<style>
  .mind-editor {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: var(--color-background-secondary);
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    gap: 2px;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background-color: var(--color-border);
    margin: 0 var(--spacing-xs);
  }

  .toolbar button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 var(--spacing-xs);
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    font-family: var(--font-family-base);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .toolbar button.text-button {
    padding: 0 var(--spacing-sm);
  }

  .toolbar button:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .toolbar button.active {
    background-color: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .toolbar button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .toolbar button svg {
    width: 14px;
    height: 14px;
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-2xl) var(--spacing-3xl);
    max-width: 850px;
    margin: 0 auto;
    width: 100%;
    background-color: var(--color-surface);
    box-shadow: 0 0 0 1px var(--color-border);
    min-height: 100%;
  }

  .editor-content :global(.tiptap-editor) {
    outline: none;
    min-height: 600px;
    color: var(--color-text-primary);
    cursor: text;
    padding: var(--spacing-md);
  }

  .editor-content :global(.tiptap-editor):focus {
    outline: none;
  }

  .editor-content :global(.ProseMirror) {
    outline: none;
  }

  .editor-content :global(.ProseMirror-focused) {
    outline: none;
  }

  .editor-content :global(.tiptap-editor h1) {
    font-size: 2.5em;
    font-weight: 700;
    color: var(--color-text-primary);
    margin: 1.2em 0 0.5em;
    line-height: 1.2;
    letter-spacing: -0.5px;
  }

  .editor-content :global(.tiptap-editor h1:first-child) {
    margin-top: 0;
  }

  .editor-content :global(.tiptap-editor h2) {
    font-size: 2em;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 1em 0 0.4em;
    line-height: 1.3;
    letter-spacing: -0.3px;
  }

  .editor-content :global(.tiptap-editor h3) {
    font-size: 1.5em;
    font-weight: 600;
    color: var(--color-text-primary);
    margin: 0.8em 0 0.3em;
    line-height: 1.4;
  }

  .editor-content :global(.tiptap-editor p) {
    font-size: 16px;
    color: var(--color-text-primary);
    margin: 0.8em 0;
    line-height: 1.75;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
  }

  .editor-content :global(.tiptap-editor ul),
  .editor-content :global(.tiptap-editor ol) {
    padding-left: var(--spacing-xl);
    margin: var(--spacing-sm) 0;
  }

  .editor-content :global(.tiptap-editor li) {
    margin: var(--spacing-xs) 0;
    line-height: var(--line-height-relaxed);
  }

  .editor-content :global(.tiptap-editor li p) {
    margin: 0;
  }

  .editor-content :global(.tiptap-editor code) {
    background-color: var(--color-surface-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    padding: 2px 6px;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    color: var(--color-accent);
  }

  .editor-content :global(.tiptap-editor pre) {
    background-color: var(--color-surface-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-md);
    margin: var(--spacing-md) 0;
    overflow-x: auto;
  }

  .editor-content :global(.tiptap-editor pre code) {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .editor-content :global(.tiptap-editor blockquote) {
    border-left: 3px solid var(--color-accent);
    padding-left: var(--spacing-md);
    margin: var(--spacing-md) 0;
    color: var(--color-text-secondary);
  }

  .editor-content :global(.tiptap-editor blockquote p) {
    color: var(--color-text-secondary);
  }

  .editor-content :global(.tiptap-editor hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: var(--spacing-xl) 0;
  }

  .editor-content :global(.tiptap-editor strong) {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .editor-content :global(.tiptap-editor em) {
    font-style: italic;
  }

  .editor-content :global(.tiptap-editor s) {
    text-decoration: line-through;
    color: var(--color-text-secondary);
  }

  .editor-content :global(.tiptap-editor p.is-editor-empty:first-child::before) {
    color: var(--color-text-tertiary);
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .toolbar button,
    * {
      transition: none !important;
    }
  }

  @media (max-width: 768px) {
    .editor-content {
      padding: var(--spacing-lg) var(--spacing-md);
    }

    .toolbar {
      gap: var(--spacing-xs);
      padding: var(--spacing-xs) var(--spacing-sm);
    }

    .toolbar-divider {
      display: none;
    }
  }
</style>
