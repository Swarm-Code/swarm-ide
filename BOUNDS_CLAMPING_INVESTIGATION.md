# WebContentsView Bounds Clamping Investigation

## Investigation Summary

### Files Analyzed
1. `main.mjs` - Electron main process
2. `src/components/IDEWindow.svelte` - Browser positioning logic
3. `src/components/UnifiedPane.svelte` - CSS layout constraints

### Key Findings

#### 1. IDEWindow.svelte (Lines 143-196)
**Current Implementation:**
```javascript
const rect = container.getBoundingClientRect();

const bounds = {
  x: Math.round(rect.left),
  y: Math.round(rect.top),
  width: Math.round(rect.width),      // ❌ NO CLAMPING
  height: Math.round(rect.height)     // ❌ NO CLAMPING
};
```

**Issue:** 
- `rect.width` and `rect.height` come from CSS layout
- Not validated against `window.innerWidth` or `window.innerHeight`
- Can cause bounds to exceed window dimensions

**Evidence from logs:**
```
Set bounds: { x: 309, y: 127, width: 576, height: 1187 }
Bottom edge: 127 + 1187 = 1314px
Window height: ~900px
OVERFLOW: 414px outside window ❌
```

#### 2. main.mjs (Lines 374-448)
**Current Implementation:**
```javascript
// Set bounds
const roundedBounds = {
  x: Math.round(bounds.x),
  y: Math.round(bounds.y),
  width: Math.round(bounds.width),
  height: Math.round(bounds.height)
};

view.setBounds(roundedBounds);  // ❌ NO VALIDATION
```

**Issue:**
- Accepts bounds from renderer without validation
- Directly applies to WebContentsView
- No check if bounds fit within window

#### 3. Electron WebContentsView Behavior
**From Electron Documentation:**
- `WebContentsView.setBounds({ x, y, width, height })`
- Coordinates are ABSOLUTE window-relative (0,0 = top-left of window)
- Does NOT validate against window dimensions
- Does NOT respect CSS overflow/containment
- Rendering happens in native layer, not HTML/CSS engine

**Coordinate System:**
- Window origin: (0, 0) at top-left
- X increases rightward
- Y increases downward
- View with y=127, height=1187 renders from pixel 127 to 1314
- Window only 900px tall → OVERFLOW

#### 4. CSS Layout (UnifiedPane.svelte)
**Current CSS:**
```css
.browser-content {
  width: 100%;
  height: 100%;
  position: relative;
  contain: strict;
  overflow: hidden;
  border: 3px solid lime;
  box-sizing: border-box;
}
```

**Status:** ✓ CSS is correct
**Issue:** ✗ WebContentsView ignores CSS rules

The CSS properly contains HTML elements, but WebContentsView is a NATIVE view rendered on top of the HTML canvas. CSS constraints do NOT apply to native views.

### Root Cause

**Two-Layer Rendering System:**
```
Layer 1: HTML/CSS (Constrained by CSS)
├── .browser-content { overflow: hidden, contain: strict }
└── Properly bounds HTML elements ✓

Layer 2: Electron Native (Unconstrained)
├── WebContentsView { x, y, width, height }
└── Ignores CSS rules, only respects window boundaries
    └── BUT we're not enforcing window boundaries! ❌
```

### Solution Required

**Bounds must be clamped BEFORE sending to Electron:**

1. **In IDEWindow.svelte (renderer):**
   - Calculate window dimensions
   - Clamp width and height to remaining window space
   - Ensure x + width ≤ windowWidth
   - Ensure y + height ≤ windowHeight

2. **In main.mjs (main process):**
   - Validate bounds against mainWindow dimensions
   - Clamp if necessary before calling setBounds()
   - Acts as safety net if renderer fails

### Mathematical Validation

**Current scenario (BROKEN):**
```
windowHeight = 900px
rect.height = 1187px
y = 127px

Check: y + height ≤ windowHeight?
127 + 1187 = 1314 ≤ 900? NO ❌
```

**After clamping (FIXED):**
```
windowHeight = 900px
rect.height = 1187px
y = 127px

clampedHeight = min(1187, 900 - 127) = min(1187, 773) = 773px

Check: y + clampedHeight ≤ windowHeight?
127 + 773 = 900 ≤ 900? YES ✓
```

### Implementation Details

**IDEWindow.svelte (lines 151-158):**
```javascript
const rect = container.getBoundingClientRect();

// NEW: Get window dimensions for clamping
const windowWidth = window.innerWidth;
const windowHeight = window.innerHeight;

// NEW: Clamp bounds to window space
const bounds = {
  x: Math.round(Math.max(0, rect.left)),
  y: Math.round(Math.max(0, rect.top)),
  width: Math.round(Math.max(0, Math.min(rect.width, windowWidth - rect.left))),
  height: Math.round(Math.max(0, Math.min(rect.height, windowHeight - rect.top)))
};
```

**main.mjs (lines 374-448):**
```javascript
ipcMain.handle('browser:setBounds', (event, { browserId, bounds }) => {
  // ... validation code ...
  
  const mainWindow = BrowserWindow.getAllWindows()[0];
  
  // NEW: Get actual window dimensions
  const windowBounds = mainWindow.getContentBounds();
  
  // NEW: Validate and clamp bounds
  const clampedBounds = {
    x: Math.max(0, Math.min(bounds.x, windowBounds.width)),
    y: Math.max(0, Math.min(bounds.y, windowBounds.height)),
    width: Math.max(0, Math.min(bounds.width, windowBounds.width - bounds.x)),
    height: Math.max(0, Math.min(bounds.height, windowBounds.height - bounds.y))
  };
  
  view.setBounds(clampedBounds);  // Now safe to apply
  
  return { success: true };
});
```

### Expected Results

**Before:**
- Browser renders at y=127 with height=1187
- Bottom edge at 1314px (exceeds 900px window)
- Browser visible outside window area ❌

**After:**
- Browser renders at y=127 with height=773 (clamped)
- Bottom edge at 900px (fits window perfectly)
- Browser always visible within window ✓

### Testing Verification

- [ ] Browser visible within pane boundaries
- [ ] No overflow outside window edges
- [ ] Resize window → browser bounds update correctly
- [ ] Toggle terminal → browser height adjusts within bounds
- [ ] Hide/show sidebar → browser respects new bounds
- [ ] Drag pane divider → browser stays within boundaries
- [ ] Multiple panes → each browser respects its pane

## Conclusion

Root cause: Unclamped bounds calculation allows WebContentsView to render outside window boundaries.

Solution: Enforce mathematical bounds clamping in both renderer and main process.

This is a fundamental architectural fix, not a performance optimization.
