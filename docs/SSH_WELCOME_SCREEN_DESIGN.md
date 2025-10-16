# SSH Welcome Screen UI Design

## Overview
The SSH Welcome Screen is a dedicated interface for SSH server selection and management, designed to match the visual language and user experience of the main WelcomeScreen. It provides users with an intuitive way to connect to SSH servers, similar to how they would open a local folder.

## Design Philosophy
- **Consistency**: Follows the same design patterns as the main WelcomeScreen
- **Simplicity**: Easy to connect to SSH servers with minimal clicks
- **Persistence**: Saves server configurations and connection history
- **Security**: Secure credential storage using OS keychain integration
- **Efficiency**: Cached folder structures for faster browsing

## Visual Design

### Layout Structure
```
┌─────────────────────────────────────────────────────┐
│                  SSH Welcome Screen                  │
│                                                      │
│              ┌────────────────────┐                 │
│              │   SWARM IDE SSH    │                 │
│              │  Remote Workspace  │                 │
│              └────────────────────┘                 │
│                                                      │
│  ┌───────────────────────────────────────────┐     │
│  │ START                                      │     │
│  ├───────────────────────────────────────────┤     │
│  │ [🔗 Quick Connect]  [➕ Add Server]       │     │
│  │ [⚙️ SSH Settings]    [📋 Import Config]   │     │
│  └───────────────────────────────────────────┘     │
│                                                      │
│  ┌───────────────────────────────────────────┐     │
│  │ SAVED SERVERS (3)                          │     │
│  ├───────────────────────────────────────────┤     │
│  │ 🟢 Production Server                       │     │
│  │    user@prod.example.com:22                │     │
│  │    Last connected: 2 hours ago             │     │
│  │                                             │     │
│  │ 🟡 Development Server                      │     │
│  │    dev@dev.example.com:22                  │     │
│  │    Last connected: 1 day ago               │     │
│  │                                             │     │
│  │ 🔴 Staging Server                          │     │
│  │    user@staging.example.com:22             │     │
│  │    Not connected                           │     │
│  └───────────────────────────────────────────┘     │
│                                                      │
│  ┌───────────────────────────────────────────┐     │
│  │ RECENT CONNECTIONS                         │     │
│  ├───────────────────────────────────────────┤     │
│  │ [Quick Connect - 192.168.1.100]           │     │
│  │ [Quick Connect - test.server.com]         │     │
│  └───────────────────────────────────────────┘     │
│                                                      │
│           Press Ctrl+Shift+S for shortcuts          │
└─────────────────────────────────────────────────────┘
```

## Component Breakdown

