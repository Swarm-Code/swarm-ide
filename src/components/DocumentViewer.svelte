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
    
    // Handle files without extensions or special names
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
      // Check if current workspace is SSH
      let activeWorkspace = null;
      const unsubscribe = workspaceStore.subscribe(state => {
        activeWorkspace = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      });
      unsubscribe();

      isSSH = activeWorkspace?.isSSH || false;
      sshConnectionId = activeWorkspace?.sshConnection?.id || null;

      console.log('[DocumentViewer] Loading file:', {
        path: filePath,
        isSSH,
        connectionId: sshConnectionId
      });

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
    const { PDFDocument } = await import('pdf-lib');
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    if (isSSH && sshConnectionId) {
      console.log('[DocumentViewer] Reading PDF via SFTP');
      result = await window.electronAPI.sshSftpReadFileBinary(sshConnectionId, filePath);
      if (result.success) {
        // Convert array back to Uint8Array
        result.data = new Uint8Array(result.data);
      }
    } else {
      console.log('[DocumentViewer] Reading PDF from local filesystem');
      result = await window.electronAPI.readFileBinary(filePath);
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to read PDF');
    }

    const pdfDoc = await PDFDocument.load(result.data);
    const numPages = pdfDoc.getPageCount();
    
    let text = `PDF Document: ${fileName}\n`;
    text += `Pages: ${numPages}\n\n`;
    text += `Note: Full PDF rendering will be added in future updates.\n`;
    text += `For now, you can view this file using an external PDF viewer.`;
    
    content = text;
  }

  async function loadWord() {
    const mammoth = await import('mammoth');
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    if (isSSH && sshConnectionId) {
      console.log('[DocumentViewer] Reading Word doc via SFTP');
      result = await window.electronAPI.sshSftpReadFileBinary(sshConnectionId, filePath);
      if (result.success) {
        result.data = new Uint8Array(result.data);
      }
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to read Word document');
    }

    const { value: html } = await mammoth.convertToHtml({ arrayBuffer: result.data });
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
      console.log('[DocumentViewer] Reading Excel via SFTP');
      result = await window.electronAPI.sshSftpReadFileBinary(sshConnectionId, filePath);
      if (result.success) {
        result.data = new Uint8Array(result.data);
      }
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
    }

    if (!result.success) {
      throw new Error(result.error || 'Failed to read Excel document');
    }

    const workbook = XLSX.read(result.data, { type: 'array' });
    
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
    // PowerPoint parsing is more complex and would require additional libraries
    // For now, show basic info
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
      console.log('[DocumentViewer] Reading text file via SFTP');
      result = await window.electronAPI.sshSftpReadFile(sshConnectionId, filePath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to read file');
      }
      content = result.content || '';
    } else {
      result = await window.electronAPI.readFile(filePath);
      if (result.error) {
        throw new Error(result.message || 'Failed to read file');
      }
      content = result.content || '';
    }
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
    </div>
  </div>

  <div class="document-content">
    {#if loading}
      <div class="loading-message">
        <div class="spinner"></div>
        <p>Loading document...</p>
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

  .document-content {
    flex: 1;
    overflow: auto;
    padding: var(--spacing-lg);
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
  }

  .html-content :global(h1),
  .html-content :global(h2),
  .html-content :global(h3),
  .html-content :global(h4) {
    margin-top: var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
    color: var(--color-text-primary);
  }

  .html-content :global(ul),
  .html-content :global(ol) {
    margin: var(--spacing-sm) 0;
    padding-left: var(--spacing-xl);
  }
</style>
