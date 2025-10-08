/**
 * LSPClient - Client-side LSP communication
 *
 * Runs in the renderer process.
 * Communicates with LanguageServerManager via IPC.
 * Manages document synchronization and LSP requests.
 */

const eventBus = require('../modules/EventBus');
const stateManager = require('../modules/StateManager');

class LSPClient {
    constructor() {
        this.openDocuments = new Map(); // filePath -> document info
        this.version = 1;
    }

    /**
     * Determine language ID from file path
     * @param {string} filePath - File path
     * @returns {string} Language ID
     */
    getLanguageId(filePath) {
        const ext = filePath.split('.').pop().toLowerCase();
        const langMap = {
            'js': 'javascript',
            'jsx': 'javascript',
            'ts': 'typescript',
            'tsx': 'typescript',
            'py': 'javascript', // Use JS server for Python too
            'java': 'javascript', // Use JS server for Java
            'c': 'javascript',
            'cpp': 'javascript',
            'h': 'javascript',
            'css': 'javascript',
            'html': 'javascript',
            'json': 'javascript',
            'md': 'javascript',
            'txt': 'javascript'
        };
        // Default to javascript for all file types to get basic LSP features
        return langMap[ext] || 'javascript';
    }

    /**
     * Get workspace root path
     * @returns {string} Root path
     */
    getRootPath() {
        return stateManager.get('currentDirectory') || process.cwd();
    }

    /**
     * Notify LSP that a document was opened
     * @param {string} filePath - File path
     * @param {string} content - File content
     */
    async didOpen(filePath, content) {
        const languageId = this.getLanguageId(filePath);
        const uri = `file://${filePath}`;

        this.openDocuments.set(filePath, {
            uri,
            languageId,
            version: this.version++,
            content
        });

        const params = {
            textDocument: {
                uri,
                languageId,
                version: this.openDocuments.get(filePath).version,
                text: content
            }
        };

        try {
            await window.electronAPI.lspNotification(
                languageId,
                'textDocument/didOpen',
                params,
                this.getRootPath()
            );
            console.log(`[LSP] Document opened: ${filePath}`);
        } catch (error) {
            console.error('[LSP] didOpen error:', error);
        }
    }

    /**
     * Notify LSP that a document changed
     * @param {string} filePath - File path
     * @param {string} content - New content
     */
    async didChange(filePath, content) {
        const doc = this.openDocuments.get(filePath);
        if (!doc) {
            console.warn(`[LSP] Document not open: ${filePath}`);
            return;
        }

        doc.version++;
        doc.content = content;

        const params = {
            textDocument: {
                uri: doc.uri,
                version: doc.version
            },
            contentChanges: [{
                text: content
            }]
        };

        try {
            await window.electronAPI.lspNotification(
                doc.languageId,
                'textDocument/didChange',
                params,
                this.getRootPath()
            );
        } catch (error) {
            console.error('[LSP] didChange error:', error);
        }
    }

    /**
     * Notify LSP that a document was saved
     * @param {string} filePath - File path
     */
    async didSave(filePath) {
        const doc = this.openDocuments.get(filePath);
        if (!doc) return;

        const params = {
            textDocument: {
                uri: doc.uri
            },
            text: doc.content
        };

        try {
            await window.electronAPI.lspNotification(
                doc.languageId,
                'textDocument/didSave',
                params,
                this.getRootPath()
            );
            console.log(`[LSP] Document saved: ${filePath}`);
        } catch (error) {
            console.error('[LSP] didSave error:', error);
        }
    }

    /**
     * Notify LSP that a document was closed
     * @param {string} filePath - File path
     */
    async didClose(filePath) {
        const doc = this.openDocuments.get(filePath);
        if (!doc) return;

        const params = {
            textDocument: {
                uri: doc.uri
            }
        };

        try {
            await window.electronAPI.lspNotification(
                doc.languageId,
                'textDocument/didClose',
                params,
                this.getRootPath()
            );
            this.openDocuments.delete(filePath);
            console.log(`[LSP] Document closed: ${filePath}`);
        } catch (error) {
            console.error('[LSP] didClose error:', error);
        }
    }

    /**
     * Request code completion
     * @param {string} filePath - File path
     * @param {number} line - Line number (0-indexed)
     * @param {number} character - Character position (0-indexed)
     * @returns {Promise<Array>} Completion items
     */
    async completion(filePath, line, character) {
        const doc = this.openDocuments.get(filePath);
        if (!doc) return [];

        const params = {
            textDocument: {
                uri: doc.uri
            },
            position: {
                line,
                character
            }
        };

        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/completion',
                params,
                this.getRootPath()
            );