### 1. Header Section
**Element**: `.ssh-welcome-header`
- **Title**: "SWARM IDE SSH"
  - Font: 42px, gradient from white to blue (#0e639c)
  - Text transform: uppercase
  - Letter spacing: 1px
- **Subtitle**: "Remote Workspace"
  - Font: 16px
  - Color: #b0b0b0
  - Letter spacing: 0.5px

### 2. Quick Action Buttons
**Element**: `.ssh-welcome-actions`
- **Grid Layout**: 2x2 grid on desktop, single column on mobile
- **Button Styles**: Same as `.welcome-action-btn`

**Buttons**:
1. **🔗 Quick Connect**
   - Opens modal dialog to quickly connect to an SSH server
   - Prompts for: host, username, password/key

2. **➕ Add Server**
   - Opens configuration dialog to save a new SSH server
   - Saves: name, host, port, username, authentication method

3. **⚙️ SSH Settings**
   - Opens SSH settings panel
   - Configure: default timeout, key locations, connection preferences

4. **📋 Import Config**
   - Import SSH configurations from file
   - Supports: JSON, SSH config format

### 3. Saved Servers List
**Element**: `.ssh-welcome-servers-list`
- **Display**: Vertical list of saved SSH server configurations
- **Item Structure**:
  ```html
  <div class="ssh-welcome-server-item" data-server-id="{id}">
    <span class="ssh-server-status {connected|connecting|disconnected}">🟢</span>
    <div class="ssh-server-content">
      <div class="ssh-server-name">Production Server</div>
      <div class="ssh-server-host">user@prod.example.com:22</div>
      <div class="ssh-server-meta">Last connected: 2 hours ago</div>
    </div>
    <div class="ssh-server-actions">
      <button class="ssh-server-btn-connect">Connect</button>
      <button class="ssh-server-btn-edit">Edit</button>
      <button class="ssh-server-btn-delete">Delete</button>
    </div>
  </div>
  ```

**Status Indicators**:
- 🟢 Green = Connected
- 🟡 Yellow = Connecting / Reconnecting
- 🔴 Red = Disconnected / Error
- ⚫ Gray = Never connected

**Server Item Actions**:
- **Click on item**: Connect to server
- **Edit button**: Open configuration dialog
- **Delete button**: Remove server configuration (with confirmation)
- **Hover**: Show additional info (IP, uptime, etc.)

### 4. Recent Connections
**Element**: `.ssh-welcome-recent-list`
- **Display**: List of recent quick connect connections (not saved)
- **Purpose**: Quick access to recently connected servers
- **Item limit**: Last 8 connections
- **Click action**: Re-connect with same credentials (if cached)

### 5. Footer Section
**Element**: `.ssh-welcome-footer`
- **Keyboard shortcuts**: Display helpful shortcuts
  - `Ctrl+Shift+S`: Open SSH quick connect
  - `Ctrl+Shift+Q`: Close SSH welcome screen
  - `Esc`: Go back to main welcome screen

## CSS Styling

### New CSS Classes

```css
/* SSH Welcome Screen Container */
.ssh-welcome-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d30 100%);
    z-index: 1001; /* Higher than main welcome screen */
    overflow-y: auto;
}

.ssh-welcome-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 100vh;
    padding: 32px 20px;
    background: linear-gradient(135deg, #1a1a1a 0%, #2d2d30 100%);
    position: relative;
    overflow-y: auto;
}

.ssh-welcome-content {
    max-width: 800px;
    padding: 32px 24px;
    width: 100%;
    animation: fadeInUp 0.6s ease-out;
}

/* SSH Header */
.ssh-welcome-header {
    text-align: center;
    margin-bottom: 48px;
    position: relative;
}

.ssh-welcome-title {
    font-size: 42px;
    font-weight: 700;
    background: linear-gradient(135deg, #ffffff 0%, #0e639c 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin: 0 0 12px 0;
    letter-spacing: 1px;
    text-transform: uppercase;
}

.ssh-welcome-subtitle {
    font-size: 16px;
    color: #b0b0b0;
    margin: 0;
    font-weight: 400;
    letter-spacing: 0.5px;
}

/* SSH Actions */
.ssh-welcome-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
    margin-bottom: 32px;
}

.ssh-welcome-action-btn {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    background: rgba(45, 45, 48, 0.7);
    border: 1px solid rgba(14, 99, 156, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;
    backdrop-filter: blur(5px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.ssh-welcome-action-btn:hover {
    background: rgba(14, 99, 156, 0.2);
    border-color: #0e639c;
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(14, 99, 156, 0.3);
}

/* SSH Servers List */
.ssh-welcome-section {
    margin-bottom: 32px;
}

.ssh-welcome-section-title {
    font-size: 13px;
    font-weight: 600;
    color: #0e639c;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(14, 99, 156, 0.3);
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.ssh-welcome-servers-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.ssh-server-item {
    display: flex;
    align-items: center;
    padding: 16px 20px;
    background: rgba(37, 37, 38, 0.6);
    border: 1px solid rgba(14, 99, 156, 0.2);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(5px);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
    position: relative;
}

.ssh-server-item:hover {
    background: rgba(14, 99, 156, 0.15);
    border-color: rgba(14, 99, 156, 0.5);
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(14, 99, 156, 0.2);
}

.ssh-server-item:hover .ssh-server-actions {
    opacity: 1;
}

.ssh-server-status {
    font-size: 18px;
    margin-right: 16px;
    transition: all 0.3s ease;
}

.ssh-server-status.connected {
    animation: pulse 2s infinite;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}

.ssh-server-content {
    flex: 1;
    min-width: 0;
}

.ssh-server-name {
    font-size: 15px;
    font-weight: 600;
    color: #e0e0e0;
    margin-bottom: 4px;
}

.ssh-server-host {
    font-size: 12px;
    color: #999;
    font-family: 'Consolas', 'Monaco', monospace;
    margin-bottom: 2px;
}

.ssh-server-meta {
    font-size: 11px;
    color: #666;
    font-style: italic;
}

.ssh-server-actions {
    display: flex;
    gap: 8px;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.ssh-server-actions button {
    padding: 6px 12px;
    font-size: 11px;
    border: 1px solid rgba(14, 99, 156, 0.4);
    background: rgba(14, 99, 156, 0.1);
    color: #0e639c;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.ssh-server-actions button:hover {
    background: rgba(14, 99, 156, 0.3);
    border-color: #0e639c;
}

.ssh-server-actions .ssh-server-btn-connect {
    background: rgba(14, 99, 156, 0.3);
    color: #fff;
    font-weight: 600;
}

.ssh-server-actions .ssh-server-btn-delete {
    border-color: rgba(220, 50, 50, 0.4);
    color: #dc3232;
}

.ssh-server-actions .ssh-server-btn-delete:hover {
    background: rgba(220, 50, 50, 0.2);
    border-color: #dc3232;
}

/* Recent Connections */
.ssh-welcome-recent-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.ssh-recent-item {
    display: flex;
    align-items: center;
    padding: 12px 16px;
    background: rgba(37, 37, 38, 0.6);
    border: 1px solid rgba(14, 99, 156, 0.2);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    backdrop-filter: blur(5px);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.1);
}

.ssh-recent-item:hover {
    background: rgba(14, 99, 156, 0.15);
    border-color: rgba(14, 99, 156, 0.5);
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(14, 99, 156, 0.2);
}

.ssh-recent-icon {
    font-size: 16px;
    margin-right: 12px;
    opacity: 0.7;
}

.ssh-recent-content {
    flex: 1;
    min-width: 0;
}

.ssh-recent-name {
    font-size: 13px;
    font-weight: 500;
    color: #e0e0e0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Footer */
.ssh-welcome-footer {
    margin-top: 32px;
    text-align: center;
}

.ssh-welcome-help {
    padding: 12px 16px;
    background-color: rgba(14, 99, 156, 0.08);
    border-radius: 4px;
    border: 1px solid rgba(14, 99, 156, 0.15);
}

.ssh-welcome-help p {
    margin: 0;
    font-size: 12px;
    color: #aaa;
}

/* Back Button */
.ssh-welcome-back-btn {
    position: absolute;
    top: 24px;
    left: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    background: rgba(37, 37, 38, 0.8);
    border: 1px solid rgba(14, 99, 156, 0.3);
    border-radius: 4px;
    color: #0e639c;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s ease;
    backdrop-filter: blur(5px);
}

.ssh-welcome-back-btn:hover {
    background: rgba(14, 99, 156, 0.2);
    border-color: #0e639c;
    transform: translateX(-2px);
}

/* Responsive Design */
@media (max-width: 600px) {
    .ssh-welcome-actions {
        grid-template-columns: 1fr;
    }

    .ssh-welcome-content {
        padding: 24px 16px;
    }

    .ssh-welcome-title {
        font-size: 32px;
    }

    .ssh-server-actions {
        opacity: 1; /* Always visible on mobile */
    }
}
```

## Functional Requirements

### 1. Navigation Flow
1. User clicks "SSH Manager" button on main welcome screen
2. Main welcome screen fades out
3. SSH welcome screen fades in
4. User can click "Back" button to return to main welcome screen

### 2. Quick Connect Flow
1. User clicks "Quick Connect" button
2. Modal appears prompting for:
   - Host (with user@host format support)
   - Username (if not in host)
   - Port (default: 22)
   - Password or SSH key
3. Connection attempt begins
4. On success:
   - Transition to main IDE
   - Add to recent connections
5. On failure:
   - Show error message
   - Allow retry

### 3. Add Server Flow
1. User clicks "Add Server" button
2. Configuration dialog appears with fields:
   - **Name**: Friendly name for the server
   - **Host**: Hostname or IP address
   - **Port**: Port number (default: 22)
   - **Username**: SSH username
   - **Authentication**:
     - Password (stored securely in OS keychain)
     - SSH Key (path to private key)
     - Agent (use SSH agent)
   - **Default Path**: Optional default directory
   - **Tags**: Optional tags for organization
3. User fills out form
4. Click "Test Connection" to validate
5. Click "Save" to store configuration
6. Server appears in "Saved Servers" list

### 4. Server Management
- **Edit**: Click edit button or double-click server item
- **Delete**: Click delete button → confirmation dialog
- **Connect**: Click server item or connect button
- **Status Tracking**: Real-time connection status updates

### 5. Data Persistence
- **Storage Location**: `~/.swarm-ide/ssh-servers.json`
- **Credential Storage**: OS keychain (via `keytar` package)
- **Recent Connections**: Last 8 quick connect connections
- **Folder Cache**: Per-server folder structure cache

### 6. Security Considerations
- Passwords stored in OS keychain, never in plain text
- SSH keys referenced by path, not duplicated
- Connection timeout: 30 seconds default
- Auto-disconnect on idle: configurable
- Certificate validation for SSH connections

## Integration Points

### 1. EventBus Events
```javascript
// Navigate to SSH Welcome Screen
eventBus.emit('ssh:show-welcome-screen');

// Navigate back to main welcome screen
eventBus.emit('welcome:show-main-screen');

// Server selected and connected
eventBus.emit('ssh:server-connected', {
    serverId: 'server-id',
    serverConfig: { ... },
    connectionId: 'connection-id'
});

// Server connection failed
eventBus.emit('ssh:server-connection-failed', {
    serverId: 'server-id',
    error: 'Error message'
});

// Server configuration updated
eventBus.emit('ssh:server-config-updated', {
    serverId: 'server-id',
    config: { ... }
});
```

### 2. Service Integration
```javascript
// SSHService methods used
await sshService.createConnection(config);
await sshService.connect(connectionId);
await sshService.disconnect(connectionId);
await sshService.getConnections();

// Config methods
config.get('sshServers', []);
config.set('sshServers', servers);
config.get('sshRecentConnections', []);
```

### 3. Workspace Integration
When a server is connected:
```javascript
// Transition to main IDE (same as opening folder)
eventBus.emit('explorer:directory-opened', {
    path: `ssh://${serverConfig.host}`,
    type: 'ssh',
    connectionId: connectionId,
    serverConfig: serverConfig
});

