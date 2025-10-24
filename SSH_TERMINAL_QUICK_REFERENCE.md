# SSH Remote Terminal Architecture - Quick Reference
## Implementation Guide & Code Patterns

---

## 1. CONNECTION FLOW (High-Level)

```
1. User connects SSH
   └─ SSHConnectionManager.createConnection()
   └─ SSHConnectionManager.connect()

2. Setup server on remote
   └─ SwarmServerDeployer.ensureServerRunning()
   └─ (Uploads code, runs npm install, starts server)

3. Forward port locally
   └─ SSHConnection.setupPortForwarding()
   └─ localhost:7777 -> remotehost:7777 via SSH

4. Create terminal on server
   └─ Terminal.attach() detects SSH connection
   └─ Creates terminal via swarm-server WebSocket
   └─ Connects xterm.js client to WebSocket stream

5. I/O Streaming
   └─ User input: xterm.js -> WebSocket -> PTY
   └─ Terminal output: PTY -> WebSocket -> xterm.js
```

---

## 2. KEY FILES & THEIR ROLES

| File | Role | Key Exports |
|------|------|------------|
| `SSHConnectionManager.js` | SSH connection pooling | `connect()`, `setupPortForwarding()` |
| `SwarmServerDeployer.js` | Auto-deploy server | `ensureServerRunning()` |
| `SwarmServerManager.js` | Server communication | `createTerminal()`, `connectTerminalWebSocket()` |
| `Terminal.js` | xterm.js wrapper | `init()`, `attach()`, `write()`, `dispose()` |
| `TerminalPanel.js` | Multi-terminal UI | `createTerminal()`, `killTerminal()` |
| `server.js` (swarm-server) | HTTP/WebSocket server | REST APIs + WS streaming |
| `terminal-manager.js` (swarm-server) | PTY management | `createTerminal()`, `attachHandlers()` |

---

## 3. CRITICAL IMPLEMENTATION PATTERNS

### Pattern 1: Connection State Machine

```javascript
// Safe state transitions
const STATE = { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR }

if (connection.state === STATE.CONNECTED) {
    // Safe to use connection
}
```

**Why**: Prevents attempting operations on disconnected connections

### Pattern 2: Lazy Connection

```javascript
// Create connection object WITHOUT connecting
const id = connectionManager.createConnection(config)  // No network call

// Connect LATER when actually needed
await connectionManager.connect(id)  // Now connects
```

**Why**: Allows storing/loading connections without network latency

### Pattern 3: Multi-Client Handler Broadcasting

```javascript
// Server-side: One PTY, Multiple WebSocket clients
ptyProcess.onData((data) => {
    terminal.dataHandlers.forEach(handler => handler(data))
    // Each handler is independent WebSocket send
})

// NOT this:
// ptyProcess.onData((data) => {
//     ptyProcess.onData((data) => handler(data))  // WRONG! Re-attaches
// })
```

**Why**: Allows multiple views of same terminal, terminal recovery

### Pattern 4: Data Buffering for Race Conditions

```javascript
// During initialization
_isBufferingData = true
_initialDataBuffer = []

// Listen for data (but buffer it)
eventBus.on('terminal:data', (data) => {
    if (_isBufferingData) {
        _initialDataBuffer.push(data)
    }
})

// After terminal fully rendered
flushDataBuffer() {
    for (const data of _initialDataBuffer) {
        xterm.write(data)
    }
    _isBufferingData = false
}
```

**Why**: Prevents data loss before terminal ready

### Pattern 5: IPC Proxy for CSP Compliance

```javascript
// Renderer (restricted):
window.electronAPI.swarmServerWsConnect(url, terminalId, ...)

// Main process (no restrictions):
ipcMain.handle('swarm-server-ws-connect', async (event, url, terminalId) => {
    const ws = new WebSocket(url)  // Allowed in main process
    // Forward messages back to renderer via IPC
    ws.on('message', msg => event.sender.send('ws-message', msg))
})
```

**Why**: CSP prevents renderer from direct WebSocket to localhost

---

## 4. MESSAGE FLOW EXAMPLES

### Example 1: User Types Text

