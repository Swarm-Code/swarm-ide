/**
 * TextEditor - Code editor with syntax highlighting
 *
 * Provides code editing with:
 * - CodeMirror integration
 * - Syntax highlighting
 * - Dirty state tracking
 * - Save functionality (Ctrl+S)
 * - Line numbers
 *
 * Usage:
 *   const editor = new TextEditor(container, content, filePath);
 */

const eventBus = require('../modules/EventBus');
const logger = require('../utils/Logger');
const stateManager = require('../modules/StateManager');
const fileTypes = require('../utils/FileTypes');
const lspClient = require('../services/LSPClient');
const settingsPanel = require('./SettingsPanel');
const ContextMenu = require('./ContextMenu');
const MouseTracker = require('./MouseTracker');
const fileStateTracker = require('../modules/FileStateTracker');
const performanceMonitor = require('../utils/PerformanceMonitor');
const DiffHighlighter = require('../utils/DiffHighlighter');

// Git integration
let gitBlameService = null;
let gitDiffService = null;
let gitStore = null;

// Lazy load Git services (will be initialized in renderer.js)
function getGitServices() {
    if (!gitBlameService) {
        try {
            const { GitBlameService } = require('../services/GitBlameService');
            const { GitDiffService } = require('../services/GitDiffService');
            const gitService = require('../services/GitService').getInstance();
            gitStore = require('../modules/GitStore').getInstance();

            gitBlameService = new GitBlameService(gitService);
            gitDiffService = new GitDiffService(gitService);
        } catch (error) {
            logger.warn('editorChange', 'Git services not available:', error.message);
        }
    }
    return { gitBlameService, gitDiffService, gitStore };
}

class TextEditor {
    constructor(container, content, filePath, options = {}) {
        logger.debug('editorInit', '========== CONSTRUCTOR ==========');
        logger.debug('editorInit', 'container:', container);
        logger.debug('editorInit', 'container dataset:', container.dataset);
        logger.debug('editorInit', 'filePath:', filePath);
        logger.debug('editorInit', 'content length:', content.length);
        logger.debug('editorInit', 'options:', options);

        this.container = container;
        this.content = content;
        this.filePath = filePath;
        this.isDirty = false;
        this.editor = null;
        this.hoverTimeout = null;
        this.hoverTooltip = null;
        this.changeTimeout = null;
        this.currentInlineCompletion = null;
        this.inlineCompletionWidget = null;
        this.contextMenu = null;

        // Git integration state
        this.gitBlameEnabled = false;
        this.gitBlameData = null;
        this.gitDiffEnabled = options.enableGitDiff || false; // Only enable if explicitly requested
        this.gitDiffData = null;
        this.diffTextMarkers = []; // Store character-level diff markers
        this.diffLineWidgets = []; // Store deleted line widgets

        // Start tracking this file with hash-based modification detection
        fileStateTracker.trackFile(filePath, content);

        logger.debug('editorInit', 'About to call init()');
        this.init();
        logger.debug('editorInit', '========================================');
    }

    /**
     * Initialize LSP for this document
     */
    async initLSP() {
        try {
            await lspClient.didOpen(this.filePath, this.content);
            logger.debug('lspClient', 'LSP initialized for:', this.filePath);
        } catch (error) {
            logger.error('editorChange', 'LSP init error:', error);
        }
    }

    /**
     * Initialize the editor
     */
    async init() {
        logger.debug('editorInit', 'init() START');

        // Wrap render with performance measurement
        performanceMonitor.measure('TextEditor.render', () => {
            this.render();
        }, { filePath: this.filePath, contentLength: this.content.length });

        logger.debug('editorInit', 'render() DONE');

        // Start mouse tracking with hover callback
        this.mouseTracker = new MouseTracker(this.editor, (pos, token, event) => {
            this.handleHover(pos, token, event);
        });
        this.mouseTracker.start();

        this.setupEventListeners();
        logger.debug('editorInit', 'setupEventListeners() DONE');
        logger.debug('editorInit', 'About to call setupLSPFeatures()...');
        try {
            this.setupLSPFeatures();
            logger.debug('editorInit', 'setupLSPFeatures() DONE');
        } catch (error) {
            logger.error('editorChange', 'setupLSPFeatures() ERROR:', error);
        }
        logger.debug('editorInit', 'About to call initLSP()...');
        await this.initLSP();
        logger.debug('editorInit', 'init() COMPLETE');

        // Initialize Git integration
        logger.debug('editorInit', 'About to call initGitIntegration()...');
        try {
            await this.initGitIntegration();
            logger.debug('editorInit', 'initGitIntegration() DONE');
        } catch (error) {
            logger.error('editorChange', 'initGitIntegration() ERROR:', error);
        }

        // Update breadcrumb with initial cursor position
        setTimeout(() => {
            this.updateBreadcrumb();
        }, 50);
    }

