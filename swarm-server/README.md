# Swarm IDE Server

Lightweight Node.js server component for Swarm IDE that enables proper workspace-aware terminal management on remote machines.

## Features

- 🎯 **Workspace Management**: Create and manage development workspaces
- 💻 **Terminal Management**: Spawn terminals with correct working directories
- 🔄 **Session Persistence**: Terminals persist across client disconnections
- 🔐 **Secure**: Token-based authentication, SSH tunnel support
- ⚡ **Lightweight**: Minimal dependencies, low resource usage

## Quick Start

### Installation

```bash
# One-line install (future)
curl -fsSL https://swarm-ide.com/install.sh | bash

# Manual install
git clone https://github.com/swarm-ide/server.git ~/.swarm-server
cd ~/.swarm-server
npm install
```

### Usage

```bash
# Start server
./bin/swarm-server.js start

# Check status
./bin/swarm-server.js status

# Stop server
./bin/swarm-server.js stop
```

## Architecture

```
Client (Swarm IDE) → SSH Tunnel → Swarm Server → PTY Processes
```

The server runs on port 7777 (configurable) and provides:
- REST API for workspace/terminal management
- WebSocket for real-time terminal I/O

## API

### Workspaces

```bash
# Create workspace
POST /workspaces
{ "name": "My Project", "path": "/var/www/html" }

# List workspaces
GET /workspaces

# Get workspace
GET /workspaces/:id

# Delete workspace
DELETE /workspaces/:id
```

### Terminals

```bash
# Create terminal in workspace
POST /workspaces/:workspaceId/terminals
{ "shell": "/bin/bash", "cols": 80, "rows": 24 }

# Connect to terminal (WebSocket)
WS /terminals/:id/stream
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run tests
npm test
```

## License

MIT
