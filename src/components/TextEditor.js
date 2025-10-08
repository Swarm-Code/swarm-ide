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
const stateManager = require('../modules/StateManager');
const fileTypes = require('../utils/FileTypes');
const lspClient = require('../services/LSPClient');
const settingsPanel = require('./SettingsPanel');
const ContextMenu = require('./ContextMenu');
const MouseTracker = require('./MouseTracker');
const fileStateTracker = require('../modules/FileStateTracker');
const performanceMonitor = require('../utils/PerformanceMonitor');

class TextEditor {
    constructor(container, content, filePath) {
        console.log('[TextEditor] ========== CONSTRUCTOR ==========');
        console.log('[TextEditor] container:', container);
        console.log('[TextEditor] container dataset:', container.dataset);
        console.log('[TextEditor] filePath:', filePath);
        console.log('[TextEditor] content length:', content.length);

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

        // Start tracking this file with hash-based modification detection
        fileStateTracker.trackFile(filePath, content);

        console.log('[TextEditor] About to call init()');
        this.init();
        console.log('[TextEditor] ========================================');
    }

    /**
     * Initialize LSP for this document
     */
    async initLSP() {
        try {
            await lspClient.didOpen(this.filePath, this.content);
            console.log('[TextEditor] LSP initialized for:', this.filePath);
        } catch (error) {
            console.error('[TextEditor] LSP init error:', error);
        }
    }

    /**
     * Initialize the editor
     */
    async init() {
        console.log('[TextEditor] init() START');

        // Wrap render with performance measurement
        performanceMonitor.measure('TextEditor.render', () => {
            this.render();
        }, { filePath: this.filePath, contentLength: this.content.length });

        console.log('[TextEditor] render() DONE');

        // Start mouse tracking with hover callback
        this.mouseTracker = new MouseTracker(this.editor, (pos, token, event) => {
            this.handleHover(pos, token, event);
        });
        this.mouseTracker.start();

        this.setupEventListeners();
        console.log('[TextEditor] setupEventListeners() DONE');
        console.log('[TextEditor] About to call setupLSPFeatures()...');
        try {
            this.setupLSPFeatures();
            console.log('[TextEditor] setupLSPFeatures() DONE');
        } catch (error) {
            console.error('[TextEditor] setupLSPFeatures() ERROR:', error);
        }
        console.log('[TextEditor] About to call initLSP()...');
        await this.initLSP();
        console.log('[TextEditor] init() COMPLETE');

        // Update breadcrumb with initial cursor position
        setTimeout(() => {
            this.updateBreadcrumb();
        }, 50);
    }

