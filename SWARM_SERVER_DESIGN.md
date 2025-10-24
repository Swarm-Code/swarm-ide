# Swarm IDE Server Component - Design Document

## 🎯 Goal

Create a lightweight Node.js server that runs on remote machines to enable proper workspace-aware terminal management and future remote development features.

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│   LOCAL (Swarm IDE Electron)            │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │  SSH Connection Manager          │  │
│  └────────┬─────────────────────────┘  │
│           │                             │
│  ┌────────▼─────────────────────────┐  │
│  │  Swarm Server Client             │  │
│  │  - Connect to server             │  │
│  │  - Send commands via HTTP/WS     │  │
│  │  - Receive terminal output       │  │
│  └────────┬─────────────────────────┘  │
└───────────┼──────────────────────────────┘
            │ SSH Tunnel (Port Forward)
            │ or Direct HTTP/WebSocket
┌───────────▼──────────────────────────────┐
│   REMOTE (Server Machine)                │
│                                          │
│  ┌──────────────────────────────────┐   │
│  │  Swarm Server (Node.js)          │   │
│  │  Port: 7777                      │   │
│  └────────┬─────────────────────────┘   │
│           │                              │
│  ┌────────▼─────────────────────────┐   │
│  │  Workspace Manager               │   │
│  │  - Track workspaces              │   │
│  │  - Associate terminals           │   │
│  └────────┬─────────────────────────┘   │
│           │                              │
│  ┌────────▼─────────────────────────┐   │
│  │  Terminal Manager                │   │
│  │  - Create terminals with cwd     │   │
│  │  - Manage pty processes          │   │
│  │  - Handle I/O                    │   │
│  └────────┬─────────────────────────┘   │
│           │                              │
│  ┌────────▼─────────────────────────┐   │
│  │  PTY Processes                   │   │
│  │  /bin/bash, zsh, etc.            │   │
│  └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

---

## 📦 Server Components

### 1. Core Server (`swarm-server.js`)
- **Responsibility**: Main HTTP/WebSocket server
- **Port**: 7777 (configurable)
- **Features**:
  - Health check endpoint
  - Authentication via tokens
  - Request routing
  - WebSocket connections for terminal streams

### 2. Workspace Manager (`workspace-manager.js`)
- **Responsibility**: Track and manage workspaces
- **Features**:
  - Create/delete workspaces
  - Store workspace metadata (name, path, id)
  - Associate terminals with workspaces
  - Persist workspace state to disk

### 3. Terminal Manager (`terminal-manager.js`)
- **Responsibility**: Manage PTY processes
- **Features**:
  - Create terminals with specific working directory
  - Track terminal → workspace association
  - Handle terminal I/O
  - Resize terminals
  - Kill/cleanup terminals

### 4. Session Manager (`session-manager.js`)
- **Responsibility**: Manage client connections
- **Features**:
  - Track active connections
  - Handle disconnection/reconnection
  - Session timeout
  - Persist sessions for reattachment

---

## 🔌 API Design

### HTTP REST API

#### Health & Info
```
GET /health
Response: { "status": "ok", "version": "1.0.0", "uptime": 12345 }
```

#### Workspaces
```
POST /workspaces
Body: { "name": "My Project", "path": "/var/www/html" }
Response: { "id": "ws_abc123", "name": "My Project", "path": "/var/www/html" }

GET /workspaces
Response: [{ "id": "ws_abc123", "name": "My Project", "path": "/var/www/html", "terminals": ["term_1", "term_2"] }]

GET /workspaces/:id
Response: { "id": "ws_abc123", "name": "My Project", "path": "/var/www/html", "terminals": [...] }

DELETE /workspaces/:id
Response: { "success": true }
```

#### Terminals
```
POST /workspaces/:workspaceId/terminals
Body: { "shell": "/bin/bash", "env": {...}, "cols": 80, "rows": 24 }
Response: { "id": "term_xyz789", "workspaceId": "ws_abc123", "cwd": "/var/www/html", "pid": 12345 }

GET /workspaces/:workspaceId/terminals
Response: [{ "id": "term_xyz789", "cwd": "/var/www/html", "pid": 12345, "shell": "/bin/bash" }]

DELETE /terminals/:id
Response: { "success": true }

POST /terminals/:id/resize
Body: { "cols": 120, "rows": 30 }
Response: { "success": true }
```

### WebSocket API

#### Connect to Terminal
```
WS /terminals/:id/stream
```

**Client → Server:**
```json
{ "type": "input", "data": "ls\n" }
{ "type": "resize", "cols": 120, "rows": 30 }
```

**Server → Client:**
```json
{ "type": "output", "data": "file1.txt\nfile2.txt\n" }
{ "type": "exit", "code": 0 }
{ "type": "error", "message": "Terminal not found" }
```

---

## 💾 Data Storage

### Workspace Registry (`~/.swarm-server/workspaces.json`)
```json
{
  "workspaces": [
    {
      "id": "ws_abc123",
      "name": "My Project",
      "path": "/var/www/html",
      "created": "2025-10-22T12:00:00Z",
      "lastAccessed": "2025-10-22T14:30:00Z"
    }
  ]
}
```

