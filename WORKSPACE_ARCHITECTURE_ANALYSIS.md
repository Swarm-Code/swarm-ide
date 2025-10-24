# Swarm IDE Workspace Architecture Analysis

## Executive Summary

The Swarm IDE implements a sophisticated multi-workspace architecture with persistence, allowing developers to manage multiple projects simultaneously. The system separates concerns into three core areas: **workspace management**, **pane/editor management**, and **terminal/browser management**. All components are tightly integrated through an event bus and state management system.

---

## 1. Workspace Management Architecture

### 1.1 Workspace Manager (`WorkspaceManager.js`)

**Location:** `/src/services/WorkspaceManager.js`

**Core Responsibility:** Manages directory-based workspace contexts with persistence across sessions.

#### Key Concepts:

1. **Workspace Structure** (Each workspace contains):
   - `id`: Unique identifier (generated)
   - `name`: Display name extracted from path or user-provided
   - `rootPath`: Root directory (local path or `ssh://` URL)
   - `currentPath`: Current working directory within workspace
   - `isSSH`: Boolean flag indicating SSH workspace
   - `paneIds`: Array of pane IDs belonging to this workspace
   - `terminalIds`: Array of terminal IDs in this workspace
   - `browserIds`: Array of browser instance IDs in this workspace
   - `openFiles`: Array of file paths currently open
   - `paneLayout`: Layout configuration for panes
   - `settings`: Workspace-specific settings (theme, etc.)
   - `sshConnectionId`: SSH connection ID for SSH workspaces

2. **State Management**:
   - `activeWorkspace`: Currently active workspace
   - `defaultWorkspace`: Default workspace (restored on startup)
   - `lastWorkspaceId`: Tracks last workspace for "Open Previous Workspace" feature
   - Tracking maps:
     - `paneToWorkspace`: Map of paneId → workspaceId
     - `terminalToWorkspace`: Map of terminalId → workspaceId
     - `browserToWorkspace`: Map of browserInstanceId → workspaceId

#### Workspace Switching Mechanism:

```
User clicks workspace in panel
  ↓
WorkspacePanel.switchWorkspace(workspaceId)
  ↓
WorkspaceManager.setActiveWorkspace(workspaceId)
  ↓
1. Save current workspace state
2. Hide current workspace panes (display: none)
3. Show target workspace panes (display: flex)
4. Update FileExplorer to target rootPath
5. Emit 'workspace:activated' event
```

#### Persistence:

- **Storage**: localStorage with key `'swarm-ide-workspaces'`
- **Format**: JSON (v2 format includes tracking maps)
- **Data Structure**:
  ```javascript
  {
    version: 2,
    workspaces: [...],
    paneToWorkspace: [['pane-id', 'workspace-id'], ...],
    terminalToWorkspace: [['terminal-id', 'workspace-id'], ...],
    activeWorkspaceId: 'workspace-id',
    savedAt: timestamp
  }
  ```

**Key Methods:**
- `init()`: Load persisted workspaces and restore last active if enabled
- `createWorkspace()`: Create new workspace with optional rootPath
- `setActiveWorkspace()`: Switch to workspace, manage pane visibility
- `hideWorkspacePanes()`: Set display: none on all workspace panes/browsers
- `showWorkspacePanes()`: Set display: flex, trigger terminal resize
- `trackPaneInActiveWorkspace()`: Associate pane with current workspace
- `trackTerminalInActiveWorkspace()`: Associate terminal with current workspace
- `trackBrowserInActiveWorkspace()`: Associate browser with current workspace
- `saveWorkspaces()`: Persist to localStorage
- `getOrCreateWorkspaceForPath()`: Get existing or create new workspace for path

---

## 2. Pane and Editor Management

### 2.1 Pane Manager (`PaneManager.js`)

**Location:** `/src/services/PaneManager.js`

**Core Responsibility:** Manages dynamic pane layouts with split views, tab management, and drag-drop functionality.

#### Pane Structure:

