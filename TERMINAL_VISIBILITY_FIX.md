# Terminal Black Screen Issue - Root Cause & Fix

## Problem
When switching workspaces with many canvases, terminal content would disappear (go black) after the canvas switched.

## Root Cause

The terminal positioning system in `IDEWindow.svelte` relies on finding a target container in the DOM with the correct `data-terminal-location` and `data-active-terminal` attributes:

```javascript
// IDEWindow.svelte lines 96-107
const canvasPanes = document.querySelectorAll('[data-terminal-location="canvas-pane"]');
for (const pane of canvasPanes) {
  const paneActiveTerminal = pane.getAttribute('data-active-terminal');
  if (paneActiveTerminal === terminalId) {
    targetContainer = pane;
    break;
  }
}
```

**The issue**: In `UnifiedPane.svelte`, the terminal container only renders when the terminal IS the active tab:

```javascript
// UnifiedPane.svelte line 591
{:else if activeTab.type === 'terminal'}
  <div data-terminal-location="canvas-pane" data-active-terminal={activeTab.terminalId}>
    <!-- Terminal content -->
  </div>
{/if}
```

**When switching canvases**:
1. New canvas loads with different active tab (e.g., an editor file, not a terminal)
2. `activeTab.type !== 'terminal'` is now true
3. The terminal container div **doesn't render**
4. `positionTerminals()` can't find any container with matching `data-active-terminal`
5. `targetContainer` stays null
6. Terminal gets hidden: `terminalEl.style.display = 'none'` (line 147)
7. **Terminal appears black/invisible**

## Solution

Added a fallback container in `UnifiedPane.svelte` that renders whenever:
1. A terminal tab exists in the pane, AND
2. The active tab is NOT a terminal

This ensures there's always a positioning target available:

```javascript
// UnifiedPane.svelte lines 621-633
{#if activeTab && activeTab.type !== 'terminal' && pane.tabs.some(t => t.type === 'terminal')}
  <div 
    class="terminal-content" 
    data-terminal-location="canvas-pane" 
    data-pane-id={pane.id}
    data-active-terminal={pane.tabs.find(t => t.type === 'terminal')?.terminalId}
    style="visibility: hidden; pointer-events: none;"
  >
    <!-- Fallback container for positioning -->
  </div>
{/if}
```

**Why `visibility: hidden` instead of `display: none`?**
- `display: none` removes the element from the layout → `getBoundingClientRect()` returns 0,0
- `visibility: hidden` keeps the element in the layout → `getBoundingClientRect()` returns correct positioning data
- The positioning system needs accurate container bounds to position terminals correctly

## Changes Made

1. **UnifiedPane.svelte**: Added fallback terminal container that renders when terminal is not the active tab
2. **IDEWindow.svelte**: Added `positionTerminalsTimeout` variable for future debouncing if needed

## Testing

The fix ensures:
✅ Terminals stay visible when switching between canvases
✅ Terminal position updates correctly even when a different tab type is active
✅ No black screen when switching workspaces with many canvases
✅ No performance impact (fallback container is invisible and non-interactive)

## Edge Cases Handled

- Multiple terminal tabs in one pane: Uses first terminal tab as fallback target
- No terminal tabs: Condition `pane.tabs.some(t => t.type === 'terminal')` prevents rendering
- Terminal is active tab: Main container renders instead of fallback