### Terminal State (`~/.swarm-server/terminals.json`)
```json
{
  "terminals": [
    {
      "id": "term_xyz789",
      "workspaceId": "ws_abc123",
      "pid": 12345,
      "cwd": "/var/www/html",
      "shell": "/bin/bash",
      "created": "2025-10-22T14:00:00Z"
    }
  ]
}
```

### Session Data (`~/.swarm-server/sessions.json`)
```json
{
  "sessions": [
    {
      "id": "session_123",
      "token": "abc...xyz",
      "created": "2025-10-22T12:00:00Z",
      "lastActivity": "2025-10-22T14:30:00Z",
      "workspaces": ["ws_abc123"]
    }
  ]
}
```

---

## 🔐 Security

### 1. Authentication
- **Token-based**: Each connection requires a token
- **Token generation**: Created on first connection, persisted
- **Token storage**: `~/.swarm-server/tokens.json`

```json
{
  "tokens": [
    {
      "token": "sk_abc123xyz",
      "created": "2025-10-22T12:00:00Z",
      "description": "Swarm IDE Connection",
      "lastUsed": "2025-10-22T14:30:00Z"
    }
  ]
}
```

### 2. Authorization
- All API requests must include header: `Authorization: Bearer <token>`
- Invalid token → 401 Unauthorized

### 3. Transport Security
- **Option A**: SSH port forwarding (recommended)
  ```bash
  ssh -L 7777:localhost:7777 user@remote
  ```
  Access via: `http://localhost:7777` (tunneled)

- **Option B**: HTTPS (future)
  ```bash
  swarm-server --https --cert /path/to/cert.pem
  ```

---

## 🚀 Installation & Deployment

### Install Script (`install.sh`)

```bash
#!/bin/bash

# Swarm Server Installer
# Downloads and sets up Swarm Server on remote machine

INSTALL_DIR="$HOME/.swarm-server"
VERSION="1.0.0"

echo "🚀 Installing Swarm Server v${VERSION}..."

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

# Create install directory
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download server package
echo "📦 Downloading server package..."
curl -L "https://github.com/swarm-ide/server/releases/download/v${VERSION}/swarm-server.tar.gz" | tar xz

# Install dependencies
echo "📦 Installing dependencies..."
npm install --production

# Create systemd service (optional)
echo "⚙️  Setting up systemd service..."
cat > "$INSTALL_DIR/swarm-server.service" << EOF
[Unit]
Description=Swarm IDE Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) $INSTALL_DIR/bin/swarm-server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

echo "✅ Installation complete!"
echo ""
echo "Start server: $INSTALL_DIR/bin/swarm-server start"
echo "Stop server:  $INSTALL_DIR/bin/swarm-server stop"
echo "Status:       $INSTALL_DIR/bin/swarm-server status"
```

### Quick Install (One-liner)
```bash
curl -fsSL https://swarm-ide.com/install.sh | bash
```

### Manual Install
```bash
# 1. Clone or download
git clone https://github.com/swarm-ide/server.git ~/.swarm-server

# 2. Install deps
cd ~/.swarm-server && npm install

# 3. Start
./bin/swarm-server start
```

---

## 🎛️ Server Management

### CLI Commands

```bash
# Start server
swarm-server start [--port 7777] [--daemon]

# Stop server
swarm-server stop

# Restart server
swarm-server restart

# Check status
swarm-server status

# View logs
swarm-server logs [--tail 100] [--follow]

# Generate token
swarm-server token create [--description "My Connection"]

# List tokens
swarm-server token list

# Revoke token
swarm-server token revoke <token>
```

---

## 📊 Project Structure

```
swarm-server/
├── bin/
│   └── swarm-server.js          # CLI entry point
├── src/
│   ├── server.js                # Main HTTP/WS server
│   ├── workspace-manager.js     # Workspace management
│   ├── terminal-manager.js      # Terminal/PTY management
│   ├── session-manager.js       # Session tracking
│   ├── auth.js                  # Authentication
│   ├── api/
│   │   ├── workspaces.js        # Workspace routes
│   │   ├── terminals.js         # Terminal routes
│   │   └── health.js            # Health check routes
│   └── utils/
│       ├── logger.js            # Logging
│       └── storage.js           # Persistent storage
├── package.json
├── README.md
└── LICENSE
```

---

## 🔄 Integration with Swarm IDE

### Client-Side Changes

#### 1. Server Connection Manager (`src/services/SwarmServerManager.js`)