```javascript
{
  id: 'pane-xxxxx',
  element: HTMLElement,
  contentContainer: HTMLElement,
  tabBarContainer: HTMLElement | null,
  parent: parentPane | null,
  children: [child1, child2],        // For split panes
  split: 'horizontal' | 'vertical' | null,
  
  // Content state
  content: HTMLElement,
  contentType: 'file-viewer' | 'browser' | 'terminal' | null,
  filePath: string | null,
  metadata: {},
  
  // Tab management
  tabs: [
    {
      id: 'tab-xxxxx',
      filePath: string,
      title: string,
      content: HTMLElement,
      contentType: string
    },
    ...
  ],
  activeTabId: string | null
}
```

#### DOM Structure:

```html
<div class="pane" data-pane-id="pane-xxx">
  <div class="pane-header">
    <span class="pane-title">Title</span>
    <div class="pane-actions">
      <button class="pane-action-btn">⬌</button>  <!-- Split H -->
      <button class="pane-action-btn">⬍</button>  <!-- Split V -->
      <button class="pane-action-btn">✕</button>  <!-- Close -->
    </div>
  </div>
  <div class="pane-tab-bar">
    <div class="pane-tab active" data-tab-id="tab-xxx" draggable="true">
      <span class="pane-tab-title">file.js</span>
      <button class="pane-tab-close">✕</button>
    </div>
    ...
  </div>
  <div class="pane-content">
    <!-- Tab content (hidden/shown via display property) -->
  </div>
</div>
```

#### Pane Lifecycle:

1. **Creation**:
   - `init()` → `createRootPane()` → single pane fills container
   - New panes created via `splitPane()`

2. **Splitting**:
   - `splitPane(paneId, direction)` creates two child panes
   - Existing content moves to first child
   - Second child becomes active pane for new files
   - Resize handle allows dynamic resizing

3. **Closing**:
   - `closePane(paneId)` removes pane and sibling promotes to parent position
   - Cannot close last pane

4. **Tab Management**:
   - Each pane has `tabs[]` array and `activeTabId`
   - Tabs show/hide content via `display: flex/none`
   - Tabs persist across pane operations

#### Tab Operations:

```javascript
// Add tab to pane
addTab(paneId, filePath, title, contentElement, contentType)
  → Check if file already open
  → Create tab object
  → Ensure tab bar exists
  → renderTabBar() to show all tabs
  → switchTab() to activate

// Switch tab (hide/show)
switchTab(paneId, tabId, lineNumber)
  → Hide all tab contents (display: none, position: absolute)
  → Show target tab (display: flex)
  → Force resize terminals/browsers
  → Navigate to line if specified

// Close tab
closeTab(paneId, tabId)
  → Cleanup content (FileViewer.destroy(), Terminal.dispose(), Browser.destroy())
  → Remove from DOM
  → Switch to next tab or clear pane
  → Re-render tab bar

// Move tab between panes
moveTab(sourcePaneId, tabId, targetPaneId)
  → Remove from source pane tabs
  → Move DOM element to target pane
  → Update Browser context if browser tab
```

#### Critical Fixes in PaneManager:

1. **CRITICAL FIX #1**: Tab switch forces resize of terminals/browsers
   - Uses double `requestAnimationFrame()` to ensure layout complete
   - Terminal: calls `resize()` and `focus()`
   - Browser: recalculates bounds
   - FileViewer: calls `refresh()`

2. **CRITICAL FIX #2**: Operation queuing prevents race conditions
   - All tab/pane operations queued sequentially
   - Prevents concurrent mutations of pane tree
   - Tracks queue depth with warnings

3. **CRITICAL FIX #4**: Pane split notifies content instances
   - Terminals get resized after split
   - Browsers update paneId/tabId context
   - FileViewers force CodeMirror refresh

4. **CRITICAL FIX #9**: Consistent display property usage
   - Constants: `DISPLAY_VISIBLE = 'flex'`, `DISPLAY_HIDDEN = 'none'`
   - Prevents issues with hidden content

#### Drag and Drop System:

1. **File Drag from Explorer**:
   - Explorer emits `explorer:drag-start` event
   - PaneManager shows drag overlay (invisible, z-index: 9999)
   - Prevents CodeMirror from intercepting drag events
   - On drop: opens file as tab or splits pane based on drop zone

2. **Tab Drag Between Panes**:
   - Tab has `draggable="true"`
   - `setupTabDragHandlers()` manages drag events
   - Sets `application/x-tab-drag` data type
   - Drop handler calls `moveTab()`

3. **Drop Zones** (for file drops):
   - Center (30-70%): Opens as tab
   - Edge (0-30% or 70-100%): Splits pane
   - Visual feedback: colored zones during drag