    /**
     * Render the editor
     */
    render() {
        console.log('[TextEditor] ========== RENDER ==========');
        console.log('[TextEditor] container:', this.container);
        console.log('[TextEditor] container dataset:', this.container.dataset);
        console.log('[TextEditor] filePath:', this.filePath);

        this.container.innerHTML = '<div class="text-editor"></div>';
        const editorContainer = this.container.querySelector('.text-editor');
        console.log('[TextEditor] editorContainer:', editorContainer);

        // Determine CodeMirror mode from file extension
        const mode = this.getCodeMirrorMode();
        console.log('[TextEditor] CodeMirror mode:', mode);

        // Create CodeMirror editor (using global CodeMirror loaded via script tag)
        console.log('[TextEditor] Creating CodeMirror instance...');
        console.log('[TextEditor] Content size:', this.content.length, 'bytes');
        console.log('[TextEditor] Line count:', this.content.split('\n').length);

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

        console.log('[TextEditor] Line count:', lineCount);
        console.log('[TextEditor] Using adaptive viewportMargin:', viewportMargin);

        this.editor = window.CodeMirror(editorContainer, {
            value: this.content,
            mode: mode,
            theme: 'monokai',
            lineNumbers: true,
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

        console.log('[TextEditor] CodeMirror constructor took:', renderDuration.toFixed(2), 'ms');

        // Track CodeMirror render performance
        performanceMonitor.trackCodeMirrorRender(this.filePath, this.content.length, renderDuration);

        console.log('[TextEditor] CodeMirror instance created:', this.editor);
        console.log('[TextEditor] CodeMirror DOM element:', this.editor.getWrapperElement());
        console.log('[TextEditor] CodeMirror parent element:', this.editor.getWrapperElement().parentElement);

        // Add URL highlighting overlay
        this.setupURLHighlighting();

        // Setup Ctrl+Click to open URLs
        this.setupURLClickHandler();

        // Refresh CodeMirror to ensure proper rendering
        // Use setTimeout to ensure DOM is ready
        setTimeout(() => {
            if (this.editor) {
                const refreshStart = performance.now();
                console.log('[TextEditor] Calling editor.refresh()...');
                this.editor.refresh();
                const refreshDuration = performance.now() - refreshStart;
                console.log('[TextEditor] editor.refresh() took:', refreshDuration.toFixed(2), 'ms');

                if (refreshDuration > 100) {
                    console.warn('[TextEditor] ⚠️ Slow refresh detected for:', this.filePath);
                }
            }
        }, 10);

        console.log('[TextEditor] ========================================');
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
                    console.log('[TextEditor] Opening URL:', url);

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
                console.log('[TextEditor] Prevented default file drop');
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
        console.log('[TextEditor] Setting up context menu for:', this.filePath);
        this.contextMenu = new ContextMenu();

        const editorWrapper = this.editor.getWrapperElement();
        editorWrapper.addEventListener('contextmenu', (e) => {
            console.log('[TextEditor] Context menu triggered at:', e.clientX, e.clientY);
            e.preventDefault();

            const selection = this.editor.getSelection();
            const hasSelection = selection.length > 0;

            console.log('[TextEditor] Has selection:', hasSelection);
            const actions = this.getContextMenuActions(hasSelection);
            console.log('[TextEditor] Context menu actions:', actions.length);
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
        console.log('[TextEditor] Go to Definition called');
        const cursor = this.editor.getCursor();
        console.log('[TextEditor] Cursor position:', cursor.line, cursor.ch);
        try {
            const definition = await lspClient.definition(this.filePath, cursor.line, cursor.ch);
            console.log('[TextEditor] Definition result:', definition);
            if (definition) {
                console.log('[TextEditor] Definition found:', definition);

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
                console.log('[TextEditor] No definition found');
            }
        } catch (err) {
            console.error('[TextEditor] Go to Definition error:', err);
        }
    }

    async findAllReferences() {
        console.log('[TextEditor] Find All References called');
        const cursor = this.editor.getCursor();
        console.log('[TextEditor] Cursor position:', cursor.line, cursor.ch);
        try {
            const references = await lspClient.references(this.filePath, cursor.line, cursor.ch, true);
            console.log('[TextEditor] References result:', references);
            if (references && references.length > 0) {
                console.log(`[TextEditor] Found ${references.length} references:`, references);

                // Create references panel or output to console
                references.forEach((ref, index) => {
                    const filePath = ref.uri.replace('file://', '');
                    const line = ref.range.start.line + 1; // Display 1-indexed
                    const char = ref.range.start.character + 1;
                    console.log(`  ${index + 1}. ${filePath}:${line}:${char}`);
                });

                // Emit event for references panel (can be implemented later)
                eventBus.emit('editor:references-found', references);
            } else {
                console.log('[TextEditor] No references found');
            }
        } catch (err) {
            console.error('[TextEditor] Find References error:', err);
        }
    }

    /**
     * Navigate to a specific line number and highlight it
     * @param {number} lineNumber - Line number to navigate to (1-based from search results)
     * @param {number} character - Optional character position (default 0)
     */
    goToLine(lineNumber, character = 0) {
        if (!this.editor) {
            console.warn('[TextEditor] Cannot goToLine: editor not initialized');
            return;
        }

        console.log('[TextEditor] Navigating to line:', lineNumber);

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
        console.log('[TextEditor] Rename Symbol called');
        const cursor = this.editor.getCursor();
        console.log('[TextEditor] Cursor position:', cursor.line, cursor.ch);

        // Prompt user for new name
        const newName = prompt('Enter new name for symbol:');
        console.log('[TextEditor] New name entered:', newName);
        if (!newName || newName.trim() === '') {
            console.log('[TextEditor] Rename cancelled');
            return;
        }

        try {
            const workspaceEdit = await lspClient.rename(this.filePath, cursor.line, cursor.ch, newName);
            console.log('[TextEditor] Rename workspace edit result:', workspaceEdit);
            if (workspaceEdit && workspaceEdit.changes) {
                console.log('[TextEditor] Rename workspace edit:', workspaceEdit);

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

                    console.log(`[TextEditor] Applied ${edits.length} rename edits`);
                }

                // Emit event for other files (can be implemented later)
                eventBus.emit('editor:workspace-edit', workspaceEdit);
            } else {
                console.log('[TextEditor] No rename edits returned');
            }
        } catch (err) {
            console.error('[TextEditor] Rename Symbol error:', err);
        }
    }

    async formatDocument() {
        console.log('[TextEditor] Format Document called');
        try {
            const edits = await lspClient.formatting(this.filePath, 4, true);
            console.log('[TextEditor] Formatting result:', edits);

            if (edits && edits.length > 0) {
                console.log(`[TextEditor] Applying ${edits.length} formatting edits`);

                // Apply edits in reverse order to maintain positions
                edits.sort((a, b) => b.range.start.line - a.range.start.line);

                edits.forEach(edit => {
                    const from = { line: edit.range.start.line, ch: edit.range.start.character };
                    const to = { line: edit.range.end.line, ch: edit.range.end.character };
                    this.editor.replaceRange(edit.newText, from, to);
                });

                console.log('[TextEditor] Document formatted successfully');
            } else {
                // Fallback to basic indentation if LSP formatting not available
                console.log('[TextEditor] LSP formatting not available, using basic indentation');
                const lineCount = this.editor.lineCount();
                for (let i = 0; i < lineCount; i++) {
                    this.editor.indentLine(i, 'smart');
                }
            }
        } catch (err) {
            console.error('[TextEditor] Format Document error:', err);
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
            console.error('[TextEditor] Paste failed:', err);
        }
    }

    async revealInFileManager() {
        try {
            const result = await window.electronAPI.revealInFileManager(this.filePath);
            if (!result || !result.success) {
                console.log('[TextEditor] Reveal in File Manager not implemented');
            }
        } catch (err) {
            console.log('[TextEditor] Reveal in File Manager:', this.filePath);
        }
    }

    /**
     * Setup LSP features (hover, autocomplete, etc.)
     */
    setupLSPFeatures() {
        console.log('[TextEditor] *** setupLSPFeatures() CALLED ***');
        console.log('[TextEditor] this.editor exists:', !!this.editor);

        if (!this.editor) {
            console.log('[TextEditor] EARLY RETURN: No editor!');
            return;
        }

        // Check if LSP is enabled
        const lspEnabled = settingsPanel.get('lspEnabled');
        console.log('[TextEditor] LSP enabled from settings:', lspEnabled);

        if (!lspEnabled) {
            console.log('[TextEditor] EARLY RETURN: LSP disabled in settings');
            return;
        }

        console.log('[TextEditor] ✓ Setting up LSP features - hover, completion, etc.');

        // Setup hover on mousemove
        console.log('[TextEditor] ✓ Attaching mousemove event for hover');
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
        console.log('[TextEditor] handleHover called for token:', token.string, 'type:', token.type);

        // Clear any existing tooltip first
        this.clearHoverTooltip();

        // Check if hover is enabled in settings
        if (!settingsPanel.get('hoverEnabled')) {
            console.log('[TextEditor] Hover disabled in settings');
            return;
        }

        // Check if file type supports hover
        if (!this.shouldEnableHover()) {
            console.log('[TextEditor] Hover not supported for this file type');
            return;
        }

        // Check if token is hoverable
        if (!this.isTokenHoverable(token)) {
            console.log('[TextEditor] Token not hoverable:', token.string, 'type:', token.type);
            return;
        }

        console.log('[TextEditor] ✓ Token is hoverable, requesting LSP hover');
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
                // Future: Git blame info
                sectionDiv.innerHTML = `<div class="hover-git-blame">${section.content}</div>`;
            } else if (section.type === 'git-history') {
                // Future: Git history
                sectionDiv.innerHTML = `<div class="hover-git-history">${section.content}</div>`;
            }

            container.appendChild(sectionDiv);
        });

        return container;
    }

