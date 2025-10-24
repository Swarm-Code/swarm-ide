# Terminal Persistence Test Plan

## Overview

This document outlines comprehensive manual tests to verify that terminals persist across workspace switches. The test plan covers basic functionality, edge cases, and performance characteristics.

## Test Environment Setup

### Prerequisites
1. Swarm IDE running with npm (dev mode preferred for logs)
2. At least 2 workspaces created
3. Terminal access to run commands
4. Browser console open (F12) to monitor logs

### Test Workspace Structure

**Workspace 1: "Backend"**
- Terminal 1: Long-running process
- Terminal 2: Build process
- Text Editor: Open a file

**Workspace 2: "Frontend"**
- Terminal 1: Different long-running process
- Text Editor: Open a different file

---

## Test Cases

### Test 1: Basic Terminal Persistence (CRITICAL)

**Objective:** Verify that a running terminal process continues while workspace is hidden

**Steps:**
1. In Workspace 1 "Backend", Terminal 1
2. Run: `while true; do echo "$(date): Running..."; sleep 2; done`
3. Observe output flowing (timestamp updates every 2 seconds)
4. Switch to Workspace 2 "Frontend" (click workspace tab)
5. Wait 5 seconds
6. Switch back to Workspace 1 "Backend"
7. Observe Terminal 1 with the same process

**Expected Result:** ✅
- Process continues running while workspace hidden
- Timestamps show process ran during switch (~5+ seconds of outputs missing)
- When you return, old output still visible in scrollback
- Process still active, continuing from where it left off

**Failure Indicators:** ❌
- Process output stops when switching away
- Terminal reconnects when switching back
- Scrollback history lost
- Process died (bash prompt appears)

---

### Test 2: Multiple Terminals in One Workspace

**Objective:** Verify multiple terminals persist simultaneously

**Steps:**
1. In Workspace 1, Terminal 1: `while true; do echo "Term1: $(date)"; sleep 3; done`
2. Switch to Terminal 2 in same workspace
3. Terminal 2: `for i in {1..10}; do echo "Term2 iteration $i"; sleep 5; done`
4. Switch back to Terminal 1 (click its tab)
5. Observe Terminal 1 output
6. Wait 5 seconds
7. Switch to Workspace 2
8. Wait 10 seconds
9. Switch back to Workspace 1
10. Click Terminal 2 tab
11. Observe Terminal 2 output

**Expected Result:** ✅
- Terminal 1 continued updating during hidden time
- Terminal 2 continued its loop during hidden time
- Both show accurate accumulated output
- Terminal 1 shows ~3-4 additional lines (wait time / sleep interval)
- Terminal 2 shows progress beyond where we left it

**Failure Indicators:** ❌
- Terminals don't show output for the time they were hidden
- Terminals reconnected or restarted
- Tab switching doesn't work properly

---

### Test 3: SSH Terminal Persistence

**Objective:** Verify SSH connections remain open during workspace switch

**Prerequisites:** Access to an SSH server

**Steps:**
1. In Workspace 1, Terminal 1
2. SSH to remote: `ssh user@remote-server`
3. Run: `tail -f /var/log/syslog` (or similar log file)
4. Observe log entries flowing
5. Switch to Workspace 2
6. Wait 10 seconds
7. Switch back to Workspace 1
8. Observe SSH still connected with continued log entries

**Expected Result:** ✅
- SSH connection stays open (no "Connection refused" or "broken pipe")
- Log entries continue streaming
- Tail process still running
- New log entries visible from the 10 seconds you were away

**Failure Indicators:** ❌
- SSH connection closed ("Connection reset by peer")
- Need to reconnect manually
- Tail process stopped
- No new log entries after return

---

### Test 4: Text Editor State Persistence

**Objective:** Verify text editors maintain state during workspace switch

