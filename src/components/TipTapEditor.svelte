<script>
  import { onMount, onDestroy } from 'svelte';
  import { Editor } from '@tiptap/core';
  import StarterKit from '@tiptap/starter-kit';
  import Image from '@tiptap/extension-image';
  import Link from '@tiptap/extension-link';
  import Highlight from '@tiptap/extension-highlight';
  import { TextStyle } from '@tiptap/extension-text-style';
  import Color from '@tiptap/extension-color';
  import Underline from '@tiptap/extension-underline';
  import Subscript from '@tiptap/extension-subscript';
  import Superscript from '@tiptap/extension-superscript';
  import TaskList from '@tiptap/extension-task-list';
  import TaskItem from '@tiptap/extension-task-item';
  import { Table } from '@tiptap/extension-table';
  import { TableRow } from '@tiptap/extension-table-row';
  import { TableCell } from '@tiptap/extension-table-cell';
  import { TableHeader } from '@tiptap/extension-table-header';
  import Placeholder from '@tiptap/extension-placeholder';
  import { FontFamily } from '@tiptap/extension-font-family';

  export let content = '';
  export let filePath = '';
  export let onContentChange = null;

  let element;
  let editor;
  let saveTimeout = null;
  let showLinkDialog = false;
  let showImageDialog = false;
  let showEmbedDialog = false;
  let linkUrl = '';
  let imageUrl = '';
  let embedUrl = '';
  let selectedFont = 'Calibri';
  let selectedFontSize = '11pt';

  const fonts = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Courier New', 'Comic Sans MS'];
  const fontSizes = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt', '36pt'];

  onMount(() => {
    editor = new Editor({
      element: element,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3, 4, 5, 6] },
        }),
        Image.configure({
          inline: true,
          allowBase64: true,
        }),
        Link.configure({
          openOnClick: false,
          HTMLAttributes: {
            class: 'tiptap-link',
          },
        }),
        Highlight.configure({
          multicolor: true,
        }),
        TextStyle,
        Color,
        Underline,
        Subscript,
        Superscript,
        TaskList,
        TaskItem.configure({
          nested: true,
        }),
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableCell,
        TableHeader,
        FontFamily,
        Placeholder.configure({
          placeholder: 'Start writing...',
        }),
      ],
      content: content || '',
      editable: true,
      autofocus: true,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        if (onContentChange) {
          onContentChange(html);
        }
        
        if (saveTimeout) {
          clearTimeout(saveTimeout);
        }
        saveTimeout = setTimeout(() => {
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

  let lastFilePath = '';
  $: if (editor && filePath && filePath !== lastFilePath) {
    editor.commands.setContent(content);
    lastFilePath = filePath;
  }

  async function saveContent(html) {
    if (!filePath || !window.electronAPI) return;
    
    const match = filePath.match(/(.*)\/\.swarm\/mind\/(.+)\.html$/);
    if (!match) return;
    
    const workspacePath = match[1];
    const filename = match[2];
    
    await window.electronAPI.mindWrite({
      workspacePath,
      name: filename,
      content: html,
    });
  }

  function handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (editor) {
        saveContent(editor.getHTML());
      }
    }
  }

  function setFontFamily(font) {
    selectedFont = font;
    editor.chain().focus().setFontFamily(font).run();
  }

  function setFontSize(size) {
    selectedFontSize = size;
    editor.chain().focus().setMark('textStyle', { fontSize: size }).run();
  }

  function addLink() {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
      linkUrl = '';
    }
    showLinkDialog = false;
  }

  function removeLink() {
    editor.chain().focus().unsetLink().run();
  }

  function addImage() {
    if (imageUrl) {
      editor.chain().focus().setImage({ src: imageUrl }).run();
      imageUrl = '';
    }
    showImageDialog = false;
  }

  async function uploadImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          editor.chain().focus().setImage({ src: event.target.result }).run();
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  function addEmbed() {
    if (embedUrl) {
      const iframe = `<iframe src="${embedUrl}" width="100%" height="400" frameborder="0" allowfullscreen></iframe>`;
      editor.chain().focus().insertContent(iframe).run();
      embedUrl = '';
    }
    showEmbedDialog = false;
  }

  function insertTable() {
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }

  function setTextColor(color) {
    editor.chain().focus().setColor(color).run();
  }

  function setHighlight(color) {
    editor.chain().focus().toggleHighlight({ color }).run();
  }
</script>

