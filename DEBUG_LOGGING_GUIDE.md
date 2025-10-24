# SSH Terminal Debug Logging & Visual Indicators Guide

## 🎯 What Was Implemented

### 1. File-Based Debug Logging
- **Location**: `~/.swarm-ide/debug-logs/`
- **Automatic**: Creates new log file on each application start
- **Comprehensive**: Tracks terminal creation, workspace operations, and SSH connections

### 2. Visual Indicators for SSH Terminals
- **Blue Color Coding**: SSH terminal tabs have blue text and blue left border
- **Lock Icon**: SSH terminals show 🔒 icon in tab
- **Different Hover Effects**: SSH tabs have blue-tinted hover background

### 3. Enhanced Workspace Creation
- **Explicit `isSSH` Property**: Workspaces now have `isSSH: true` set explicitly
- **Fallback Name Handling**: Uses hostname if connection name is undefined
- **Full Logging**: Every step of workspace creation is logged

---

## 📝 How to Use Debug Logging

### Finding Your Debug Log

When the application starts, you'll see:
```
🔍 DEBUG LOGGING ENABLED 🔍
📝 Log file: /home/alejandro/.swarm-ide/debug-logs/terminal-debug-2025-10-22T21-30-00-000Z.log
```

### What Gets Logged

The debug logger tracks:

#### Terminal Creation
```
[TERMINAL] createTerminal() invoked
           Data: { "options": {} }
[TERMINAL] Initial options
           Data: {
             "providedConnectionType": undefined,
             "providedConnectionId": undefined,
             "hasOptions": false
           }
[TERMINAL] No connectionType provided, checking active workspace...
[WORKSPACE] Active workspace retrieved
            Data: {
              "hasWorkspace": true,
              "workspaceId": "ws_xxx",
              "workspaceName": "Clover4 - root",
              "workspaceRootPath": "ssh://root@155.138.218.159/root",
              "isSSH": true,
              "sshConnectionId": "ssh_xxx"
            }
[TERMINAL] ✅ AUTO-DETECTED SSH WORKSPACE
           Data: {
             "connectionType": "ssh",
             "connectionId": "ssh_xxx",
             "workspaceName": "Clover4 - root"
           }
```

#### Workspace Creation
```
[WORKSPACE] Connection data
            Data: {
              "connectionId": "ssh_xxx",
              "connectionName": "Clover4",
              "host": "155.138.218.159",
              "username": "root",
              "remotePath": "/root"
            }
[WORKSPACE] Computed workspace name
            Data: {
              "folderName": "root",
              "workspaceName": "Clover4 - root",
              "connectionNameUsed": "Clover4"
            }
[WORKSPACE] ✅ Workspace configured as SSH
            Data: {
              "id": "ws_xxx",
              "name": "Clover4 - root",
              "isSSH": true,
              "sshConnectionId": "ssh_xxx"
            }
```

### Reading the Log File

```bash
# View latest log
tail -f ~/.swarm-ide/debug-logs/terminal-debug-*.log

# Search for specific issues
grep "ERROR" ~/.swarm-ide/debug-logs/terminal-debug-*.log
grep "AUTO-DETECTED" ~/.swarm-ide/debug-logs/terminal-debug-*.log

# View entire session
cat ~/.swarm-ide/debug-logs/terminal-debug-2025-10-22T21-30-00-000Z.log
```

---

## 🎨 Visual Indicators

### SSH Terminal Tabs

**Normal State:**
- 🔒 Lock icon prefix
- Blue text color (`#4a9eff`)
- 3px blue left border

**Active State:**
- Brighter blue text (`#6eb3ff`)
- Bold text weight
- Dark blue background (`#1e2a35`)

**Hover State:**
- Blue-tinted background (`rgba(74, 158, 255, 0.1)`)

### Local Terminal Tabs

**Normal State:**
- No icon
- Gray text color (`#858585`)
- No colored border

**Active State:**
- Light gray text (`#cccccc`)
- Dark background (`#1e1e1e`)

---

## 🔍 Debugging Workflow

### Problem: Terminal Creating Locally Instead of SSH

**Step 1**: Check the debug log
```bash
grep "createTerminal" ~/.swarm-ide/debug-logs/terminal-debug-*.log | tail -20
```

Look for:
- ✅ `AUTO-DETECTED SSH WORKSPACE` = Good, detection working
- ❌ `Defaulting to LOCAL terminal` = Problem, workspace not marked as SSH

**Step 2**: Check workspace properties
```bash
grep "Active workspace retrieved" ~/.swarm-ide/debug-logs/terminal-debug-*.log | tail -5
```

Verify:
- `hasWorkspace: true`
- `isSSH: true` ← **MUST BE TRUE**
- `sshConnectionId: "ssh_xxx"` ← **MUST EXIST**

**Step 3**: Check workspace creation
```bash
grep "WORKSPACE CREATION" -A 50 ~/.swarm-ide/debug-logs/terminal-debug-*.log
```

Verify:
- Connection name exists or fallback used
- `isSSH: true` is set
- `sshConnectionId` is assigned

### Problem: Workspace Name Shows "undefined"

**Step 1**: Check connection data in log
```bash
grep "Connection data" ~/.swarm-ide/debug-logs/terminal-debug-*.log | tail -5
```

Look for:
- `connectionName: "Clover4"` = Good
- `connectionName: undefined` or `connectionName: null` = Problem

**Step 2**: Check computed workspace name
```bash
grep "Computed workspace name" ~/.swarm-ide/debug-logs/terminal-debug-*.log | tail -5
```

