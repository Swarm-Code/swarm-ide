# SSH Remote Server & Terminal Streaming Architecture Analysis
## Claude Code Implementation Review (Swarm IDE)

---

## Executive Summary

Based on analysis of the Swarm IDE codebase (which implements Claude Code patterns), the architecture uses:

1. **SSH Connection Management**: Node SSH for remote host connection and SFTP operations
2. **Server Deployment**: Automatic server bootstrap via SSH to remote hosts
3. **Terminal Management**: Node-pty for PTY processes, optionally proxied through remote swarm-server
4. **Communication**: WebSocket streaming for real-time I/O with fallback to direct SSH terminal I/O
5. **Architecture**: Multi-layer approach with IPC proxy pattern in Electron main process

---

## 1. SSH SERVER DEPLOYMENT & MANAGEMENT

### 1.1 SSH Connection Lifecycle

**File**: `/home/alejandro/Swarm/swarm-ide/src/services/SSHConnectionManager.js`

#### Connection Pooling Pattern
```javascript
class SSHConnectionManager {
    // Manages pool of SSH connections
    connections = new Map()  // connectionId -> SSHConnection
    
    // Each connection has lifecycle states
    CONNECTION_STATES = {
        DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR
    }
}
```

#### Key Initialization Sequence
1. **Connection Creation**: `createConnection(connectionConfig)`
   - Generates unique connectionId
   - Stores configuration (host, port, username, auth)
   - Does NOT connect yet (lazy connection)

2. **Connection Establishment**: `connect(connectionId)`
   - Uses `NodeSSH` library from `node-ssh` package
   - Supports both password and private key authentication
   - Negotiates SSH algorithms (kex, cipher, hmac)
   - Sets readyTimeout to 20 seconds

3. **SFTP Initialization**: `initializeSFTP()`
   - Called automatically after SSH connection succeeds
   - Enables file transfer capabilities for server deployment

### 1.2 Authentication Methods

```javascript
// Private Key (preferred)
connectConfig.privateKey = this.config.privateKey
connectConfig.passphrase = this.config.passphrase  // if encrypted

// Or Password
connectConfig.password = this.config.password
```

### 1.3 Connection Health Management

**Heartbeat Pattern** (Every 30 seconds)
```javascript
startHeartbeat() {
    setInterval(async () => {
        await this.ssh.execCommand('echo "heartbeat"')
    }, 30000)
}
```

**Reconnection with Exponential Backoff**
```javascript
async reconnect() {
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s max
    const delay = Math.min(
        this.reconnectDelay * Math.pow(2, attemptNumber),
        30000
    )
}
```

### 1.4 Port Forwarding for Server Access

**Critical Feature**: SSH tunnel for accessing remote swarm-server

```javascript
async setupPortForwarding(localPort = 7777, remotePort = 7777) {
    // Creates local TCP server that tunnels through SSH
    const server = net.createServer((clientSocket) => {
        this.ssh.connection.forwardOut(
            '127.0.0.1',  // Local source
            localPort,    
            '127.0.0.1',  // Remote destination (on SSH host)
            remotePort,   
            (err, stream) => {
                // Bidirectional pipe: local socket <-> SSH tunnel <-> remote port
                clientSocket.pipe(stream).pipe(clientSocket)
            }
        )
    })
    
    server.listen(localPort, '127.0.0.1')
}
```

**Use Case**: Client connects to `localhost:7777`, which automatically tunnels to `remotehost:7777` via SSH

---

## 2. REMOTE SERVER DEPLOYMENT

### 2.1 Server Deployment Strategy

**File**: `/home/alejandro/Swarm/swarm-ide/src/services/SwarmServerDeployer.js`

This implements a **VSCode Remote-SSH inspired** server bootstrap:

#### Deployment Sequence
```
1. Check if server already running (health check via curl)
2. Check if Node.js installed (version >= 18)
3. Check if server code installed
4. If not installed: Upload via SFTP and npm install
5. Start server with nohup
6. Verify startup with health check
```