### 2.2 Text Editor Component (`TextEditor.js`)

**Location:** `/src/components/TextEditor.js`

**Core Responsibility:** CodeMirror wrapper for code editing with syntax highlighting and Git integration.

#### Features:
- CodeMirror integration with monokai theme
- Syntax highlighting (auto-detected from extension)
- Line numbers, code folding, bracket matching
- Git blame and diff visualization
- LSP integration (completions, diagnostics)
- Save tracking (dirty state)
- Performance optimization (adaptive viewport margin for large files)

#### Integration with Panes:
- TextEditor creates `FileViewer` component
- FileViewer wrapped in container element
- Container stored in `tab.content`
- Reference stored at `tab.content._fileViewerInstance`
- PaneManager can access and refresh via `textEditor.refresh()`

---

## 3. Terminal and Browser Management

### 3.1 Terminal Architecture

#### Terminal Component (`Terminal.js`)

**Location:** `/src/components/terminal/Terminal.js`

- **Wraps**: xterm.js with FitAddon, WebLinksAddon, WebglAddon
- **Supports**: Local and SSH terminal connections
- **Key Methods**:
  - `init()`: Create xterm instance
  - `attach()`: Open in DOM, create PTY, setup listeners
  - `resize()`: Fit to container
  - `fit()`: Use FitAddon to calculate dimensions
  - `dispose()`: Cleanup and close PTY

#### Terminal Panel (`TerminalPanel.js`)

**Location:** `/src/components/terminal/TerminalPanel.js`

- **Manages**: Multiple terminal tabs in bottom panel
- **Features**:
  - Terminal tabs (like editor tabs)
  - New local/SSH terminal dropdown
  - Resizable panel (min 100px, max 600px)
  - Split terminal (creates new tab, not true split)

#### Terminal Lifecycle in Workspaces:

```
createTerminal() in TerminalPanel
  ↓
Create Terminal instance with connectionType/connectionId
  ↓
terminal.init() → terminal.attach()
  ↓
Create PTY (local or SSH)
  ↓
workspaceManager.trackTerminalInActiveWorkspace(terminalId)
  ↓
[Workspace switch]
  ↓
WorkspaceManager.hideWorkspacePanes() [terminal hidden, PTY stays alive]
  ↓
[Switch back]
  ↓
WorkspaceManager.showWorkspacePanes() [terminal shown, resized]
```

**Important**: Terminals are NOT part of PaneManager tabs. They exist in a separate TerminalPanel at the bottom. However, they can be moved to panes via drag-drop (future enhancement).

### 3.2 Browser Management

#### Browser Component (`Browser.js`)

- **Manages**: BrowserView instances
- **Features**:
  - Multiple browser profiles
  - URL bar integration
  - DevTools integration
  - User agent spoofing

#### Browser in Panes:

Browsers can be opened as pane tabs via `pane:request-open-browser` event:
1. Create Browser instance
2. Get active tab ID (BrowserView)
3. Create container element
4. Add as tab to pane via `paneManager.addTab()`
5. Store Browser reference at `tab.content._browserInstance`

#### Browser Context Tracking:

```javascript
// When browser tab moves between panes or is resized
tab.content._browserInstance.updatePaneContext(newPaneId, newTabId)
  ↓
Recalculate bounds based on pane element position/size
  ↓
Call electronAPI.browserUpdateBounds(tabId, bounds)
```

---

## 4. State Management and Events

### 4.1 Event Bus Integration

**Location:** `/src/modules/EventBus.js`

**Key Events** for workspace/pane/tab operations:

```javascript
// Workspace events
'workspace:created'         // New workspace created
'workspace:activated'       // Switched to workspace
'workspace:switched'        // User switched workspace
'workspace:updated'         // Workspace properties updated
'workspace:deleted'         // Workspace deleted
'workspace:toggle-panel'    // Show/hide workspace panel

// Pane events
'pane:split'               // Pane split horizontally/vertically
'pane:closed'              // Pane closed
'pane:activated'           // Pane became active
'pane:request-file-open'   // Request to open file in pane

// Tab events
'tab:added'                // Tab added to pane
'tab:switched'             // Tab switched (active changed)
'tab:closed'               // Tab closed

// Terminal events
'terminal:data'            // Data from PTY
'terminal:exit'            // PTY exited
'terminal:toggle-panel'    // Show/hide terminal panel

// Drag/drop events
'explorer:drag-start'      // File drag started
'explorer:drag-end'        // File drag ended
```

