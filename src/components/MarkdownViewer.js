/**
 * MarkdownViewer - Markdown preview with mermaid diagram support
 *
 * Renders markdown content with:
 * - Full markdown syntax support (headers, lists, code, tables, etc.)
 * - Mermaid diagram rendering (flowcharts, sequence, class, state diagrams)
 * - Dark theme styling
 * - Edit/Preview mode toggle
 *
 * Usage:
 *   const viewer = new MarkdownViewer(container, content, filePath);
 */

const { marked } = require('marked');
const TextEditor = require('./TextEditor');

class MarkdownViewer {
    constructor(container, content, filePath) {
        this.container = container;
        this.content = content;
        this.filePath = filePath;
        this.mode = 'edit'; // 'edit' or 'preview' - default to edit
        this.textEditor = null;
        this.previewContainer = null;
        this.toolbar = null;
        this.zoomLevel = 1.0;

        this.init();
    }

    /**
     * Initialize the markdown viewer
     */
    async init() {
        console.log('[MarkdownViewer] Initializing for:', this.filePath);

        // Configure mermaid
        this.configureMermaid();

        // Render UI
        this.render();
    }

    /**
     * Configure mermaid with dark theme
     */
    configureMermaid() {
        if (!window.mermaid) {
            console.warn('[MarkdownViewer] Mermaid not loaded');
            return;
        }

        window.mermaid.initialize({
            startOnLoad: false,
            theme: 'dark',
            themeVariables: {
                darkMode: true,
                background: '#1e1e1e',
                primaryColor: '#0e639c',
                primaryTextColor: '#d4d4d4',
                primaryBorderColor: '#3e3e42',
                lineColor: '#d4d4d4',
                secondaryColor: '#3e3e42',
                tertiaryColor: '#2d2d30',
                mainBkg: '#1e1e1e',
                secondBkg: '#2d2d30',
                mainContrastColor: '#d4d4d4',
                textColor: '#d4d4d4',
                lineHeight: 1.5
            },
            flowchart: {
                htmlLabels: true,
                curve: 'basis'
            },
            securityLevel: 'loose',
            fontFamily: '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif'
        });
    }

    /**
     * Render the viewer UI
     */
    render() {
        this.container.innerHTML = '';
        this.container.className = 'markdown-viewer';

        // Create toolbar
        this.toolbar = this.createToolbar();
        this.container.appendChild(this.toolbar);

        // Create content container
        const contentContainer = document.createElement('div');
        contentContainer.className = 'markdown-content-container';
        this.container.appendChild(contentContainer);

        // Create preview container
        this.previewContainer = document.createElement('div');
        this.previewContainer.className = 'markdown-preview';
        this.previewContainer.style.display = this.mode === 'preview' ? 'block' : 'none';
        contentContainer.appendChild(this.previewContainer);

        // Create editor for edit mode
        if (this.mode === 'edit') {
            const editorContainer = document.createElement('div');
            editorContainer.className = 'markdown-editor-container';
            contentContainer.appendChild(editorContainer);
            this.textEditor = new TextEditor(editorContainer, this.content, this.filePath);
        } else {
            // Render markdown for preview mode
            this.renderMarkdown();
        }
    }

    /**
     * Create toolbar with controls
     */
    createToolbar() {
        const toolbar = document.createElement('div');
        toolbar.className = 'markdown-toolbar';

        // Preview toggle button (magnifying glass)
        const previewButton = document.createElement('button');
        previewButton.className = 'markdown-toolbar-btn markdown-preview-toggle';
        previewButton.innerHTML = '🔍';
        previewButton.title = 'Toggle Preview';
        previewButton.addEventListener('click', () => this.toggleMode());
        toolbar.appendChild(previewButton);

        return toolbar;
    }

    /**
     * Toggle between edit and preview modes
     */
    toggleMode() {
        console.log('[MarkdownViewer] Toggling mode from', this.mode);

        if (this.mode === 'preview') {
            // Switch to edit mode
            this.mode = 'edit';
            this.previewContainer.style.display = 'none';

            // Show text editor container if it exists
            const editorContainer = this.container.querySelector('.markdown-editor-container');
            if (editorContainer) {
                editorContainer.style.display = 'block';
            } else if (!this.textEditor) {
                // Create text editor if not exists
                const newEditorContainer = document.createElement('div');
                newEditorContainer.className = 'markdown-editor-container';
                this.container.querySelector('.markdown-content-container').appendChild(newEditorContainer);

                this.textEditor = new TextEditor(newEditorContainer, this.content, this.filePath);
            }
        } else {
            // Switch to preview mode
            this.mode = 'preview';

            // Get updated content from editor
            if (this.textEditor && this.textEditor.editor) {
                this.content = this.textEditor.editor.getValue();
            }

            // Show preview
            this.previewContainer.style.display = 'block';
            this.renderMarkdown();

            // Hide editor
            if (this.textEditor) {
                const editorContainer = this.container.querySelector('.markdown-editor-container');
                if (editorContainer) {
                    editorContainer.style.display = 'none';
                }
            }
        }
    }