Should show:
- `connectionNameUsed: "Clover4"` or `connectionNameUsed: "fallback to host"`

**Fix Applied**: Code now uses `connection.name || connection.host` as fallback

---

## 🐛 Common Issues & Solutions

### Issue 1: Terminal Always Creates Locally

**Symptoms:**
- Tab shows "bash" instead of "ssh"
- No lock icon
- No blue coloring
- Debug log shows: `Defaulting to LOCAL terminal`

**Root Causes:**
1. Workspace `isSSH` property not set
2. Workspace `sshConnectionId` missing
3. Workspace not activated

**Solution:**
```javascript
// Ensure workspace has these properties:
workspace.isSSH = true;
workspace.sshConnectionId = "ssh_xxx";
```

**Verification in Log:**
```
[WORKSPACE] ✅ Workspace configured as SSH
            Data: {
              "isSSH": true,
              "sshConnectionId": "ssh_xxx"
            }
```

### Issue 2: Workspace Name is "undefined - folder"

**Symptoms:**
- Workspace shows "undefined - root" in workspace panel
- Debug log shows: `connectionName: undefined`

**Root Cause:**
SSH connection config missing `name` property

**Solution:**
Code now uses fallback: `connection.name || connection.host`

**Verification in Log:**
```
[WORKSPACE] Computed workspace name
            Data: {
              "workspaceName": "155.138.218.159 - root",
              "connectionNameUsed": "fallback to host"
            }
```

### Issue 3: Tab Not Showing Blue Color

**Symptoms:**
- Terminal is SSH (log confirms)
- Tab text is white/gray instead of blue
- No lock icon

**Root Cause:**
CSS not loaded or class not applied

**Solution:**
1. Verify styles.css included in bundle
2. Check tab has `terminal-tab-ssh` class:
```bash
grep "terminal-tab-ssh" ~/.swarm-ide/debug-logs/terminal-debug-*.log
```

**Verification in Log:**
```
[TERMINAL] Creating tab
           Data: {
             "connectionType": "ssh",
             "isSSH": true
           }
```

---

## 📊 Debug Log Sections

### Section: APPLICATION STARTUP
- Log file path
- Initial setup

### Section: CREATE TERMINAL CALLED
- Terminal creation request
- Options provided
- Auto-detection logic
- Active workspace check
- Terminal type decision

### Section: WORKSPACE CREATION
- Connection data
- Workspace name computation
- SSH URI construction
- Workspace object creation
- isSSH property setting

---

## 🔧 Developer Notes

### Adding More Logging

```javascript
// Terminal-related logging
debugLogger.terminal('Message here', { data });

// Workspace-related logging
debugLogger.workspace('Message here', { data });

// SSH-related logging
debugLogger.ssh('Message here', { data });

// Error logging
debugLogger.error('Message here', errorObject);

// Section headers
debugLogger.section('SECTION TITLE');

// Separators
debugLogger.separator();
```

### Log File Rotation

- New log file created on each application start
- Old logs are kept (manual cleanup required)
- Location: `~/.swarm-ide/debug-logs/`

### Performance Impact

- Minimal (synchronous file writes)
- Only active during development/debugging
- Can be disabled by commenting out debugLogger calls

---

## ✅ Testing Checklist

Use this checklist with debug logging:

### Test 1: SSH Connection & Workspace Creation
1. Start application
2. Note debug log file path from console
3. Connect to SSH server
4. Select remote folder
5. Check log for:
   ```bash
   grep "WORKSPACE CREATION" -A 100 [log-file]
   ```
6. Verify:
   - ✅ Connection name exists or fallback used
   - ✅ Workspace name computed correctly
   - ✅ `isSSH: true` is set
   - ✅ `sshConnectionId` assigned

### Test 2: Terminal Auto-Detection
1. In SSH workspace, click "New Terminal"
2. Check log:
   ```bash
   grep "CREATE TERMINAL" -A 50 [log-file]
   ```
3. Verify:
   - ✅ "Auto-detected SSH workspace" message
   - ✅ Active workspace has `isSSH: true`
   - ✅ `connectionType: "ssh"` selected
   - ✅ Tab shows 🔒 icon
   - ✅ Tab has blue color

### Test 3: Visual Indicators
1. Create SSH terminal
2. Create local terminal (switch to local workspace first)
3. Compare tabs:
   - SSH tab: 🔒 + blue color
   - Local tab: no icon + gray color
4. Hover over each:
   - SSH: blue tint
   - Local: white tint

---

## 🎉 Summary of Changes

### Files Created (1)
- `src/utils/DebugLogger.js` - File-based logging utility

### Files Modified (3)
1. **src/components/terminal/TerminalPanel.js**
   - Added debug logger import
   - Extensive logging in `createTerminal()`
   - SSH indicator icon in tabs
   - `terminal-tab-ssh` class for SSH tabs

2. **src/renderer.js**
   - Added debug logger import
   - Console message with log file path
   - Extensive workspace creation logging
   - Explicit `workspace.isSSH = true` assignment
   - Fallback for undefined connection name

3. **styles.css**
   - SSH terminal tab styling
   - Blue color scheme for SSH tabs
   - Lock icon styling
   - Hover effects

### Features Added
- ✅ File-based debug logging
- ✅ Visual SSH terminal indicators (🔒 + blue)
- ✅ Explicit workspace `isSSH` property
- ✅ Connection name fallback handling
- ✅ Comprehensive troubleshooting logs

---

**Debug log files are your friend!** Check them first when troubleshooting terminal issues.
