# Swarm-Server Auto-Shutdown & Multi-User Support

## Overview

The swarm-server now includes automatic shutdown functionality to clean up idle servers and better support for multiple concurrent users through SSH connections.

## Features

### 1. Automatic Idle Shutdown

The server automatically tracks activity and shuts itself down after a period of inactivity. This helps:
- Reduce resource usage on remote machines
- Clean up orphaned server processes
- Ensure servers don't run indefinitely after IDE disconnects

**Activity Tracking:**
- HTTP API requests reset the idle timer
- Active WebSocket connections keep the server alive
- When all WebSocket connections close, the idle timer starts
- Idle check runs every minute

**Default Configuration:**
- Idle Timeout: 30 minutes
- Auto-shutdown: Enabled by default

### 2. WebSocket Path Fix

Fixed the WebSocket server configuration to accept connections to `/terminals/:terminalId/stream` endpoints.

**What Changed:**
- Removed restrictive `path: '/terminals'` from WebSocket.Server options
- Server now accepts all WebSocket upgrade requests and validates the URL pattern internally
- Properly handles terminal streaming WebSocket connections

## Configuration

The server accepts configuration via environment variables:

```bash
# Set idle timeout (in minutes)
export SWARM_SERVER_IDLE_TIMEOUT=60  # 60 minutes

# Disable auto-shutdown
export SWARM_SERVER_SHUTDOWN_ON_IDLE=false

# Set custom port
export SWARM_SERVER_PORT=8888
```

## Usage

### Starting with Default Settings

```bash
node src/index.js
```

Output:
```
===================================
   Swarm Server v1.0.0
===================================
Auto-shutdown: enabled
Idle timeout: 30 minutes
✅ Swarm Server started on port 7777
   HTTP API: http://localhost:7777
   WebSocket: ws://localhost:7777
Idle checker started
```

### Starting with Custom Timeout

```bash
SWARM_SERVER_IDLE_TIMEOUT=60 node src/index.js
```

### Disabling Auto-Shutdown

```bash
SWARM_SERVER_SHUTDOWN_ON_IDLE=false node src/index.js
```

## Architecture

### Activity Tracking

```
HTTP Request → recordActivity() → Reset idle timer
WebSocket Connect → Track connection → Reset idle timer
WebSocket Disconnect → Remove connection → Check if idle
```

### Idle Check Flow

```
Every 60 seconds:
  1. Check active WebSocket connections
  2. If active connections exist → Reset idle timer
  3. If no connections AND idle time > timeout → Shutdown

Shutdown sequence:
  1. Stop idle checker
  2. Close all terminals
  3. Stop HTTP/WebSocket servers
  4. Exit process
```

### Multi-User Support

The server tracks all active WebSocket connections in a Set:
- When a user connects via SSH and opens a terminal, their WebSocket is added to `activeConnections`
- Multiple users can connect simultaneously
- Each user's WebSocket connection keeps the server alive
- Server only shuts down when ALL users disconnect and idle timeout expires

## Implementation Details

### Files Modified

1. **swarm-server/src/server.js**
   - Added idle tracking properties to constructor
   - Added activity recording in middleware and WebSocket handlers
   - Implemented `recordActivity()`, `startIdleChecker()`, `checkIdleStatus()`, and `shutdown()` methods
   - Fixed WebSocket server path configuration

2. **swarm-server/src/index.js**
   - Added environment variable parsing for configuration
   - Pass configuration options to SwarmServer constructor

### Key Methods

**`recordActivity()`**
```javascript
recordActivity() {
    this.lastActivityTime = Date.now();
}
```
Resets the idle timer. Called on every HTTP request and WebSocket connection.

**`checkIdleStatus()`**
```javascript
checkIdleStatus() {
    const idleTime = Date.now() - this.lastActivityTime;
    const hasActiveConnections = this.activeConnections.size > 0;

    if (hasActiveConnections) {
        this.recordActivity();
        return;
    }

    if (idleTime >= this.idleTimeout) {
        this.shutdown();
    }
}
```
Checks if server should shut down. Runs every minute.

**`shutdown()`**
```javascript
async shutdown() {
    // Stop idle checker
    clearInterval(this.idleCheckInterval);

    // Close all terminals
    const terminals = terminalManager.listTerminals();
    for (const terminal of terminals) {
        await terminalManager.killTerminal(terminal.id);
    }

    // Stop server
    await this.stop();

    // Exit process
    process.exit(0);
}
```
Gracefully shuts down the server.

## Deployment

The swarm-server-deployer in swarm-ide automatically deploys the updated server code when connecting via SSH. No manual deployment steps needed.

## Testing

### Test Auto-Shutdown

1. Deploy swarm-server via SSH connection
2. Open a terminal (creates WebSocket connection)
3. Close the terminal
4. Wait for idle timeout
5. Server should automatically shut down

### Test Multi-User

1. Connect from IDE A
2. Connect from IDE B
3. Both users can open terminals
4. Server stays alive while either user is connected
5. Server shuts down after both users disconnect + idle timeout

## Logging

The server logs idle status every minute when checking:

```
[DEBUG] Active connections: 2, idle timer reset
[DEBUG] Idle for 5 minutes (threshold: 30 minutes)
[WARN] ⏰ Server has been idle for 30 minutes. Shutting down...
[INFO] 🛑 Graceful shutdown initiated...
[INFO] Closing all terminals...
[INFO] ✅ Swarm Server stopped
[INFO] 👋 Server shutdown complete. Exiting...
```

## Benefits

1. **Resource Efficiency**: Servers don't run indefinitely
2. **Multi-User Support**: Multiple IDE instances can share one server
3. **Automatic Cleanup**: No orphaned processes
4. **Configurable**: Adjust timeout based on use case
5. **Graceful**: Properly closes terminals and connections before exit

## Migration Notes

### For Existing Deployments

The new auto-shutdown feature is **enabled by default** with a **30-minute timeout**.

If you want to disable it for testing or development:
```bash
SWARM_SERVER_SHUTDOWN_ON_IDLE=false node src/index.js
```

### For Production

Consider setting a longer timeout for production environments:
```bash
SWARM_SERVER_IDLE_TIMEOUT=120  # 2 hours
```

## Future Enhancements

Potential improvements:
- Configurable idle check interval
- Notifications before shutdown
- Persistent terminal sessions across server restarts
- Health check endpoint returns idle status
- Metrics/statistics about uptime and connections