#### Key Implementation Details

**1. Server Running Check**
```javascript
async checkServerRunning(sshConnection) {
    const result = await sshConnection.ssh.execCommand(
        'curl -s http://localhost:7777/health || echo "FAILED"'
    )
    
    return result.stdout && result.stdout.includes('"status":"ok"')
}
```

**2. Node.js Verification**
```javascript
async checkNodeInstalled(sshConnection) {
    const result = await sshConnection.ssh.execCommand('node --version')
    
    // Must be >= v18
    const majorVersion = parseInt(version.replace('v', '').split('.')[0])
    return majorVersion >= 18
}
```

**3. Server Installation via SFTP**
```javascript
async installServer(sshConnection) {
    // 1. Create remote directory
    await sshConnection.ssh.execCommand(`mkdir -p /tmp/.swarm-server`)
    
    // 2. Get SFTP client
    const sftp = await sshConnection.ssh.requestSFTP()
    
    // 3. Upload entire server directory (skip node_modules)
    await this.uploadDirectory(sftp, localPath, remotePath)
    
    // 4. Install npm dependencies
    await sshConnection.ssh.execCommand(
        `cd /tmp/.swarm-server && npm install --production`
    )
    
    // 5. Make executable
    await sshConnection.ssh.execCommand(
        `chmod +x /tmp/.swarm-server/bin/swarm-server.js`
    )
}
```

**4. Server Startup**
```javascript
async startServer(sshConnection) {
    // Background execution with nohup
    const startCmd = `cd /tmp/.swarm-server && nohup node src/index.js > ~/.swarm-server/server.log 2>&1 &`
    
    await sshConnection.ssh.execCommand(startCmd)
}
```

### 2.2 Server Lifecycle

**File**: `/home/alejandro/Swarm/swarm-ide/swarm-server/src/index.js`

```javascript
// Environment-controlled configuration
const PORT = process.env.SWARM_SERVER_PORT || 7777
const IDLE_TIMEOUT_MINUTES = parseInt(process.env.SWARM_SERVER_IDLE_TIMEOUT) || 30
const SHUTDOWN_ON_IDLE = process.env.SWARM_SERVER_SHUTDOWN_ON_IDLE !== 'false'

// Auto-shutdown if idle (crucial for remote resource cleanup)
// Checked every 60 seconds
```

---

## 3. TERMINAL MANAGEMENT ARCHITECTURE

### 3.1 Remote Server-Side Terminal Management

**File**: `/home/alejandro/Swarm/swarm-ide/swarm-server/src/terminal-manager.js`

#### PTY Creation (node-pty)
```javascript
createTerminal(workspaceId, options = {}) {
    // Critical: use login shell with -l flag (like VSCode)
    const ptyProcess = pty.spawn(shell, ['-l'], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: workspace.path,      // CRITICAL: working directory
        env: {                     // Full environment setup
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: 'en_US.UTF-8',
            HOME, USER, ...processEnv
        },
        encoding: 'utf8'           // CRITICAL: UTF-8 encoding
    })
}
```

#### Multi-Client Handler Pattern

**Critical fix**: Track multiple WebSocket clients per terminal
```javascript
terminal = {
    id: terminalId,
    ptyProcess,
    dataHandlers: [],    // Array of client output handlers
    exitHandlers: []     // Array of client exit handlers
}

// PTY data -> broadcast to all clients
ptyProcess.onData((data) => {
    terminal.dataHandlers.forEach((handler, idx) => {
        try {
            handler(data)  // Send to each connected WebSocket client
        } catch (err) {
            logger.error(`Handler ${idx} failed:`, err)
        }
    })
})
```

#### Handler Registration
```javascript
attachHandlers(terminalId, onData, onExit) {
    // Don't re-attach PTY handlers!
    // Just register client output handler
    terminal.dataHandlers.push(onData)
    terminal.exitHandlers.push(onExit)
}

detachHandlers(terminalId, onData, onExit) {
    // Remove when WebSocket disconnects
    terminal.dataHandlers = terminal.dataHandlers.filter(h => h !== onData)
    terminal.exitHandlers = terminal.exitHandlers.filter(h => h !== onExit)
}
```

