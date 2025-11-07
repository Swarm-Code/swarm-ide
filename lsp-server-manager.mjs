/**
 * LSP Server Manager - Runs in Electron main process
 * Spawns and manages LSP server child processes
 */

import { spawn } from 'child_process';
import { BrowserWindow } from 'electron';

export class LspServerManager {
  constructor() {
    this.servers = new Map(); // languageId -> { process, config }
  }

  /**
   * Start an LSP server for a language
   */
  startServer(languageId, serverConfig) {
    if (this.servers.has(languageId)) {
      console.log(`[LSP] Server for ${languageId} already running`);
      return { success: true, message: 'Server already running' };
    }

    console.log(`[LSP] Starting server for ${languageId}`, serverConfig);

    try {
      const { command, args, cwd } = serverConfig;
      
      const serverProcess = spawn(command, args || [], {
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      // Buffer for incomplete JSON-RPC messages
      let messageBuffer = '';

      // Handle stdout from LSP server
      serverProcess.stdout.on('data', (data) => {
        messageBuffer += data.toString();
        
        // Try to parse complete messages
        const messages = this.extractMessages(messageBuffer);
        
        messages.forEach(message => {
          this.sendToRenderer(languageId, message);
        });

        // Keep the incomplete part in buffer
        const lastNewline = messageBuffer.lastIndexOf('\n');
        if (lastNewline !== -1) {
          messageBuffer = messageBuffer.substring(lastNewline + 1);
        }
      });

      serverProcess.stderr.on('data', (data) => {
        console.error(`[LSP ${languageId}] Error:`, data.toString());
      });

      serverProcess.on('error', (error) => {
        console.error(`[LSP ${languageId}] Process error:`, error);
        this.servers.delete(languageId);
      });

      serverProcess.on('exit', (code) => {
        console.log(`[LSP ${languageId}] Process exited with code ${code}`);
        this.servers.delete(languageId);
      });

      this.servers.set(languageId, {
        process: serverProcess,
        config: serverConfig
      });

      return { success: true, message: 'Server started' };
    } catch (error) {
      console.error(`[LSP] Failed to start server for ${languageId}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Extract complete JSON-RPC messages from buffer
   */
  extractMessages(buffer) {
    const messages = [];
    const lines = buffer.split('\n');
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i].trim();
      
      // Look for Content-Length header
      if (line.startsWith('Content-Length:')) {
        const length = parseInt(line.split(':')[1].trim());
        
        // Skip blank line after headers
        i++;
        while (i < lines.length && lines[i].trim() === '') {
          i++;
        }
        
        // Get the message content
        if (i < lines.length) {
          const content = lines[i];
          if (content.length >= length) {
            try {
              const message = JSON.parse(content.substring(0, length));
              messages.push(message);
            } catch (e) {
              console.error('[LSP] Failed to parse message:', e);
            }
          }
        }
      }
      i++;
    }
    
    return messages;
  }

  /**
   * Send message to renderer process
   */
  sendToRenderer(languageId, message) {
    const window = BrowserWindow.getAllWindows()[0];
    if (window) {
      window.webContents.send('lsp:message', {
        languageId,
        message
      });
    }
  }

  /**
   * Send message to LSP server
   */
  sendMessage(languageId, message) {
    const server = this.servers.get(languageId);
    if (!server) {
      console.error(`[LSP] No server running for ${languageId}`);
      return { success: false, error: 'Server not running' };
    }

    try {
      const content = JSON.stringify(message);
      const header = `Content-Length: ${content.length}\r\n\r\n`;
      const packet = header + content;
      
      server.process.stdin.write(packet);
      return { success: true };
    } catch (error) {
      console.error(`[LSP ${languageId}] Failed to send message:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Stop an LSP server
   */
  stopServer(languageId) {
    const server = this.servers.get(languageId);
    if (server) {
      server.process.kill();
      this.servers.delete(languageId);
      return { success: true };
    }
    return { success: false, error: 'Server not found' };
  }

  /**
   * Stop all LSP servers
   */
  stopAll() {
    this.servers.forEach((server, languageId) => {
      console.log(`[LSP] Stopping server for ${languageId}`);
      server.process.kill();
    });
    this.servers.clear();
  }
}

// Export singleton instance
export const lspServerManager = new LspServerManager();