    /**
     * Render markdown to HTML with mermaid support
     */
    async renderMarkdown() {
        console.log('[MarkdownViewer] Rendering markdown');

        try {
            // Parse markdown to HTML
            let html = marked.parse(this.content);

            // Replace mermaid code blocks with placeholders
            const mermaidBlocks = [];
            html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g, (match, code) => {
                const id = `mermaid-${mermaidBlocks.length}`;
                mermaidBlocks.push({ id, code: this.decodeHTML(code) });
                return `<div class="mermaid-container" id="${id}"></div>`;
            });

            // Set HTML
            this.previewContainer.innerHTML = html;

            // Render mermaid diagrams
            if (window.mermaid && mermaidBlocks.length > 0) {
                for (const block of mermaidBlocks) {
                    try {
                        const { svg } = await window.mermaid.render(`mermaid-svg-${block.id}`, block.code);
                        const container = this.previewContainer.querySelector(`#${block.id}`);
                        if (container) {
                            container.innerHTML = svg;
                        }
                    } catch (error) {
                        console.error('[MarkdownViewer] Mermaid rendering error:', error);
                        const container = this.previewContainer.querySelector(`#${block.id}`);
                        if (container) {
                            container.innerHTML = `<div class="mermaid-error">
                                <strong>Mermaid Syntax Error:</strong>
                                <pre>${this.escapeHTML(error.message)}</pre>
                            </div>`;
                        }
                    }
                }
            } else if (mermaidBlocks.length > 0) {
                console.warn('[MarkdownViewer] Mermaid not loaded, skipping diagram rendering');
            }

            // Apply zoom
            this.previewContainer.style.transform = `scale(${this.zoomLevel})`;
            this.previewContainer.style.transformOrigin = 'top left';

        } catch (error) {
            console.error('[MarkdownViewer] Rendering error:', error);
            this.previewContainer.innerHTML = `<div class="markdown-error">
                <strong>Error rendering markdown:</strong>
                <pre>${this.escapeHTML(error.message)}</pre>
            </div>`;
        }
    }

    /**
     * Zoom preview
     * @param {number} delta - Zoom delta (0 = reset)
     */
    zoom(delta) {
        if (delta === 0) {
            this.zoomLevel = 1.0;
        } else {
            this.zoomLevel = Math.max(0.5, Math.min(2.0, this.zoomLevel + delta));
        }

        console.log('[MarkdownViewer] Zoom level:', this.zoomLevel);

        this.previewContainer.style.transform = `scale(${this.zoomLevel})`;
        this.previewContainer.style.transformOrigin = 'top left';

        // Update zoom button text
        const zoomResetButton = this.toolbar.querySelectorAll('.markdown-toolbar-btn')[3];
        zoomResetButton.innerHTML = `${Math.round(this.zoomLevel * 100)}%`;
    }

    /**
     * Export to HTML file
     */
    async exportToHTML() {
        console.log('[MarkdownViewer] Exporting to HTML');

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Export</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background-color: #1e1e1e;
            color: #d4d4d4;
            padding: 20px;
            max-width: 900px;
            margin: 0 auto;
        }
    </style>
</head>
<body>
${this.previewContainer.innerHTML}
</body>
</html>`;

        // Create blob and download
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.filePath.replace(/\.md$/, '.html');
        a.click();
        URL.revokeObjectURL(url);

        console.log('[MarkdownViewer] HTML exported');
    }

    /**
     * Decode HTML entities
     */
    decodeHTML(html) {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    }

    /**
     * Escape HTML special characters
     */
    escapeHTML(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        console.log('[MarkdownViewer] Destroying');

        if (this.textEditor) {
            this.textEditor.destroy();
        }

        this.container.innerHTML = '';
    }
}

module.exports = MarkdownViewer;
