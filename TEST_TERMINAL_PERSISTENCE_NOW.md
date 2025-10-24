# Test Terminal Persistence NOW - Quick Start Guide

## What You're Testing

Terminal Persistence across workspace switches. When you switch workspaces:
- Terminals are **hidden**, not destroyed
- Processes keep running in the background
- When you return, the same terminal appears with continued output
- **No process restart** ✅

## 5-Minute Quick Test

### Step 1: Setup (1 min)

1. Open Swarm IDE
2. Create 2 workspaces (or use existing ones):
   - Workspace A: "Dev"
   - Workspace B: "Build"

### Step 2: Create a Running Process (1 min)

1. Go to **Workspace A**
2. Open a Terminal (Ctrl+Shift+T or menu)
3. Run this command:
   ```bash
   while true; do echo "$(date): Workspace A is running"; sleep 2; done
   ```
4. **Watch the timestamps** - you should see them updating every 2 seconds
5. Take note of the terminal ID in browser console: `window.terminalRegistry.listAll()`

### Step 3: The Switch Test (2 min)

1. Let the process run for ~10 seconds (so you see several lines)
2. **Switch to Workspace B** (click the tab)
3. You're now in Workspace B - the terminal should be hidden
4. **Wait 10-15 seconds** ⏱️
5. **Switch back to Workspace A** (click the tab)

### Step 4: Verify Persistence (1 min)

Look at the terminal. You should see:

✅ **PASS** - The same terminal content with NEW lines added
- Example: "2024-10-24 14:23:48: Workspace A is running" (from before you left)
- New lines: "2024-10-24 14:24:02: Workspace A is running" (while you were gone)
- **The process never stopped!**

❌ **FAIL** - Terminal is blank or showing only new content
- This means a new terminal was created (bug not fixed)

## Console Inspection

### In Browser DevTools Console (F12):

**Check all terminals:**
```javascript
window.terminalRegistry.listAll()
```

**Expected output:**
```javascript
[
  {
    id: "terminal-1728384228000",
    paneId: "pane-xyz-123",
    isAlive: true
  }
]
```

**The `id` should ALWAYS be the same across workspace switches!**

### Check Terminal Instance:
```javascript
const terminal = window.terminalRegistry.get('terminal-1728384228000');
console.log(terminal); // Should show Terminal instance with xterm, ptyId, etc.
```

## Full 10-Minute Test (All Scenarios)

### Scenario 1: Simple Persistence (3 min)

**Test:** Basic terminal continues running

1. Workspace A Terminal:
   ```bash
   for i in {1..100}; do echo "Line $i"; sleep 1; done
   ```
2. Switch to Workspace B after 20 seconds
3. Wait 30 seconds
4. Return to Workspace A
5. Check: Should see lines 20-50+, NOT just lines 1-20

### Scenario 2: Multiple Terminals (4 min)

**Test:** Multiple terminals in same workspace persist independently

1. Workspace A, Terminal 1:
   ```bash
   while true; do echo "Terminal 1: $(date)"; sleep 2; done
   ```

2. Create Terminal 2 in Workspace A (split pane)
   ```bash
   while true; do echo "Terminal 2: $(date)"; sleep 3; done
   ```

3. Switch to Workspace B for 10 seconds

4. Return to Workspace A

5. Check both terminals:
   - Terminal 1: Should have 5+ more lines (every 2 seconds)
   - Terminal 2: Should have 3+ more lines (every 3 seconds)
   - Both continued independently! ✅

### Scenario 3: SSH Terminal Persistence (3 min)

**Test:** SSH connections stay open

1. Workspace A Terminal:
   ```bash
   ssh user@remote-server
   ```

2. Once connected, run:
   ```bash
   echo "Connected at $(date)"
   ```

3. Switch to Workspace B for 15 seconds

4. Return to Workspace A

5. Check: Still connected (no "Connection reset"), can type commands

## Expected Console Logs

### When Opening Terminal

```
========== OPENING TERMINAL IN PANE ==========
Adding terminal tab to pane
Creating Terminal instance with tabId: tab-xyz
✓ Terminal registered in registry: terminal-1728384228000
✓ Terminal opened in pane successfully
```

### When Switching Workspaces WITH Existing Terminal

```
====== TERMINAL RESTORATION STARTING ======
Pane ID: pane-abc
Terminal ID (from data): terminal-1728384228000

✓ REUSING EXISTING TERMINAL: terminal-1728384228000
This terminal has been running in the background!

✓ Terminal fitted to pane size: terminal-1728384228000

✓ TERMINAL PERSISTENCE SUCCESSFUL - Terminal reused with existing PTY connection
====== TERMINAL RESTORATION COMPLETE ======
```

**Key phrase:** "REUSING EXISTING TERMINAL" ← This means persistence is working!

## Debugging Checklist

If persistence isn't working, check these things:

### 1. Check Console for Errors
- Open DevTools (F12)
- Look for red errors in console
- Are there "Cannot read property" errors related to terminal?

### 2. Verify Terminal Registry
```javascript
// Should show your terminal
window.terminalRegistry.listAll()

// Should NOT return null/undefined
window.terminalRegistry.get('terminal-ID-HERE')
```

### 3. Check Browser Console Logs
- Search for "REUSING EXISTING TERMINAL"
- Should see this when switching back to workspace
- If you see "CREATING NEW TERMINAL" instead → Bug in registry lookup

### 4. Check Terminal IDs
```javascript
// Open console and run this
window.swarmApp?.workspaceManager?.getActiveWorkspace()?.terminalIds

// Should show terminal IDs that match your open terminals
```

### 5. Check Pane Layout Serialization
In browser storage:
```javascript
// Check what's saved
const layout = localStorage.getItem('swarm-ide-workspaces');
console.log(JSON.parse(layout)); // Look for terminalId fields in tabs
```

## What NOT to Expect

❌ **Process saves/resumes state** - Terminal state is preserved but not the process memory
❌ **Output appears instantly** - There's a ~50-150ms delay for workspace switch
❌ **Works without PTY** - Terminal must have active PTY connection (local or SSH)

## Performance Baseline

### Normal Workspace Switch Time
- **Best case:** 50ms
- **Average:** 100-150ms
- **Worst case (slow system):** 200-300ms

If switch takes >500ms, something is wrong.

## Commit to Test Against

**Commit:** `d8b7ebc` - "Fix terminal recreation on workspace switches - implement terminal persistence registry"

To verify you're testing the right code:
```bash
git log --oneline -1
# Should show: d8b7ebc Fix terminal recreation on workspace switches...
```

## After You Test

### Report Success ✅
- Terminal IDs stayed the same
- Process output continued
- No errors in console
- Workspace switches were fast

### Report Issues ❌
- Different terminal IDs on each switch
- Process output stopped
- Console errors appeared
- Workspace switches were slow

Include this info:
- Terminal ID from `window.terminalRegistry.listAll()`
- Console logs (copy the "====== TERMINAL RESTORATION ======" section)
- Error messages if any
- What you expected vs what you saw

---

**Ready? Start with the 5-minute quick test above!** 🚀

Go to Workspace A, run the while loop, switch to B, wait, come back to A, and verify the timestamps show continued execution!