    async showHoverTooltip(pos, event) {
        try {
            console.log('[TextEditor] Requesting hover at line:', pos.line, 'ch:', pos.ch);
            const hoverInfo = await lspClient.hover(this.filePath, pos.line, pos.ch);
            console.log('[TextEditor] Hover response:', hoverInfo);

            if (!hoverInfo || !hoverInfo.contents) {
                console.log('[TextEditor] No hover content received');
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
                console.log('[TextEditor] Hover content is empty');
                return;
            }

            this.clearHoverTooltip();

            // Create tooltip
            this.hoverTooltip = document.createElement('div');
            this.hoverTooltip.className = 'lsp-hover-tooltip';

            // Build sections array (extensible for future features)
            const sections = [
                { type: 'lsp', content: content }
                // Future: { type: 'git-blame', content: '...' }
                // Future: { type: 'git-history', content: '...' }
            ];

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

            console.log('[TextEditor] ✓ Hover tooltip displayed at', left, top);
        } catch (error) {
            console.error('[TextEditor] Hover error:', error);
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
            console.log('[TextEditor] No changes to save');
            return;
        }

        try {
            console.log('[TextEditor] Saving file:', this.filePath);
            const content = this.getContent();
            const result = await window.electronAPI.saveFile(this.filePath, content);

            if (result.success) {
                this.setDirty(false);
                this.content = content;

                // Update baseline hash in file state tracker
                fileStateTracker.updateBaseline(this.filePath, content);

                console.log('[TextEditor] ✓ File saved successfully');
                eventBus.emit('file:saved', { path: this.filePath });

                // Notify LSP
                await lspClient.didSave(this.filePath);

                // Show brief save confirmation
                this.showSaveNotification();
            } else {
                console.error('[TextEditor] Save failed:', result.error);
                this.showErrorNotification('Save failed: ' + result.error);
            }
        } catch (error) {
            console.error('[TextEditor] Error saving file:', error);
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
     * Cleanup
     */
    destroy() {
        // Remove event listeners
        if (this.saveHandler) {
            document.removeEventListener('keydown', this.saveHandler);
        }

        // Clear timeouts
        clearTimeout(this.hoverTimeout);
        clearTimeout(this.changeTimeout);

        // Clear hover tooltip
        this.clearHoverTooltip();

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
