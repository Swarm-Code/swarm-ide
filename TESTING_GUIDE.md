# Swarm Server Integration - Testing Guide

## Overview

This guide provides step-by-step instructions for testing the complete swarm-server integration with Swarm IDE. Follow these steps to verify that SSH terminals are created with the correct working directory on remote machines.

---

## Prerequisites

### Local Machine (Swarm IDE Client)
- ✅ Swarm IDE installed and working
- ✅ All swarm-server integration code implemented
- ✅ SSH client available
- ✅ Access to a remote SSH server

### Remote Machine (SSH Server)
- SSH server running and accessible
- Node.js v18+ installed
- Sufficient permissions to install packages and run services
- Network connectivity to local machine

---

## Phase 1: Deploy Swarm Server to Remote Machine

### Step 1.1: Install Node.js (if not already installed)

```bash
# For Ubuntu/Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# For RHEL/CentOS/Fedora
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# For Arch Linux
sudo pacman -S nodejs npm

# Verify installation
node --version  # Should show v18 or higher
npm --version
```

### Step 1.2: Copy Swarm Server to Remote

**Option A: Using SCP**
```bash
# From your local machine
cd /home/alejandro/Swarm/swarm-ide
tar czf swarm-server.tar.gz swarm-server/
scp swarm-server.tar.gz user@remote-host:/tmp/

# On remote machine
ssh user@remote-host
cd /opt
sudo mkdir -p swarm-server
sudo tar xzf /tmp/swarm-server.tar.gz -C /opt/
sudo chown -R $USER:$USER /opt/swarm-server
```

**Option B: Using Git (if you have a repo)**
```bash
ssh user@remote-host
cd /opt
sudo git clone https://github.com/your-repo/swarm-ide.git
cd swarm-ide/swarm-server
```

### Step 1.3: Install Dependencies

```bash
ssh user@remote-host
cd /opt/swarm-server
npm install
```

**Expected output:**
```
added 359 packages, and audited 360 packages in 23s
found 0 vulnerabilities
```

### Step 1.4: Make CLI Executable

```bash
chmod +x bin/swarm-server.js
chmod +x src/index.js

# Optional: Create symlink for global access
sudo ln -s /opt/swarm-server/bin/swarm-server.js /usr/local/bin/swarm-server
```

### Step 1.5: Start Swarm Server

```bash
cd /opt/swarm-server
swarm-server start
```

**Expected output:**
```
🚀 Starting Swarm Server...
✅ Swarm Server started (PID: 12345)
   Logs: /home/user/.swarm-server/swarm-server.log
   Status: swarm-server status
```

### Step 1.6: Verify Server is Running

```bash
swarm-server status
```

**Expected output:**
```
Status: 🟢 Running (PID: 12345)
Logs:   /home/user/.swarm-server/swarm-server.log

Recent logs:
─────────────────────────────────────────
[2025-10-22T...] [INFO] ===================================
[2025-10-22T...] [INFO]    Swarm Server v1.0.0
[2025-10-22T...] [INFO] ===================================
[2025-10-22T...] [INFO] WebSocket server initialized
[2025-10-22T...] [INFO] ✅ Swarm Server started on port 7777
```

### Step 1.7: Test Local Access (on remote machine)

```bash
curl http://localhost:7777/health
```