### 3.2 WebSocket Streaming Architecture

**File**: `/home/alejandro/Swarm/swarm-ide/swarm-server/src/server.js`

#### WebSocket Connection Lifecycle

```javascript
setupWebSocket() {
    this.wss = new WebSocket.Server({ server: this.server })
    
    this.wss.on('connection', (ws, req) => {
        // 1. Extract terminal ID from URL path
        // Expected: /terminals/{terminalId}/stream
        const terminalId = req.url.match(/\/terminals\/([^\/]+)\/stream/)[1]
        
        // 2. Track active connections
        this.activeConnections.add(ws)
        this.recordActivity()  // Reset idle timer
        
        // 3. Get terminal instance
        const terminal = terminalManager.getTerminal(terminalId)
        
        // 4. Attach handlers: PTY data -> WebSocket
        const onData = (data) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'data',
                    data: data
                }))
            }
        }
        
        // 5. Attach handlers: PTY exit -> WebSocket
        const onExit = (exitCode, signal) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'exit',
                    exitCode,
                    signal
                }))
                ws.close(1000, 'Terminal exited')
            }
        }
        
        terminalManager.attachHandlers(terminalId, onData, onExit)
        
        // 6. Handle WebSocket messages (client input -> PTY)
        ws.on('message', (message) => {
            const msg = JSON.parse(message)
            
            if (msg.type === 'input') {
                terminalManager.writeToTerminal(terminalId, msg.data)
            } else if (msg.type === 'resize') {
                terminalManager.resizeTerminal(terminalId, msg.cols, msg.rows)
            }
        })
        
        // 7. Cleanup on disconnect
        ws.on('close', () => {
            this.activeConnections.delete(ws)
            terminalManager.detachHandlers(terminalId, onData, onExit)
        })
    })
}
```

#### Message Protocol

**Server -> Client (Terminal Output)**
```json
{
    "type": "data",
    "data": "shell output here"
}
```

**Server -> Client (Terminal Connection)**
```json
{
    "type": "connected",
    "terminalId": "term_abc123",
    "pid": 12345
}
```

**Server -> Client (Terminal Exit)**
```json
{
    "type": "exit",
    "exitCode": 0,
    "signal": null
}
```

**Client -> Server (Terminal Input)**
```json
{
    "type": "input",
    "data": "command text"
}
```

**Client -> Server (Terminal Resize)**
```json
{
    "type": "resize",
    "cols": 80,
    "rows": 24
}
```

---

## 4. CLIENT-SIDE TERMINAL IMPLEMENTATION

### 4.1 Terminal Component (xterm.js wrapper)

**File**: `/home/alejandro/Swarm/swarm-ide/src/components/terminal/Terminal.js`

#### Initialization Sequence

**CRITICAL**: Must follow exact order to avoid race conditions

```javascript
class Terminal {
    async init() {
        // 1. Create xterm.js instance (BEFORE open())
        this.xterm = new XtermTerminal({
            cols: 80, rows: 24,
            theme, fontSize, fontFamily,
            scrollback: 1000,
            allowProposedApi: true
        })
        
        // 2. Create addon instances (DON'T load yet)
        this.fitAddon = new FitAddon()
        this.webLinksAddon = new WebLinksAddon()
    }
    
    async attach() {
        // STEP 1: Open terminal in DOM FIRST
        this.xterm.open(this.container)
        this.isAttached = true
        
        // STEP 2: Load addons AFTER open()
        this.xterm.loadAddon(this.fitAddon)
        this.xterm.loadAddon(this.webLinksAddon)
        
        // STEP 3: Wait for DOM to settle
        await new Promise(resolve => setTimeout(resolve, 200))
        
        // STEP 4: Fit terminal to container (multiple times!)
        this.fit()
        await new Promise(resolve => setTimeout(resolve, 100))
        this.fit()
        
        // STEP 5: Get final dimensions
        const { cols, rows } = this.fitAddon.proposeDimensions()
        
        // STEP 6: Start listening for PTY data BEFORE creation
        this.startDataListener()
        
        // STEP 7: Create terminal (local, SSH, or swarm-server)
        let result = await this.createTerminal(connectionType, connectionId)
        
        // STEP 8: Wait and flush buffered data
        await new Promise(resolve => setTimeout(resolve, 100))
        this.flushDataBuffer()
    }
}
```