```javascript
// Client
xterm.onData((text) => {
    window.electronAPI.terminalWrite(terminalId, text)
})

// Main process
ipcMain.handle('terminal-write', (event, terminalId, text) => {
    const ws = activeWebSockets.get(terminalId)
    ws.send(JSON.stringify({ type: 'input', data: text }))
})

// Server
ws.on('message', (msg) => {
    if (msg.type === 'input') {
        terminalManager.writeToTerminal(terminalId, msg.data)
    }
})

// PTY
ptyProcess.write(text)
```

### Example 2: Terminal Produces Output

```javascript
// Server PTY
ptyProcess.onData((output) => {
    terminal.dataHandlers.forEach(handler => {
        handler(output)  // Call each client handler
    })
})

// Server-side handler
const onData = (output) => {
    ws.send(JSON.stringify({ type: 'data', data: output }))
}

// Main process receives
ws.on('message', (rawData) => {
    const msg = JSON.parse(rawData)
    event.sender.send('swarm-server-ws-message', terminalId, msg)
})

// Client receives IPC event
window.onmessage = (event) => {
    if (event.data.type === 'data') {
        terminal.write(event.data.data)
    }
}

// xterm.js renders
xterm.write(data)
```

---

## 5. COMMON ISSUES & SOLUTIONS

| Issue | Cause | Solution |
|-------|-------|----------|
| No output in terminal | Data arriving before xterm ready | Use data buffering pattern |
| Terminal too small | fit() called before DOM ready | Add 200ms delay before fit() |
| WebSocket fails to connect | CSP restriction | Use IPC proxy pattern |
| Duplicate terminal output | Multiple handlers | Track handlers in array |
| Connection hangs | No timeout set | Set readyTimeout: 20000 |
| Server doesn't start | Node.js not installed | Check `node --version` >= 18 |
| Port collision | Server port in use | Change env var SWARM_SERVER_PORT |

---

## 6. DEPLOYMENT STEPS

### Step 1: SSH Connection

```javascript
const connectionId = await sshManager.createConnection({
    host: 'remote.server.com',
    username: 'user',
    privateKey: fs.readFileSync('/path/to/key')
})

await sshManager.connect(connectionId)
```

### Step 2: Ensure Server Running

```javascript
const deployer = require('./SwarmServerDeployer')
const connection = sshManager.getConnection(connectionId)

await deployer.ensureServerRunning(connection)
// Checks running, checks Node.js, uploads code, starts if needed
```

### Step 3: Port Forward

```javascript
const forwardInfo = await connection.setupPortForwarding(7777, 7777)
// localhost:7777 now tunnels to remote:7777
```

### Step 4: Connect Server Manager

```javascript
const swarmManager = require('./SwarmServerManager')
await swarmManager.connect('http://localhost:7777', 'ssh-tunnel')
```

### Step 5: Create Workspace

```javascript
const workspace = await swarmManager.createWorkspace(
    'my-project',
    '/home/user/project',
    'local-workspace-id'
)
```

### Step 6: Create Terminal

```javascript
const terminal = await swarmManager.createTerminal(
    'local-workspace-id',
    { cols: 80, rows: 24, shell: '/bin/bash' }
)
```

### Step 7: Connect Terminal UI

```javascript
const terminalUI = new Terminal(container, {
    id: 'term-1',
    connectionType: 'ssh',
    connectionId: connectionId
})

await terminalUI.init()
await terminalUI.attach()
// Automatically detects swarm-server available
// Connects via WebSocket to streaming endpoint
```

---

## 7. TESTING CHECKLIST

- [ ] SSH connection succeeds with private key
- [ ] SSH connection succeeds with password
- [ ] SFTP file upload works
- [ ] Remote command execution works
- [ ] Node.js version check works
- [ ] Server installation completes
- [ ] Server starts without errors
- [ ] Port forwarding tunnel works
- [ ] HTTP health endpoint responds
- [ ] WebSocket connection succeeds
- [ ] Terminal output appears in xterm.js
- [ ] User input sends to PTY
- [ ] Terminal resize sends to PTY
- [ ] Multiple WebSocket clients work
- [ ] Terminal persists after client reconnect
- [ ] Server auto-shuts down on idle
- [ ] Fallback to direct SSH works

---