            if (response.success && response.result) {
                const items = Array.isArray(response.result)
                    ? response.result
                    : response.result.items || [];
                return items;
            }
        } catch (error) {
            console.error('[LSP] completion error:', error);
        }

        return [];
    }

    /**
     * Request hover information
     * @param {string} filePath - File path
     * @param {number} line - Line number (0-indexed)
     * @param {number} character - Character position (0-indexed)
     * @returns {Promise<Object|null>} Hover information
     */
    async hover(filePath, line, character) {
        const doc = this.openDocuments.get(filePath);
        if (!doc) return null;

        const params = {
            textDocument: {
                uri: doc.uri
            },
            position: {
                line,
                character
            }
        };

        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/hover',
                params,
                this.getRootPath()
            );

            if (response.success && response.result) {
                return response.result;
            }
        } catch (error) {
            console.error('[LSP] hover error:', error);
        }

        return null;
    }

    /**
     * Request signature help
     * @param {string} filePath - File path
     * @param {number} line - Line number (0-indexed)
     * @param {number} character - Character position (0-indexed)
     * @returns {Promise<Object|null>} Signature help
     */
    async signatureHelp(filePath, line, character) {
        const doc = this.openDocuments.get(filePath);
        if (!doc) return null;

        const params = {
            textDocument: {
                uri: doc.uri
            },
            position: {
                line,
                character
            }
        };

        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/signatureHelp',
                params,
                this.getRootPath()
            );

            if (response.success && response.result) {
                return response.result;
            }
        } catch (error) {
            console.error('[LSP] signatureHelp error:', error);
        }

        return null;
    }

    /**
     * Request go to definition
     * @param {string} filePath - File path
     * @param {number} line - Line number (0-indexed)
     * @param {number} character - Character position (0-indexed)
     * @returns {Promise<Object|null>} Definition location
     */
    async definition(filePath, line, character) {
        console.log('[LSPClient] definition() called for:', filePath, 'at', line, character);
        const doc = this.openDocuments.get(filePath);
        if (!doc) {
            console.error('[LSPClient] Document not open:', filePath);
            return null;
        }

        const params = {
            textDocument: {
                uri: doc.uri
            },
            position: {
                line,
                character
            }
        };

        console.log('[LSPClient] Sending definition request:', params);
        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/definition',
                params,
                this.getRootPath()
            );

            console.log('[LSPClient] definition() response:', response);
            if (response.success && response.result) {
                return response.result;
            }
        } catch (error) {
            console.error('[LSPClient] definition error:', error);
        }

        return null;
    }

    /**
     * Request find all references
     * @param {string} filePath - File path
     * @param {number} line - Line number (0-indexed)
     * @param {number} character - Character position (0-indexed)
     * @param {boolean} includeDeclaration - Include declaration in results
     * @returns {Promise<Array>} Reference locations
     */
    async references(filePath, line, character, includeDeclaration = true) {
        console.log('[LSPClient] references() called for:', filePath, 'at', line, character);
        const doc = this.openDocuments.get(filePath);
        if (!doc) {
            console.error('[LSPClient] Document not open:', filePath);
            return [];
        }

        const params = {
            textDocument: {
                uri: doc.uri
            },
            position: {
                line,
                character
            },
            context: {
                includeDeclaration
            }
        };

        console.log('[LSPClient] Sending references request:', params);
        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/references',
                params,
                this.getRootPath()
            );

            console.log('[LSPClient] references() response:', response);
            if (response.success && response.result) {
                return Array.isArray(response.result) ? response.result : [];
            }
        } catch (error) {
            console.error('[LSPClient] references error:', error);
        }

        return [];
    }

    /**
     * Request rename symbol
     * @param {string} filePath - File path
     * @param {number} line - Line number (0-indexed)
     * @param {number} character - Character position (0-indexed)
     * @param {string} newName - New symbol name
     * @returns {Promise<Object|null>} Workspace edit with changes
     */
    async rename(filePath, line, character, newName) {
        console.log('[LSPClient] rename() called for:', filePath, 'at', line, character, 'newName:', newName);
        const doc = this.openDocuments.get(filePath);
        if (!doc) {
            console.error('[LSPClient] Document not open:', filePath);
            return null;
        }

        const params = {
            textDocument: {
                uri: doc.uri
            },
            position: {
                line,
                character
            },
            newName
        };

        console.log('[LSPClient] Sending rename request:', params);
        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/rename',
                params,
                this.getRootPath()
            );

            console.log('[LSPClient] rename() response:', response);
            if (response.success && response.result) {
                return response.result;
            }
        } catch (error) {
            console.error('[LSPClient] rename error:', error);
        }

        return null;
    }

    /**
     * Request document formatting
     * @param {string} filePath - File path
     * @param {number} tabSize - Tab size (default 4)
     * @param {boolean} insertSpaces - Use spaces instead of tabs (default true)
     * @returns {Promise<Array>} Text edits to format the document
     */
    async formatting(filePath, tabSize = 4, insertSpaces = true) {
        console.log('[LSPClient] formatting() called for:', filePath);
        const doc = this.openDocuments.get(filePath);
        if (!doc) {
            console.error('[LSPClient] Document not open:', filePath);
            return [];
        }

        const params = {
            textDocument: {
                uri: doc.uri
            },
            options: {
                tabSize,
                insertSpaces
            }
        };

        console.log('[LSPClient] Sending formatting request:', params);
        try {
            const response = await window.electronAPI.lspRequest(
                doc.languageId,
                'textDocument/formatting',
                params,
                this.getRootPath()
            );

            console.log('[LSPClient] formatting() response:', response);
            if (response.success && response.result) {
                return Array.isArray(response.result) ? response.result : [];
            }
        } catch (error) {
            console.error('[LSPClient] formatting error:', error);
        }

        return [];
    }
}

// Export singleton instance
const lspClient = new LSPClient();
module.exports = lspClient;