**Expected output:**
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 12.345
}
```

---

## Phase 2: Configure SSH Connection in Swarm IDE

### Step 2.1: Open Swarm IDE

```bash
cd /home/alejandro/Swarm/swarm-ide
npm start
```

### Step 2.2: Add SSH Connection

1. Click SSH icon in sidebar (or use menu)
2. Click "Add SSH Connection"
3. Enter connection details:
   - **Host**: Your remote server hostname or IP
   - **Port**: 22 (or your SSH port)
   - **Username**: Your SSH username
   - **Authentication**: Choose password or key-based
   - **Name**: e.g., "Test Remote Server"

4. Click "Connect" or "Save and Connect"

**Expected behavior:**
- Connection dialog should close
- You should see connection in SSH connections list

---

## Phase 3: End-to-End Testing

### Test 3.1: SSH Connection and Port Forwarding

**Action**: Click "Connect" on your SSH connection

**Expected behavior:**
1. SSH connection establishes
2. Console logs show:
   ```
   [SSH] Connected to remote-host:22 as username
   [SSH] Port forwarding established for conn_xxx: localhost:7777 -> remote-host:7777
   [SSH] Connected to swarm-server via SSH tunnel
   ```

3. Remote folder picker dialog appears showing remote directories

**Verification:**
- Check Swarm IDE console (F12) for port forwarding messages
- Verify no errors about swarm-server connection

**If this fails:**
- Check remote server: `swarm-server status`
- Verify firewall allows port 7777 (local access only)
- Check SSH connection is stable

### Test 3.2: Workspace Creation

**Action**: In the remote folder picker dialog:
1. Navigate to a test directory (e.g., `/var/www/html` or `/home/user/projects`)
2. Select a folder
3. Click "Select" or "OK"

**Expected behavior:**
1. Dialog closes
2. Workspace is created with name like "remote-host - projects"
3. File explorer shows remote files
4. Console logs show:
   ```
   [SSH] Created SSH workspace: remote-host - projects (ws_xxx)
   [SSH] Created server workspace: ws_yyy (remote path: /home/user/projects)
   ```

**Verification:**
- File explorer shows correct remote directory contents
- Workspace name appears in workspace list
- No error notifications

**If this fails:**
- Check file explorer for error messages
- Verify remote path exists and is accessible
- Check swarm-server logs: `swarm-server status`

### Test 3.3: Terminal Creation - THE CRITICAL TEST

**Action**:
1. With SSH workspace active, create a new terminal:
   - Press `` Ctrl+` `` OR
   - Click terminal icon OR
   - Menu: View → Terminal

**Expected behavior:**
1. Terminal opens
2. Console logs show:
   ```
   [terminal] Using swarm-server for SSH terminal creation
   [terminal] Swarm-server terminal created: term_xxx
   [terminal] WebSocket connected for terminal: term_xxx
   ```

3. Terminal displays prompt (may take 1-2 seconds)

**Verification - THE MOMENT OF TRUTH:**

Type in the terminal:
```bash
pwd
```

**EXPECTED RESULT:**
```bash
/home/user/projects  # Or whatever directory you selected in Step 3.2
```

**NOT THIS (old broken behavior):**
```bash
/home/user  # Home directory - WRONG!
```

If `pwd` shows the **correct workspace directory**, the integration is working! ✅

**Additional verification commands:**
```bash
# List files - should match file explorer
ls -la

# Show current directory with full path
readlink -f .

# Create a test file (verify it appears in file explorer)
touch swarm-test-file.txt
# Check file explorer - should see swarm-test-file.txt

# Clean up
rm swarm-test-file.txt
```

### Test 3.4: Terminal I/O Testing

**Action**: Test various terminal operations

```bash
# Test command execution
echo "Hello from swarm-server!"

# Test multiline commands
for i in 1 2 3; do
  echo "Line $i"
done

# Test interactive command
top
# Press 'q' to quit

# Test color output
ls --color=auto

# Test special characters
echo "Test: !@#$%^&*()"
```

**Expected behavior:**
- All commands execute normally
- Output displays correctly with colors
- Special characters work
- No lag or stuttering

### Test 3.5: Terminal Resize

**Action**:
1. Resize terminal panel by dragging edges
2. Watch terminal content reflow

**Expected behavior:**
- Terminal content adjusts to new size
- No visual glitches or corruption
- Console shows resize messages:
  ```
  [terminal] Terminal resized: 120x30
  ```

### Test 3.6: Multiple Terminals

**Action**:
1. Create 2-3 terminals in the SSH workspace
2. Type `pwd` in each

**Expected behavior:**
- Each terminal shows **same working directory** (the workspace path)
- Tabs show terminal numbers correctly
- Can switch between terminals
- All terminals work independently

**Verification:**
```bash
# In Terminal 1
pwd
touch test1.txt

# In Terminal 2
pwd
ls test1.txt  # Should see the file created in Terminal 1

# In Terminal 3
pwd
rm test1.txt
```

### Test 3.7: Terminal Persistence (Optional)

**Action**:
1. Create terminal
2. Run a long command: `sleep 120`
3. Close Swarm IDE (not the terminal, the whole app)
4. Reopen Swarm IDE
5. Reconnect to SSH

