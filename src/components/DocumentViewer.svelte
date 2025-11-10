<script>
  import { onMount } from 'svelte';
  import { workspaceStore } from '../stores/workspaceStore.js';

  export let filePath = '';
  export let fileName = '';

  let content = '';
  let fileType = 'unknown';
  let loading = true;
  let error = null;
  let isSSH = false;
  let sshConnectionId = null;

  // PDF viewer state
  let pdfDoc = null;
  let pdfPages = [];
  let currentPage = 1;
  let totalPages = 0;
  let scale = 1.5;
  let rendering = false;

  const PDF_EXTENSIONS = new Set(['.pdf']);
  const WORD_EXTENSIONS = new Set(['.doc', '.docx']);
  const EXCEL_EXTENSIONS = new Set(['.xls', '.xlsx', '.csv']);
  const POWERPOINT_EXTENSIONS = new Set(['.ppt', '.pptx']);
  const TEXT_EXTENSIONS = new Set(['.env', '.log', '.txt', '.gitignore', '.gitattributes', '.git']);

  function detectFileType(path) {
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    if (PDF_EXTENSIONS.has(ext)) return 'pdf';
    if (WORD_EXTENSIONS.has(ext)) return 'word';
    if (EXCEL_EXTENSIONS.has(ext)) return 'excel';
    if (POWERPOINT_EXTENSIONS.has(ext)) return 'powerpoint';
    if (TEXT_EXTENSIONS.has(ext)) return 'text';
    
    const baseName = path.substring(path.lastIndexOf('/') + 1);
    if (baseName === '.env' || baseName.startsWith('.env.')) return 'text';
    if (baseName === '.gitignore' || baseName === '.gitattributes') return 'text';
    if (baseName.endsWith('.log')) return 'text';
    
    return 'unknown';
  }

  async function loadFile() {
    loading = true;
    error = null;

    try {
      let activeWorkspace = null;
      const unsubscribe = workspaceStore.subscribe(state => {
        activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      });
      unsubscribe();

      isSSH = activeWorkspace?.isSSH || false;
      sshConnectionId = activeWorkspace?.sshConnection?.id || null;

      fileType = detectFileType(filePath);

      if (fileType === 'pdf') {
        await loadPDF();
      } else if (fileType === 'word') {
        await loadWord();
      } else if (fileType === 'excel') {
        await loadExcel();
      } else if (fileType === 'powerpoint') {
        await loadPowerPoint();
      } else if (fileType === 'text') {
        await loadText();
      } else {
        throw new Error('Unsupported file type');
      }
    } catch (err) {
      error = err.message;
      console.error('Error loading document:', err);
    } finally {
      loading = false;
    }
  }

  async function loadPDF() {
    const pdfjsLib = await import('pdfjs-dist');
    
    // Set worker path
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).href;
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    if (isSSH && sshConnectionId) {
      result = await window.electronAPI.sshSftpReadFileBinary?.(sshConnectionId, filePath);
      if (result?.success) {
        result.data = new Uint8Array(result.data);
      }
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
    }

    if (!result?.success) {
      throw new Error(result?.error || 'Failed to read PDF');
    }

    const typedArray = new Uint8Array(result.data);
    const loadingTask = pdfjsLib.getDocument({ data: typedArray });
    pdfDoc = await loadingTask.promise;
    totalPages = pdfDoc.numPages;
    
    await renderAllPages();
  }

  async function renderAllPages() {
    rendering = true;
    pdfPages = [];

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;

      pdfPages.push({
        pageNum,
        canvas,
        width: viewport.width,
        height: viewport.height
      });
    }

    rendering = false;
  }

  async function zoomIn() {
    if (scale < 3) {
      scale += 0.25;
      await renderAllPages();
    }
  }

  async function zoomOut() {
    if (scale > 0.5) {
      scale -= 0.25;
      await renderAllPages();
    }
  }

  async function resetZoom() {
    scale = 1.5;
    await renderAllPages();
  }

  async function loadWord() {
    const mammoth = await import('mammoth');
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    if (isSSH && sshConnectionId) {
      result = await window.electronAPI.sshSftpReadFileBinary?.(sshConnectionId, filePath);
      if (result?.success) {
        result.data = new Uint8Array(result.data);
      }
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
    }

    if (!result?.success) {
      throw new Error(result?.error || 'Failed to read Word document');
    }

    const arrayBuffer = new Uint8Array(result.data).buffer;
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
    content = html;
    fileType = 'word-html';
  }

  async function loadExcel() {
    const XLSX = await import('xlsx');
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    if (isSSH && sshConnectionId) {
      result = await window.electronAPI.sshSftpReadFileBinary?.(sshConnectionId, filePath);
      if (result?.success) {
        result.data = new Uint8Array(result.data);
      }
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
    }

    if (!result?.success) {
      throw new Error(result?.error || 'Failed to read Excel document');
    }

    const workbook = XLSX.read(new Uint8Array(result.data), { type: 'array' });
    
    let html = '<div class="excel-viewer">';
    
    workbook.SheetNames.forEach((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const htmlTable = XLSX.utils.sheet_to_html(worksheet);
      html += `<div class="sheet">`;
      html += `<h3 class="sheet-name">${sheetName}</h3>`;
      html += htmlTable;
      html += `</div>`;
    });
    
    html += '</div>';
    content = html;
    fileType = 'excel-html';
  }

  async function loadPowerPoint() {
    content = `PowerPoint Document: ${fileName}\n\n`;
    content += `Note: Full PowerPoint rendering requires additional libraries.\n`;
    content += `For now, you can view this file using an external viewer.`;
  }

  async function loadText() {
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    if (isSSH && sshConnectionId) {
      result = await window.electronAPI.sshSftpReadFile?.(sshConnectionId, filePath);
    } else {
      result = await window.electronAPI.readFile(filePath);
    }

    if (result?.error) {
      throw new Error(result.message || 'Failed to read file');
    }

    content = result.content || '';
  }

  $: if (filePath) {
    loadFile();
  }