### 4.2 State Manager

**Location:** `/src/modules/StateManager.js`

- Centralized reactive state system
- Subscribers notified on state changes
- Used for UI state (current file, cursor position, etc.)

---

## 5. UI Structure and Workspace Tabs

### 5.1 Workspace Switching UI

#### Menu Bar Integration (`MenuBar.js`):

```html
<button id="workspace-button" class="workspace-switcher">
  <img src="assets/icons/folder.svg" alt="Workspace" class="workspace-icon">
  <span class="workspace-name">Current Workspace Name</span>
</button>
```

- Shows currently active workspace name
- Clicking opens WorkspacePanel

#### Workspace Panel (`WorkspacePanel.js`):

```html
<div class="workspace-panel">
  <div class="workspace-panel-header">
    <h3>Workspaces</h3>
    <button class="workspace-panel-close">✕</button>
  </div>
  <div class="workspace-list">
    <div class="workspace-item active">
      <div class="workspace-item-info">
        <div class="workspace-item-name">Project Name</div>
        <div class="workspace-item-desc">Description</div>
      </div>
      <div class="workspace-item-actions">
        <button class="workspace-item-delete">🗑️</button>
      </div>
    </div>
  </div>
  <button class="workspace-create-btn">➕ Create Workspace</button>
</div>
```

- Slides in from right
- Lists all workspaces
- Highlights active workspace
- Create/delete options
- Click to switch

#### Status Bar Integration:

```
Click workspace info in status bar
  ↓
Show workspace switcher menu (same as panel)
```

### 5.2 Renderer Integration

**Location:** `/src/renderer.js`

**Initialization Sequence**:

```javascript
app.init()
  ↓
1. Load config
2. Initialize services (FileSystem, SQL, SSH)
3. Initialize WorkspaceManager (restore last workspace)
4. Initialize BrowserProfileManager
5. Setup UIManager
6. Initialize Git services
7. Setup global handlers
8. Initialize UI components:
   - MenuBar
   - FileExplorer
   - PaneManager (with root pane)
   - TerminalPanel
   - WorkspacePanel
   - All other panels
9. Apply theme
10. Wire up FileExplorer to first workspace directory
```

**Key Wiring** (renderer.js):

```javascript
// Set managers reference in WorkspaceManager
this.workspaceManager.setManagers(this.paneManager, this.fileExplorer);

// Track browser in active workspace
Browser.instances event listeners track browsers

// Handle file opens in active pane
eventBus.on('file:open-request', (path) => {
  const activePane = paneManager.getActivePane();
  openFileInPane(activePane.id, path);
});

// Handle workspace switches
eventBus.on('workspace:activated', () => {
  // Panes already shown by WorkspaceManager
  // Update file explorer
  // Update UI display
});
```

---

## 6. Persistence and Recovery

### 6.1 Workspace Persistence

**What's Saved**:
- All workspaces and their properties
- Pane-to-workspace tracking
- Terminal-to-workspace tracking
- Active workspace ID

**What's NOT Saved** (by design):
- Individual file content (handled by editor)
- Open tabs (could be added)
- Pane layout details within workspace (could be added)
- Terminal history (handled by PTY)

### 6.2 Restoration on Startup

```javascript
WorkspaceManager.init()
  ↓
1. Load from localStorage
  ↓
2. Check restoreWorkspaceOnStartup config
  ↓
3. If enabled: restore last active workspace
  ↓
4. Restore workspace state (no panes yet, just metadata)
  ↓
5. Wait for PaneManager to initialize (root pane created)
  ↓
6. When workspace activated: showWorkspacePanes() (shows panes if they exist)
```

### 6.3 File Explorer Directory Synchronization

When workspace is activated:
```javascript
WorkspaceManager.setActiveWorkspace()
  ↓
if (workspace.rootPath && fileExplorer) {
  await fileExplorer.openDirectory(workspace.rootPath);
}
```

This causes FileExplorer to:
1. Clear current directory tree
2. Load directory contents from rootPath
3. Display in file explorer panel

---

## 7. Key Data Flows

