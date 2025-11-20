import { outputStore } from '../stores/outputStore.js';

/**
 * Browser-specific logger that logs to both console and output panel
 * All browser logs appear with "browser" source for easy filtering
 */
class BrowserLogger {
  constructor() {
    this.platform = typeof process !== 'undefined' ? process.platform : navigator.platform;
  }

  /**
   * Log browser bounds information
   * @param {string} action - What action is being logged (e.g., "POSITION", "CLAMP", "SET")
   * @param {string} browserId - The browser ID
   * @param {object} data - Additional data to log
   */
  logBounds(action, browserId, data) {
    const message = `[${action}] ${browserId}: ${JSON.stringify(data)}`;
    
    console.log(`[🌐 BROWSER ${action}]`, browserId, data);
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log container and bounds calculation details
   */
  logContainerCalculation(browserId, containerInfo, boundsCalculation) {
    const message = `CONTAINER: w=${containerInfo.width}px h=${containerInfo.height}px | BOUNDS: x=${boundsCalculation.x} y=${boundsCalculation.y} w=${boundsCalculation.width} h=${boundsCalculation.height}`;
    
    console.log('[🌐 BROWSER CONTAINER]', {
      browserId,
      container: containerInfo,
      bounds: boundsCalculation
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log when bounds are clamped
   */
  logClamping(browserId, original, clamped, windowBounds) {
    const message = `CLAMPED: ${JSON.stringify(original)} → ${JSON.stringify(clamped)} (window: ${windowBounds.width}x${windowBounds.height})`;
    
    console.log('[🌐 BROWSER CLAMPING]', {
      browserId,
      original,
      clamped,
      windowBounds,
      wasChanged: !(original.x === clamped.x && original.y === clamped.y && 
                    original.width === clamped.width && original.height === clamped.height)
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log final bounds being set via Electron
   */
  logSetBounds(browserId, bounds, windowSize) {
    const message = `SET_BOUNDS: x=${bounds.x} y=${bounds.y} w=${bounds.width} h=${bounds.height} (window: ${windowSize.width}x${windowSize.height})`;
    
    console.log('[🌐 BROWSER SET_BOUNDS]', {
      browserId,
      bounds,
      windowSize,
      fits: {
        x: bounds.x >= 0,
        y: bounds.y >= 0,
        right: bounds.x + bounds.width <= windowSize.width,
        bottom: bounds.y + bounds.height <= windowSize.height
      }
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log window and view dimensions
   */
  logDimensions(label, width, height, dpr = 1) {
    const message = `${label}: ${width}x${height}px (DPR: ${dpr.toFixed(4)})`;
    
    console.log(`[🌐 BROWSER ${label}]`, {
      width,
      height,
      devicePixelRatio: dpr
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log DPR-adjusted bounds calculation
   */
  logDPRCalculation(browserId, originalWindow, dpr, adjustedWindow, originalBounds, adjustedBounds) {
    const message = `DPR_CALC: ${browserId} | DPR: ${dpr.toFixed(4)} | Window: ${originalWindow.width}x${originalWindow.height} → ${adjustedWindow.width}x${adjustedWindow.height} | Bounds: ${originalBounds.width}x${originalBounds.height} → ${adjustedBounds.width}x${adjustedBounds.height}`;
    
    console.log('[🌐 BROWSER DPR_CALC]', {
      browserId,
      devicePixelRatio: dpr,
      originalWindow,
      adjustedWindow,
      originalBounds,
      adjustedBounds,
      wasAdjusted: originalBounds.width !== adjustedBounds.width || originalBounds.height !== adjustedBounds.height
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log errors
   */
  logError(browserId, error) {
    const message = `ERROR: ${error.message || error}`;
    
    console.error('[🌐 BROWSER ERROR]', browserId, error);
    outputStore.addLog(message, 'error', 'browser');
  }

  /**
   * Log warnings
   */
  logWarning(browserId, warning) {
    const message = `WARNING: ${warning}`;
    
    console.warn('[🌐 BROWSER WARNING]', browserId, warning);
    outputStore.addLog(message, 'warn', 'browser');
  }

  /**
   * Log lifecycle events
   */
  logEvent(event, browserId, details = {}) {
    const message = `${event}: ${browserId} ${Object.keys(details).length > 0 ? JSON.stringify(details) : ''}`.trim();
    
    console.log(`[🌐 BROWSER ${event}]`, browserId, details);
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log tab/pane rendering details
   */
  logTabRender(browserId, tabInfo, paneInfo) {
    const message = `TAB_RENDER: ${browserId} | Tab: ${tabInfo.id} (${tabInfo.name}) | Pane: ${paneInfo.id} (active: ${paneInfo.isActive})`;
    
    console.log('[🌐 BROWSER TAB_RENDER]', {
      browserId,
      tab: tabInfo,
      pane: paneInfo,
      timestamp: new Date().toISOString()
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log pane/container dimensions
   */
  logPaneDimensions(paneId, browserId, dimensions) {
    const message = `PANE_DIMS: Pane ${paneId} -> Browser ${browserId}: ${dimensions.width}x${dimensions.height}px (x: ${dimensions.left}, y: ${dimensions.top})`;
    
    console.log('[🌐 BROWSER PANE_DIMS]', {
      paneId,
      browserId,
      dimensions,
      timestamp: new Date().toISOString()
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log tab selection and focus
   */
  logTabSelection(browserId, paneId, isActive, isVisible) {
    const message = `TAB_SELECT: ${browserId} in Pane ${paneId} | Active: ${isActive} | Visible: ${isVisible}`;
    
    console.log('[🌐 BROWSER TAB_SELECT]', {
      browserId,
      paneId,
      isActive,
      isVisible
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log content div rendering
   */
  logContentDiv(browserId, paneId, contentDivInfo) {
    const message = `CONTENT_DIV: ${browserId} | Pane ${paneId} | Visible: ${contentDivInfo.isVisible} | Size: ${contentDivInfo.width}x${contentDivInfo.height}px`;
    
    console.log('[🌐 BROWSER CONTENT_DIV]', {
      browserId,
      paneId,
      contentDiv: contentDivInfo,
      timestamp: new Date().toISOString()
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }

  /**
   * Log browser visibility state
   */
  logVisibility(browserId, isVisible, reason) {
    const message = `VISIBILITY: ${browserId} -> ${isVisible ? 'VISIBLE' : 'HIDDEN'} (${reason})`;
    
    console.log('[🌐 BROWSER VISIBILITY]', {
      browserId,
      isVisible,
      reason,
      timestamp: new Date().toISOString()
    });
    
    outputStore.addLog(message, 'log', 'browser');
  }
}

export const browserLogger = new BrowserLogger();