### 4.2 Connection Type Routing

**Key Decision Point**: Determine how to create terminal

```javascript
if (connectionType === 'ssh') {
    // Check if swarm-server is available
    const swarmServerManager = require('../../services/SwarmServerManager')
    
    if (swarmServerManager.isServerConnected()) {
        // Use server-based terminal
        this.useSwarmServer = true
        
        // 1. Create terminal on swarm-server
        const serverTerminal = await swarmServerManager.createTerminal(
            workspace.id,
            { cols, rows, shell: '/bin/bash' }
        )
        
        // 2. Connect WebSocket for streaming
        this.serverWebSocket = swarmServerManager.connectTerminalWebSocket(
            serverTerminal.id,
            (data) => this.write(data),      // Output handler
            (exitCode, signal) => this.onExit(exitCode, signal)  // Exit handler
        )
    } else {
        // Fallback: Direct SSH terminal
        result = await window.electronAPI.sshTerminalCreate(
            connectionId, cols, rows, id, workingDir
        )
    }
} else {
    // Local terminal
    result = await window.electronAPI.terminalCreate(cols, rows, id)
}
```

### 4.3 Data Buffering Pattern (VSCode-inspired)

**Problem**: Data may arrive before xterm.js is fully rendered

**Solution**: Buffer initial data until terminal ready
```javascript
class Terminal {
    _initialDataBuffer = []
    _isBufferingData = true
    
    setupEventListeners() {
        this.xterm.onData((data) => {
            // User typed something, send to PTY
            window.electronAPI.terminalWrite(this.ptyId, data)
        })
    }
    
    startDataListener() {
        // Listen for PTY output
        eventBus.on('terminal:data', (data) => {
            if (this._isBufferingData) {
                // Buffer it (prevents race condition)
                this._initialDataBuffer.push(data.data)
            } else {
                // Write directly to xterm
                this.write(data.data)
            }
        })
    }
    
    flushDataBuffer() {
        // Call after terminal fully ready
        for (const data of this._initialDataBuffer) {
            this.write(data)
        }
        this._initialDataBuffer = []
        this._isBufferingData = false
    }
}
```

### 4.4 Multi-Terminal Management

**File**: `/home/alejandro/Swarm/swarm-ide/src/components/terminal/TerminalPanel.js`

```javascript
class TerminalPanel {
    terminals = new Map()      // id -> Terminal instance
    activeTerminalId = null
    
    async createTerminal(options = {}) {
        // Auto-detect connection type from active workspace
        if (!options.connectionType) {
            const workspace = workspaceManager.getActiveWorkspace()
            
            if (workspace?.isSSH && workspace?.sshConnectionId) {
                options.connectionType = 'ssh'
                options.connectionId = workspace.sshConnectionId
            } else {
                options.connectionType = 'local'
            }
        }
        
        // Create tab and container
        const id = `terminal-${++nextTerminalId}`
        const container = document.createElement('div')
        container.className = 'terminal-instance'
        
        // Create terminal instance
        const terminal = new Terminal(container, {
            id,
            connectionType: options.connectionType,
            connectionId: options.connectionId,
            workingDir: options.workingDir
        })
        
        await terminal.init()
        await terminal.attach()
        
        this.terminals.set(id, terminal)
        return terminal
    }
}
```

---

## 5. ELECTRON IPC BRIDGE ARCHITECTURE

### 5.1 Main Process WebSocket Proxy

**File**: `/home/alejandro/Swarm/swarm-ide/main.js`