**Expected behavior:**
- After reconnect, previous terminal session still exists on server
- Can reconnect to existing terminal (if reconnection implemented)
- New terminal in same workspace still uses correct directory

**Note:** Full session persistence requires additional implementation.

### Test 3.8: Cleanup and Disposal

**Action**:
1. Create a terminal
2. Close the terminal tab (X button)

**Expected behavior:**
- Terminal closes without errors
- Console logs show:
  ```
  [terminal] Disposing terminal: terminal-xxx
  [terminal] Swarm-server terminal closed: term_xxx
  ```
- Server terminal is killed on remote machine

**Verification on remote:**
```bash
# Check swarm-server logs
swarm-server status
# Should show terminal exit message
```

---

## Phase 4: Troubleshooting

### Issue: "Failed to setup port forwarding"

**Symptoms:**
- Error dialog: "Failed to setup port forwarding: ..."
- No workspace creation dialog

**Diagnosis:**
```bash
# Check SSH connection
ssh user@remote-host

# Check swarm-server is running
ssh user@remote-host 'swarm-server status'
```

**Solutions:**
1. Ensure swarm-server is running on remote: `ssh user@remote-host 'swarm-server start'`
2. Check SSH connection is stable
3. Verify no firewall blocking SSH

### Issue: "Failed to connect to swarm-server"

**Symptoms:**
- Error dialog: "Failed to connect to swarm-server: ..."
- Port forwarding succeeded but server connection failed

**Diagnosis:**
```bash
# On remote machine
swarm-server status

# Check if port 7777 is listening
netstat -tlnp | grep 7777
# Should show: tcp  0.0.0.0:7777  LISTEN  <PID>/node

# Test local access
curl http://localhost:7777/health
```

**Solutions:**
1. Restart swarm-server: `swarm-server restart`
2. Check logs: `tail -f ~/.swarm-server/swarm-server.log`
3. Verify Node.js version: `node --version` (must be v18+)
4. Check for permission issues

### Issue: Terminal opens but shows home directory (not workspace directory)

**Symptoms:**
- Terminal works but `pwd` shows `/home/user` instead of workspace path
- Means falling back to old direct SSH method

**Diagnosis:**
- Check console logs for "Using swarm-server" vs "Swarm-server not connected"

**Solutions:**
1. Verify swarm-server connection in console
2. Check SwarmServerManager.isServerConnected() returns true
3. Ensure workspace was created on server:
   ```bash
   # On remote, check swarm-server data
   cat ~/.swarm-server/data/workspaces.json
   # Should show your workspace
   ```

### Issue: Terminal shows no output or hangs

**Symptoms:**
- Terminal opens but shows blank
- No prompt appears
- Commands don't execute

**Diagnosis:**
- Check WebSocket connection in console (F12 Network tab)
- Check swarm-server logs for WebSocket errors

**Solutions:**
1. Restart swarm-server
2. Disconnect and reconnect SSH
3. Create new terminal
4. Check for WebSocket errors in browser console

### Issue: "Workspace not found" when creating terminal

**Symptoms:**
- Error: "No active workspace found for swarm-server terminal"
- Terminal creation fails

**Diagnosis:**
- Check if workspace is actually active
- Verify workspace.isSSH is set
- Check workspace mapping in SwarmServerManager

**Solutions:**
1. Reactivate workspace by clicking it in workspace list
2. Disconnect and reconnect SSH to recreate workspace
3. Check workspace data: `WorkspaceManager.getActiveWorkspace()`

### Issue: WebSocket connection fails

**Symptoms:**
- Terminal created but no I/O
- Console shows WebSocket errors

**Diagnosis:**
```javascript
// In browser console
window.api.sshSetupPortForwarding  // Check if defined
// Try manual WebSocket test
const ws = new WebSocket('ws://localhost:7777/terminals/test/stream');
ws.onopen = () => console.log('WS OPEN');
ws.onerror = (e) => console.log('WS ERROR', e);
```

**Solutions:**
1. Verify port forwarding is active
2. Check for browser WebSocket restrictions
3. Ensure swarm-server WebSocket server is running
4. Check for conflicting ports

---

## Phase 5: Performance and Stability Testing

### Test 5.1: Large Output

