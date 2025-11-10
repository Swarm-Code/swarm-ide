import { EventEmitter } from 'events';

/**
 * SSHConnectionManager - Main process connection manager
 * This should run in the main process, not renderer
 * Manages ssh2.Client connections with multiplexing support
 */
class SSHConnectionManager extends EventEmitter {
  constructor() {
    super();
    this._connections = new Map(); // connectionId -> { client, sftp, state, config, channels }
    this._keepaliveIntervals = new Map(); // connectionId -> intervalId
  }

  /**
   * Create a new SSH connection with SFTP
   * @param {Object} config - Connection configuration
   * @param {string} config.id - Unique connection ID
   * @param {string} config.host - Remote host
   * @param {number} config.port - SSH port (default 22)
   * @param {string} config.username - Username
   * @param {Object} credentials - Authentication credentials
   * @param {string} credentials.password - Password (optional)
   * @param {string} credentials.privateKey - Private key content (optional)
   * @returns {Promise<Object>} Connection info
   */
  async connect(config, credentials, Client) {
    const { id, host, port = 22, username } = config;

    if (this._connections.has(id)) {
      const existing = this._connections.get(id);
      if (existing.state === 'connected') {
        process.stdout.write(`[SSHConnectionManager] Reusing existing connection: ${id}\n`);
        return {
          id,
          state: 'connected',
          host,
          port,
          username
        };
      }
    }

    process.stdout.write(`[SSHConnectionManager] Creating new connection: ${id}\n`);

    const client = new Client();
    
    return new Promise((resolve, reject) => {
      const connectionData = {
        client,
        sftp: null,
        state: 'connecting',
        config,
        channels: new Set() // Track all channels (SFTP + PTY shells)
      };

      this._connections.set(id, connectionData);
      this.emit('connecting', id);

      client.on('ready', () => {
        process.stdout.write('[SSHConnectionManager] Client ready, requesting SFTP...\n');
        connectionData.state = 'connected';
        
        // Request SFTP session
        client.sftp((err, sftp) => {
          if (err) {
            process.stderr.write(`[SSHConnectionManager] SFTP error: ${err}\n`);
            connectionData.state = 'error';
            this.emit('error', id, err);
            reject(new Error(`SFTP failed: ${err.message}`));
            return;
          }

          process.stdout.write('[SSHConnectionManager] SFTP session established\n');
          connectionData.sftp = sftp;
          connectionData.channels.add('sftp');

          // Setup keepalive
          this._setupKeepalive(id, client);

          this.emit('connected', id);
          
          resolve({
            id,
            state: 'connected',
            host,
            port,
            username
          });
        });
      });

      client.on('error', (err) => {
        process.stderr.write(`[SSHConnectionManager] Connection error: ${err}\n`);
        connectionData.state = 'error';
        this.emit('error', id, err);
        this._connections.delete(id);
        reject(err);
      });

      client.on('close', () => {
        process.stdout.write(`[SSHConnectionManager] Connection closed: ${id}\n`);
        this._cleanup(id);
        this.emit('disconnected', id);
      });

      // Connect with credentials
      const connectConfig = {
        host,
        port,
        username,
        readyTimeout: 20000,
        keepaliveInterval: 10000
      };

      if (credentials.privateKey) {
        connectConfig.privateKey = credentials.privateKey;
        process.stdout.write('[SSHConnectionManager] Connecting with private key...\n');
      } else if (credentials.password) {
        connectConfig.password = credentials.password;
        process.stdout.write('[SSHConnectionManager] Connecting with password...\n');
      } else {
        reject(new Error('No valid credentials provided'));
        return;
      }

      client.connect(connectConfig);
    });
  }

  /**
   * Create a PTY shell channel on an existing connection
   * @param {string} connectionId - Connection ID
   * @param {Object} options - PTY options (cols, rows, term)
   * @returns {Promise<Stream>} PTY stream
   */
  async createShellChannel(connectionId, options = {}) {
    const conn = this._connections.get(connectionId);
    if (!conn) {
      throw new Error(`Connection ${connectionId} not found`);
    }

    if (conn.state !== 'connected') {
      throw new Error(`Connection ${connectionId} not ready (state: ${conn.state})`);
    }

    const shellOptions = {
      term: options.term || 'xterm-256color',
      cols: options.cols || 80,
      rows: options.rows || 30
    };

    return new Promise((resolve, reject) => {
      conn.client.shell(shellOptions, (err, stream) => {
        if (err) {
          process.stderr.write(`[SSHConnectionManager] Shell error: ${err}\n`);
          reject(err);
          return;
        }

        process.stdout.write('[SSHConnectionManager] Shell channel created\n');
        conn.channels.add(stream);

        // Clean up on stream close
        stream.on('close', () => {
          conn.channels.delete(stream);
          process.stdout.write(`[SSHConnectionManager] Shell channel closed, remaining: ${conn.channels.size}\n`);
        });

        resolve(stream);
      });
    });
  }

  /**
   * Get connection by ID
   */
  getConnection(id) {
    return this._connections.get(id);
  }

  /**
   * Get SFTP session for a connection
   */
  getSftpSession(id) {
    const conn = this._connections.get(id);
    return conn?.sftp;
  }

  /**
   * Get all connections
   */
  getAllConnections() {
    return Array.from(this._connections.entries()).map(([id, conn]) => ({
      id,
      state: conn.state,
      config: conn.config,
      channelCount: conn.channels.size
    }));
  }

  /**
   * Check if connection is active and ready
   */
  isConnected(id) {
    const conn = this._connections.get(id);
    return conn && conn.state === 'connected';
  }

  /**
   * Disconnect and cleanup connection
   */
  async disconnect(id) {
    const conn = this._connections.get(id);
    if (!conn) return;

    process.stdout.write(`[SSHConnectionManager] Disconnecting: ${id}\n`);

    // Close all channels
    for (const channel of conn.channels) {
      if (typeof channel === 'object' && channel.close) {
        channel.close();
      }
    }

    // End client connection
    if (conn.client) {
      conn.client.end();
    }

    this._cleanup(id);
  }

  /**
   * Setup keepalive for connection
   */
  _setupKeepalive(id, client) {
    const interval = setInterval(() => {
      if (this._connections.has(id)) {
        client.exec('echo keepalive', (err) => {
          if (err) {
            console.error('[SSHConnectionManager] Keepalive failed:', err);
          }
        });
      } else {
        clearInterval(interval);
      }
    }, 30000); // 30 seconds

    this._keepaliveIntervals.set(id, interval);
  }

  /**
   * Cleanup connection resources
   */
  _cleanup(id) {
    const interval = this._keepaliveIntervals.get(id);
    if (interval) {
      clearInterval(interval);
      this._keepaliveIntervals.delete(id);
    }

    this._connections.delete(id);
  }

  /**
   * Cleanup all connections (on app shutdown)
   */
  disconnectAll() {
    process.stdout.write('[SSHConnectionManager] Disconnecting all connections...\n');
    for (const [id] of this._connections) {
      this.disconnect(id);
    }
  }
}

// Export class (not singleton, main process will instantiate)
export default SSHConnectionManager;