**Why**: Renderer process has Content Security Policy (CSP) restrictions on WebSocket

```javascript
// Main process acts as WebSocket proxy
const swarmServerWebSockets = new Map()  // terminalId -> WebSocket

ipcMain.handle('swarm-server-ws-connect', async (event, wsUrl, terminalId) => {
    console.log(`[Main] Creating WebSocket proxy for terminal: ${terminalId}`)
    
    // Main process creates real WebSocket
    const ws = new WebSocket(wsUrl)
    
    ws.on('open', () => {
        console.log(`[Main] ✅ WebSocket connected`)
        // Notify renderer
        event.sender.send('swarm-server-ws-open', terminalId)
    })
    
    ws.on('message', (rawData) => {
        const msg = JSON.parse(rawData)
        console.log(`[Main] 📨 WebSocket message:`, msg.type)
        // Forward to renderer
        event.sender.send('swarm-server-ws-message', terminalId, msg)
    })
    
    ws.on('close', (code, reason) => {
        console.log(`[Main] 🔴 WebSocket closed`)
        event.sender.send('swarm-server-ws-close', terminalId, code, reason)
        swarmServerWebSockets.delete(terminalId)
    })
    
    ws.on('error', (error) => {
        console.error(`[Main] ❌ WebSocket error`)
        event.sender.send('swarm-server-ws-error', terminalId, error.message)
    })
    
    swarmServerWebSockets.set(terminalId, ws)
})

// Renderer sends data through main process
ipcMain.handle('swarm-server-ws-send', async (event, terminalId, data) => {
    const ws = swarmServerWebSockets.get(terminalId)
    if (!ws) return { success: false, error: 'WebSocket not found' }
    
    ws.send(data)
    return { success: true }
})

// Close WebSocket from renderer
ipcMain.handle('swarm-server-ws-close', async (event, terminalId) => {
    const ws = swarmServerWebSockets.get(terminalId)
    if (ws) {
        ws.close()
        swarmServerWebSockets.delete(terminalId)
    }
})
```

### 5.2 SwarmServerManager IPC Integration

**File**: `/home/alejandro/Swarm/swarm-ide/src/services/SwarmServerManager.js`

```javascript
class SwarmServerManager {
    connectTerminalWebSocket(terminalId, onData, onExit) {
        // Convert HTTP URL to WebSocket
        const wsUrl = this.serverUrl.replace(/^http/, 'ws')
        const fullWsUrl = `${wsUrl}/terminals/${terminalId}/stream`
        
        // Use IPC proxy to connect
        window.electronAPI.swarmServerWsConnect(
            fullWsUrl,
            terminalId,
            () => {
                console.log(`✅ WebSocket OPENED`)
                // Ready for communication
            },
            (msg) => {
                // Handle messages from server
                if (msg.type === 'data' && onData) {
                    onData(msg.data)
                } else if (msg.type === 'exit' && onExit) {
                    onExit(msg.exitCode, msg.signal)
                } else if (msg.type === 'connected') {
                    console.log(`Connected to terminal: ${msg.terminalId}`)
                }
            },
            (code, reason) => {
                console.log(`🔴 WebSocket CLOSED`)
            },
            (error) => {
                console.error(`❌ WebSocket ERROR`, error)
            }
        )
        
        // Return object mimicking WebSocket interface
        return {
            close: () => window.electronAPI.swarmServerWsClose(terminalId),
            send: (data) => {
                // For swarm-server terminals, input is handled separately
                // (not used in this implementation, data goes through message handler)
            }
        }
    }
}
```

### 5.3 Direct SSH Terminal IPC

**For fallback when swarm-server unavailable**

```javascript
// Create SSH terminal directly
await window.electronAPI.sshTerminalCreate(
    connectionId,
    cols,
    rows,
    terminalId,
    workingDir
)

// Send input to SSH terminal
window.electronAPI.sshTerminalWrite(ptyId, data)

// Resize SSH terminal
window.electronAPI.sshTerminalResize(ptyId, cols, rows)

// Close SSH terminal
await window.electronAPI.sshTerminalClose(ptyId)
```