// Hide SSH welcome screen
sshWelcomeScreen.hide();

// Show main app container
document.getElementById('app-container').style.display = 'block';
```

## Implementation Phases

### Phase 1: Basic UI Structure ✅
- [x] Create SSHWelcomeScreen component class
- [x] Implement render() method with HTML structure
- [x] Add CSS styles to styles.css
- [x] Implement show() and hide() methods
- [x] Integrate with main WelcomeScreen navigation

### Phase 2: Quick Connect
- [ ] Implement quick connect button handler
- [ ] Use Modal component for connection prompts
- [ ] Connect to SSH service
- [ ] Handle connection success/failure
- [ ] Add to recent connections
- [ ] Transition to main IDE on success

### Phase 3: Server Management
- [ ] Create server configuration dialog
- [ ] Implement add server functionality
- [ ] Implement edit server functionality
- [ ] Implement delete server functionality
- [ ] Save/load server configs from storage
- [ ] Integrate with keytar for password storage

### Phase 4: Server List Display
- [ ] Load saved servers on render
- [ ] Display servers with status indicators
- [ ] Implement click to connect
- [ ] Show connection progress
- [ ] Update status in real-time
- [ ] Handle connection errors

### Phase 5: Recent Connections
- [ ] Track quick connect history
- [ ] Display recent connections
- [ ] Implement click to reconnect
- [ ] Cache credentials (if user opts in)
- [ ] Limit to 8 most recent

### Phase 6: Advanced Features
- [ ] SSH settings panel
- [ ] Import/export configurations
- [ ] Server tags and filtering
- [ ] Search functionality
- [ ] Folder caching per server
- [ ] Connection health monitoring

## User Experience Goals

1. **Familiar**: Feels like the main welcome screen
2. **Fast**: Quick connect in under 5 seconds
3. **Secure**: Credentials never stored in plain text
4. **Reliable**: Connection errors handled gracefully
5. **Discoverable**: Clear actions and intuitive navigation
6. **Efficient**: Recently used servers easily accessible
7. **Professional**: Matches VSCode/JetBrains quality

## Success Metrics

- Time to first SSH connection < 30 seconds
- Connection success rate > 95%
- User retention on SSH features > 80%
- Zero plain-text credential storage
- Average connection time < 5 seconds
