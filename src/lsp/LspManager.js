/**
 * LSP Manager - Handles LSP server lifecycle and message routing
 * Runs in the renderer process, communicates with main process via IPC
 */

export class LspManager {
  constructor() {
    this.servers = new Map(); // languageId -> server info
    this.messageHandlers = new Map(); // requestId -> handler
    this.requestId = 0;
  }

  /**
   * Start an LSP server for a language
   */
  async startServer(languageId, serverConfig) {
    if (this.servers.has(languageId)) {
      console.log(`[LspManager] Server for ${languageId} already running`);
      return;
    }

    console.log(`[LspManager] Starting LSP server for ${languageId}`);
    
    // Request main process to start the LSP server
    const result = await window.electronAPI.lspStartServer({
      languageId,
      serverConfig
    });

    if (result.success) {
      this.servers.set(languageId, {
        languageId,
        serverConfig,
        capabilities: null
      });

      // Listen for messages from this server
      this.setupMessageListener(languageId);
    }

    return result;
  }

  /**
   * Send a request to the LSP server
   */
  async sendRequest(languageId, method, params) {
    const id = ++this.requestId;
    
    return new Promise((resolve, reject) => {
      // Store handler for response
      this.messageHandlers.set(id, { resolve, reject });

      // Send request to main process
      window.electronAPI.lspSendMessage({
        languageId,
        message: {
          jsonrpc: '2.0',
          id,
          method,
          params
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.messageHandlers.has(id)) {
          this.messageHandlers.delete(id);
          reject(new Error(`LSP request timeout: ${method}`));
        }
      }, 30000);
    });
  }

  /**
   * Send a notification to the LSP server (no response expected)
   */
  sendNotification(languageId, method, params) {
    window.electronAPI.lspSendMessage({
      languageId,
      message: {
        jsonrpc: '2.0',
        method,
        params
      }
    });
  }

  /**
   * Setup listener for messages from LSP server
   */
  setupMessageListener(languageId) {
    window.electronAPI.onLspMessage((data) => {
      if (data.languageId !== languageId) return;

      const message = data.message;

      // Handle response to request
      if (message.id !== undefined && this.messageHandlers.has(message.id)) {
        const handler = this.messageHandlers.get(message.id);
        this.messageHandlers.delete(message.id);

        if (message.error) {
          handler.reject(new Error(message.error.message || 'LSP error'));
        } else {
          handler.resolve(message.result);
        }
      }

      // Handle server notifications (diagnostics, etc.)
      if (message.method) {
        this.handleServerNotification(languageId, message.method, message.params);
      }
    });
  }

  /**
   * Handle notifications from the LSP server
   */
  handleServerNotification(languageId, method, params) {
    console.log(`[LspManager] Notification from ${languageId}:`, method);

    // Dispatch custom events for notifications
    window.dispatchEvent(new CustomEvent('lsp:notification', {
      detail: { languageId, method, params }
    }));
  }

  /**
   * Initialize the server (send initialize request)
   */
  async initialize(languageId, workspaceFolder) {
    const result = await this.sendRequest(languageId, 'initialize', {
      processId: null,
      clientInfo: {
        name: 'SwarmIDE',
        version: '1.0.0'
      },
      rootUri: workspaceFolder ? `file://${workspaceFolder}` : null,
      capabilities: {
        textDocument: {
          hover: {
            dynamicRegistration: true,
            contentFormat: ['markdown', 'plaintext']
          },
          publishDiagnostics: {
            relatedInformation: true,
            versionSupport: true,
            codeDescriptionSupport: true,
            dataSupport: true
          },
          completion: {
            dynamicRegistration: true,
            completionItem: {
              snippetSupport: true,
              commitCharactersSupport: true,
              documentationFormat: ['markdown', 'plaintext']
            }
          },
          signatureHelp: {
            dynamicRegistration: true,
            signatureInformation: {
              documentationFormat: ['markdown', 'plaintext']
            }
          },
          definition: {
            dynamicRegistration: true,
            linkSupport: true
          },
          references: {
            dynamicRegistration: true
          },
          documentSymbol: {
            dynamicRegistration: true
          }
        },
        workspace: {
          didChangeConfiguration: {
            dynamicRegistration: true
          }
        }
      }
    });

    // Send initialized notification
    this.sendNotification(languageId, 'initialized', {});

    // Store server capabilities
    const serverInfo = this.servers.get(languageId);
    if (serverInfo) {
      serverInfo.capabilities = result.capabilities;
    }

    return result;
  }

  /**
   * Notify server of document open
   */
  didOpenTextDocument(languageId, uri, text, version = 1) {
    this.sendNotification(languageId, 'textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text
      }
    });
  }

  /**
   * Notify server of document change
   */
  didChangeTextDocument(languageId, uri, changes, version) {
    this.sendNotification(languageId, 'textDocument/didChange', {
      textDocument: {
        uri,
        version
      },
      contentChanges: changes
    });
  }

  /**
   * Notify server of document close
   */
  didCloseTextDocument(languageId, uri) {
    this.sendNotification(languageId, 'textDocument/didClose', {
      textDocument: { uri }
    });
  }

  /**
   * Request hover information
   */
  async hover(languageId, uri, position) {
    return this.sendRequest(languageId, 'textDocument/hover', {
      textDocument: { uri },
      position
    });
  }

  /**
   * Request completion
   */
  async completion(languageId, uri, position) {
    return this.sendRequest(languageId, 'textDocument/completion', {
      textDocument: { uri },
      position
    });
  }

  /**
   * Shutdown a server
   */
  async shutdownServer(languageId) {
    if (!this.servers.has(languageId)) return;

    await this.sendRequest(languageId, 'shutdown', null);
    this.sendNotification(languageId, 'exit', null);

    this.servers.delete(languageId);

    // Tell main process to kill the server
    await window.electronAPI.lspStopServer({ languageId });
  }

  /**
   * Shutdown all servers
   */
  async shutdownAll() {
    const languageIds = Array.from(this.servers.keys());
    await Promise.all(languageIds.map(id => this.shutdownServer(id)));
  }
}

// Global instance
export const lspManager = new LspManager();