```javascript
class SwarmServerManager {
    constructor(sshConnectionId) {
        this.sshConnectionId = sshConnectionId;
        this.serverUrl = null;
        this.token = null;
        this.connected = false;
    }

    async connect() {
        // Setup SSH tunnel
        await this.setupTunnel();

        // Test connection
        const health = await this.fetchHealth();

        // Get or create token
        this.token = await this.getToken();

        this.connected = true;
    }

    async setupTunnel() {
        // Use SSH port forwarding
        // ssh -L 7777:localhost:7777 user@host
        const localPort = await this.findAvailablePort();
        await window.electronAPI.sshPortForward(
            this.sshConnectionId,
            localPort,
            7777
        );
        this.serverUrl = `http://localhost:${localPort}`;
    }

    async createWorkspace(name, path) {
        const response = await fetch(`${this.serverUrl}/workspaces`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, path })
        });
        return await response.json();
    }

    async createTerminal(workspaceId, options) {
        const response = await fetch(
            `${this.serverUrl}/workspaces/${workspaceId}/terminals`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(options)
            }
        );
        return await response.json();
    }

    connectToTerminal(terminalId) {
        const ws = new WebSocket(
            `${this.serverUrl.replace('http', 'ws')}/terminals/${terminalId}/stream`,
            {
                headers: {
                    'Authorization': `Bearer ${this.token}`
                }
            }
        );
        return ws;
    }
}
```

#### 2. Modified Terminal Creation

```javascript
// TerminalPanel.js
async createTerminal(options = {}) {
    const workspace = workspaceManager.getActiveWorkspace();

    if (workspace && workspace.isSSH) {
        // Use Swarm Server
        const serverManager = await this.getServerManager(workspace.sshConnectionId);

        // Create terminal on server with workspace context
        const terminal = await serverManager.createTerminal(workspace.serverId, {
            shell: '/bin/bash',
            cols: 80,
            rows: 24
        });

        // Connect WebSocket
        const ws = serverManager.connectToTerminal(terminal.id);

        // Attach to xterm.js
        const xtermTerminal = new Terminal({ /* ... */ });
        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'output') {
                xtermTerminal.write(msg.data);
            }
        };

        xtermTerminal.onData((data) => {
            ws.send(JSON.stringify({ type: 'input', data }));
        });

    } else {
        // Local terminal (existing code)
        await this.createLocalTerminal(options);
    }
}
```

---

## 🏁 Implementation Phases

### Phase 1: Core Server (Week 1)
- [x] Design architecture
- [ ] Implement basic HTTP server
- [ ] Implement workspace manager
- [ ] Implement terminal manager with node-pty
- [ ] Basic CLI (start/stop)

### Phase 2: Client Integration (Week 2)
- [ ] SSH port forwarding setup
- [ ] Server connection manager
- [ ] Modified terminal creation
- [ ] WebSocket terminal streaming
- [ ] Testing with single workspace

### Phase 3: Features & Polish (Week 3)
- [ ] Session persistence
- [ ] Terminal reattachment
- [ ] Multi-workspace support
- [ ] Error handling
- [ ] Logging

### Phase 4: Deployment (Week 4)
- [ ] Install script
- [ ] Auto-update mechanism
- [ ] Documentation
- [ ] systemd service
- [ ] Testing on various Linux distros

---

## 🧪 Testing Strategy

### Unit Tests
- Workspace manager operations
- Terminal creation/destruction
- Session management
- Token authentication

### Integration Tests
- Full client → server flow
- Terminal I/O
- WebSocket communication
- Reconnection handling

### Manual Testing Scenarios
1. Create workspace on remote server
2. Create terminal in workspace
3. Verify terminal starts in correct directory
4. Execute commands, verify output
5. Disconnect client, reconnect, reattach to terminal
6. Switch workspaces, create new terminal
7. Kill server, restart, verify session recovery

---

## 📈 Future Enhancements

### Phase 2 Features
- File system operations (replace SFTP)
- Code intelligence server integration
- Debugging support
- Port forwarding management
- Environment variable management

### Phase 3 Features
- Multi-user support
- Workspace sharing
- Terminal replay/recording
- Built-in process monitoring
- Resource usage tracking

---

## 💭 Design Decisions

### Why Node.js?
- Same runtime as Electron
- Easy code sharing with client
- Excellent PTY support (node-pty)
- Lightweight

### Why HTTP/WebSocket vs Custom Protocol?
- Standard, debuggable
- Works through SSH tunnels
- Easy to test with curl/wscat
- Future-proof (can add REST API easily)

### Why Port Forwarding vs Direct Connection?
- More secure (no open ports)
- Works through firewalls
- Leverages existing SSH connection
- Can add direct HTTPS later

---

## ✅ Success Criteria

After implementation, we should be able to:

1. ✅ Install server on remote machine with one command
2. ✅ Create workspace on server from Swarm IDE
3. ✅ Create terminal that starts in workspace directory
4. ✅ Type in terminal, see output in real-time
5. ✅ Disconnect and reconnect, reattach to same terminal
6. ✅ Switch workspaces, create new terminal in different directory
7. ✅ All terminals persist across Swarm IDE restarts

---

## 🎓 Comparison: Before vs After

### Before (Current)
```
Swarm IDE → SSH Stream → Shell (with cd command)
- ❌ No workspace context
- ❌ Fragile directory setup
- ❌ No persistence
- ❌ No reattachment
```

### After (With Server)
```
Swarm IDE → Swarm Server → PTY Process (spawned with cwd)
- ✅ Full workspace context
- ✅ Reliable directory
- ✅ Persistent sessions
- ✅ Reattachment support
```

---

This design gives us a **proper foundation** for remote development, not just a hack to make terminals work.

