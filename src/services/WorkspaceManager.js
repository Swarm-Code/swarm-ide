/**
 * WorkspaceManager - Coordinates workspace creation and SSH integration
 * Manages the lifecycle of workspaces (local and SSH)
 */
class WorkspaceManager {
  constructor() {
    this.workspaces = new Map(); // workspaceId -> workspace config
  }

  /**
   * Create a new workspace
   * @param {Object} config - Workspace configuration
   * @param {string} config.id - Unique workspace ID
   * @param {string} config.type - 'local' or 'ssh'
   * @param {string} config.path - Workspace path (local path or remote path)
   * @param {string} config.name - Workspace display name
   * @param {Object} config.sshConnection - SSH connection config (if type is 'ssh')
   * @param {string} config.color - Workspace color identifier
   * @returns {Object} Workspace object
   */
  createWorkspace(config) {
    const { id, type, path, name, sshConnection, color } = config;

    if (this.workspaces.has(id)) {
      throw new Error(`Workspace ${id} already exists`);
    }

    const workspace = {
      id,
      type,
      path,
      name: name || this._getDefaultName(type, path),
      color: color || this._generateColor(),
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      sshConnection: type === 'ssh' ? sshConnection : null
    };

    this.workspaces.set(id, workspace);

    console.log('[WorkspaceManager] Created workspace:', {
      id,
      type,
      name: workspace.name,
      isSSH: type === 'ssh'
    });

    return workspace;
  }

  /**
   * Get workspace by ID
   */
  getWorkspace(id) {
    const workspace = this.workspaces.get(id);
    if (workspace) {
      workspace.lastAccessedAt = Date.now();
    }
    return workspace;
  }

  /**
   * Get all workspaces
   */
  getAllWorkspaces() {
    return Array.from(this.workspaces.values());
  }

  /**
   * Update workspace
   */
  updateWorkspace(id, updates) {
    const workspace = this.workspaces.get(id);
    if (!workspace) {
      throw new Error(`Workspace ${id} not found`);
    }

    Object.assign(workspace, updates);
    workspace.lastAccessedAt = Date.now();

    return workspace;
  }

  /**
   * Delete workspace
   */
  deleteWorkspace(id) {
    if (!this.workspaces.has(id)) {
      throw new Error(`Workspace ${id} not found`);
    }

    this.workspaces.delete(id);
    console.log('[WorkspaceManager] Deleted workspace:', id);
  }

  /**
   * Check if workspace is SSH-based
   */
  isSSHWorkspace(id) {
    const workspace = this.workspaces.get(id);
    return workspace && workspace.type === 'ssh';
  }

  /**
   * Get SSH connection for workspace
   */
  getSSHConnection(id) {
    const workspace = this.workspaces.get(id);
    return workspace?.type === 'ssh' ? workspace.sshConnection : null;
  }

  /**
   * Generate default workspace name
   */
  _getDefaultName(type, path) {
    if (type === 'ssh') {
      // Extract last segment of remote path
      const segments = path.split('/').filter(s => s);
      return segments[segments.length - 1] || 'SSH Workspace';
    }
    // Extract directory name from local path
    const segments = path.split(/[/\\]/).filter(s => s);
    return segments[segments.length - 1] || 'Workspace';
  }

  /**
   * Generate random color for workspace
   */
  _generateColor() {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B739', '#52B788', '#E76F51', '#2A9D8F'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Serialize workspaces for storage
   */
  serialize() {
    return Array.from(this.workspaces.values());
  }

  /**
   * Load workspaces from storage
   */
  deserialize(data) {
    if (!Array.isArray(data)) return;

    this.workspaces.clear();
    for (const workspace of data) {
      this.workspaces.set(workspace.id, workspace);
    }

    console.log('[WorkspaceManager] Loaded workspaces:', this.workspaces.size);
  }
}

// Singleton instance
export const workspaceManager = new WorkspaceManager();