---

## 6. DATA FLOW DIAGRAMS

### 6.1 Server-Based Terminal (Recommended)

```
User Types
    ↓
xterm.js onData event
    ↓
Terminal.setupEventListeners() → window.electronAPI call
    ↓
Main Process IPC Handler
    ↓
WebSocket (main process) sends to swarm-server
    ↓
swarm-server /terminals/{id}/stream WebSocket receives
    ↓
Terminal Manager: writeToTerminal(terminalId, data)
    ↓
PTY Process: ptyProcess.write(data)
    ↓
Shell receives input and processes


Shell produces output
    ↓
PTY Process: ptyProcess.onData(data) callback fires
    ↓
Terminal Manager broadcasts to all client handlers
    ↓
Server-side onData handler: ws.send(JSON.stringify({type: 'data', data}))
    ↓
Main Process IPC receives WebSocket message
    ↓
Main Process sends IPC event to renderer: event.sender.send('swarm-server-ws-message', ...)
    ↓
Renderer listens on event, calls SwarmServerManager callback
    ↓
Terminal.attach() onData callback: this.write(data)
    ↓
xterm.js renders the output
```

### 6.2 SSH Terminal (Fallback)

```
User Types
    ↓
xterm.js onData event
    ↓
Terminal.setupEventListeners()
    ↓
window.electronAPI.sshTerminalWrite(ptyId, data)
    ↓
Main Process Handler: ipcMain.handle('ssh-terminal-write', ...)
    ↓
SSH Terminal (in main process): ptyProcess.write(data)
    ↓
Shell receives input


Shell produces output
    ↓
PTY Process: ptyProcess.onData(data) callback
    ↓
Main Process sends to renderer: mainWindow.webContents.send('terminal:data', {ptyId, data})
    ↓
Renderer eventBus emits 'terminal:data' event
    ↓
Terminal.startDataListener() receives it
    ↓
Terminal.write(data) or buffer if still initializing
    ↓
xterm.js renders the output
```

---

## 7. CRITICAL IMPLEMENTATION DETAILS

### 7.1 Timing and Race Conditions

| Issue | Solution |
|-------|----------|
| xterm.js not rendered when data arrives | Buffer data until `flushDataBuffer()` called |
| Container size wrong before fitting | Call `fit()` twice with 100ms delay |
| WebSocket message arrives before handler attached | Handlers attached before PTY creation, then handlers registered before WebSocket open |
| Multiple clients on same terminal output | Use handler array in terminal, not re-attaching PTY |
| Client disconnects mid-write | Check `ws.readyState === WebSocket.OPEN` before send |

### 7.2 Environment Setup

**Server-side (swarm-server)**
```javascript
env: {
    ...process.env,
    TERM: 'xterm-256color',         // Terminal type
    COLORTERM: 'truecolor',         // Color support
    LANG: 'en_US.UTF-8',            // Locale
    HOME: process.env.HOME,          // Home directory
    USER: process.env.USER           // Username
}
```

**Spawn Options**
```javascript
pty.spawn(shell, ['-l'], {          // -l = login shell
    name: 'xterm-256color',
    cols, rows,
    cwd: workspace.path,             // Working directory!
    env,
    encoding: 'utf8'                 // UTF-8 encoding critical
})
```

### 7.3 Connection Health

**Auto-shutdown on idle** (30 minutes default)
```javascript
// Server tracks last activity
recordActivity() {
    this.lastActivityTime = Date.now()
}

// Reset on every HTTP request and WebSocket connection
```

**Client heartbeat** (30 second echo check)
```javascript
setInterval(async () => {
    await this.ssh.execCommand('echo "heartbeat"')
}, 30000)
```

---

## 8. ARCHITECTURAL PATTERNS

### 8.1 Handler Broadcasting Pattern

**Key Innovation**: Multiple clients can connect to same terminal

