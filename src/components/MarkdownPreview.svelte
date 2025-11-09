<script>
  import { onMount, onDestroy } from 'svelte';
  import { marked } from 'marked';
  import mermaid from 'mermaid';
  import hljs from 'highlight.js';

  export let content = '';
  export let isDarkTheme = true;
  export let scrollSync = null; // { scrollToPercent: (percent) => void }

  let previewContainer;
  let renderedHtml = '';
  let isScrolling = false;

  // Configure mermaid
  onMount(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkTheme ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'SF Mono, Monaco, Cascadia Code, Courier New, monospace',
    });
  });

  // Configure marked with mermaid and syntax highlighting
  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch (err) {
          console.error('Highlight error:', err);
        }
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
  });

  // Render markdown with mermaid support
  async function renderMarkdown(markdown) {
    if (!markdown) {
      renderedHtml = '';
      return;
    }

    try {
      // First pass: convert markdown to HTML
      let html = marked.parse(markdown);

      // Second pass: find and render mermaid diagrams
      const mermaidRegex = /<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g;
      const mermaidBlocks = [];
      let match;
      let index = 0;

      while ((match = mermaidRegex.exec(html)) !== null) {
        const mermaidCode = match[1]
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
        
        const id = `mermaid-${Date.now()}-${index++}`;
        mermaidBlocks.push({ id, code: mermaidCode, placeholder: match[0] });
      }

      // Render mermaid diagrams
      for (const block of mermaidBlocks) {
        try {
          const { svg } = await mermaid.render(block.id, block.code);
          html = html.replace(block.placeholder, `<div class="mermaid-diagram">${svg}</div>`);
        } catch (err) {
          console.error('Mermaid render error:', err);
          html = html.replace(
            block.placeholder,
            `<div class="mermaid-error"><pre>${block.code}</pre><p class="error-message">⚠️ Mermaid diagram error: ${err.message}</p></div>`
          );
        }
      }

      renderedHtml = html;
    } catch (error) {
      console.error('Markdown render error:', error);
      renderedHtml = `<div class="render-error">Failed to render markdown: ${error.message}</div>`;
    }
  }

  // Debounced rendering
  let renderTimeout;
  $: {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
      renderMarkdown(content);
    }, 300);
  }

  // Update mermaid theme when dark mode changes
  $: if (mermaid) {
    mermaid.initialize({
      startOnLoad: false,
      theme: isDarkTheme ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'SF Mono, Monaco, Cascadia Code, Courier New, monospace',
    });
    renderMarkdown(content);
  }

  // Handle scroll events to sync with editor
  function handleScroll() {
    if (!previewContainer || !scrollSync || isScrolling) return;
    
    const scrollTop = previewContainer.scrollTop;
    const scrollHeight = previewContainer.scrollHeight - previewContainer.clientHeight;
    
    if (scrollHeight > 0) {
      const scrollPercent = scrollTop / scrollHeight;
      scrollSync.onPreviewScroll?.(scrollPercent);
    }
  }

  // Export method to scroll preview from outside
  export function scrollToPercent(percent) {
    if (!previewContainer) return;
    
    isScrolling = true;
    const scrollHeight = previewContainer.scrollHeight - previewContainer.clientHeight;
    previewContainer.scrollTop = scrollHeight * percent;
    
    setTimeout(() => {
      isScrolling = false;
    }, 100);
  }

  onDestroy(() => {
    clearTimeout(renderTimeout);
  });
</script>

<div class="markdown-preview" class:dark={isDarkTheme} bind:this={previewContainer} on:scroll={handleScroll}>
  <div class="preview-content">
    {@html renderedHtml}
  </div>
</div>

<style>
  .markdown-preview {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 24px;
    background-color: var(--color-background);
    color: var(--color-text-primary);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
  }

  .preview-content {
    max-width: 900px;
    margin: 0 auto;
  }

  /* Typography */
  .preview-content :global(h1) {
    font-size: 2em;
    font-weight: 600;
    margin-top: 24px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .preview-content :global(h2) {
    font-size: 1.5em;
    font-weight: 600;
    margin-top: 24px;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .preview-content :global(h3) {
    font-size: 1.25em;
    font-weight: 600;
    margin-top: 20px;
    margin-bottom: 12px;
    color: var(--color-text-primary);
  }

  .preview-content :global(h4),
  .preview-content :global(h5),
  .preview-content :global(h6) {
    font-weight: 600;
    margin-top: 16px;
    margin-bottom: 12px;
    color: var(--color-text-primary);
  }

  .preview-content :global(p) {
    margin-top: 0;
    margin-bottom: 16px;
    line-height: 1.6;
  }

  .preview-content :global(a) {
    color: var(--color-accent);
    text-decoration: none;
  }

  .preview-content :global(a:hover) {
    text-decoration: underline;
  }

  /* Lists */
  .preview-content :global(ul),
  .preview-content :global(ol) {
    margin-top: 0;
    margin-bottom: 16px;
    padding-left: 32px;
  }

  .preview-content :global(li) {
    margin-bottom: 4px;
    line-height: 1.6;
  }

  /* Code blocks */
  .preview-content :global(pre) {
    background-color: var(--color-surface-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: 16px;
    overflow-x: auto;
    margin-bottom: 16px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
    font-size: 0.9em;
    line-height: 1.5;
  }

  .preview-content :global(code) {
    background-color: var(--color-surface-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace;
    font-size: 0.9em;
  }

  .preview-content :global(pre code) {
    background-color: transparent;
    padding: 0;
    border-radius: 0;
  }

  /* Blockquotes */
  .preview-content :global(blockquote) {
    margin: 0 0 16px 0;
    padding-left: 16px;
    border-left: 4px solid var(--color-border);
    color: var(--color-text-secondary);
  }

  /* Tables */
  .preview-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
  }

  .preview-content :global(th),
  .preview-content :global(td) {
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    text-align: left;
  }

  .preview-content :global(th) {
    background-color: var(--color-surface-secondary);
    font-weight: 600;
  }

  /* Images */
  .preview-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-md);
    margin-bottom: 16px;
  }

  /* Horizontal rule */
  .preview-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: 24px 0;
  }

  /* Mermaid diagrams */
  .preview-content :global(.mermaid-diagram) {
    margin: 24px 0;
    padding: 16px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    overflow-x: auto;
    text-align: center;
  }

  .preview-content :global(.mermaid-diagram svg) {
    max-width: 100%;
    height: auto;
  }

  .preview-content :global(.mermaid-error) {
    margin: 24px 0;
    padding: 16px;
    background-color: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: var(--radius-md);
  }

  .preview-content :global(.mermaid-error pre) {
    background-color: rgba(0, 0, 0, 0.2);
    margin-bottom: 12px;
  }

  .preview-content :global(.error-message) {
    color: #ef4444;
    margin: 0;
    font-size: 0.9em;
  }

  .preview-content :global(.render-error) {
    padding: 16px;
    background-color: rgba(220, 38, 38, 0.1);
    border: 1px solid rgba(220, 38, 38, 0.3);
    border-radius: var(--radius-md);
    color: #ef4444;
  }

  /* Scrollbar */
  .markdown-preview::-webkit-scrollbar {
    width: 12px;
  }

  .markdown-preview::-webkit-scrollbar-track {
    background: var(--color-surface);
  }

  .markdown-preview::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: 6px;
  }

  .markdown-preview::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-tertiary);
  }
</style>
