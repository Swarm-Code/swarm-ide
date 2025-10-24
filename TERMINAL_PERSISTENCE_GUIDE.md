# Terminal Persistence Across Workspace Switches

## Overview

Swarm IDE implements **terminal persistence** using CSS display toggling instead of DOM destruction. This means when you switch between workspaces, your terminals and editors remain alive in memory, continuing to run any background processes, and instantly restore when you switch back.

## How It Works

### Two-Level Persistence System

Swarm IDE has a **double-layer persistence** system:

#### 1. **Workspace Level** (WorkspaceManager.js)
- When switching workspaces, the current workspace's panes are hidden with `display: none`
- **NOT destroyed** - they remain in memory
- All child elements (terminals, editors, browsers) inherit this visibility
- Terminals continue running background processes
- Long-running commands keep executing

#### 2. **Terminal Tab Level** (TerminalPanel.js)
- Within a workspace, multiple terminal tabs exist
- Switching between tabs hides one terminal with CSS class removal
- **NOT destroyed** - remains in memory with active PTY connection
- Only one terminal visible at a time (`display: block` for active terminal)

### The Persistence Mechanism

```
┌─────────────────────────────────────────────────────────┐
│ Workspace 1 (Hidden)                                     │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Pane 1 (display: none)                           │   │
│ │ ┌────────────────────────────────────────────┐   │   │
│ │ │ Terminal 1 (xterm.js instance)              │   │   │
│ │ │ Running: npm run dev                        │   │   │
│ │ │ Status: ALIVE, accumulating output          │   │   │
│ │ └────────────────────────────────────────────┘   │   │
│ │                                                   │   │
│ │ ┌────────────────────────────────────────────┐   │   │
│ │ │ Terminal 2 (xterm.js instance)              │   │   │
│ │ │ Running: npm run build                      │   │   │
│ │ │ Status: ALIVE, accumulating output          │   │   │
│ │ └────────────────────────────────────────────┘   │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

User switches workspace...

┌─────────────────────────────────────────────────────────┐
│ Workspace 2 (Visible)                                    │
│ ┌──────────────────────────────────────────────────┐   │
│ │ Pane 1 (display: flex)  ✓ NOW VISIBLE          │   │
│ │ ┌────────────────────────────────────────────┐   │   │
│ │ │ Terminal 3 (xterm.js instance)              │   │   │
│ │ │ Running: ssh remote-server                  │   │   │
│ │ │ Status: ALIVE, now visible                  │   │   │
│ │ └────────────────────────────────────────────┘   │   │
│ └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘

Meanwhile, in Workspace 1 (hidden background):
- Terminal 1: npm run dev continues executing
- Terminal 2: npm run build continues building
- Output accumulates invisibly
- No reconnection needed when returning
```

## Key Features

### ✅ What Persists

1. **Terminal Process (PTY)**
   - SSH connections stay open
   - Local PTY processes remain running
   - No reconnection/restart needed

2. **Output Buffer**
   - Everything the process outputs is captured
   - Scrollback history is preserved
   - When you return, you see all accumulated output

3. **Connection State**
   - xterm.js instance never disposed
   - WebSocket connections stay open (for SSH)
   - Terminal dimensions remembered

4. **Editor State**
   - Undo/redo stacks preserved
   - Cursor position maintained
   - File changes persist

5. **Browser Instances**
   - Web pages in browsers stay loaded
   - Navigation history preserved
   - JavaScript state unchanged

### ✅ Why It Works

**Instead of destroying and recreating:**
```javascript
// BAD: Destroys terminal when hidden
hiddenWorkspace.terminals.forEach(t => t.dispose());
```

**We just hide the DOM:**
```javascript
// GOOD: Keeps terminal alive, just invisible
paneElement.style.display = 'none';  // Terminal still runs!
```

**When returning, we show it again:**
```javascript
paneElement.style.display = 'flex';    // Terminal appears with all output
terminal.fit();                        // Adjust to new container size
```

## Usage Examples

### Example 1: Long-Running Build

```
1. In Workspace "Backend"
   - Terminal 1: npm run dev (React app compiling)
   - Terminal 2: npm run build:watch (TypeScript compiling)

2. Switch to Workspace "Documentation"
   - Both build processes continue running invisibly
   - Output accumulates silently

3. Work on documentation for 10 minutes

4. Switch back to Workspace "Backend"
   - All build output from those 10 minutes is visible
   - Compilation might have finished, all warnings visible
```