```bash
# Generate large output
cat /var/log/syslog
# OR
find / -name "*.log" 2>/dev/null

# Test with streaming output
tail -f /var/log/syslog
# Press Ctrl+C to stop
```

**Expected**: No lag, output streams smoothly

### Test 5.2: Rapid Input

```bash
# Type rapidly, paste large text
cat > test.txt
# Paste a large block of code or text
# Press Ctrl+D

# Verify no input loss
cat test.txt
rm test.txt
```

**Expected**: All input captured correctly

### Test 5.3: Long-Running Commands

```bash
# Start long process
sleep 300 &

# List background jobs
jobs

# Check process still running
ps aux | grep sleep
```

**Expected**: Process runs in background correctly

### Test 5.4: Connection Resilience

**Action**:
1. Create terminal
2. Pause VM or simulate network hiccup
3. Resume connection

**Expected**: Terminal shows disconnect/reconnect behavior gracefully

---

## Phase 6: Regression Testing

Verify existing functionality still works:

### Test 6.1: Local Terminals

**Action**: Create a local (non-SSH) terminal

**Expected**:
- Local terminal works normally
- Uses direct PTY, not swarm-server
- Console shows "Creating LOCAL terminal"

### Test 6.2: Direct SSH (No Swarm Server)

**Action**:
1. Stop swarm-server on remote: `ssh user@remote 'swarm-server stop'`
2. Connect to SSH
3. Try to create workspace/terminal

**Expected**:
- Port forwarding fails OR server connection fails
- System falls back to direct SSH method
- Terminal created with old `cd` command approach
- Terminal works but may not have correct directory (known limitation)

### Test 6.3: Multiple SSH Connections

**Action**:
1. Add 2 different SSH connections
2. Connect to both
3. Create workspace in each
4. Create terminal in each

**Expected**:
- Each connection has its own port forwarding
- Workspaces are independent
- Terminals work correctly in their respective workspaces

---

## Success Criteria

✅ **Phase 1 PASS if:**
- Swarm-server starts without errors
- Health endpoint responds
- Server logs show initialization

✅ **Phase 2 PASS if:**
- SSH connection succeeds
- No connection errors
- Connection appears in list

✅ **Phase 3 PASS if:**
- Port forwarding established
- Server connection successful
- Workspace created on both client and server
- File explorer shows remote files
- **Terminal `pwd` shows workspace directory (CRITICAL)**
- Terminal I/O works correctly
- Resize works
- Multiple terminals work
- Cleanup works

✅ **COMPLETE SUCCESS:**
All tests pass AND terminal shows correct working directory on first try!

---

## Next Steps After Successful Testing

1. **Document findings**: Note any issues or edge cases discovered
2. **Performance tuning**: Optimize if needed
3. **Security review**: Audit authentication and connection security
4. **User documentation**: Update user guides with SSH workflow
5. **Deployment automation**: Create installation scripts
6. **Monitoring**: Add logging and diagnostics
7. **Additional features**:
   - Terminal reconnection after disconnect
   - Auto-install swarm-server on first connect
   - Multiple workspaces per SSH connection

---

## Quick Reference Commands

### Remote Server
```bash
# Start server
swarm-server start

# Check status
swarm-server status

# View logs
tail -f ~/.swarm-server/swarm-server.log

# Stop server
swarm-server stop

# Restart server
swarm-server restart
```

### Local Machine (in terminal)
```bash
# Start Swarm IDE
cd /home/alejandro/Swarm/swarm-ide
npm start

# View console logs
# Press F12 in Swarm IDE window

# Test SSH connection
ssh user@remote-host
```

### Debugging
```bash
# Check what terminals are running on server
ssh user@remote 'cat ~/.swarm-server/data/workspaces.json'

# Check port forwarding
netstat -an | grep 7777

# Check swarm-server process
ssh user@remote 'ps aux | grep swarm-server'
```

---

## Contact and Support

If you encounter issues not covered in this guide:

1. Check server logs: `~/.swarm-server/swarm-server.log`
2. Check browser console (F12) for client errors
3. Review `SWARM_SERVER_INTEGRATION_COMPLETE.md` for architecture details
4. File a GitHub issue with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Relevant log excerpts
   - Environment details (OS, Node.js version, etc.)

---

**Last Updated**: 2025-10-22
**Version**: 1.0.0
**Author**: Swarm IDE Development Team
