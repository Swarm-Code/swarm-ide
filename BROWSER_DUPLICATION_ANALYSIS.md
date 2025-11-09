# Browser Duplication Analysis - Tab Drag Issue

## Problem Statement
When dragging a browser tab from one pane to another, a duplicate WebContentsView is created. The old view stays at the wrong position, and the new view fits perfectly in the target pane.

**User observation:**
> "it gets duplicated when I split the pane and then when I drag it to the other one thats when theres 2 but the new one is actually fitting in perfectly, its only like the parent one that gets the issue"

## Root Cause

### The Bug Chain

**Step 1: Initial browser creation**
```javascript
// Pane A creates browser tab
UnifiedPane.svelte (Pane A):
  - browserTabs reactive statement triggers (line 29)
  - createdBrowsers.has('browser-123') → false
  - calls createBrowserInstance()
  - IPC: browser:create { browserId: 'browser-123' }
  
Main Process:
  - Creates new WebContentsView
  - browsers.set('browser-123', view)
  - contentView.children.length = 1 ✅
```

**Step 2: User drags tab from Pane A to Pane B**
```javascript
// Tab is moved in editorStore
editorStore.moveTab('pane-A', 'pane-B', 'tab-1')

// Pane A's reactive statement
UnifiedPane.svelte (Pane A):
  - browserTabs = [] (no longer has browser tab)
  - onDestroy() NOT called yet (component still mounted)
  - createdBrowsers.has('browser-123') → true
  - No cleanup happens ❌

// Pane B's reactive statement
UnifiedPane.svelte (Pane B):
  - browserTabs = [{ browserId: 'browser-123', ... }]
  - createdBrowsers.has('browser-123') → false ❌ (different component instance!)
  - calls createBrowserInstance()
  - IPC: browser:create { browserId: 'browser-123' }
```

**Step 3: Main process creates duplicate**
```javascript
Main Process (main.mjs:354):
  ipcMain.handle('browser:create', (event, { browserId, url, workspaceId }) => {
    // ❌ NO CHECK if browser already exists!
    const view = new WebContentsView({ ... });  // Creates NEW view
    
    browsers.set(browserId, view);  // Overwrites old reference
    // Old view is orphaned but still attached to window!
  });
```

**Step 4: Result**
```javascript
Main Process state:
  - browsers.get('browser-123') → new WebContentsView (from Pane B)
  - contentView.children = [old view, new view] ❌
  - old view: still at Pane A's old position
  - new view: correctly positioned in Pane B
```

### Why This Happens

**1. Component-local state**
- `createdBrowsers` Set is per-component (line 16 of UnifiedPane.svelte)
- When Pane A has browser, its Set contains browserId
- When Pane B receives browser, its Set is empty
- No global registry of created browsers

**2. Missing duplicate prevention**
- `browser:create` handler always creates new WebContentsView
- No check if `browsers.has(browserId)`
- Overwrites Map entry without destroying old view

**3. No cleanup on tab move**
- When tab leaves Pane A, component doesn't destroy browser
- `onDestroy()` only runs when component unmounts
- Browser persists in main process

## The Fix

### Solution 1: Add duplicate check in main process ⭐⭐⭐

**File:** `main.mjs`

```javascript
ipcMain.handle('browser:create', (event, { browserId, url, workspaceId }) => {
  try {
    // 🔧 FIX: Check if browser already exists
    if (browsers.has(browserId)) {
      console.log('[browser:create] ✓ Browser already exists:', browserId);
      return { success: true, alreadyExists: true };
    }
    
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      }
    });
    
    // ... rest of handler
```

**Why this works:**
- Main process becomes source of truth
- Prevents duplicate WebContentsView creation
- Component-local Sets become irrelevant
- Safe for any number of panes

### Solution 2: Make createdBrowsers global (Alternative)

**File:** `src/stores/browserStore.js`

```javascript
// Add to store
const createdBrowsers = new Set();

export const browserStore = createBrowserStore() {
  // ...
  
  markBrowserCreated: (id) => {
    createdBrowsers.add(id);
  },
  
  isBrowserCreated: (id) => {
    return createdBrowsers.has(id);
  },
  
  markBrowserDestroyed: (id) => {
    createdBrowsers.delete(id);
  }
}
```

**File:** `src/components/UnifiedPane.svelte`

```javascript
// Replace local Set with store calls
$: browserTabs = pane.tabs.filter(t => t.type === 'browser');
$: if (browserTabs.length > 0 && window.electronAPI) {
  browserTabs.forEach(tab => {
    const browser = allBrowsers.find(b => b.id === tab.browserId);
    if (browser && !browserStore.isBrowserCreated(tab.browserId)) {
      createBrowserInstance(browser, tab);
    }
  });
}
```

**Why this works:**
- Global registry across all components
- All panes see same creation state
- More complex, requires store changes

## Recommended Fix

**Use Solution 1** (duplicate check in main process)

**Reasons:**
1. Simpler - one line change
2. Main process is source of truth
3. Fail-safe - works even if renderer logic changes
4. No store refactoring needed
5. Prevents race conditions from parallel pane creation

## Implementation Plan

### Step 1: Add duplicate check
```javascript
// main.mjs:354
ipcMain.handle('browser:create', (event, { browserId, url, workspaceId }) => {
  try {
    // Check if browser already exists
    if (browsers.has(browserId)) {
      console.log('[browser:create] ✓ Browser already exists:', browserId);
      return { success: true, alreadyExists: true };
    }
    
    // ... existing code
```

### Step 2: Verify with logging
- Drag tab between panes
- Check console for "[browser:create] ✓ Browser already exists"
- Verify `contentView.children.length` stays at 1

### Step 3: Test scenarios
1. **Drag tab A→B** → Should see "already exists", no duplicate
2. **Drag tab A→B→C** → Same browser, no duplicates
3. **Create new browser in B** → New browser created successfully
4. **Split with browser open** → Original browser stays, no duplicate

## Additional Improvements

### Optional: Add cleanup logging

```javascript
// UnifiedPane.svelte:89
onDestroy(() => {
  if (window.electronAPI) {
    browserTabs.forEach(tab => {
      if (createdBrowsers.has(tab.browserId)) {
        console.log('[UnifiedPane] 🗑️ Destroying browser on component unmount:', tab.browserId);
        window.electronAPI.browserDestroy({ browserId: tab.browserId });
        createdBrowsers.delete(tab.browserId);
      }
    });
  }
});
```

### Optional: Prevent orphaned views

```javascript
// main.mjs:386 (after browsers.set)
// Track all attached views for cleanup
const mainWindow = BrowserWindow.getAllWindows()[0];
if (mainWindow && mainWindow.contentView) {
  console.log('[browser:create] Current views in window:', 
    mainWindow.contentView.children.length);
}
```

## Expected Behavior After Fix

✅ Drag tab between panes → Single WebContentsView
✅ Browser repositioned correctly
✅ No duplicate views in contentView.children
✅ Console shows "Browser already exists" on duplicate create attempts
✅ Clean tab dragging experience

## Files to Modify

1. **main.mjs** (line 354)
   - Add `if (browsers.has(browserId))` check
   - Return early with success if exists

## Risk Assessment

**Low Risk:**
- One-line defensive check
- No behavior change for normal creation
- Prevents edge case bug
- No performance impact

**No Breaking Changes:**
- Existing browser creation works same
- Tab dragging improved
- No API changes
