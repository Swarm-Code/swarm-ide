<script>
  import { onMount } from 'svelte';

  export let filePath = '';
  export let fileName = '';

  let fileUrl = '';
  let fileType = 'unknown'; // 'image' or 'video'
  let imageLoaded = false;
  let videoLoaded = false;
  let error = null;
  let zoomLevel = 1;
  let fitToScreen = true;

  // Image dimensions
  let naturalWidth = 0;
  let naturalHeight = 0;
  let displayWidth = 0;
  let displayHeight = 0;

  // Pan state
  let isDragging = false;
  let panX = 0;
  let panY = 0;
  let startX = 0;
  let startY = 0;

  const IMAGE_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico', '.apng'
  ]);

  const VIDEO_EXTENSIONS = new Set([
    '.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv', '.m4v'
  ]);

  function detectFileType(path) {
    const ext = path.substring(path.lastIndexOf('.')).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (VIDEO_EXTENSIONS.has(ext)) return 'video';
    return 'unknown';
  }

  function handleImageLoad(event) {
    imageLoaded = true;
    error = null;
    const img = event.target;
    naturalWidth = img.naturalWidth;
    naturalHeight = img.naturalHeight;
    if (fitToScreen) {
      resetView();
    }
  }

  function handleVideoLoad() {
    videoLoaded = true;
    error = null;
  }

  function handleError(event) {
    error = `Failed to load ${fileType}: ${event.target.error || 'Unknown error'}`;
    imageLoaded = false;
    videoLoaded = false;
  }

  function zoomIn() {
    fitToScreen = false;
    zoomLevel = Math.min(zoomLevel * 1.25, 10);
    updateDisplaySize();
  }

  function zoomOut() {
    fitToScreen = false;
    zoomLevel = Math.max(zoomLevel / 1.25, 0.1);
    updateDisplaySize();
  }

  function resetView() {
    fitToScreen = true;
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    updateDisplaySize();
  }

  function actualSize() {
    fitToScreen = false;
    zoomLevel = 1;
    panX = 0;
    panY = 0;
    displayWidth = naturalWidth;
    displayHeight = naturalHeight;
  }

  function updateDisplaySize() {
    if (fitToScreen) {
      // Will be handled by CSS
      displayWidth = 0;
      displayHeight = 0;
    } else {
      displayWidth = naturalWidth * zoomLevel;
      displayHeight = naturalHeight * zoomLevel;
    }
  }

  function handleMouseDown(event) {
    if (fileType !== 'image' || fitToScreen) return;
    isDragging = true;
    startX = event.clientX - panX;
    startY = event.clientY - panY;
    event.preventDefault();
  }

  function handleMouseMove(event) {
    if (!isDragging) return;
    panX = event.clientX - startX;
    panY = event.clientY - startY;
  }

  function handleMouseUp() {
    isDragging = false;
  }

  function handleWheel(event) {
    if (fileType !== 'image') return;
    event.preventDefault();
    fitToScreen = false;

    const delta = event.deltaY > 0 ? 0.9 : 1.1;
    zoomLevel = Math.max(0.1, Math.min(10, zoomLevel * delta));
    updateDisplaySize();
  }

  $: {
    if (filePath) {
      // Convert to file:// URL for Electron
      fileUrl = `file://${filePath}`;
      fileType = detectFileType(filePath);
      imageLoaded = false;
      videoLoaded = false;
      error = null;
      resetView();
    }
  }
</script>

<svelte:window
  on:mousemove={handleMouseMove}
  on:mouseup={handleMouseUp}
/>