### Example 2: SSH Connection

```
1. In Workspace "Production"
   - Terminal: ssh deploy@production.example.com
   - Running: tail -f /var/log/app.log

2. Switch to Workspace "Local Dev"
   - SSH connection stays open
   - Log file continues being monitored

3. Later, switch back to Workspace "Production"
   - SSH still connected
   - Latest log entries visible
   - No need to ssh again
```

### Example 3: Multiple Editors

```
1. Workspace "Frontend"
   - Editor 1: src/components/Button.jsx (unsaved changes)
   - Editor 2: src/styles/globals.css
   - Terminal: npm run dev (live reload watching)

2. Switch to Workspace "Backend"
   - Work on different code

3. Switch back to Workspace "Frontend"
   - Button.jsx still shows unsaved changes
   - globals.css scroll position preserved
   - npm run dev still watching for changes
   - Live reload triggers immediately
```

## Technical Implementation

### Files Involved

1. **WorkspaceManager.js** (Lines 284-435)
   - `hideWorkspacePanes()` - Sets `display: none` on pane containers
   - `showWorkspacePanes()` - Sets `display: flex` on pane containers
   - Uses double `requestAnimationFrame` for proper terminal resizing

2. **TerminalPanel.js** (Lines 293-374)
   - `setActiveTerminal()` - Toggles CSS class for tab visibility
   - Uses CSS class instead of DOM removal

3. **styles.css** (Lines 6940-6977)
   - `.terminal-instance { display: none; }` - Default hidden
   - `.terminal-instance.active { display: block; }` - Active tab visible

4. **WorkspacePanel.js** (Lines 131-257)
   - UI shows terminal counts
   - Tooltip explains persistence

### Event Flow

```
User clicks workspace tab
         ↓
WorkspacePanel.switchWorkspace(workspaceId)
         ↓
WorkspaceManager.setActiveWorkspace(workspaceId)
         ↓
hideWorkspacePanes(previousWorkspace.id)
  └─ pane.element.style.display = 'none'
         ↓
showWorkspacePanes(newWorkspace.id)
  ├─ pane.element.style.display = 'flex'
  └─ requestAnimationFrame x2
       └─ terminal.resize() + terminal.fit()
         ↓
eventBus.emit('workspace:activated')
         ↓
Terminal becomes visible with all output
```

## Performance Benefits

### Memory Efficient
- No DOM recreation
- No reconnection overhead
- Minimal CSS repainting

### Instant Response
- Workspace switch completes in <100ms
- No waiting for terminal re-initialization
- Output appears immediately

### Battery Friendly
- Processes keep running (but invisibly)
- No constant reconnection/disconnect cycles
- More efficient than pause/resume approach

## Important Notes

### Terminals Keep Running in Background
This is both a feature and something to be aware of:

✅ **Good for:**
- Long builds continuing while you work elsewhere
- SSH connections staying open
- Monitoring processes (log tails, watches)

⚠️ **Be aware:**
- Processes consume CPU/memory even when hidden
- SSH sessions eventually timeout if inactive too long
- Multiple simultaneous builds might slow down your system

### CPU Usage
If you have 5 workspaces with 3 terminals each running `npm run dev`, all 15 processes will be building simultaneously. This is intentional but be mindful of system resources.

## Future Enhancements

Potential improvements:

1. **Process Suspension** - Pause hidden terminal processes to save CPU
2. **Memory Management** - Limit scrollback buffer for long-running terminals
3. **Reconnection Recovery** - Auto-reconnect SSH if connection drops
4. **Workspace Presets** - Save terminal arrangements per workspace
5. **Activity Indicators** - Badge showing if hidden workspace has new output

## Troubleshooting

### Terminal Output Not Showing
1. Verify workspace is actually switching (watch "Active" indicator)
2. Check if terminal process crashed (exit code in status)
3. Try switching back and forth to refresh

### SSH Connection Dropped
1. Long inactivity might timeout
2. Try switching workspaces to trigger activity
3. Or manually reconnect in the hidden terminal

### High CPU Usage
1. Check how many workspaces have processes running
2. Consider using process suspension for background workspaces
3. Kill unneeded terminals in hidden workspaces

## See Also

- [Workspace Management Guide](./docs/WORKSPACE_GUIDE.md)
- [Terminal Configuration](./docs/TERMINAL_CONFIG.md)
- [Architecture: Workspace System](./WORKSPACE_ARCHITECTURE_ANALYSIS.md)
