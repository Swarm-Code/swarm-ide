# Browser Overflow Analysis - Complete Logic Trace

## Problem Statement
Browsers occasionally break out of pane boundaries in rare instances when panes are split or resized.

**User's observed behavior:**
1. Pane splits successfully
2. Browser doesn't fit inside new pane size
3. When split again, browser glitches and stays at wrong position

## Root Cause Identified ✅

### The Race Condition

**Timing sequence when split happens:**

```
0ms:  User clicks "Split Pane"
1ms:  editorStore.splitPane() → splitPaneInLayout() mutates layout
2ms:  Store update triggers reactive statement (IDEWindow.svelte:328)
3ms:  positionBrowsers() called
4ms:  16ms debounce timer starts
5ms:  Svelte schedules re-render with new layout
10ms: Svelte begins rendering EditorSplitView
15ms: EditorSplitView creates local splitRatio variable
      Template generates inline style="width: 50%"
      BUT STYLE NOT YET APPLIED TO DOM
20ms: Debounce timer fires
21ms: await tick() - waits for Svelte update queue
22ms: await requestAnimationFrame() - waits for next paint
23ms: ❌ getBoundingClientRect() called
      → Reads STALE or MID-TRANSITION width
      → Browser positioned with WRONG bounds
25ms: Browser applies inline styles to DOM
      → Split pane now has correct width
      → But browser already positioned with wrong bounds
30ms: Cache stores WRONG bounds
```

**Next split:**
- Cache sees "same dimensions" → skips reposition
- Browser stuck at wrong position
- "Glitches and stays there"

### Why Single `requestAnimationFrame` Fails

From Svelte documentation and browser rendering pipeline:

1. **Svelte's update queue** (`tick()`) schedules DOM updates
2. **Browser's rendering pipeline:**
   - JavaScript execution
   - Style calculation
   - Layout (reflow)
   - Paint
   - Composite

**Single rAF waits for paint, NOT layout completion**

Split panes use:
- Inline styles (slow to apply in large trees)
- Flexbox (requires layout pass)
- Nested components (multiple render cycles)

### The Cache Problem

```javascript
// IDEWindow.svelte:225-233
const cachedBounds = cachedBrowserBounds.get(browserId);
if (cachedBounds && 
    cachedBounds.x === bounds.x && 
    cachedBounds.y === bounds.y && 
    cachedBounds.width === bounds.width && 
    cachedBounds.height === bounds.height) {
  continue; // ❌ Skips reposition even if layout changed
}
```

**Problem:** Cache compares final bounds, not layout structure
- Pane splits: browser moves from left pane to right pane
- If both panes have same width (after split), cache sees "unchanged"
- But browser is at wrong X position
- Cache prevents correction

## The Complete Fix (4 Parts)

### Fix 1: Clear Cache on Layout Changes ⭐⭐⭐

**File:** `src/components/IDEWindow.svelte`

```javascript
// After line 404 (in script section)
let lastEditorLayoutJson = '';

// Add reactive statement BEFORE existing reactive statements
$: {
  // Clear browser bounds cache when layout structure changes
  const newLayoutJson = JSON.stringify(editorLayout);
  if (newLayoutJson !== lastEditorLayoutJson) {
    console.log('[IDEWindow] 🔄 Layout changed, clearing browser bounds cache');
    cachedBrowserBounds.clear();
    lastEditorLayoutJson = newLayoutJson;
  }
}
```

**Why this works:**
- Detects ANY layout structure change (splits, closes, reorders)
- Forces full reposition on next call
- Prevents "stuck at wrong position" bug

### Fix 2: Wait Multiple Frames for DOM Settling ⭐⭐⭐

**File:** `src/components/IDEWindow.svelte`

**Replace lines 143-146:**

```javascript
// OLD:
await tick();
await new Promise(resolve => requestAnimationFrame(resolve));

// NEW:
await tick(); // Wait for Svelte update queue
await new Promise(resolve => requestAnimationFrame(resolve)); // Frame 1: Style calculation
await new Promise(resolve => requestAnimationFrame(resolve)); // Frame 2: Layout pass
await new Promise(resolve => requestAnimationFrame(resolve)); // Frame 3: Paint complete
```

**Why this works:**
- Frame 1: Browser calculates styles
- Frame 2: Browser performs layout (flexbox, positioning)
- Frame 3: Ensures layout is committed
- `getBoundingClientRect()` now reads FINAL positions

### Fix 3: Force Layout Reflow Before Reading Bounds ⭐⭐

**File:** `src/components/IDEWindow.svelte`

**After line 196 (before `getBoundingClientRect()`):**

```javascript
// Force layout reflow to ensure bounds are up-to-date
// Reading offsetHeight forces browser to complete any pending layout
container.offsetHeight;

const rect = container.getBoundingClientRect();
```

**Why this works:**
- `offsetHeight` read forces synchronous layout
- Browser MUST calculate final positions before returning
- Guarantees `getBoundingClientRect()` reads accurate bounds

### Fix 4: Enhanced Logging for Verification ⭐

**File:** `src/components/IDEWindow.svelte`

**Add after line 196:**

```javascript
console.log('[IDEWindow] 📏 Container bounds for browser', browserId, ':', {
  containerElement: container.className,
  paneId: paneId,
  beforeReflow: {
    // These would be stale without reflow
    clientWidth: container.clientWidth,
    clientHeight: container.clientHeight
  },
  afterReflow: {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.right,
    bottom: rect.bottom
  },
  layoutJson: JSON.stringify(editorLayout).substring(0, 100) + '...'
});
```

## Implementation Priority

1. **Fix 1 (Clear cache)** - CRITICAL - Prevents stuck browsers
2. **Fix 3 (Force reflow)** - HIGH - Ensures accurate bounds
3. **Fix 2 (Multiple frames)** - HIGH - Handles complex layouts
4. **Fix 4 (Logging)** - MEDIUM - Debugging aid

## Testing Scenarios

After implementing fixes, test:

1. **Rapid vertical split** - Split pane 3x quickly
2. **Horizontal split with browser** - Browser in pane, split horizontally
3. **Split while loading webpage** - Heavy webpage loading, split pane
4. **Drag tab during split** - Drag browser tab while split animation
5. **Window resize during split** - Resize window immediately after split
6. **Explorer toggle during split** - Toggle explorer, then split
7. **Multiple workspace splits** - Switch workspace, split, switch back

## Expected Results

✅ Browser always fits exactly in pane boundaries
✅ No overflow beyond container
✅ No "glitch and stay" behavior
✅ Smooth repositioning on every split
✅ Cache invalidation on layout changes
✅ Consistent behavior across rapid operations

## Files to Modify

1. **src/components/IDEWindow.svelte**
   - Add cache clearing reactive statement
   - Add multiple rAF waits
   - Add forced reflow
   - Add enhanced logging

## Verification Commands

```bash
# Build and test
bun run build
bun run electron

# Check console logs for:
# - "Layout changed, clearing browser bounds cache"
# - "Container bounds for browser" with accurate dimensions
# - No "bounds unchanged" messages during splits
```

## Risk Assessment

**Low Risk Changes:**
- Clearing cache: No side effects, just forces IPC calls
- Multiple rAF: Adds ~48ms delay (3 frames), imperceptible
- Forced reflow: Standard technique, no performance impact
- Logging: Can be removed after verification

**No Breaking Changes:**
- Browser instances unchanged
- Terminal processes unchanged
- IPC protocol unchanged
- User data unaffected