## 8. PERFORMANCE NOTES

| Component | Typical Duration | Notes |
|-----------|------------------|-------|
| SSH connect | < 5 seconds | Depends on network, server load |
| Server check | < 1 second | Quick curl to health endpoint |
| SFTP upload | 5-30 seconds | Depends on code size, network |
| npm install | 10-60 seconds | First time, cached after |
| Server startup | 2-5 seconds | Port binding, initialization |
| WebSocket connect | < 1 second | Local tunnel, fast |
| Terminal create | < 1 second | PTY spawn, fast |
| First render | 200-500ms | xterm.js DOM mounting |
| First data | Immediate | PTY output begins |

---

## 9. ENVIRONMENT VARIABLES

### For swarm-server

```bash
# Custom port
SWARM_SERVER_PORT=8888

# Idle shutdown (minutes)
SWARM_SERVER_IDLE_TIMEOUT=60

# Disable auto-shutdown
SWARM_SERVER_SHUTDOWN_ON_IDLE=false

# For debugging
DEBUG=*
NODE_ENV=development
```

### For SSH

```bash
# SSH key passphrase
SSH_PASSPHRASE=mypassphrase

# Preferred shell
SHELL=/bin/zsh

# Locale
LANG=en_US.UTF-8
```

---

## 10. DEBUGGING TIPS

### Enable detailed logging

```javascript
const logger = require('./utils/Logger')
logger.level = 'trace'  // Maximum verbosity
```

### Monitor SSH state

```javascript
connection.on('stateChange', (event) => {
    console.log(`SSH State: ${event.oldState} -> ${event.state}`)
})
```

### Monitor WebSocket

```javascript
// Server-side
console.log(`[Server] Data sent: ${data.length} bytes`)
console.log(`[Server] WebSocket state: ${ws.readyState}`)

// Client-side
console.log(`[Client] Data received: ${data.length} bytes`)
```

### Monitor PTY

```javascript
ptyProcess.onData((data) => {
    console.log(`[PTY] Output: ${data.substring(0, 50)}...`)
})

ptyProcess.onExit(({ exitCode }) => {
    console.log(`[PTY] Process exited: ${exitCode}`)
})
```

### Test manual WebSocket

```bash
# Server must be running
# In terminal 1:
node /tmp/.swarm-server/src/index.js

# In terminal 2:
wscat -c ws://localhost:7777/terminals/{terminalId}/stream

# Then type JSON messages
{"type":"input","data":"ls\n"}
```

---

## 11. SECURITY CONSIDERATIONS

- SSH private keys never stored on disk (loaded from config)
- Passwords never logged or stored
- WebSocket over localhost only (SSH tunnel)
- Server auto-shutdowns on idle (cleanup)
- Terminal output sanitized before transmission
- Commands validated on server before execution

---

## 12. RECOVERY PROCEDURES

### If Server Won't Start

```bash
# Check server logs
tail -f ~/.swarm-server/server.log

# Check if port in use
lsof -i :7777

# Kill existing process
pkill -f "node src/index.js"

# Manually start
cd /tmp/.swarm-server
npm install
node src/index.js
```

### If Terminal Frozen

```javascript
// Force close and recreate
await terminalUI.dispose()
await swarmManager.killTerminal(terminalId)
const newTerminal = await swarmManager.createTerminal(workspaceId, options)
```

### If SSH Disconnects

```javascript
// Auto-reconnect triggers
const connection = sshManager.getConnection(connectionId)
// Monitors heartbeat every 30s, reconnects with exponential backoff
```

---

## 13. NEXT STEPS / EXTENSIONS

Possible enhancements:

1. **Terminal Sharing**: Send terminal ID to collaborators
2. **Terminal Recording**: Record terminal session playback
3. **Terminal Search**: Search terminal history
4. **Split Terminals**: VSCode-style terminal splitting
5. **Custom Themes**: User-defined color schemes
6. **Session Recovery**: Save/restore terminal state
7. **Multiplexing**: tmux/screen like functionality
8. **SSH Agent Forwarding**: Forward SSH keys to remote
9. **VT220 Emulation**: Better terminal compatibility
10. **Performance Profiling**: Monitor CPU/Memory usage