### 7.1 Opening a File

```
1. FileExplorer: User double-clicks file
   ↓
2. FileExplorer emits 'file:open-request' with filePath
   ↓
3. Renderer handles event:
   - Get active pane
   - Create FileViewer component
   - Call paneManager.addTab()
   ↓
4. PaneManager.addTab():
   - Check if file already open in tabs
   - If yes: switch to that tab
   - If no: create new tab, switch to it
   ↓
5. renderTabBar() updates UI
   ↓
6. switchTab() shows new tab content
```

### 7.2 Switching Workspace

```
1. User clicks workspace in panel
   ↓
2. WorkspacePanel.switchWorkspace(wsId)
   ↓
3. WorkspaceManager.setActiveWorkspace(wsId):
   a. Save current workspace state
   b. hideWorkspacePanes(oldWsId) - display: none all panes
   c. showWorkspacePanes(newWsId) - display: flex all panes
   d. Update FileExplorer directory
   e. Emit 'workspace:activated'
   ↓
4. Panes become visible with their tabs intact
   ↓
5. Terminals (TerminalPanel) remain unchanged (separate system)
```

### 7.3 Creating New Terminal

```
1. User clicks "+" in TerminalPanel
   ↓
2. TerminalPanel.createTerminal():
   - Create Terminal instance
   - terminal.init() + terminal.attach()
   - Create PTY
   - Add tab to TerminalPanel
   ↓
3. Workspace Manager:
   - workspaceManager.trackTerminalInActiveWorkspace(terminalId)
   ↓
4. Terminal shows in TerminalPanel tabs
   ↓
5. When workspace switches:
   - Terminal stays in TerminalPanel (not workspace-bound)
   - Terminal stays alive (PTY continues)
   - Can be moved to pane later (future)
```

---

## 8. Architecture Diagrams

### 8.1 Component Hierarchy

```
Application (renderer.js)
├── MenuBar
│   └── Workspace Switcher Button
├── Sidebar
│   └── FileExplorer
├── Main Area
│   └── PaneManager
│       └── Root Pane
│           ├── Pane Tabs
│           │   ├── FileViewer (TextEditor)
│           │   ├── Browser
│           │   └── Other content
│           └── [Child Panes if split]
├── BottomPanel
│   └── TerminalPanel
│       └── Terminal Tabs
├── WorkspacePanel (slide-out)
│   └── Workspace List
└── Other Panels
    ├── GitPanel
    ├── SSHPanel
    └── SettingsPanel
```

### 8.2 Data Flow: Workspace Switching

```
                     User Action
                         ↓
                  Click Workspace
                         ↓
                  WorkspacePanel
                         ↓
          WorkspaceManager.setActiveWorkspace()
         /                                      \
   Save Old State                         Load New State
        ↓                                       ↓
  hideWorkspacePanes()                   showWorkspacePanes()
  (display: none)                        (display: flex)
        ↓                                       ↓
  Stop rendering                         Resume rendering
  Panes stay in DOM                      Panes visible
  Terminals stay alive                   Terminals resized
        ↓                                       ↓
   FileExplorer.openDirectory(newRoot)
        ↓
   UI updates with new workspace context
```

### 8.3 Tab Management State Machine

```
           [Pane with N tabs]
                  ↓
        switchTab(tabId)
                  ↓
      renderTabBar(pane)
                  ↓
    [All tab contents hidden]
    [One tab content shown]
                  ↓
    Force resize visible content
    (Terminal.resize(), Browser bounds, etc.)
```

---

## 9. Critical Implementation Details

### 9.1 Tab Content Display Strategy

**Key Principle**: Tabs use `display: flex/none` instead of creating/destroying DOM

**Advantages**:
- Fast switching (no element recreation)
- Terminal connection persists (PTY not closed)
- Browser state persists (BrowserView not destroyed)
- Content scrolling position preserved

**Disadvantage**:
- Memory usage (all open tabs kept in memory)

**Implementation**:
```javascript
// When hiding tab
tab.content.style.display = 'none';
tab.content.style.position = 'absolute';

// When showing tab
tab.content.style.display = 'flex';
tab.content.style.position = 'absolute';
tab.content.style.top = '0';
tab.content.style.left = '0';
tab.content.style.right = '0';
tab.content.style.bottom = '0';
```

