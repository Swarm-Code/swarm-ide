<script>
  import { fade } from 'svelte/transition';
  import { marked } from 'marked';

  // Configure marked for better rendering
  marked.setOptions({
    breaks: true,
    gfm: true
  });

  let messages = [];
  let inputText = '';
  let outputContainer;

  function parseMarkdown(text) {
    return marked.parse(text);
  }

  function handleSendMessage() {
    if (!inputText.trim()) return;

    // Add user message
    const userMessage = {
      id: Date.now(),
      role: 'user',
      content: inputText.trim()
    };
    messages = [...messages, userMessage];

    const userInput = inputText.trim();
    inputText = '';

    // Auto-scroll to bottom
    setTimeout(() => scrollToBottom(), 50);

    // TODO: Add actual agent response logic here
    setTimeout(() => {
      const assistantMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: `You said: **"${userInput}"**\n\nI can render:\n- *Italic text*\n- **Bold text**\n- \`inline code\`\n- Lists and more!`
      };
      messages = [...messages, assistantMessage];
      setTimeout(() => scrollToBottom(), 50);
    }, 500);
  }

  function scrollToBottom() {
    if (outputContainer) {
      outputContainer.scrollTo({
        top: outputContainer.scrollHeight,
        behavior: 'smooth'
      });
    }
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  }
</script>

<div class="agent-panel">
  <!-- Panel header -->
  <div class="panel-header">
    <h3>Agent Chat</h3>
    <span class="mode-badge">AUTO</span>
  </div>

  <!-- Output/conversation area -->
  <div class="output-container" bind:this={outputContainer}>
    {#if messages.length === 0}
      <div class="welcome-message" in:fade>
        <p>Hi! I'm Claude, operating in AUTO mode within the MCP environment.</p>
        <p>I'm ready to assist you with your tasks.</p>
      </div>
    {/if}

    {#each messages as message (message.id)}
      <div class="message-block" in:fade={{ duration: 200 }}>
        {#if message.role === 'user'}
          <div class="user-query">{message.content}</div>
        {:else}
          <div class="assistant-response markdown-content">
            {@html parseMarkdown(message.content)}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- Input at bottom -->
  <div class="input-section">
    <input
      type="text"
      class="agent-input"
      placeholder="Type a message..."
      bind:value={inputText}
      on:keydown={handleKeyDown}
    />
  </div>
</div>

<style>
  .agent-panel {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: var(--color-background);
    font-family: var(--font-family-base);
  }

  /* Panel header */
  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-surface);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .panel-header h3 {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .mode-badge {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-tertiary);
    background: var(--color-background-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Input at bottom */
  .input-section {
    padding: var(--spacing-md);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface);
    flex-shrink: 0;
  }

  .agent-input {
    width: 100%;
    padding: 10px var(--spacing-md);
    background: var(--color-background-secondary);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-family: var(--font-family-base);
    transition: all var(--transition-fast);
  }

  .agent-input::placeholder {
    color: var(--color-text-tertiary);
  }

  .agent-input:focus {
    outline: none;
    border-color: var(--color-accent);
    background: var(--color-background);
  }

  /* Output container - document style */
  .output-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: var(--spacing-lg);
    scroll-behavior: smooth;
  }

  /* Custom scrollbar */
  .output-container::-webkit-scrollbar {
    width: 8px;
  }

  .output-container::-webkit-scrollbar-track {
    background: transparent;
  }

  .output-container::-webkit-scrollbar-thumb {
    background: var(--color-border);
    border-radius: var(--radius-full);
  }

  .output-container::-webkit-scrollbar-thumb:hover {
    background: var(--color-text-tertiary);
  }

  /* Welcome message */
  .welcome-message {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-relaxed);
  }

  .welcome-message p {
    margin: 0 0 var(--spacing-sm) 0;
  }

  /* Message blocks - no bubbles, just text */
  .message-block {
    margin-bottom: var(--spacing-lg);
    font-size: var(--font-size-sm);
    line-height: var(--line-height-relaxed);
  }

  .user-query {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-medium);
    margin-bottom: var(--spacing-md);
    padding-bottom: var(--spacing-sm);
    border-bottom: 1px solid var(--color-border-secondary);
  }

  .assistant-response {
    color: var(--color-text-secondary);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* Markdown styling - using :global() because content is injected via {@html} */
  .markdown-content {
    line-height: var(--line-height-relaxed);
  }

  .markdown-content :global(p) {
    margin: 0 0 var(--spacing-sm) 0;
  }

  .markdown-content :global(p:last-child) {
    margin-bottom: 0;
  }

  /* Emphasis */
  .markdown-content :global(strong) {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .markdown-content :global(em) {
    font-style: italic;
    color: var(--color-text-primary);
  }

  /* Code */
  .markdown-content :global(code) {
    font-family: var(--font-family-mono);
    font-size: 0.9em;
    background: var(--color-background-secondary);
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-secondary);
  }

  .markdown-content :global(pre) {
    background: var(--color-background-secondary);
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    overflow-x: auto;
    margin: var(--spacing-sm) 0;
    border: 1px solid var(--color-border);
  }

  .markdown-content :global(pre code) {
    background: none;
    padding: 0;
    border: none;
    color: var(--color-text-primary);
  }

  /* Lists */
  .markdown-content :global(ul),
  .markdown-content :global(ol) {
    margin: var(--spacing-sm) 0;
    padding-left: var(--spacing-lg);
  }

  .markdown-content :global(li) {
    margin: var(--spacing-xs) 0;
  }

  .markdown-content :global(ul) {
    list-style-type: disc;
  }

  .markdown-content :global(ol) {
    list-style-type: decimal;
  }

  /* Headings */
  .markdown-content :global(h1),
  .markdown-content :global(h2),
  .markdown-content :global(h3),
  .markdown-content :global(h4),
  .markdown-content :global(h5),
  .markdown-content :global(h6) {
    color: var(--color-text-primary);
    font-weight: var(--font-weight-semibold);
    margin: var(--spacing-md) 0 var(--spacing-sm) 0;
  }

  .markdown-content :global(h1) {
    font-size: var(--font-size-xl);
  }

  .markdown-content :global(h2) {
    font-size: var(--font-size-lg);
  }

  .markdown-content :global(h3) {
    font-size: var(--font-size-base);
  }

  /* Links */
  .markdown-content :global(a) {
    color: var(--color-accent);
    text-decoration: none;
    transition: color var(--transition-fast);
  }

  .markdown-content :global(a:hover) {
    color: var(--color-accent-hover);
    text-decoration: underline;
  }

  /* Blockquotes */
  .markdown-content :global(blockquote) {
    border-left: 3px solid var(--color-border);
    padding-left: var(--spacing-md);
    margin: var(--spacing-sm) 0;
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  /* Horizontal rule */
  .markdown-content :global(hr) {
    border: none;
    border-top: 1px solid var(--color-border);
    margin: var(--spacing-md) 0;
  }

  /* Tables */
  .markdown-content :global(table) {
    border-collapse: collapse;
    width: 100%;
    margin: var(--spacing-sm) 0;
  }

  .markdown-content :global(th),
  .markdown-content :global(td) {
    border: 1px solid var(--color-border);
    padding: var(--spacing-xs) var(--spacing-sm);
    text-align: left;
  }

  .markdown-content :global(th) {
    background: var(--color-surface-secondary);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }
</style>