    /**
     * Render the editor
     */
    render() {
        logger.debug('editorInit', '========== RENDER ==========');
        logger.debug('editorInit', 'container:', this.container);
        logger.debug('editorInit', 'container dataset:', this.container.dataset);
        logger.debug('editorInit', 'filePath:', this.filePath);

        this.container.innerHTML = '<div class="text-editor"></div>';
        const editorContainer = this.container.querySelector('.text-editor');
        logger.debug('editorInit', 'editorContainer:', editorContainer);

        // Determine CodeMirror mode from file extension
        const mode = this.getCodeMirrorMode();
        logger.debug('editorInit', 'CodeMirror mode:', mode);

        // Create CodeMirror editor (using global CodeMirror loaded via script tag)
        logger.debug('editorInit', 'Creating CodeMirror instance...');
        logger.debug('editorInit', 'Content size:', this.content.length, 'bytes');
        logger.debug('editorInit', 'Line count:', this.content.split('\n').length);

        const renderStart = performance.now();

        // VS Code-inspired adaptive viewport margin strategy
        // Use line count instead of byte count for better performance tuning
        const lineCount = this.content.split('\n').length;
        let viewportMargin;

        if (lineCount <= 1000) {
            viewportMargin = Infinity; // Small files: render all lines (no virtualization)
        } else if (lineCount <= 3000) {
            viewportMargin = 150; // Medium files: moderate virtualization
        } else if (lineCount <= 10000) {
            viewportMargin = 100; // Large files: aggressive virtualization
        } else {
            viewportMargin = 50; // Very large files: maximum virtualization
        }

        const isLargeFile = lineCount > 3000; // For other optimizations

        logger.debug('editorInit', 'Line count:', lineCount);
        logger.debug('editorInit', 'Using adaptive viewportMargin:', viewportMargin);

        this.editor = window.CodeMirror(editorContainer, {
            value: this.content,
            mode: mode,
            theme: 'monokai',
            lineNumbers: true,
            gutters: ['CodeMirror-linenumbers', 'git-diff-gutter', 'git-blame-gutter'],
            indentUnit: 4,
            tabSize: 4,
            indentWithTabs: false,
            lineWrapping: false,
            matchBrackets: !isLargeFile, // Disable for large files
            autoCloseBrackets: !isLargeFile, // Disable for large files
            styleActiveLine: !isLargeFile, // Disable for large files
            viewportMargin: viewportMargin // Adaptive viewport based on line count
        });
        const renderDuration = performance.now() - renderStart;

        logger.debug('editorInit', 'CodeMirror constructor took:', renderDuration.toFixed(2), 'ms');

        // Track CodeMirror render performance
        performanceMonitor.trackCodeMirrorRender(this.filePath, this.content.length, renderDuration);

        logger.debug('editorInit', 'CodeMirror instance created:', this.editor);
        logger.debug('editorInit', 'CodeMirror DOM element:', this.editor.getWrapperElement());
        logger.debug('editorInit', 'CodeMirror parent element:', this.editor.getWrapperElement().parentElement);

        // Add URL highlighting overlay
        this.setupURLHighlighting();

        // Setup Ctrl+Click to open URLs
        this.setupURLClickHandler();

        // Refresh CodeMirror to ensure proper rendering
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            if (this.editor) {
                const refreshStart = performance.now();
                logger.debug('editorInit', 'Calling editor.refresh()...');
                this.editor.refresh();
                const refreshDuration = performance.now() - refreshStart;
                logger.debug('editorInit', 'editor.refresh() took:', refreshDuration.toFixed(2), 'ms');

                if (refreshDuration > 100) {
                    logger.warn('editorChange', '⚠️ Slow refresh detected for:', this.filePath);
                }
            }
        }, 10);

        logger.debug('editorInit', '========================================');
    }

    /**
     * Setup URL highlighting overlay
     */
    setupURLHighlighting() {
        if (!this.editor) return;

        const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;

        window.CodeMirror.defineMode("url-overlay", (config, parserConfig) => {
            return {
                token: function(stream) {
                    // Check for URL
                    const match = stream.match(urlRegex, false);
                    if (match && stream.pos === stream.string.indexOf(match[0])) {
                        stream.match(urlRegex);
                        return "url-link";
                    }

                    // Otherwise, skip to next potential URL
                    const nextUrl = stream.string.slice(stream.pos).search(/https?:\/\//);
                    if (nextUrl > 0) {
                        stream.pos += nextUrl;
                    } else {
                        stream.skipToEnd();
                    }
                    return null;
                }
            };
        });

        this.editor.addOverlay("url-overlay");
    }

    /**
     * Setup Ctrl+Click handler to open URLs
     */
    setupURLClickHandler() {
        if (!this.editor) return;

        const wrapper = this.editor.getWrapperElement();

        wrapper.addEventListener('click', (e) => {
            // Only trigger on Ctrl+Click or Cmd+Click
            if (!e.ctrlKey && !e.metaKey) return;

            const pos = this.editor.coordsChar({ left: e.clientX, top: e.clientY });
            const token = this.editor.getTokenAt(pos);
            const line = this.editor.getLine(pos.line);

            // Check if clicked on a URL
            const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
            let match;

            while ((match = urlRegex.exec(line)) !== null) {
                const start = match.index;
                const end = match.index + match[0].length;

                if (pos.ch >= start && pos.ch <= end) {
                    const url = match[0];
                    logger.debug('editorChange', 'Opening URL:', url);

                    // Open URL in system browser
                    if (window.electronAPI && window.electronAPI.openExternal) {
                        window.electronAPI.openExternal(url);
                    } else {
                        window.open(url, '_blank');
                    }

                    e.preventDefault();
                    break;
                }
            }
        });
    }

    /**
     * Get CodeMirror mode from file extension
     * @returns {string} CodeMirror mode
     */
    getCodeMirrorMode() {
        const language = fileTypes.getLanguage(this.filePath);

        const modeMap = {
            'javascript': 'javascript',
            'typescript': 'javascript',
            'python': 'python',
            'java': 'text/x-java',
            'c': 'text/x-csrc',
            'cpp': 'text/x-c++src',
            'csharp': 'text/x-csharp',
            'html': 'htmlmixed',
            'xml': 'xml',
            'css': 'css',
            'scss': 'css',
            'sass': 'css',
            'json': 'application/json',
            'markdown': 'markdown',
            'bash': 'shell',
            'sql': 'sql',
            'plaintext': 'text/plain'
        };

        return modeMap[language] || 'text/plain';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        if (!this.editor) return;

        // Track changes with hash-based modification detection
        this.editor.on('change', () => {
            // Update file state tracker with current content
            const currentContent = this.getContent();
            const stateChanged = fileStateTracker.updateContent(this.filePath, currentContent);

            // Get actual modification state from tracker
            const isModified = fileStateTracker.isModified(this.filePath);

            // Update isDirty flag to match actual modification state
            if (this.isDirty !== isModified) {
                this.setDirty(isModified);
            }
        });

        // Save shortcut (Ctrl+S / Cmd+S)
        this.saveHandler = async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                await this.save();
            }
        };

        document.addEventListener('keydown', this.saveHandler);

        // Context menu
        this.setupContextMenu();

        // Prevent default file drop on editor
        const editorWrapper = this.editor.getWrapperElement();
        editorWrapper.addEventListener('drop', (e) => {
            // Check if dropping a file from outside (dataTransfer has files)
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                e.preventDefault();
                e.stopPropagation();
                logger.debug('editorChange', 'Prevented default file drop');
            }
        });

        editorWrapper.addEventListener('dragover', (e) => {
            // Check if dragging a file from outside
            if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // Focus the editor
        this.editor.focus();
    }

    /**
     * Setup context menu
     */
    setupContextMenu() {
        logger.debug('editorInit', 'Setting up context menu for:', this.filePath);
        this.contextMenu = new ContextMenu();

        const editorWrapper = this.editor.getWrapperElement();
        editorWrapper.addEventListener('contextmenu', (e) => {
            logger.debug('editorChange', 'Context menu triggered at:', e.clientX, e.clientY);
            e.preventDefault();

            const selection = this.editor.getSelection();
            const hasSelection = selection.length > 0;

            logger.debug('editorChange', 'Has selection:', hasSelection);
            const actions = this.getContextMenuActions(hasSelection);
            logger.debug('editorChange', 'Context menu actions:', actions.length);
            this.contextMenu.show(e.clientX, e.clientY, actions);
        });
    }

    /**
     * Get context menu actions
     */
    getContextMenuActions(hasSelection) {
        return [
            {
                label: 'Go to Definition',
                shortcut: 'F12',
                onClick: () => this.goToDefinition()
            },
            {
                label: 'Find All References',
                shortcut: 'Alt+Shift+F12',
                onClick: () => this.findAllReferences()
            },
            { type: 'separator' },
            {
                label: 'Rename Symbol',
                shortcut: 'F2',
                onClick: () => this.renameSymbol()
            },
            {
                label: 'Format Document',
                shortcut: 'Ctrl+Shift+I',
                onClick: () => this.formatDocument()
            },
            { type: 'separator' },
            {
                label: 'Cut',
                shortcut: 'Ctrl+X',
                disabled: !hasSelection,
                onClick: () => this.cut()
            },
            {
                label: 'Copy',
                shortcut: 'Ctrl+C',
                disabled: !hasSelection,
                onClick: () => this.copy()
            },
            {
                label: 'Paste',
                shortcut: 'Ctrl+V',
                onClick: () => this.paste()
            },
            { type: 'separator' },
            {
                label: 'Reveal in File Manager',
                shortcut: 'Ctrl+K R',
                onClick: () => this.revealInFileManager()
            }
        ];
    }

    async goToDefinition() {
        logger.debug('lspClient', 'Go to Definition called');
        const cursor = this.editor.getCursor();
        logger.debug('lspClient', 'Cursor position:', cursor.line, cursor.ch);
        try {
            const definition = await lspClient.definition(this.filePath, cursor.line, cursor.ch);
            logger.debug('lspClient', 'Definition result:', definition);
            if (definition) {
                logger.debug('lspClient', 'Definition found:', definition);

                // Handle definition result (can be Location or Location[])
                const location = Array.isArray(definition) ? definition[0] : definition;

                if (location && location.uri && location.range) {
                    // Parse file path from URI
                    const filePath = location.uri.replace('file://', '');
                    const line = location.range.start.line;
                    const character = location.range.start.character;

                    // If same file, just jump to position
                    if (filePath === this.filePath) {
                        this.editor.setCursor(line, character);
                        this.editor.focus();
                    } else {
                        // Emit event to open different file (handled by FileManager)
                        eventBus.emit('file:open', {
                            filePath,
                            position: { line, character }
                        });
                    }
                }
            } else {
                logger.debug('lspClient', 'No definition found');
            }
        } catch (err) {
            logger.error('editorChange', 'Go to Definition error:', err);
        }
    }

    async findAllReferences() {
        logger.debug('lspClient', 'Find All References called');
        const cursor = this.editor.getCursor();
        logger.debug('lspClient', 'Cursor position:', cursor.line, cursor.ch);
        try {
            const references = await lspClient.references(this.filePath, cursor.line, cursor.ch, true);
            logger.debug('lspClient', 'References result:', references);
            if (references && references.length > 0) {
                logger.debug('lspClient', `Found ${references.length} references:`, references);

                // Create references panel or output to console
                references.forEach((ref, index) => {
                    const filePath = ref.uri.replace('file://', '');
                    const line = ref.range.start.line + 1; // Display 1-indexed
                    const char = ref.range.start.character + 1;
                    logger.debug('lspClient', `  ${index + 1}. ${filePath}:${line}:${char}`);
                });

                // Emit event for references panel (can be implemented later)
                eventBus.emit('editor:references-found', references);
            } else {
                logger.debug('lspClient', 'No references found');
            }
        } catch (err) {
            logger.error('editorChange', 'Find References error:', err);
        }
    }

    /**
     * Navigate to a specific line number and highlight it
     * @param {number} lineNumber - Line number to navigate to (1-based from search results)
     * @param {number} character - Optional character position (default 0)
     */
    goToLine(lineNumber, character = 0) {
        if (!this.editor) {
            logger.warn('editorChange', 'Cannot goToLine: editor not initialized');
            return;
        }

        logger.debug('editorChange', 'Navigating to line:', lineNumber);

        // CodeMirror uses 0-based line numbers, but search results use 1-based
        // So we need to subtract 1 from the line number
        const cmLine = lineNumber - 1;

        // Set cursor to the line
        this.editor.setCursor(cmLine, character);

        // Scroll the line into view with some margin
        this.editor.scrollIntoView({line: cmLine, ch: character}, 100);

        // Focus the editor
        this.editor.focus();

        // Highlight the line temporarily
        this.highlightLine(cmLine);
    }

    /**
     * Highlight a specific line with a background color
     * @param {number} line - Line number to highlight (0-based CodeMirror line number)
     */
    highlightLine(line) {
        if (!this.editor) return;

        // Add a CSS class to highlight the line
        const lineHandle = this.editor.addLineClass(line, 'background', 'highlighted-search-line');

        // Remove the highlight after 2 seconds
        setTimeout(() => {
            this.editor.removeLineClass(line, 'background', 'highlighted-search-line');
        }, 2000);
    }

    async renameSymbol() {
        logger.debug('lspClient', 'Rename Symbol called');
        const cursor = this.editor.getCursor();
        logger.debug('lspClient', 'Cursor position:', cursor.line, cursor.ch);

        // Prompt user for new name
        const newName = prompt('Enter new name for symbol:');
        logger.debug('lspClient', 'New name entered:', newName);
        if (!newName || newName.trim() === '') {
            logger.debug('lspClient', 'Rename cancelled');
            return;
        }

        try {
            const workspaceEdit = await lspClient.rename(this.filePath, cursor.line, cursor.ch, newName);
            logger.debug('lspClient', 'Rename workspace edit result:', workspaceEdit);
            if (workspaceEdit && workspaceEdit.changes) {
                logger.debug('lspClient', 'Rename workspace edit:', workspaceEdit);

                // Apply changes to current file
                const fileUri = `file://${this.filePath}`;
                const edits = workspaceEdit.changes[fileUri];

                if (edits && edits.length > 0) {
                    // Apply edits in reverse order to maintain positions
                    edits.sort((a, b) => b.range.start.line - a.range.start.line);

                    edits.forEach(edit => {
                        const from = { line: edit.range.start.line, ch: edit.range.start.character };
                        const to = { line: edit.range.end.line, ch: edit.range.end.character };
                        this.editor.replaceRange(edit.newText, from, to);
                    });

                    logger.debug('lspClient', `Applied ${edits.length} rename edits`);
                }

                // Emit event for other files (can be implemented later)
                eventBus.emit('editor:workspace-edit', workspaceEdit);
            } else {
                logger.debug('lspClient', 'No rename edits returned');
            }
        } catch (err) {
            logger.error('editorChange', 'Rename Symbol error:', err);
        }
    }

    async formatDocument() {
        logger.debug('lspClient', 'Format Document called');
        try {
            const edits = await lspClient.formatting(this.filePath, 4, true);
            logger.debug('lspClient', 'Formatting result:', edits);

            if (edits && edits.length > 0) {
                logger.debug('lspClient', `Applying ${edits.length} formatting edits`);

                // Apply edits in reverse order to maintain positions
                edits.sort((a, b) => b.range.start.line - a.range.start.line);

                edits.forEach(edit => {
                    const from = { line: edit.range.start.line, ch: edit.range.start.character };
                    const to = { line: edit.range.end.line, ch: edit.range.end.character };
                    this.editor.replaceRange(edit.newText, from, to);
                });

                logger.debug('lspClient', 'Document formatted successfully');
            } else {
                // Fallback to basic indentation if LSP formatting not available
                logger.debug('lspClient', 'LSP formatting not available, using basic indentation');
                const lineCount = this.editor.lineCount();
                for (let i = 0; i < lineCount; i++) {
                    this.editor.indentLine(i, 'smart');
                }
            }
        } catch (err) {
            logger.error('editorChange', 'Format Document error:', err);
            // Fallback to basic indentation on error
            const lineCount = this.editor.lineCount();
            for (let i = 0; i < lineCount; i++) {
                this.editor.indentLine(i, 'smart');
            }
        }
    }

    cut() {
        const selection = this.editor.getSelection();
        if (selection) {
            navigator.clipboard.writeText(selection);
            this.editor.replaceSelection('');
        }
    }

    copy() {
        const selection = this.editor.getSelection();
        if (selection) {
            navigator.clipboard.writeText(selection);
        }
    }

    async paste() {
        try {
            const text = await navigator.clipboard.readText();
            this.editor.replaceSelection(text);
        } catch (err) {
            logger.error('editorChange', 'Paste failed:', err);
        }
    }

    async revealInFileManager() {
        try {
            const result = await window.electronAPI.revealInFileManager(this.filePath);
            if (!result || !result.success) {
                logger.debug('editorChange', 'Reveal in File Manager not implemented');
            }
        } catch (err) {
            logger.debug('editorChange', 'Reveal in File Manager:', this.filePath);
        }
    }

    /**
     * Setup LSP features (hover, autocomplete, etc.)
     */
    setupLSPFeatures() {
        logger.debug('editorInit', '*** setupLSPFeatures() CALLED ***');
        logger.debug('editorInit', 'this.editor exists:', !!this.editor);

        if (!this.editor) {
            logger.debug('editorInit', 'EARLY RETURN: No editor!');
            return;
        }

        // Check if LSP is enabled
        const lspEnabled = settingsPanel.get('lspEnabled');
        logger.debug('lspClient', 'LSP enabled from settings:', lspEnabled);

        if (!lspEnabled) {
            logger.debug('editorInit', 'EARLY RETURN: LSP disabled in settings');
            return;
        }

        logger.debug('editorInit', '✓ Setting up LSP features - hover, completion, etc.');

        // Setup hover on mousemove
        logger.debug('editorInit', '✓ Attaching mousemove event for hover');
        this.editor.on('mousemove', (cm, event) => {
            this.handleMouseMove(event);
        });

        // Clear hover when mouse leaves
        this.editor.getWrapperElement().addEventListener('mouseleave', () => {
            this.clearHoverTooltip();
        });

        // Setup inline ghost text autocomplete
        this.editor.on('inputRead', (cm, change) => {
            if (change.origin === '+input') {
                clearTimeout(this.changeTimeout);
                const delay = settingsPanel.get('completionDelay') || 100;
                this.changeTimeout = setTimeout(() => {
                    this.showInlineCompletion();
                }, delay);
            }
        });

        // Accept inline completion with Tab
        this.editor.addKeyMap({
            'Tab': (cm) => {
                if (this.currentInlineCompletion) {
                    this.acceptInlineCompletion();
                    return true;
                }
                return window.CodeMirror.Pass;
            },
            'Ctrl-Space': () => {
                this.showInlineCompletion();
            }
        });

        // Track cursor position for breadcrumb
        this.editor.on('cursorActivity', () => {
            this.updateBreadcrumb();
        });

        // Notify LSP of changes
        this.editor.on('change', () => {
            // Clear inline completion on any change
            this.clearInlineCompletion();

            clearTimeout(this.changeTimeout);
            this.changeTimeout = setTimeout(() => {
                this.notifyLSPChange();
            }, 500);
        });
    }

    /**
     * Handle mouse move for hover tooltip
     */
    handleMouseMove(event) {
        clearTimeout(this.hoverTimeout);

        // Check if hover is enabled
        if (!settingsPanel.get('hoverEnabled')) return;

        const delay = settingsPanel.get('hoverDelay') || 500;
        this.hoverTimeout = setTimeout(() => {
            const coords = this.editor.coordsChar({ left: event.clientX, top: event.clientY });
            this.showHoverTooltip(coords, event);
        }, delay);
    }

    /**
     * Show hover tooltip at position
     */
    /**
     * Check if hover should be enabled for this file type
     */
    shouldEnableHover() {
        const language = fileTypes.getLanguage(this.filePath);

        // Only enable hover for programming languages with LSP support
        const supportedLanguages = [
            'javascript',
            'typescript',
            'python',
            'java',
            'c',
            'cpp',
            'csharp',
            'html',
            'css',
            'scss',
            'sass',
            'json'
        ];

        return supportedLanguages.includes(language);
    }

    /**
     * Check if token is hoverable (not comment, string, etc.)
     */
    isTokenHoverable(token) {
        if (!token || !token.string || !token.string.trim()) {
            return false;
        }

        // Don't show hover for comments
        if (token.type && token.type.includes('comment')) {
            return false;
        }

        // Don't show hover for strings (unless it's a property key)
        if (token.type && token.type.includes('string') && !token.type.includes('property')) {
            return false;
        }

        // Don't show hover for operators, punctuation
        const nonHoverableTypes = ['operator', 'punctuation', 'bracket', 'delimiter'];
        if (token.type && nonHoverableTypes.some(t => token.type.includes(t))) {
            return false;
        }

        // Token string should be identifier-like (not just whitespace or symbols)
        const tokenStr = token.string.trim();
        if (tokenStr.length === 0 || /^[{}()\[\];:,.<>!@#$%^&*+=|\\/~`'"-]+$/.test(tokenStr)) {
            return false;
        }

        return true;
    }

    /**
     * Handle hover from MouseTracker
     */
    handleHover(pos, token, event) {
        logger.debug('hover', 'handleHover called for token:', token.string, 'type:', token.type);

        // Clear any existing tooltip first
        this.clearHoverTooltip();

        // Check if hover is enabled in settings
        if (!settingsPanel.get('hoverEnabled')) {
            logger.debug('hover', 'Hover disabled in settings');
            return;
        }

        // Check if file type supports hover
        if (!this.shouldEnableHover()) {
            logger.debug('hover', 'Hover not supported for this file type');
            return;
        }

        // Check if token is hoverable
        if (!this.isTokenHoverable(token)) {
            logger.debug('hover', 'Token not hoverable:', token.string, 'type:', token.type);
            return;
        }

        logger.debug('hover', '✓ Token is hoverable, requesting LSP hover');
        // Show hover tooltip
        this.showHoverTooltip(pos, event);
    }

    /**
     * Render hover content with sections
     */
    renderHoverContent(sections) {
        const container = document.createElement('div');
        container.className = 'hover-content';

        sections.forEach(section => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'hover-section';

            if (section.type === 'lsp') {
                // LSP documentation
                let content = section.content;
                content = content
                    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
                    .replace(/`([^`]+)`/g, '<code>$1</code>')
                    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                    .replace(/\n/g, '<br>');
                sectionDiv.innerHTML = content;
            } else if (section.type === 'git-blame') {
                // Git blame information
                const blame = section.content;
                sectionDiv.className = 'hover-section hover-git-blame';
                sectionDiv.innerHTML = `
                    <div class="git-blame-header">
                        <span class="git-blame-sha">${blame.shortSha}</span>
                        <span class="git-blame-author">${blame.author}</span>
                    </div>
                    <div class="git-blame-summary">${blame.summary}</div>
                    <div class="git-blame-time">${blame.relativeTime}</div>
                `;
            } else if (section.type === 'git-history') {
                // Git history (reserved for future use)
                sectionDiv.innerHTML = `<div class="hover-git-history">${section.content}</div>`;
            }

            container.appendChild(sectionDiv);
        });

        return container;
    }

    async showHoverTooltip(pos, event) {
        try {
            logger.debug('hover', 'Requesting hover at line:', pos.line, 'ch:', pos.ch);
            const hoverInfo = await lspClient.hover(this.filePath, pos.line, pos.ch);
            logger.debug('hover', 'Hover response:', hoverInfo);

            if (!hoverInfo || !hoverInfo.contents) {
                logger.debug('hover', 'No hover content received');
                return;
            }

            // Parse LSP content
            let content = '';
            if (Array.isArray(hoverInfo.contents)) {
                content = hoverInfo.contents.map(c => typeof c === 'string' ? c : c.value).join('\n\n');
            } else if (typeof hoverInfo.contents === 'string') {
                content = hoverInfo.contents;
            } else if (hoverInfo.contents.value) {
                content = hoverInfo.contents.value;
            }

            if (!content || content.trim().length === 0) {
                logger.debug('hover', 'Hover content is empty');
                return;
            }

            this.clearHoverTooltip();

            // Create tooltip
            this.hoverTooltip = document.createElement('div');
            this.hoverTooltip.className = 'lsp-hover-tooltip';

            // Build sections array (extensible for future features)
            const sections = [
                { type: 'lsp', content: content }
            ];

            // Add Git blame information if enabled
            if (this.gitBlameEnabled && this.gitBlameData) {
                try {
                    const { gitBlameService } = getGitServices();
                    if (gitBlameService) {
                        const lineNumber = pos.line + 1; // CodeMirror uses 0-indexed lines
                        const blameEntry = await gitBlameService.getBlameForLine(this.filePath, lineNumber);

                        if (blameEntry) {
                            sections.push({
                                type: 'git-blame',
                                content: {
                                    shortSha: blameEntry.shortSha,
                                    author: blameEntry.author,
                                    summary: blameEntry.summary,
                                    relativeTime: this._formatRelativeTime(blameEntry.authorTime)
                                }
                            });
                        }
                    }
                } catch (error) {
                    logger.error('editorChange', 'Failed to get blame for hover:', error);
                }
            }

            // Render content
            const contentContainer = this.renderHoverContent(sections);
            this.hoverTooltip.appendChild(contentContainer);

            // Position tooltip with bounds checking
            document.body.appendChild(this.hoverTooltip);

            const tooltipRect = this.hoverTooltip.getBoundingClientRect();
            let left = event.clientX;
            let top = event.clientY + 20;

            // Adjust if tooltip goes off right edge
            if (left + tooltipRect.width > window.innerWidth - 10) {
                left = window.innerWidth - tooltipRect.width - 10;
            }

            // Adjust if tooltip goes off bottom edge
            if (top + tooltipRect.height > window.innerHeight - 10) {
                top = event.clientY - tooltipRect.height - 10;
            }

            // Ensure tooltip doesn't go off left/top edges
            left = Math.max(10, left);
            top = Math.max(10, top);

            this.hoverTooltip.style.left = left + 'px';
            this.hoverTooltip.style.top = top + 'px';

            // Make tooltip interactive (allows scrolling)
            this.setupTooltipInteraction();

            logger.debug('hover', '✓ Hover tooltip displayed at', left, top);
        } catch (error) {
            logger.error('editorChange', 'Hover error:', error);
        }
    }

    /**
     * Setup tooltip interaction (keep alive on hover, dismiss on mouse leave)
     */
    setupTooltipInteraction() {
        if (!this.hoverTooltip) return;

        // Keep tooltip alive when mouse is over it
        this.hoverTooltip.addEventListener('mouseenter', () => {
            this.tooltipHovered = true;
        });

        this.hoverTooltip.addEventListener('mouseleave', () => {
            this.tooltipHovered = false;
            // Delay clearing to allow moving back to tooltip
            setTimeout(() => {
                if (!this.tooltipHovered) {
                    this.clearHoverTooltip();
                }
            }, 400);
        });
    }

    /**
     * Clear hover tooltip
     */
    clearHoverTooltip() {
        clearTimeout(this.hoverTimeout);
        if (this.hoverTooltip) {
            this.hoverTooltip.remove();
            this.hoverTooltip = null;
        }
    }

    /**
     * Show inline ghost text completion
     */
    async showInlineCompletion() {
        if (!this.editor) return;

        // Check if inline completion is enabled
        if (!settingsPanel.get('inlineCompletionEnabled')) return;

        // Clear previous inline completion
        this.clearInlineCompletion();

        const cursor = this.editor.getCursor();
        const completions = await lspClient.completion(this.filePath, cursor.line, cursor.ch);

        if (completions && completions.length > 0) {
            // Get the first (best) completion
            const completion = completions[0];
            const completionText = completion.insertText || completion.label;

            // Get current line text before cursor
            const line = this.editor.getLine(cursor.line);
            const textBeforeCursor = line.substring(0, cursor.ch);

            // Find common prefix to avoid duplication
            let commonPrefix = '';
            for (let i = textBeforeCursor.length - 1; i >= 0; i--) {
                const suffix = textBeforeCursor.substring(i);
                if (completionText.startsWith(suffix)) {
                    commonPrefix = suffix;
                    break;
                }
            }

            // Calculate what to show
            const textToShow = completionText.substring(commonPrefix.length);

            if (textToShow && textToShow.length > 0) {
                // Store completion info
                this.currentInlineCompletion = {
                    text: textToShow,
                    fullText: completionText,
                    position: cursor
                };

                // Create ghost text widget
                const ghost = document.createElement('span');
                ghost.className = 'inline-completion-ghost';
                ghost.textContent = textToShow;

                this.inlineCompletionWidget = this.editor.addWidget(cursor, ghost, false);
            }
        }
    }

    /**
     * Accept inline completion
     */
    acceptInlineCompletion() {
        if (!this.currentInlineCompletion) return;

        const cursor = this.editor.getCursor();
        this.editor.replaceRange(
            this.currentInlineCompletion.text,
            cursor
        );

        this.clearInlineCompletion();
    }

    /**
     * Clear inline completion
     */
    clearInlineCompletion() {
        if (this.inlineCompletionWidget) {
            const widget = this.editor.getWrapperElement().querySelector('.inline-completion-ghost');
            if (widget) widget.remove();
            this.inlineCompletionWidget = null;
        }
        this.currentInlineCompletion = null;
    }

    /**
     * Get icon for completion kind
     */
    getCompletionIcon(kind) {
        const icons = {
            1: '📝', // Text
            2: '🔧', // Method
            3: '🔧', // Function
            4: '🏗️', // Constructor
            5: '📦', // Field
            6: '📊', // Variable
            7: '📦', // Class
            8: '🔷', // Interface
            9: '📁', // Module
            10: '⚙️', // Property
            12: '🔢', // Value
            13: '📊', // Enum
            14: '🔤', // Keyword
        };
        return icons[kind] || '📄';
    }

    /**
     * Notify LSP of content changes
     */
    async notifyLSPChange() {
        const content = this.getContent();
        await lspClient.didChange(this.filePath, content);
    }

    /**
     * Set dirty state
     * @param {boolean} dirty - Is dirty
     */
    setDirty(dirty) {
        this.isDirty = dirty;
        stateManager.set('dirtyFile', dirty ? this.filePath : null);
        eventBus.emit('file:dirty-changed', {
            path: this.filePath,
            isDirty: dirty
        });
    }

    /**
     * Get current content
     * @returns {string} Current content
     */
    getContent() {
        return this.editor ? this.editor.getValue() : this.content;
    }

    /**
     * Save file
     */
    async save() {
        if (!this.isDirty) {
            logger.debug('editorChange', 'No changes to save');
            return;
        }

        try {
            logger.debug('editorChange', 'Saving file:', this.filePath);
            const content = this.getContent();

            let result;
            // Check if this is an SSH path
            if (this.filePath.startsWith('ssh://')) {
                logger.debug('editorChange', 'SSH file detected, using SSH write');

                // Get SSH context from FileExplorer
                const uiManager = require('../modules/UIManager');
                const explorer = uiManager.getComponent('fileExplorer');
                if (!explorer || !explorer.sshContext || !explorer.sshContext.connectionId) {
                    this.showErrorNotification('SSH connection not available');
                    return;
                }

                // Extract remote path from ssh:// URL
                // Format: ssh://host/remote/path
                // We need to remove ssh://host to get /remote/path
                const sshPrefix = `ssh://${explorer.sshContext.connectionConfig?.host}`;
                const remotePath = this.filePath.startsWith(sshPrefix) ? this.filePath.substring(sshPrefix.length) : this.filePath;

                const { ipcRenderer } = require('electron');
                logger.debug('editorChange', 'Writing SSH file:', { connectionId: explorer.sshContext.connectionId, remotePath });
                result = await ipcRenderer.invoke('ssh-write-file', explorer.sshContext.connectionId, remotePath, content, 'utf8');
            } else {
                // Local file
                result = await window.electronAPI.saveFile(this.filePath, content);
            }

            if (result.success) {
                this.setDirty(false);
                this.content = content;

                // Update baseline hash in file state tracker
                fileStateTracker.updateBaseline(this.filePath, content);

                logger.debug('editorChange', '✓ File saved successfully');
                eventBus.emit('file:saved', { path: this.filePath });

                // Notify LSP (only for local files)
                if (!this.filePath.startsWith('ssh://')) {
                    await lspClient.didSave(this.filePath);
                }

                // Show brief save confirmation
                this.showSaveNotification();
            } else {
                logger.error('editorChange', 'Save failed:', result.error);
                this.showErrorNotification('Save failed: ' + result.error);
            }
        } catch (error) {
            logger.error('editorChange', 'Error saving file:', error);
            this.showErrorNotification('Error saving file');
        }
    }

    /**
     * Show save notification
     */
    showSaveNotification() {
        const notification = document.createElement('div');
        notification.className = 'editor-notification success';
        notification.textContent = '✓ Saved';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 1500);
    }

    /**
     * Show error notification
     * @param {string} message - Error message
     */
    showErrorNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'editor-notification error';
        notification.textContent = '✗ ' + message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    /**
     * Escape HTML
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Check if dirty
     * @returns {boolean} Is dirty
     */
    checkDirty() {
        return this.isDirty;
    }

    /**
     * Update breadcrumb with current cursor position
     */
    updateBreadcrumb() {
        if (!this.editor) return;

        const cursor = this.editor.getCursor();
        const content = this.editor.getValue();

        // Determine file type
        const fileName = this.filePath.split('/').pop();
        const ext = fileName.split('.').pop().toLowerCase();

        let symbols = [];

        // Parse HTML/XML files
        if (['html', 'htm', 'xml', 'svg'].includes(ext)) {
            symbols = this.parseHTMLSymbols(content, cursor.line, cursor.ch);
        }

        // Emit event with breadcrumb data
        eventBus.emit('editor:breadcrumb-update', {
            filePath: this.filePath,
            symbols: symbols,
            line: cursor.line,
            ch: cursor.ch
        });
    }

    /**
     * Parse HTML content and find elements at cursor position
     * @param {string} content - HTML content
     * @param {number} line - Cursor line (0-indexed)
     * @param {number} ch - Cursor character (0-indexed)
     * @returns {Array<string>} Array of element tags at cursor position
     */
    parseHTMLSymbols(content, line, ch) {
        const lines = content.split('\n');
        if (line >= lines.length) return [];

        // Calculate absolute position in content
        let position = 0;
        for (let i = 0; i < line; i++) {
            position += lines[i].length + 1; // +1 for newline
        }
        position += ch;

        // Find all opening and closing tags with their positions
        const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)>/g;
        const tags = [];
        let match;

        while ((match = tagRegex.exec(content)) !== null) {
            const isClosing = match[0].startsWith('</');
            const tagName = match[1];
            const attributes = match[2] || '';
            const pos = match.index;

            // Extract id and class from attributes
            let id = '';
            let classes = [];

            const idMatch = attributes.match(/\bid\s*=\s*["']([^"']+)["']/);
            if (idMatch) id = idMatch[1];

            const classMatch = attributes.match(/\bclass\s*=\s*["']([^"']+)["']/);
            if (classMatch) {
                classes = classMatch[1].split(/\s+/).filter(c => c);
            }

            // Build display name
            let displayName = tagName;
            if (id) displayName += `#${id}`;
            if (classes.length > 0) displayName += `.${classes.join('.')}`;

            tags.push({
                name: tagName,
                displayName: displayName,
                isClosing,
                position: pos,
                isSelfClosing: match[0].endsWith('/>')
            });
        }

        // Build element stack at cursor position
        const stack = [];
        for (const tag of tags) {
            if (tag.position >= position) break;

            if (tag.isSelfClosing) {
                continue;
            } else if (!tag.isClosing) {
                stack.push(tag.displayName);
            } else {
                // Find matching opening tag
                for (let i = stack.length - 1; i >= 0; i--) {
                    if (stack[i].startsWith(tag.name)) {
                        stack.splice(i, 1);
                        break;
                    }
                }
            }
        }

        return stack;
    }

    /**
     * Format Unix timestamp to relative time string
     * @param {number} timestamp - Unix timestamp in seconds
     * @returns {string} Relative time string (e.g., "2 hours ago")
     */
    _formatRelativeTime(timestamp) {
        const now = Math.floor(Date.now() / 1000);
        const diff = now - timestamp;

        if (diff < 60) {
            return 'just now';
        } else if (diff < 3600) {
            const minutes = Math.floor(diff / 60);
            return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
        } else if (diff < 86400) {
            const hours = Math.floor(diff / 3600);
            return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
        } else if (diff < 604800) {
            const days = Math.floor(diff / 86400);
            return `${days} day${days !== 1 ? 's' : ''} ago`;
        } else if (diff < 2592000) {
            const weeks = Math.floor(diff / 604800);
            return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
        } else if (diff < 31536000) {
            const months = Math.floor(diff / 2592000);
            return `${months} month${months !== 1 ? 's' : ''} ago`;
        } else {
            const years = Math.floor(diff / 31536000);
            return `${years} year${years !== 1 ? 's' : ''} ago`;
        }
    }

    /**
     * Toggle Git blame view
     */
    async toggleBlame() {
        this.gitBlameEnabled = !this.gitBlameEnabled;

        if (this.gitBlameEnabled) {
            // Load blame data for current file
            try {
                const { gitBlameService } = getGitServices();
                if (gitBlameService) {
                    logger.debug('editorChange', 'Loading blame data for:', this.filePath);
                    this.gitBlameData = await gitBlameService.getBlame(this.filePath);
                    this.renderBlameGutter();
                }
            } catch (error) {
                logger.error('editorChange', 'Failed to load blame data:', error);
                this.gitBlameEnabled = false;
            }
        } else {
            // Clear blame gutter
            this.gitBlameData = null;
            this.clearBlameGutter();
        }
    }

    /**
     * Render Git blame information in gutter
     */
    renderBlameGutter() {
        if (!this.editor || !this.gitBlameData) return;

        const lineCount = this.editor.lineCount();

        for (let line = 0; line < lineCount; line++) {
            const lineNumber = line + 1; // Git uses 1-indexed lines

            // Find blame entry for this line
            const blameEntry = this.gitBlameData.find(entry =>
                lineNumber >= entry.lineStart && lineNumber <= entry.lineEnd
            );

            if (blameEntry) {
                const marker = document.createElement('div');
                marker.className = 'git-blame-gutter-marker';
                marker.textContent = blameEntry.shortSha;
                marker.title = `${blameEntry.author} - ${blameEntry.summary}`;

                this.editor.setGutterMarker(line, 'git-blame-gutter', marker);
            }
        }
    }

    /**
     * Clear Git blame gutter
     */
    clearBlameGutter() {
        if (!this.editor) return;

        const lineCount = this.editor.lineCount();
        for (let line = 0; line < lineCount; line++) {
            this.editor.setGutterMarker(line, 'git-blame-gutter', null);
        }
    }

    /**
     * Apply character-level highlighting to a changed line
     * @param {number} lineNum - Line number (0-based)
     * @param {string} content - Line content from file
     * @param {string} oldContent - Original line content (for comparison)
     * @param {string} changeType - 'added' or 'deleted'
     */
    applyCharLevelHighlight(lineNum, content, oldContent, changeType) {
        if (!this.editor || !content || !oldContent) return;

        try {
            // Calculate character-level changes
            const changes = DiffHighlighter.calculateCharChanges(oldContent, content);

            if (changes.hasChanges) {
                const range = changeType === 'added' ? changes.newRange : changes.oldRange;

                if (range.length > 0) {
                    logger.debug('editorChange', `🔍 Applying char-level highlight: line ${lineNum}, start ${range.start}, length ${range.length}`);

                    const marker = this.editor.markText(
                        { line: lineNum, ch: range.start },
                        { line: lineNum, ch: range.start + range.length },
                        { className: changeType === 'added' ? 'git-diff-char-added' : 'git-diff-char-deleted' }
                    );

                    if (marker) {
                        this.diffTextMarkers.push(marker);
                    }
                }
            }
        } catch (error) {
            logger.error('editorChange', 'Failed to apply char-level highlight:', error);
        }
    }

    /**
     * Render Git diff decorations in gutter
     */
    async renderDiffGutter() {
        logger.trace('diffRender', '═══════════════════════════════════════════════════');
        logger.trace('diffRender', '🔍 DEBUG: renderDiffGutter() START');
        logger.trace('diffRender', '🔍 DEBUG: this.editor exists?', !!this.editor);
        logger.trace('diffRender', '🔍 DEBUG: this.gitDiffEnabled?', this.gitDiffEnabled);
        logger.trace('diffRender', '🔍 DEBUG: this.filePath:', this.filePath);

        if (!this.editor || !this.gitDiffEnabled) {
            logger.trace('diffRender', '❌ DEBUG: Exiting early - editor or gitDiffEnabled false');
            return;
        }

        try {
            const { gitDiffService } = getGitServices();
            logger.trace('diffRender', '🔍 DEBUG: gitDiffService exists?', !!gitDiffService);
            if (!gitDiffService) {
                logger.trace('diffRender', '❌ DEBUG: No gitDiffService available');
                return;
            }

            logger.trace('diffRender', '📥 Loading diff data for:', this.filePath);
            const diffArray = await gitDiffService.getDiff(this.filePath);
            logger.trace('diffRender', '🔍 DEBUG: diffArray received:', diffArray);
            logger.trace('diffRender', '🔍 DEBUG: diffArray length:', diffArray?.length);

            if (!diffArray || diffArray.length === 0) {
                logger.trace('diffRender', '⚠️  No diff data available');
                return;
            }

            this.gitDiffData = diffArray[0];
            logger.trace('diffRender', '🔍 DEBUG: gitDiffData:', this.gitDiffData);
            logger.trace('diffRender', '🔍 DEBUG: hunks count:', this.gitDiffData.hunks?.length || 0);

            // Clear existing diff markers and line classes
            this.clearDiffGutter();

            let totalMarkersAdded = 0;
            let totalLinesHighlighted = 0;

            // Render diff markers based on hunks with character-level highlighting
            for (const hunk of this.gitDiffData.hunks || []) {
                logger.trace('diffRender', '🔍 DEBUG: Processing hunk:', hunk);
                logger.trace('diffRender', '🔍 DEBUG: Hunk newStart:', hunk.newStart);
                logger.trace('diffRender', '🔍 DEBUG: Hunk lines count:', hunk.lines.length);

                let newLineNum = hunk.newStart - 1; // CodeMirror uses 0-indexed lines
                const hunkLines = hunk.lines || [];

                // Process lines and detect modifications (removed + added pairs)
                for (let i = 0; i < hunkLines.length; i++) {
                    const line = hunkLines[i];
                    if (!line) {
                        logger.trace('diffRender', '⚠️  DEBUG: Skipping null/undefined line');
                        continue;
                    }

                    logger.trace('diffRender', '🔍 DEBUG: Processing line type:', line.type, 'at lineNum:', newLineNum, 'index:', i);

                    // line.type is 'added', 'removed', or 'unchanged'
                    if (line.type === 'added') {
                        // Create gutter marker
                        const marker = document.createElement('div');
                        marker.className = 'git-diff-gutter-marker added';
                        marker.title = 'Added line';
                        marker.style.width = '10px';
                        marker.style.height = '100%';
                        marker.style.backgroundColor = '#28a745';

                        logger.trace('diffRender', '➕ DEBUG: Adding ADDED marker at line', newLineNum);

                        this.editor.setGutterMarker(newLineNum, 'git-diff-gutter', marker);

                        // Add line background class
                        this.editor.addLineClass(newLineNum, 'background', 'git-diff-line-added');

                        // Try to find matching removed line for character-level diff
                        // Look backwards in a small window (typically modifications are remove then add)
                        let matchedRemoved = null;
                        const searchWindow = 5; // Look back up to 5 lines
                        for (let j = Math.max(0, i - searchWindow); j < i; j++) {
                            const prevLine = hunkLines[j];
                            if (prevLine && prevLine.type === 'removed') {
                                // Calculate similarity to see if this is likely a modification
                                const similarity = DiffHighlighter.calculateSimilarity(
                                    prevLine.content || '',
                                    line.content || ''
                                );
                                // If >30% similar, consider it a modification
                                if (similarity > 0.3) {
                                    matchedRemoved = prevLine;
                                    logger.trace('diffRender', '🔍 Found matching removed line for char-level diff, similarity:', similarity);
                                    break;
                                }
                            }
                        }

                        // Apply character-level highlighting if we found a match
                        if (matchedRemoved) {
                            const currentLineContent = this.editor.getLine(newLineNum);
                            if (currentLineContent) {
                                this.applyCharLevelHighlight(
                                    newLineNum,
                                    currentLineContent,
                                    matchedRemoved.content || '',
                                    'added'
                                );
                            }
                        }

                        totalMarkersAdded++;
                        totalLinesHighlighted++;
                        newLineNum++;

                    } else if (line.type === 'removed') {
                        // For removed lines, insert a line widget showing the deleted content
                        logger.trace('diffRender', '➖ DEBUG: Adding DELETED line widget at line', newLineNum);
                        logger.trace('diffRender', '➖ DEBUG: Deleted content:', line.content);

                        // Create widget element to display deleted line
                        const widget = document.createElement('div');
                        widget.className = 'git-diff-deleted-line';
                        widget.style.cssText = `
                            background-color: rgba(220, 53, 69, 0.25);
                            border-left: 3px solid #dc3545;
                            color: rgba(255, 255, 255, 0.6);
                            padding: 2px 4px 2px 8px;
                            font-family: 'Fira Code', 'Consolas', 'Monaco', monospace;
                            font-size: 14px;
                            line-height: 1.5;
                            white-space: pre;
                            text-decoration: line-through;
                            opacity: 0.8;
                            user-select: none;
                            cursor: default;
                        `;

                        // Add prefix indicator
                        const prefix = document.createElement('span');
                        prefix.textContent = '- ';
                        prefix.style.cssText = 'color: #dc3545; font-weight: bold; text-decoration: none;';
                        widget.appendChild(prefix);

                        // Add the deleted content
                        const content = document.createElement('span');
                        content.textContent = line.content || '';
                        widget.appendChild(content);

                        // Insert line widget BEFORE the current line position
                        // This shows what was deleted at this position
                        const lineWidget = this.editor.addLineWidget(newLineNum, widget, {
                            coverGutter: false,
                            noHScroll: false,
                            above: true // Show above the current line
                        });

                        this.diffLineWidgets.push(lineWidget);

                        // Add gutter marker for visual indication
                        const marker = document.createElement('div');
                        marker.className = 'git-diff-gutter-marker deleted';
                        marker.title = 'Deleted line';
                        marker.style.width = '10px';
                        marker.style.height = '4px';
                        marker.style.backgroundColor = '#dc3545';
                        this.editor.setGutterMarker(newLineNum, 'git-diff-gutter', marker);

                        totalMarkersAdded++;
                        // Don't increment line number for deletions (they don't exist in the new file)

                    } else if (line.type === 'unchanged') {
                        // Context lines - don't mark them
                        logger.trace('diffRender', '⚪ DEBUG: Skipping unchanged line', newLineNum);
                        newLineNum++;
                    }
                }
            }

            logger.trace('diffRender', '✅ DEBUG: RENDER COMPLETE!');
            logger.trace('diffRender', '📊 DEBUG: Total markers added:', totalMarkersAdded);
            logger.trace('diffRender', '📊 DEBUG: Total lines highlighted:', totalLinesHighlighted);
            logger.trace('diffRender', '🔍 DEBUG: Checking if gutters exist in DOM...');

            // Debug: Check if gutter actually exists in DOM
            const gutterElement = this.editor.getWrapperElement().querySelector('.git-diff-gutter');
            logger.trace('diffRender', '🔍 DEBUG: .git-diff-gutter element:', gutterElement);
            if (gutterElement) {
                const computedStyle = window.getComputedStyle(gutterElement);
                logger.trace('diffRender', '🔍 DEBUG: Gutter width:', computedStyle.width);
                logger.trace('diffRender', '🔍 DEBUG: Gutter display:', computedStyle.display);
                logger.trace('diffRender', '🔍 DEBUG: Gutter visibility:', computedStyle.visibility);
                logger.trace('diffRender', '🔍 DEBUG: Gutter backgroundColor:', computedStyle.backgroundColor);
            } else {
                logger.trace('diffRender', '❌ DEBUG: .git-diff-gutter element NOT FOUND IN DOM!');
            }

            logger.trace('diffRender', '═══════════════════════════════════════════════════');
        } catch (error) {
            logger.error('editorChange', '❌ DEBUG: ERROR in renderDiffGutter:', error);
            logger.error('editorChange', '❌ DEBUG: Error stack:', error.stack);
        }
    }

    /**
     * Clear Git diff gutter
     */
    clearDiffGutter() {
        if (!this.editor) return;

        // Clear gutter markers
        const lineCount = this.editor.lineCount();
        for (let line = 0; line < lineCount; line++) {
            this.editor.setGutterMarker(line, 'git-diff-gutter', null);
            // Clear line background classes
            this.editor.removeLineClass(line, 'background', 'git-diff-line-added');
            this.editor.removeLineClass(line, 'background', 'git-diff-line-deleted');
            this.editor.removeLineClass(line, 'background', 'git-diff-line-modified');
        }

        // Clear all character-level text markers
        this.diffTextMarkers.forEach(marker => {
            try {
                marker.clear();
            } catch (e) {
                // Marker might already be cleared
            }
        });
        this.diffTextMarkers = [];

        // Clear all deleted line widgets
        this.diffLineWidgets.forEach(widget => {
            try {
                widget.clear();
            } catch (e) {
                // Widget might already be cleared
            }
        });
        this.diffLineWidgets = [];
    }

    /**
     * Update all Git gutters (blame and diff)
     */
    async updateGitGutters() {
        if (this.gitBlameEnabled) {
            await this.toggleBlame();
        }
        if (this.gitDiffEnabled) {
            await this.renderDiffGutter();
        }
    }

    /**
     * Initialize Git integration for this file
     */
    async initGitIntegration() {
        try {
            const { gitStore } = getGitServices();
            if (!gitStore) return;

            // Check if we're in a Git repository
            const repoPath = await gitStore.getCurrentRepository();
            if (!repoPath) {
                logger.debug('editorInit', 'Not in a Git repository');
                return;
            }

            logger.debug('editorInit', 'Initializing Git integration for:', this.filePath);
            logger.debug('editorInit', 'Repository:', repoPath);

            // Render diff gutter by default
            await this.renderDiffGutter();

            // Listen for Git state changes
            eventBus.on('git:file-changed', this.handleGitFileChanged.bind(this));
            eventBus.on('git:branch-switched', this.handleGitBranchSwitched.bind(this));
            eventBus.on('git:show-diff', this.handleShowDiff.bind(this));

            logger.debug('editorInit', '✓ Git integration initialized successfully');
        } catch (error) {
            logger.error('editorChange', 'Failed to initialize Git integration:', error);
        }
    }

    /**
     * Handle Git file changed event
     */
    async handleGitFileChanged(event) {
        if (event.filePath === this.filePath) {
            logger.debug('editorChange', 'Git file changed, updating gutters');
            await this.updateGitGutters();
        }
    }

    /**
     * Handle Git branch switched event
     */
    async handleGitBranchSwitched() {
        logger.debug('editorChange', 'Git branch switched, updating gutters');
        await this.updateGitGutters();
    }

    /**
     * Handle show diff event from GitPanel
     */
    async handleShowDiff(event) {
        const { filePath } = event;
        logger.debug('editorChange', 'Received git:show-diff event for:', filePath);

        try {
            // Emit file:open event to open the file in editor
            logger.debug('editorChange', 'Emitting file:open event for:', filePath);
            eventBus.emit('file:open', { path: filePath });

            // Wait a moment for the file to load
            await new Promise(resolve => setTimeout(resolve, 200));

            // If this editor now has that file, show diff gutter
            if (this.filePath === filePath) {
                logger.debug('editorChange', 'File loaded, rendering diff gutter');
                await this.renderDiffGutter();
            }
        } catch (error) {
            logger.error('editorChange', 'Failed to show diff:', error);
        }
    }

    /**
     * Cleanup
     */
    destroy() {
        // Remove event listeners
        if (this.saveHandler) {
            document.removeEventListener('keydown', this.saveHandler);
        }

        // Remove Git event listeners
        eventBus.off('git:file-changed', this.handleGitFileChanged);
        eventBus.off('git:branch-switched', this.handleGitBranchSwitched);
        eventBus.off('git:show-diff', this.handleShowDiff);

        // Clear timeouts
        clearTimeout(this.hoverTimeout);
        clearTimeout(this.changeTimeout);

        // Clear hover tooltip
        this.clearHoverTooltip();

        // Clear Git gutters
        this.clearBlameGutter();
        this.clearDiffGutter();

        // Notify LSP document closed
        lspClient.didClose(this.filePath);

        // Clear dirty state
        if (this.isDirty) {
            this.setDirty(false);
        }

        // Stop tracking this file in file state tracker
        fileStateTracker.untrackFile(this.filePath);

        // Clear container
        this.container.innerHTML = '';
    }
}

module.exports = TextEditor;