### 9.2 Workspace Pane Visibility

**Same principle** as tabs:
```javascript
// Hide workspace
pane.element.style.display = 'none';

// Show workspace
pane.element.style.display = 'flex';
```

**Side effect**: When pane becomes visible, need to trigger resize:
```javascript
// In showWorkspacePanes()
if (tab.content._terminalInstance) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      tab.content._terminalInstance.resize();
      tab.content._terminalInstance.fit();
    });
  });
}
```

### 9.3 Operation Queuing for Concurrent Safety

**Problem**: Multiple tab/pane operations could corrupt state

**Solution**: Promise-based operation queue
```javascript
queueOperation(name, operation) {
  this.operationQueue = this.operationQueue.then(() => {
    return operation();  // Operations execute sequentially
  });
  return this.operationQueue;
}
```

**Used for**:
- `closeTab()`: Might trigger cleanup, tab switch
- `closePane()`: Restructure pane tree
- `moveTab()`: Modify two panes

---

## 10. Performance Considerations

### 10.1 Large Files in TextEditor

- **Adaptive viewportMargin**: 
  - ≤1000 lines: render all (Infinity)
  - ≤3000 lines: moderate (150)
  - ≤10000 lines: aggressive (100)
  - >10000 lines: maximum (50)

### 10.2 Drag Performance

- **Drag overlay**: Invisible z-index 9999 prevents CodeMirror cursor creation
- **Throttled events**: dragover events throttled to 100ms
- **Metrics tracking**: Performance monitoring during drag

### 10.3 Terminal Resizing

- **debounced**: 100ms debounce on ResizeObserver
- **double RAF**: Ensures layout complete before fit()
- **Multiple fit() calls**: On show, on resize, on tab switch

---

## 11. Potential Enhancements

1. **Persist tab state**: Save which files are open in each workspace
2. **Persist pane layout**: Save split structure per workspace
3. **Tab history**: Navigate back/forward through recent tabs
4. **Workspace templates**: Save/restore full workspace configuration
5. **Sync terminals to panes**: Move terminals from bottom panel to panes
6. **Workspace sync**: Cloud sync workspace configurations
7. **Auto-save workspace**: Continuously persist workspace state
8. **Grouped tabs**: Tab groups/sections within panes

---

## 12. File Locations Reference

| Component | File | Responsibility |
|-----------|------|-----------------|
| WorkspaceManager | `src/services/WorkspaceManager.js` | Workspace CRUD, switching, persistence |
| PaneManager | `src/services/PaneManager.js` | Pane layout, splitting, tabs |
| TerminalPanel | `src/components/terminal/TerminalPanel.js` | Terminal tabs management |
| Terminal | `src/components/terminal/Terminal.js` | xterm.js wrapper |
| TextEditor | `src/components/TextEditor.js` | CodeMirror integration |
| FileViewer | `src/components/FileViewer.js` | File content display |
| Browser | `src/components/Browser.js` | BrowserView management |
| WorkspacePanel | `src/components/WorkspacePanel.js` | Workspace UI panel |
| MenuBar | `src/components/MenuBar.js` | Menu + workspace button |
| StatusBar | `src/components/StatusBar.js` | Status display + workspace info |
| Renderer | `src/renderer.js` | App initialization, wiring |
| EventBus | `src/modules/EventBus.js` | Event system |
| StateManager | `src/modules/StateManager.js` | Reactive state |

---

## 13. Configuration and Settings

**Workspace Settings**:
- Stored in workspace object
- Per-workspace theme, editor settings
- SSH connection preferences

**Application Settings**:
- Stored in Config module
- `restoreWorkspaceOnStartup`: boolean (default: false)

**localStorage Keys**:
- `swarm-ide-workspaces`: Main workspace persistence

---

## Conclusion

The Swarm IDE workspace architecture demonstrates sophisticated state management:

1. **Separation of concerns**: Workspaces, panes, and terminals managed independently
2. **Persistence**: Workspaces survive application restarts
3. **Performance**: Display toggling instead of DOM recreation
4. **Safety**: Operation queuing prevents race conditions
5. **Extensibility**: Event-driven design allows future enhancements
6. **SSH Support**: First-class SSH workspace support with remote terminals

The system is designed for developers working on multiple projects simultaneously, providing fast switching and isolated development contexts.

