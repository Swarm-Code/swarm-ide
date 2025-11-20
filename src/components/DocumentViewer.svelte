<script>
  import { onMount } from 'svelte';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { outputStore } from '../stores/outputStore.js';

  let renderCanvas;
  let drawCanvas;
  
  function logPdfDebug(message, level = 'log') {
    console.log(`[PDF] ${message}`);
    outputStore.addLog(message, level, 'pdf-debug');
  }
  
  onMount(() => {
    renderCanvas = document.getElementById('pdf-render-canvas');
    drawCanvas = document.getElementById('pdf-draw-canvas');
  });

  export let filePath = '';
  export let fileName = '';

  let content = '';
  let fileType = 'unknown';
  let loading = true;
  let error = null;
  let isSSH = false;
  let sshConnectionId = null;
  let pdfPages = [];
  let currentPdfPage = 1;
  let totalPdfPages = 0;
  
  // PDF enhancement features
  let pdfDocument = null;
  let cachedPages = new Map(); // Cache rendered pages
  let activeTool = null; // 'draw', 'annotate', 'ocr', 'text'
  let drawColor = '#FF0000';
  let drawLineWidth = 2;
  let zoom = 100;
  let annotations = [];
  let selectedText = '';
  let ocrProcessing = false;
  let ocrResults = {};
  let viewMode = 'single'; // 'single', 'continuous', 'dual'
  let continuousScroll = false;
  let visiblePages = [1];
  let pageHeights = new Map(); // Cache page heights for continuous mode

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
    logPdfDebug(`📂 Loading PDF: ${filePath}`);
    
    const pdfjsLib = await import('pdfjs-dist');
    const { getDocument } = pdfjsLib;
    
    if (!window.electronAPI) {
      throw new Error('Electron API not available');
    }

    let result;
    let pdfData;
    if (isSSH && sshConnectionId) {
      logPdfDebug(`🔌 Reading PDF via SFTP (connection: ${sshConnectionId})`);
      result = await window.electronAPI.sshSftpReadFileBinary(sshConnectionId, filePath);
      logPdfDebug(`  Response: success=${result?.success}, dataSize=${result?.data?.length || 0} bytes`);
      
      if (!result) {
        throw new Error('No response from SFTP read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read PDF via SFTP');
      }
      
      if (!result.data) {
        throw new Error('No data returned from SFTP read');
      }
      
      pdfData = new Uint8Array(result.data);
      logPdfDebug(`✓ SFTP data received: ${pdfData.byteLength} bytes`);
    } else {
      logPdfDebug(`📁 Reading PDF from local filesystem`);
      result = await window.electronAPI.readFileBinary(filePath);
      logPdfDebug(`  Response: success=${result?.success}, dataSize=${result?.data?.length || 0} bytes`);
      
      if (!result) {
        throw new Error('No response from local file read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read PDF from local filesystem');
      }
      
      if (!result.data) {
        throw new Error('No data returned from file read');
      }
      
      pdfData = new Uint8Array(result.data);
      logPdfDebug(`✓ Local data received: ${pdfData.byteLength} bytes`);
    }

    // Set up PDF.js worker from bundled pdfjs-dist
    const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    logPdfDebug(`⚙️  Setting PDF.js worker: ${workerUrl}`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
    
    // Load PDF document
    logPdfDebug(`🔄 Loading PDF document...`);
    const pdf = await getDocument({ data: pdfData }).promise;
    totalPdfPages = pdf.numPages;
    
    logPdfDebug(`✓ PDF loaded: ${totalPdfPages} pages`);
    
    // Render first page
    logPdfDebug(`📄 Rendering first page...`);
    await renderPDFPage(pdf, 1);
    pdfPages = Array.from({ length: totalPdfPages }, (_, i) => i + 1);
  }
  
  async function renderPDFPageToCanvas(pdf, pageNum, canvas) {
    if (!canvas || pageNum < 1 || pageNum > totalPdfPages) {
      logPdfDebug(`⚠️ Invalid render attempt - canvas: ${!!canvas}, page: ${pageNum}/${totalPdfPages}`, 'warn');
      return null;
    }
    
    try {
      // Check cache first
      if (cachedPages.has(pageNum)) {
        const cachedData = cachedPages.get(pageNum);
        logPdfDebug(`✓ Used cached page ${pageNum} (${cachedData.width}x${cachedData.height})`);
        
        canvas.width = cachedData.width;
        canvas.height = cachedData.height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not get 2d context for cached page');
        
        context.putImageData(cachedData.imageData, 0, 0);
        return cachedData;
      }
      
      logPdfDebug(`→ Rendering page ${pageNum} (zoom: ${zoom}%)`);
      
      const page = await pdf.getPage(pageNum);
      const scale = (zoom / 100) * 1.5;
      const viewport = page.getViewport({ scale });
      
      logPdfDebug(`  Canvas size: ${viewport.width}x${viewport.height} (scale: ${scale})`);
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      pageHeights.set(pageNum, viewport.height);
      
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Could not get canvas 2d context');
      
      logPdfDebug(`  Context obtained, filling background`);
      
      // Fill with white background
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
      logPdfDebug(`  Rendering to canvas...`);
      
      // Render page
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      logPdfDebug(`  ✓ Page rendered successfully`);
      
      // Cache the rendered page
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const cachedData = { width: canvas.width, height: canvas.height, imageData };
      cachedPages.set(pageNum, cachedData);
      
      logPdfDebug(`✓ Cached page ${pageNum}`);
      return cachedData;
    } catch (err) {
      logPdfDebug(`❌ Error rendering page ${pageNum}: ${err.message}`, 'error');
      throw err;
    }
  }

  async function renderPDFPage(pdf, pageNum) {
    if (pageNum < 1 || pageNum > totalPdfPages) return;
    
    try {
      logPdfDebug(`🔄 renderPDFPage called for page ${pageNum}`);
      
      // Small delay to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, 50));
      
      const canvas = document.getElementById('pdf-render-canvas');
      const drawCnv = document.getElementById('pdf-draw-canvas');
      
      if (!canvas) {
        logPdfDebug(`❌ pdf-render-canvas element not found in DOM`, 'error');
        return;
      }
      
      logPdfDebug(`✓ Found canvas element (initial size: ${canvas.width}x${canvas.height})`);
      
      await renderPDFPageToCanvas(pdf, pageNum, canvas);
      
      logPdfDebug(`✓ Canvas rendering complete (final size: ${canvas.width}x${canvas.height})`);
      
      // Match draw canvas size to render canvas
      if (drawCnv) {
        drawCnv.width = canvas.width;
        drawCnv.height = canvas.height;
        logPdfDebug(`✓ Draw canvas resized to ${drawCnv.width}x${drawCnv.height}`);
      } else {
        logPdfDebug(`⚠️ Draw canvas not found`, 'warn');
      }
      
      currentPdfPage = pageNum;
      pdfDocument = pdf;
      fileType = 'pdf-interactive';
      
      logPdfDebug(`✓ Page ${pageNum} ready (type: ${fileType})`);
    } catch (err) {
      logPdfDebug(`❌ Error rendering PDF page ${pageNum}: ${err.message}`, 'error');
      throw err;
    }
  }

  async function renderContinuousPages(pdf, startPage, endPage) {
    try {
      const container = document.getElementById('continuous-scroll-container');
      if (!container) return;
      
      container.innerHTML = '';
      visiblePages = [];
      
      for (let pageNum = startPage; pageNum <= Math.min(endPage, totalPdfPages); pageNum++) {
        const canvas = document.createElement('canvas');
        canvas.style.width = '100%';
        canvas.style.maxWidth = '100%';
        canvas.style.display = 'block';
        canvas.style.marginBottom = '20px';
        canvas.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.15)';
        
        await renderPDFPageToCanvas(pdf, pageNum, canvas);
        container.appendChild(canvas);
        visiblePages.push(pageNum);
      }
    } catch (err) {
      console.error('[DocumentViewer] Error rendering continuous pages:', err);
    }
  }

  async function performOCR() {
    if (!content || ocrProcessing) return;
    
    ocrProcessing = true;
    try {
      const Tesseract = await import('tesseract.js');
      const { createWorker } = Tesseract;
      
      const worker = await createWorker();
      const img = new Image();
      img.src = content;
      
      await new Promise(resolve => {
        img.onload = resolve;
      });
      
      const result = await worker.recognize(img);
      ocrResults[currentPdfPage] = result.data.text;
      
      await worker.terminate();
      console.log('[DocumentViewer] OCR completed for page', currentPdfPage);
    } catch (err) {
      console.error('[DocumentViewer] OCR error:', err);
      error = 'OCR failed: ' + err.message;
    } finally {
      ocrProcessing = false;
    }
  }

  function toggleTool(tool) {
    activeTool = activeTool === tool ? null : tool;
  }

  function addAnnotation(text) {
    annotations.push({
      page: currentPdfPage,
      text: text,
      timestamp: new Date().toISOString()
    });
  }

  function deleteAnnotation(index) {
    annotations.splice(index, 1);
    annotations = annotations;
  }

  function handleZoom(direction) {
    if (direction === 'in' && zoom < 200) zoom += 20;
    if (direction === 'out' && zoom > 50) zoom -= 20;
  }

  function handleDrawMouseDown(e) {
    if (activeTool !== 'draw') return;
    
    const canvas = document.getElementById('pdf-draw-canvas');
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');
    
    ctx.strokeStyle = drawColor;
    ctx.lineWidth = drawLineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    const startX = e.clientX - rect.left;
    const startY = e.clientY - rect.top;
    
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    
    const handleMouseMove = (moveEvent) => {
      const x = moveEvent.clientX - rect.left;
      const y = moveEvent.clientY - rect.top;
      ctx.lineTo(x, y);
      ctx.stroke();
    };
    
    const handleMouseUp = () => {
      ctx.closePath();
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }
  
  async function nextPDFPage() {
    if (currentPdfPage < totalPdfPages) {
      const pdfjsLib = await import('pdfjs-dist');
      const { getDocument } = pdfjsLib;
      const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      
      let pdfData;
      if (isSSH && sshConnectionId) {
        const result = await window.electronAPI.sshSftpReadFileBinary(sshConnectionId, filePath);
        pdfData = new Uint8Array(result.data);
      } else {
        const result = await window.electronAPI.readFileBinary(filePath);
        pdfData = new Uint8Array(result.data);
      }
      
      const pdf = await getDocument({ data: pdfData }).promise;
      await renderPDFPage(pdf, currentPdfPage + 1);
    }
  }
  
  async function prevPDFPage() {
    if (currentPdfPage > 1) {
      const pdfjsLib = await import('pdfjs-dist');
      const { getDocument } = pdfjsLib;
      const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
      
      let pdfData;
      if (isSSH && sshConnectionId) {
        const result = await window.electronAPI.sshSftpReadFileBinary(sshConnectionId, filePath);
        pdfData = new Uint8Array(result.data);
      } else {
        const result = await window.electronAPI.readFileBinary(filePath);
        pdfData = new Uint8Array(result.data);
      }
      
      const pdf = await getDocument({ data: pdfData }).promise;
      await renderPDFPage(pdf, currentPdfPage - 1);
    }
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
      console.log('[DocumentViewer] SFTP result:', { success: result?.success, hasData: !!result?.data, error: result?.error });
      
      if (!result) {
        throw new Error('No response from SFTP read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read Word document via SFTP');
      }
      
      if (!result.data) {
        throw new Error('No data returned from SFTP read');
      }
      
      result.data = new Uint8Array(result.data);
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
      console.log('[DocumentViewer] Local result:', { success: result?.success, hasData: !!result?.data, error: result?.error });
      
      if (!result) {
        throw new Error('No response from local file read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read Word document');
      }
      
      if (!result.data) {
        throw new Error('No data returned from file read');
      }
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
      console.log('[DocumentViewer] SFTP result:', { success: result?.success, hasData: !!result?.data, error: result?.error });
      
      if (!result) {
        throw new Error('No response from SFTP read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read Excel document via SFTP');
      }
      
      if (!result.data) {
        throw new Error('No data returned from SFTP read');
      }
      
      result.data = new Uint8Array(result.data);
    } else {
      result = await window.electronAPI.readFileBinary(filePath);
      console.log('[DocumentViewer] Local result:', { success: result?.success, hasData: !!result?.data, error: result?.error });
      
      if (!result) {
        throw new Error('No response from local file read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read Excel document');
      }
      
      if (!result.data) {
        throw new Error('No data returned from file read');
      }
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
      console.log('[DocumentViewer] SFTP text result:', { success: result?.success, hasContent: !!result?.content, error: result?.error });
      
      if (!result) {
        throw new Error('No response from SFTP read');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to read file via SFTP');
      }
      
      content = result.content || '';
    } else {
      result = await window.electronAPI.readFile(filePath);
      console.log('[DocumentViewer] Local text result:', { hasError: !!result?.error, hasContent: !!result?.content, message: result?.message });
      
      if (!result) {
        throw new Error('No response from local file read');
      }
      
      if (result.error) {
        throw new Error(result.message || 'Failed to read file');
      }
      
      content = result.content || '';
    }
  }

  $: if (filePath) {
    loadFile();
  }

  // Handle view mode changes
  $: if (viewMode && pdfDocument && fileType === 'pdf-interactive') {
    if (viewMode === 'continuous') {
      renderContinuousPages(pdfDocument, 1, totalPdfPages);
    } else if (viewMode === 'single' || viewMode === 'dual') {
      renderPDFPage(pdfDocument, currentPdfPage);
    }
  }

  // Handle zoom changes - invalidate cache
  $: if (zoom && pdfDocument && fileType === 'pdf-interactive') {
    cachedPages.clear();
    if (viewMode === 'single' || viewMode === 'dual') {
      renderPDFPage(pdfDocument, currentPdfPage);
    } else if (viewMode === 'continuous') {
      renderContinuousPages(pdfDocument, 1, totalPdfPages);
    }
  }