```
PTY Process
    ↓ onData event
    ↓
[Handler 1, Handler 2, Handler 3, ...]  // Client WebSockets
    ↓ send individual messages
    ↓
Clients receive same output independently
```

**Why Important**: Allows terminal sharing, multiple views, recovery after disconnect

### 8.2 IPC Proxy Pattern

**Reason**: CSP restrictions in Electron renderer

```
Renderer (restricted CSP) <--IPC--> Main Process (no restrictions) <--WebSocket--> Remote Server
```

### 8.3 Fallback Chain

```
Try swarm-server
    ↓ (if connected)
    ↓ Yes: Use server-based terminal (multi-client support)
    ↓ No: Fall back to SSH direct
        ↓ (PTY in main process)
        ↓ No SSH: Fall back to local PTY
```

---

## 9. CONFIGURATION & ENVIRONMENT VARIABLES

### Server-side
```bash
SWARM_SERVER_PORT=7777                      # Default server port
SWARM_SERVER_IDLE_TIMEOUT=30                # Minutes until auto-shutdown
SWARM_SERVER_SHUTDOWN_ON_IDLE=true          # Enable auto-shutdown
```

### SSH Connection
```javascript
{
    host: 'remote.host.com',
    port: 22,
    username: 'user',
    privateKey: '/path/to/key',             // Or password
    passphrase: 'key_passphrase',           // If encrypted
    readyTimeout: 20000,                    // 20 second timeout
    algorithms: { kex, cipher, hmac }       // Algorithm negotiation
}
```

### Terminal Options
```javascript
{
    cols: 80,                               // Columns
    rows: 24,                               // Rows
    shell: '/bin/bash',                     // Shell path
    env: { ... }                            // Environment variables
}
```

---

## 10. DEPLOYMENT CHECKLIST

- [ ] SSH connectivity to remote host confirmed
- [ ] Node.js v18+ installed on remote
- [ ] /tmp/.swarm-server directory writable
- [ ] HTTP port 7777 accessible (locally on remote, tunneled via SSH)
- [ ] npm available for dependency installation
- [ ] Bash or compatible shell available
- [ ] Terminal size negotiation working (PTY support)
- [ ] UTF-8 encoding properly configured

---

## 11. DEBUGGING RECOMMENDATIONS

### Enable Verbose Logging
```javascript
// In logger config
logger.level = 'trace'  // Maximum verbosity
```

### Monitor Key Events
1. **SSH Connection**: Watch state transitions
2. **Server Deployment**: Check `/home/user/.swarm-server/server.log`
3. **PTY Creation**: Look for "PTY onData FIRED" logs
4. **WebSocket**: Monitor message flow type-by-type
5. **Data Buffering**: Verify `flushDataBuffer()` called

### Test Endpoints
```bash
# Server health
curl http://localhost:7777/health

# Create workspace
curl -X POST http://localhost:7777/workspaces \
  -H "Content-Type: application/json" \
  -d '{"name":"test","path":"/tmp"}'

# Create terminal
curl -X POST http://localhost:7777/workspaces/{id}/terminals \
  -H "Content-Type: application/json" \
  -d '{"cols":80,"rows":24,"shell":"/bin/bash"}'
```

---

## 12. SUMMARY

The implementation uses a sophisticated multi-layer architecture:

1. **SSH Layer**: Manages remote connections with health checking
2. **Deployment Layer**: Automatically installs swarm-server via SFTP
3. **Server Layer**: node-pty based PTY with multi-client support
4. **WebSocket Layer**: Real-time streaming with JSON protocol
5. **IPC Layer**: Bridges Electron main/renderer with CSP compliance
6. **Client Layer**: xterm.js wrapper with data buffering

**Key Strengths**:
- Automatic server deployment (no manual setup needed)
- Multi-client support (terminal can be viewed by multiple clients)
- Robust fallback chain (server → SSH → local)
- Proper race condition handling (data buffering pattern)
- Auto-shutdown on idle (resource cleanup)

This is production-ready architecture for remote development IDE capabilities.