<div class="mind-editor" on:keydown={handleKeydown} role="application" tabindex="0">
  {#if editor}
    <div class="toolbar">
      <!-- Font Controls -->
      <div class="toolbar-group">
        <select class="font-select" value={selectedFont} on:change={(e) => setFontFamily(e.target.value)}>
          {#each fonts as font}
            <option value={font}>{font}</option>
          {/each}
        </select>
        <select class="size-select" value={selectedFontSize} on:change={(e) => setFontSize(e.target.value)}>
          {#each fontSizes as size}
            <option value={size}>{size}</option>
          {/each}
        </select>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Text Formatting -->
      <div class="toolbar-group">
        <button
          on:click={() => editor.chain().focus().toggleBold().run()}
          class:active={editor.isActive('bold')}
          title="Bold (⌘B)"
        >
          <strong>B</strong>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleItalic().run()}
          class:active={editor.isActive('italic')}
          title="Italic (⌘I)"
        >
          <em>I</em>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleUnderline().run()}
          class:active={editor.isActive('underline')}
          title="Underline (⌘U)"
        >
          <u>U</u>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleStrike().run()}
          class:active={editor.isActive('strike')}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleSubscript().run()}
          class:active={editor.isActive('subscript')}
          title="Subscript"
        >
          X<sub>2</sub>
        </button>
        <button
          on:click={() => editor.chain().focus().toggleSuperscript().run()}
          class:active={editor.isActive('superscript')}
          title="Superscript"
        >
          X<sup>2</sup>
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Colors -->
      <div class="toolbar-group">
        <div class="color-picker">
          <button title="Text Color">A</button>
          <input type="color" on:input={(e) => setTextColor(e.target.value)} />
        </div>
        <div class="color-picker highlight">
          <button title="Highlight">
            <span class="highlight-icon">H</span>
          </button>
          <input type="color" value="#ffff00" on:input={(e) => setHighlight(e.target.value)} />
        </div>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Headings -->
      <div class="toolbar-group">
        {#each [1, 2, 3] as level}
          <button
            on:click={() => editor.chain().focus().toggleHeading({ level }).run()}
            class:active={editor.isActive('heading', { level })}
            title="Heading {level}"
            class="text-button"
          >
            H{level}
          </button>
        {/each}
      </div>

      <div class="toolbar-divider"></div>

      <!-- Lists -->
      <div class="toolbar-group">
        <button
          on:click={() => editor.chain().focus().toggleBulletList().run()}
          class:active={editor.isActive('bulletList')}
          title="Bullet List"
        >
          •
        </button>
        <button
          on:click={() => editor.chain().focus().toggleOrderedList().run()}
          class:active={editor.isActive('orderedList')}
          title="Numbered List"
        >
          1.
        </button>
        <button
          on:click={() => editor.chain().focus().toggleTaskList().run()}
          class:active={editor.isActive('taskList')}
          title="Task List"
        >
          ☑
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Insert -->
      <div class="toolbar-group">
        <button on:click={() => showLinkDialog = true} class:active={editor.isActive('link')} title="Insert Link">
          🔗
        </button>
        <button on:click={() => showImageDialog = true} title="Insert Image">
          🖼
        </button>
        <button on:click={insertTable} title="Insert Table">
          ⊞
        </button>
        <button on:click={() => showEmbedDialog = true} title="Insert Embed">
          ⧉
        </button>
        <button on:click={() => editor.chain().focus().toggleCodeBlock().run()} class:active={editor.isActive('codeBlock')} title="Code Block">
          {'</>'}
        </button>
        <button on:click={() => editor.chain().focus().toggleBlockquote().run()} class:active={editor.isActive('blockquote')} title="Quote">
          "
        </button>
        <button on:click={() => editor.chain().focus().setHorizontalRule().run()} title="Divider">
          ―
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <!-- Undo/Redo -->
      <div class="toolbar-group">
        <button on:click={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Undo">
          ↶
        </button>
        <button on:click={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Redo">
          ↷
        </button>
      </div>
    </div>
  {/if}

  <div class="editor-content" bind:this={element}></div>

  <!-- Link Dialog -->
  {#if showLinkDialog}
    <div class="dialog-overlay" on:click={() => showLinkDialog = false}>
      <div class="dialog" on:click|stopPropagation>
        <h3>Insert Link</h3>
        <input type="url" bind:value={linkUrl} placeholder="https://..." />
        <div class="dialog-actions">
          <button on:click={() => showLinkDialog = false}>Cancel</button>
          <button class="primary" on:click={addLink}>Insert</button>
          {#if editor?.isActive('link')}
            <button class="danger" on:click={removeLink}>Remove Link</button>
          {/if}
        </div>
      </div>
    </div>
  {/if}

  <!-- Image Dialog -->
  {#if showImageDialog}
    <div class="dialog-overlay" on:click={() => showImageDialog = false}>
      <div class="dialog" on:click|stopPropagation>
        <h3>Insert Image</h3>
        <input type="url" bind:value={imageUrl} placeholder="Image URL..." />
        <div class="dialog-actions">
          <button on:click={uploadImage}>Upload File</button>
          <button on:click={() => showImageDialog = false}>Cancel</button>
          <button class="primary" on:click={addImage}>Insert URL</button>
        </div>
      </div>
    </div>
  {/if}

  <!-- Embed Dialog -->
  {#if showEmbedDialog}
    <div class="dialog-overlay" on:click={() => showEmbedDialog = false}>
      <div class="dialog" on:click|stopPropagation>
        <h3>Insert Embed</h3>
        <input type="url" bind:value={embedUrl} placeholder="Embed URL (YouTube, Vimeo, etc.)..." />
        <div class="dialog-actions">
          <button on:click={() => showEmbedDialog = false}>Cancel</button>
          <button class="primary" on:click={addEmbed}>Insert</button>
        </div>
      </div>
    </div>
  {/if}
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
    gap: 4px;
    padding: 8px 12px;
    background-color: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .toolbar-divider {
    width: 1px;
    height: 20px;
    background-color: var(--color-border);
    margin: 0 4px;
  }

  .font-select, .size-select {
    height: 28px;
    padding: 0 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: 12px;
    cursor: pointer;
  }

  .font-select {
    width: 120px;
  }

  .size-select {
    width: 60px;
  }

  .toolbar button {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 6px;
    background-color: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--color-text-secondary);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .toolbar button:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .toolbar button.active {
    background-color: var(--color-accent);
    color: white;
  }

  .toolbar button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .color-picker {
    position: relative;
    display: flex;
    align-items: center;
  }

  .color-picker input[type="color"] {
    position: absolute;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .color-picker button {
    pointer-events: none;
  }

  .color-picker.highlight button {
    background-color: #ffff00;
    color: #000;
  }

  .editor-content {
    flex: 1;
    overflow-y: auto;
    padding: 40px;
    background-color: #f0f0f0;
  }

  .editor-content :global(.tiptap-editor) {
    max-width: 816px;
    min-height: 1056px;
    margin: 0 auto;
    padding: 96px;
    background-color: #ffffff;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    border-radius: 2px;
    color: #1a1a1a;
    cursor: text;
    outline: none;
    font-family: 'Calibri', sans-serif;
    font-size: 11pt;
    line-height: 1.15;
  }

  .editor-content :global(.tiptap-editor):focus {
    outline: none;
  }

  .editor-content :global(.ProseMirror) {
    outline: none;
  }

  .editor-content :global(.tiptap-editor h1) {
    font-size: 2em;
    font-weight: 700;
    margin: 0 0 0.5em;
    line-height: 1.2;
  }

  .editor-content :global(.tiptap-editor h2) {
    font-size: 1.5em;
    font-weight: 600;
    margin: 1em 0 0.4em;
    line-height: 1.3;
  }

  .editor-content :global(.tiptap-editor h3) {
    font-size: 1.17em;
    font-weight: 600;
    margin: 0.8em 0 0.3em;
    line-height: 1.4;
  }

  .editor-content :global(.tiptap-editor p) {
    margin: 0 0 8pt;
  }

  .editor-content :global(.tiptap-editor ul) {
    padding-left: 24px;
    margin: 0.5em 0;
    list-style-type: disc;
  }

  .editor-content :global(.tiptap-editor ol) {
    padding-left: 24px;
    margin: 0.5em 0;
    list-style-type: decimal;
  }

  .editor-content :global(.tiptap-editor ul ul) {
    list-style-type: circle;
  }

  .editor-content :global(.tiptap-editor ul ul ul) {
    list-style-type: square;
  }

  .editor-content :global(.tiptap-editor li) {
    margin: 0.25em 0;
    line-height: 1.6;
  }

  .editor-content :global(.tiptap-editor li p) {
    margin: 0;
  }

  /* Task List */
  .editor-content :global(.tiptap-editor ul[data-type="taskList"]) {
    list-style: none;
    padding-left: 0;
  }

  .editor-content :global(.tiptap-editor ul[data-type="taskList"] li) {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }

  .editor-content :global(.tiptap-editor ul[data-type="taskList"] li label) {
    display: flex;
    align-items: center;
  }

  .editor-content :global(.tiptap-editor ul[data-type="taskList"] li input[type="checkbox"]) {
    width: 16px;
    height: 16px;
    cursor: pointer;
  }

  .editor-content :global(.tiptap-editor ul[data-type="taskList"] li[data-checked="true"] > div > p) {
    text-decoration: line-through;
    color: #888;
  }

  /* Tables */
  .editor-content :global(.tiptap-editor table) {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
  }

  .editor-content :global(.tiptap-editor th),
  .editor-content :global(.tiptap-editor td) {
    border: 1px solid #ccc;
    padding: 8px 12px;
    text-align: left;
  }

  .editor-content :global(.tiptap-editor th) {
    background-color: #f5f5f5;
    font-weight: 600;
  }

  /* Links */
  .editor-content :global(.tiptap-link) {
    color: #0066cc;
    text-decoration: underline;
    cursor: pointer;
  }

  /* Images */
  .editor-content :global(.tiptap-editor img) {
    max-width: 100%;
    height: auto;
    margin: 1em 0;
    border-radius: 4px;
  }

  /* Code */
  .editor-content :global(.tiptap-editor code) {
    background-color: #f5f5f5;
    border: 1px solid #ddd;
    border-radius: 3px;
    padding: 2px 6px;
    font-family: 'Courier New', monospace;
    font-size: 0.9em;
  }

  .editor-content :global(.tiptap-editor pre) {
    background-color: #2d2d2d;
    border-radius: 6px;
    padding: 16px;
    margin: 1em 0;
    overflow-x: auto;
  }

  .editor-content :global(.tiptap-editor pre code) {
    background: none;
    border: none;
    padding: 0;
    color: #f8f8f2;
    font-size: 13px;
  }

  /* Blockquote */
  .editor-content :global(.tiptap-editor blockquote) {
    border-left: 4px solid #0066cc;
    padding-left: 16px;
    margin: 1em 0;
    color: #666;
    font-style: italic;
  }

  /* Horizontal Rule */
  .editor-content :global(.tiptap-editor hr) {
    border: none;
    border-top: 1px solid #ddd;
    margin: 2em 0;
  }

  /* Placeholder */
  .editor-content :global(.tiptap-editor p.is-editor-empty:first-child::before) {
    color: #aaa;
    content: attr(data-placeholder);
    float: left;
    height: 0;
    pointer-events: none;
  }

  /* Embeds */
  .editor-content :global(.tiptap-editor iframe) {
    width: 100%;
    max-width: 100%;
    margin: 1em 0;
    border-radius: 6px;
  }

  /* Dialog */
  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .dialog {
    background: var(--color-surface);
    border-radius: 8px;
    padding: 24px;
    min-width: 400px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  }

  .dialog h3 {
    margin: 0 0 16px;
    color: var(--color-text-primary);
  }

  .dialog input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-background);
    color: var(--color-text-primary);
    font-size: 14px;
    margin-bottom: 16px;
  }

  .dialog-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .dialog-actions button {
    padding: 8px 16px;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    background: var(--color-surface);
    color: var(--color-text-primary);
    cursor: pointer;
    font-size: 13px;
  }

  .dialog-actions button.primary {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .dialog-actions button.danger {
    background: #dc3545;
    color: white;
    border-color: #dc3545;
  }

  @media (prefers-color-scheme: dark) {
    .editor-content {
      background-color: #1e1e1e;
    }
    
    .editor-content :global(.tiptap-editor) {
      background-color: #2d2d2d;
      color: #e0e0e0;
    }

    .editor-content :global(.tiptap-editor th) {
      background-color: #3d3d3d;
    }

    .editor-content :global(.tiptap-editor th),
    .editor-content :global(.tiptap-editor td) {
      border-color: #4d4d4d;
    }
  }

  @media (max-width: 768px) {
    .editor-content {
      padding: 16px;
    }

    .editor-content :global(.tiptap-editor) {
      padding: 48px;
    }

    .toolbar {
      gap: 2px;
      padding: 6px;
    }

    .toolbar-divider {
      display: none;
    }

    .font-select {
      width: 80px;
    }
  }
</style>