</script>

<div class="document-viewer">
  <div class="document-toolbar">
    <div class="document-info">
      <span class="file-name">{fileName}</span>
      <span class="file-type">{fileType.toUpperCase()}</span>
      {#if fileType === 'pdf' && totalPages > 0}
        <span class="page-info">{totalPages} {totalPages === 1 ? 'page' : 'pages'}</span>
        <span class="zoom-level">{Math.round(scale * 100)}%</span>
      {/if}
    </div>

    {#if fileType === 'pdf'}
      <div class="pdf-controls">
        <button class="control-button" on:click={zoomOut} disabled={scale <= 0.5 || rendering} title="Zoom out">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="6.5" cy="6.5" r="4.5" stroke-width="1.5"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <button class="control-button" on:click={resetZoom} disabled={rendering} title="Reset zoom">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <rect x="2" y="2" width="12" height="12" stroke-width="1.5" rx="1"/>
            <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="8" font-family="monospace">1:1</text>
          </svg>
        </button>

        <button class="control-button" on:click={zoomIn} disabled={scale >= 3 || rendering} title="Zoom in">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="6.5" cy="6.5" r="4.5" stroke-width="1.5"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <div class="document-content">
    {#if loading || rendering}
      <div class="loading-message">
        <div class="spinner"></div>
        <p>{rendering ? 'Rendering PDF...' : 'Loading document...'}</p>
      </div>
    {:else if error}
      <div class="error-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <line x1="12" y1="8" x2="12" y2="12" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16" r="1" fill="currentColor"/>
        </svg>
        <p>{error}</p>
      </div>
    {:else if fileType === 'pdf' && pdfPages.length > 0}
      <div class="pdf-pages">
        {#each pdfPages as page (page.pageNum)}
          <div class="pdf-page">
            <div class="page-number">Page {page.pageNum} of {totalPages}</div>
            <canvas
              bind:this={page.canvas}
              width={page.width}
              height={page.height}
            />
          </div>
        {/each}
      </div>
    {:else if fileType === 'word-html' || fileType === 'excel-html'}
      <div class="html-content">
        {@html content}
      </div>
    {:else}
      <pre class="text-content">{content}</pre>
    {/if}
  </div>
</div>

<style>
  .document-viewer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .document-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .document-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    font-size: var(--font-size-sm);
  }

  .file-name {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .file-type {
    padding: 2px 8px;
    background-color: var(--color-accent);
    color: white;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-xs);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .page-info,
  .zoom-level {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
  }

  .pdf-controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .control-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    transition: all var(--transition-fast);
    cursor: pointer;
  }

  .control-button:hover:not(:disabled) {
    background-color: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .control-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .control-button svg {
    width: 16px;
    height: 16px;
  }

  .document-content {
    flex: 1;
    overflow: auto;
    padding: var(--spacing-lg);
    background-color: #525659;
  }

  .loading-message,
  .error-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    height: 100%;
    color: var(--color-text-tertiary);
    text-align: center;
  }

  .loading-message svg,
  .error-message svg {
    width: 48px;
    height: 48px;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .error-message {
    color: var(--color-error, #f87171);
  }

  .pdf-pages {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-xl);
    padding: var(--spacing-xl) 0;
  }

  .pdf-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--spacing-sm);
    background: white;
    padding: var(--spacing-md);
    border-radius: var(--radius-md);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .page-number {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    padding: var(--spacing-xs) var(--spacing-sm);
    background-color: var(--color-surface);
    border-radius: var(--radius-sm);
  }

  .pdf-page canvas {
    display: block;
    max-width: 100%;
    height: auto;
  }

  .text-content {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: var(--font-size-sm);
    line-height: 1.6;
    color: var(--color-text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
  }

  .html-content {
    max-width: 900px;
    margin: 0 auto;
    line-height: 1.6;
    color: var(--color-text-primary);
    background: white;
    padding: var(--spacing-xl);
    border-radius: var(--radius-md);
  }

  .html-content :global(table) {
    width: 100%;
    border-collapse: collapse;
    margin: var(--spacing-md) 0;
    background-color: var(--color-surface);
    font-size: var(--font-size-sm);
  }

  .html-content :global(th),
  .html-content :global(td) {
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    text-align: left;
  }

  .html-content :global(th) {
    background-color: var(--color-surface-secondary);
    font-weight: var(--font-weight-medium);
  }

  .html-content :global(tr:hover) {
    background-color: var(--color-surface-hover);
  }

  .html-content :global(.sheet) {
    margin-bottom: var(--spacing-2xl);
  }

  .html-content :global(.sheet-name) {
    margin: var(--spacing-lg) 0 var(--spacing-md);
    padding-bottom: var(--spacing-sm);
    border-bottom: 2px solid var(--color-accent);
    color: var(--color-text-primary);
    font-size: var(--font-size-lg);
  }

  .html-content :global(p) {
    margin: var(--spacing-sm) 0;
    color: #1a1a1a;
  }

  .html-content :global(h1),
  .html-content :global(h2),
  .html-content :global(h3),
  .html-content :global(h4) {
    margin-top: var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
    color: #1a1a1a;
  }

  .html-content :global(ul),
  .html-content :global(ol) {
    margin: var(--spacing-sm) 0;
    padding-left: var(--spacing-xl);
  }
</style>