**Steps:**
1. In Workspace 1, open text editor with a file
2. Make some changes but don't save (should show unsaved indicator)
3. Click in the middle of the file
4. Switch to Workspace 2
5. Make changes in Workspace 2's editor
6. Switch back to Workspace 1

**Expected Result:** ✅
- File in Workspace 1 still shows unsaved changes (not saved)
- Cursor position preserved
- Undo stack preserved (can undo back to original state)
- Scroll position maintained

**Failure Indicators:** ❌
- Changes lost
- File shows as saved
- Cursor at wrong position
- Scroll position reset

---

### Test 5: Performance: Workspace Switch Duration

**Objective:** Measure workspace switch performance

**Steps:**
1. Open browser console (F12 → Console tab)
2. Clear console
3. Create 3 workspaces each with 3-4 terminals
4. In each terminal, start a process: `while true; do date; sleep 1; done`
5. Click to switch between workspaces, observe console logs
6. Note timing of "Active workspace set" messages

**Expected Result:** ✅
- Workspace switch completes in < 200ms
- Logs show performance metrics like:
  ```
  Active workspace set: workspace-2 {
    performanceMetrics: {
      showPanesDuration: "45.3ms",
      totalSwitchDuration: "78.2ms"
    }
  }
  ```
- Consistent performance across multiple switches

**Failure Indicators:** ❌
- Switch takes > 500ms
- Stuttering/lag during switch
- High CPU usage during switch
- Processes interrupt

---

### Test 6: Long-Running Build Process

**Objective:** Verify build processes continue in background

**Steps:**
1. In Workspace 1, Terminal 1
2. Start a long build: `npm run build` (or similar 30+ second command)
3. Observe build output starting
4. Switch to Workspace 2
5. Work on Workspace 2 for 20-30 seconds
6. Check Workspace 1 Terminal 1

**Expected Result:** ✅
- Build continued while you worked in Workspace 2
- Build either finished or progressed significantly
- All build output preserved
- No build interruption or restart

**Failure Indicators:** ❌
- Build stopped when switched away
- Build restarted when returning
- Build output missing
- Build failed unexpectedly

---

### Test 7: Database/Server Process Persistence

**Objective:** Verify long-lived service processes persist

**Steps:**
1. In Workspace 1, Terminal 1
2. Start a service: `npm run server` or `python -m http.server 8080`
3. Observe server startup messages
4. Switch to Workspace 2
5. Open another terminal and test the service:
   - `curl http://localhost:8080/health` or similar
6. Service responds ✓
7. Return to Workspace 1

**Expected Result:** ✅
- Service continued running while workspace hidden
- Service responds to requests from other terminal
- No errors in server logs
- All accumulated logs visible

**Failure Indicators:** ❌
- Service crashed while hidden
- Service doesn't respond
- Connection refused
- Port already in use error (process restarted)

---

### Test 8: Multiple Workspace Switching (Stress Test)

**Objective:** Verify system handles rapid workspace switching

**Steps:**
1. Create 3+ workspaces with terminals running processes
2. Rapidly click between workspace tabs (5+ rapid switches)
3. Observe each workspace when you return
4. Watch browser console for errors

**Expected Result:** ✅
- All workspace switches complete
- No errors in console
- No processes killed/restarted
- All output preserved
- UI responsive

**Failure Indicators:** ❌
- Workspace switch fails or hangs
- Console shows errors
- Processes restart/crash
- UI becomes unresponsive
- Terminal output corrupted

---

### Test 9: Terminal with Long Output Buffer

**Objective:** Verify large output buffers don't cause issues

**Steps:**
1. In Workspace 1, Terminal 1
2. Generate lots of output: `for i in {1..10000}; do echo "Line $i"; done`
3. Wait for output to complete
4. Scroll back to verify all lines
5. Switch to Workspace 2
6. Switch back to Workspace 1
7. Scroll back to verify output still there

**Expected Result:** ✅
- All 10,000 lines present in scrollback
- No performance degradation
- Switch still fast (< 200ms)
- Scrollback responsive