<div class="media-viewer">
  <div class="media-toolbar">
    <div class="media-info">
      <span class="file-name">{fileName}</span>
      {#if imageLoaded && naturalWidth > 0}
        <span class="dimensions">{naturalWidth} × {naturalHeight}</span>
        <span class="zoom-level">{Math.round(zoomLevel * 100)}%</span>
      {/if}
    </div>

    {#if fileType === 'image'}
      <div class="media-controls">
        <button
          class="control-button"
          on:click={zoomIn}
          title="Zoom in"
          disabled={zoomLevel >= 10}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="6.5" cy="6.5" r="4.5" stroke-width="1.5"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="6.5" y1="4.5" x2="6.5" y2="8.5" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <button
          class="control-button"
          on:click={zoomOut}
          title="Zoom out"
          disabled={zoomLevel <= 0.1}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <circle cx="6.5" cy="6.5" r="4.5" stroke-width="1.5"/>
            <line x1="9.5" y1="9.5" x2="13" y2="13" stroke-width="1.5" stroke-linecap="round"/>
            <line x1="4.5" y1="6.5" x2="8.5" y2="6.5" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>

        <button
          class="control-button"
          on:click={actualSize}
          title="Actual size"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <rect x="2" y="2" width="12" height="12" stroke-width="1.5" rx="1"/>
            <text x="8" y="11" text-anchor="middle" fill="currentColor" font-size="8" font-family="monospace">1:1</text>
          </svg>
        </button>

        <button
          class="control-button"
          on:click={resetView}
          title="Fit to screen"
          class:active={fitToScreen}
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <rect x="2" y="2" width="12" height="12" stroke-width="1.5" rx="1"/>
            <polyline points="5,8 8,11 11,8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            <polyline points="5,8 8,5 11,8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    {/if}
  </div>

  <div
    class="media-content"
    class:dragging={isDragging}
    on:wheel={handleWheel}
  >
    {#if error}
      <div class="error-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" stroke-width="2"/>
          <line x1="12" y1="8" x2="12" y2="12" stroke-width="2" stroke-linecap="round"/>
          <circle cx="12" cy="16" r="1" fill="currentColor"/>
        </svg>
        <p>{error}</p>
      </div>
    {:else if fileType === 'image'}
      <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
      <img
        src={fileUrl}
        alt={fileName}
        class="media-image"
        class:fit-screen={fitToScreen}
        style:width={displayWidth ? `${displayWidth}px` : 'auto'}
        style:height={displayHeight ? `${displayHeight}px` : 'auto'}
        style:transform={!fitToScreen ? `translate(${panX}px, ${panY}px)` : 'none'}
        style:cursor={fitToScreen ? 'default' : (isDragging ? 'grabbing' : 'grab')}
        on:load={handleImageLoad}
        on:error={handleError}
        on:mousedown={handleMouseDown}
        draggable="false"
      />

      {#if !imageLoaded}
        <div class="loading-message">
          <div class="spinner"></div>
          <p>Loading image...</p>
        </div>
      {/if}
    {:else if fileType === 'video'}
      <!-- svelte-ignore a11y-media-has-caption -->
      <video
        src={fileUrl}
        class="media-video"
        controls
        on:loadedmetadata={handleVideoLoad}
        on:error={handleError}
      >
        Your browser does not support the video tag.
      </video>

      {#if !videoLoaded}
        <div class="loading-message">
          <div class="spinner"></div>
          <p>Loading video...</p>
        </div>
      {/if}
    {:else}
      <div class="unsupported-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
        </svg>
        <p>Unsupported file type</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .media-viewer {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background-color: var(--color-background);
    overflow: hidden;
  }

  .media-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 40px;
    padding: 0 var(--spacing-md);
    background-color: var(--color-surface-secondary);
    border-bottom: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .media-info {
    display: flex;
    align-items: center;
    gap: var(--spacing-md);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .file-name {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
  }

  .dimensions,
  .zoom-level {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: var(--font-size-xs);
  }

  .media-controls {
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

  .control-button.active {
    background-color: var(--color-accent);
    color: white;
  }

  .control-button:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .control-button svg {
    width: 16px;
    height: 16px;
  }

  .media-content {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    background-color: var(--color-background);
    background-image:
      linear-gradient(45deg, var(--color-surface) 25%, transparent 25%),
      linear-gradient(-45deg, var(--color-surface) 25%, transparent 25%),
      linear-gradient(45deg, transparent 75%, var(--color-surface) 75%),
      linear-gradient(-45deg, transparent 75%, var(--color-surface) 75%);
    background-size: 20px 20px;
    background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  }

  .media-content.dragging {
    cursor: grabbing !important;
  }

  .media-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }

  .media-image.fit-screen {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
  }

  .media-video {
    max-width: 90%;
    max-height: 90%;
    outline: none;
  }

  .loading-message,
  .error-message,
  .unsupported-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-md);
    color: var(--color-text-tertiary);
    text-align: center;
    padding: var(--spacing-2xl);
  }

  .loading-message svg,
  .error-message svg,
  .unsupported-message svg {
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
</style>