</script>

<div class="document-viewer">
  <div class="document-toolbar">
    <div class="toolbar-left">
      <span class="file-name">{fileName}</span>
      <span class="file-type">{fileType.toUpperCase()}</span>
    </div>
    
    {#if fileType === 'pdf-canvas' || fileType === 'pdf-interactive'}
      <div class="toolbar-right">
        <div class="tool-group">
          <button title="Single Page" class:active={viewMode === 'single'} on:click={() => viewMode = 'single'}>▭</button>
          <button title="Continuous Scroll" class:active={viewMode === 'continuous'} on:click={() => viewMode = 'continuous'}>≡</button>
          <button title="Dual Page" class:active={viewMode === 'dual'} on:click={() => viewMode = 'dual'}>▬</button>
        </div>
        
        <div class="tool-group">
          <button title="Extract Text (OCR)" class:active={activeTool === 'ocr'} on:click={() => toggleTool('ocr')} disabled={ocrProcessing}>
            {#if ocrProcessing}
              <span class="spinner-mini"></span>
            {:else}
              ⊕
            {/if}
          </button>
          <button title="Add Note" class:active={activeTool === 'annotate'} on:click={() => toggleTool('annotate')}>✎</button>
          <button title="Draw Markup" class:active={activeTool === 'draw'} on:click={() => toggleTool('draw')}>▀</button>
        </div>
        
        {#if activeTool === 'draw'}
          <div class="tool-options">
            <label>Color:</label>
            <input type="color" bind:value={drawColor} title="Draw color" />
            <label>Width:</label>
            <input type="range" min="1" max="10" bind:value={drawLineWidth} title="Line width" class="line-width-slider" />
          </div>
        {/if}
        
        <div class="tool-group">
          <button on:click={() => handleZoom('out')} title="Zoom Out">−</button>
          <span class="zoom-display">{zoom}%</span>
          <button on:click={() => handleZoom('in')} title="Zoom In">+</button>
        </div>
      </div>
    {/if}
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
    {:else if fileType === 'pdf-canvas' || fileType === 'pdf-interactive'}
      <div class="pdf-viewer">
        {#if viewMode === 'single' || viewMode === 'dual'}
          <div class="pdf-canvas-wrapper" style="--pdf-zoom: {zoom}%;">
            <div class="pdf-canvas-container">
              <canvas id="pdf-render-canvas" class="pdf-canvas"></canvas>
              <canvas id="pdf-draw-canvas" class="pdf-draw-canvas" class:drawing-mode={activeTool === 'draw'} on:mousedown={handleDrawMouseDown}></canvas>
              {#if activeTool === 'annotate' && annotations.length > 0}
                <div class="annotations-overlay">
                  {#each annotations.filter(a => a.page === currentPdfPage) as ann, idx}
                    <div class="annotation-sticky">
                      <span class="annotation-text">{ann.text}</span>
                      <button class="annotation-close" on:click={() => deleteAnnotation(annotations.indexOf(ann))}>×</button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {:else if viewMode === 'continuous'}
          <div class="pdf-canvas-wrapper continuous-scroll">
            <div id="continuous-scroll-container" class="continuous-scroll-container"></div>
          </div>
        {/if}
        
        <div class="pdf-footer">
          {#if viewMode === 'single' || viewMode === 'dual'}
            <button on:click={prevPDFPage} disabled={currentPdfPage <= 1} class="nav-btn">‹</button>
            <span class="pdf-page-info">{currentPdfPage} / {totalPdfPages}</span>
            <button on:click={nextPDFPage} disabled={currentPdfPage >= totalPdfPages} class="nav-btn">›</button>
          {:else if viewMode === 'continuous'}
            <span class="pdf-page-info">Pages: {visiblePages.join(', ')}</span>
          {/if}
          
          {#if activeTool === 'ocr' && ocrResults[currentPdfPage]}
            <div class="ocr-results">
              <p class="ocr-text">{ocrResults[currentPdfPage]}</p>
            </div>
          {/if}
          
          {#if activeTool === 'annotate'}
            <input type="text" placeholder="Add annotation..." on:keydown={(e) => e.key === 'Enter' && (addAnnotation(e.target.value), e.target.value = '')} class="annotation-input" />
          {/if}
        </div>
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
    height: 36px;
    padding: 0 var(--spacing-sm) 0 var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
    gap: var(--spacing-md);
  }

  .toolbar-left {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    min-width: 0;
  }

  .toolbar-right {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    flex-shrink: 0;
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

  .pdf-viewer {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .pdf-canvas-wrapper {
    flex: 1;
    overflow: auto;
    background-color: var(--color-background);
  }

  .pdf-canvas-wrapper.continuous-scroll {
    padding: var(--spacing-lg);
  }

  .continuous-scroll-container {
    max-width: 100%;
    margin: 0 auto;
  }

  .pdf-canvas-container {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100%;
    padding: var(--spacing-lg);
    background-color: var(--color-background);
    position: relative;
  }

  #pdf-render-canvas,
  #pdf-draw-canvas {
    display: block;
  }

  #pdf-render-canvas {
    max-width: 100%;
    max-height: 100%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: block;
    background-color: white;
  }

  .pdf-canvas {
    max-width: 100%;
    max-height: 100%;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    display: block;
  }

  .pdf-draw-canvas {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    cursor: crosshair;
    display: none;
  }

  .pdf-draw-canvas.drawing-mode {
    display: block;
  }

  .pdf-canvas-container {
    position: relative;
    display: inline-block;
  }

  .tool-group {
    display: flex;
    gap: 2px;
  }

  .tool-group button,
  .toolbar-right button {
    padding: 4px 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
  }

  .tool-group button:hover:not(:disabled),
  .toolbar-right button:hover:not(:disabled) {
    background-color: var(--color-surface-secondary);
    border-color: var(--color-accent);
  }

  .tool-group button.active {
    background-color: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .tool-group button:disabled,
  .toolbar-right button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tool-options {
    display: flex;
    gap: 6px;
    align-items: center;
    padding: 0 var(--spacing-sm);
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
  }

  .tool-options label {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .tool-options input[type="color"] {
    width: 24px;
    height: 24px;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    cursor: pointer;
  }

  .line-width-slider {
    width: 60px;
    height: 4px;
    cursor: pointer;
  }

  .zoom-display {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    min-width: 35px;
    text-align: center;
  }

  .spinner-mini {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-accent);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  .pdf-footer {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm) var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-top: 1px solid var(--color-border);
    flex-shrink: 0;
    min-height: 36px;
  }

  .nav-btn {
    padding: 4px 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .nav-btn:hover:not(:disabled) {
    background-color: var(--color-surface-secondary);
    border-color: var(--color-accent);
  }

  .nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pdf-page-info {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    font-weight: var(--font-weight-medium);
    min-width: 50px;
    text-align: center;
  }

  .annotation-input {
    flex: 1;
    max-width: 300px;
    padding: 4px 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
    color: var(--color-text-primary);
    font-size: var(--font-size-xs);
  }

  .annotation-input:focus {
    outline: none;
    border-color: var(--color-accent);
    box-shadow: 0 0 0 2px rgba(var(--color-accent-rgb), 0.1);
  }

  .annotations-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    pointer-events: none;
  }

  .annotation-sticky {
    position: absolute;
    background-color: #FFEB3B;
    border: 1px solid #FBC02D;
    border-radius: 3px;
    padding: 4px 6px;
    font-size: 11px;
    max-width: 100px;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    pointer-events: auto;
  }

  .annotation-text {
    display: block;
    margin-right: 16px;
    word-wrap: break-word;
  }

  .annotation-close {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    padding: 0;
    background-color: #f44336;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 12px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .annotation-close:hover {
    background-color: #d32f2f;
  }

  .ocr-results {
    flex: 1;
    max-width: 400px;
    max-height: 100px;
    overflow-y: auto;
    padding: 6px 8px;
    background-color: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 4px;
  }

  .ocr-text {
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    line-height: 1.4;
  }
</style>