**Failure Indicators:** ❌
- Some output lost
- Terminal sluggish/slow
- Switch takes too long
- Scrollback performance bad

---

### Test 10: Application Reload Persistence

**Objective:** Verify workspaces restore on app reload

**Steps:**
1. Setup Workspace 1 with running process in Terminal 1
2. Setup Workspace 2 with different process
3. Make workspace switch active: be in Workspace 1
4. Note the terminal process and any unsaved files
5. Reload Swarm IDE (F5 or Ctrl+R)
6. Wait for app to fully load
7. Check which workspace loads
8. Check if Terminal 1 shows running process

**Expected Result:** ✅
- Workspace 1 loads (last active)
- Terminal process shows in history
- Can see accumulated output
- Unsaved file changes preserved

**Failure Indicators:** ❌
- Workspace doesn't restore
- Terminal is gone
- Output history lost
- Changes saved (shouldn't be)

---

## Performance Benchmarks

### Expected Timing

| Operation | Expected Duration | Maximum Acceptable |
|-----------|------------------|-------------------|
| Workspace switch | 50-150ms | < 300ms |
| Hide panes | 5-20ms | < 100ms |
| Show panes | 20-80ms | < 150ms |
| Terminal fit/resize | 10-40ms | < 100ms |

### System Baseline

Before running tests:
1. Note system CPU/RAM usage
2. Run workspace switches with DevTools
3. Record baseline metrics
4. Compare after running heavy tests

---

## Test Results Template

```markdown
## Test Results: [Date] [Tester]

### System Info
- OS: [Windows/Mac/Linux]
- Node: [version]
- RAM: [GB]
- CPU: [model]

### Test Summary
- Total Tests: 10
- Passed: [number]
- Failed: [number]
- Partial: [number]

### Individual Results

**Test 1: Basic Terminal Persistence**
- Status: ✅ PASS / ⚠️ PARTIAL / ❌ FAIL
- Duration: XXXms
- Notes: [observations]

[repeat for each test]

### Performance Metrics
- Average switch duration: XXXms
- Min/Max: XX/XXms
- System impact: [CPU usage changes]

### Known Issues
- [List any failures or unusual behavior]

### Recommendations
- [Suggestions for improvements]
```

---

## Debugging Tips

### If Tests Fail

1. **Check Console Logs**
   - Open DevTools: F12
   - Look for "workspaceLoad" messages
   - Check for JavaScript errors

2. **Verify DOM State**
   - Elements should have `display: none` or `display: flex`
   - Check computed styles in DevTools
   - Look for orphaned DOM nodes

3. **Monitor Terminal Process**
   - Use `ps aux | grep` to see if PTY process exists
   - Check if connection still open
   - Look for zombie processes

4. **Check Performance**
   - Use DevTools Performance tab
   - Record workspace switch
   - Identify bottlenecks in flame graph

### Key Monitoring Points

```javascript
// In browser console, check workspace state:
const wsManager = window.swarmApp.workspaceManager;
wsManager.getActiveWorkspace();           // Current workspace
wsManager.getAllWorkspaces();             // All workspaces
wsManager.workspaces.get('ws-id').paneIds // Panes in workspace
```

---

## Success Criteria

All tests pass if:
- ✅ No terminals are destroyed during workspace switches
- ✅ All output is preserved and visible after switches
- ✅ Long-running processes continue while hidden
- ✅ Workspace switches complete quickly (< 300ms)
- ✅ No errors in console
- ✅ System remains stable with multiple workspaces

---

## References

- [Terminal Persistence Guide](./TERMINAL_PERSISTENCE_GUIDE.md)
- [Workspace Architecture Analysis](./WORKSPACE_ARCHITECTURE_ANALYSIS.md)
- Source Files:
  - `src/services/WorkspaceManager.js`
  - `src/components/terminal/TerminalPanel.js`
  - `src/components/WorkspacePanel.js`
  - `styles.css`
