/**
 * MouseTracker - Simple component to track mouse position over editor
 * Uses native DOM events - no external dependencies
 */

class MouseTracker {
    constructor(editor, onHover) {
        this.editor = editor;
        this.onHover = onHover;
        this.isTracking = false;
        this.mouseMoveHandler = null;
        this.hoverTimeout = null;
        this.lastPos = null;
        console.log('[MouseTracker] Created for editor:', !!editor);
    }

    start() {
        if (this.isTracking) {
            console.log('[MouseTracker] Already tracking');
            return;
        }

        if (!this.editor) {
            console.error('[MouseTracker] No editor provided!');
            return;
        }

        console.log('[MouseTracker] Starting mouse tracking...');

        // Get the CodeMirror wrapper element
        const wrapper = this.editor.getWrapperElement();

        if (!wrapper) {
            console.error('[MouseTracker] No wrapper element found!');
            return;
        }

        console.log('[MouseTracker] Wrapper element found:', wrapper.className);

        // Create handler with hover delay
        this.mouseMoveHandler = (event) => {
            try {
                const pos = this.editor.coordsChar({ left: event.clientX, top: event.clientY });
                const token = this.editor.getTokenAt(pos);

                // Clear previous hover timeout
                if (this.hoverTimeout) {
                    clearTimeout(this.hoverTimeout);
                    this.hoverTimeout = null;
                }

                // Only trigger hover if token exists and has content
                if (token && token.string && token.string.trim()) {
                    // Set new hover timeout (200ms delay)
                    this.hoverTimeout = setTimeout(() => {
                        console.log('[MouseTracker] Hover triggered at line:', pos.line, 'ch:', pos.ch, 'token:', token.string);
                        if (this.onHover) {
                            this.onHover(pos, token, event);
                        }
                    }, 200);
                }
            } catch (err) {
                console.error('[MouseTracker] Error getting position:', err);
            }
        };

        // Attach to wrapper
        wrapper.addEventListener('mousemove', this.mouseMoveHandler, false);
        this.isTracking = true;
        console.log('[MouseTracker] ✓✓✓ Mouse tracking ACTIVE ✓✓✓');
    }

    stop() {
        if (!this.isTracking) return;

        const wrapper = this.editor.getWrapperElement();
        if (wrapper && this.mouseMoveHandler) {
            wrapper.removeEventListener('mousemove', this.mouseMoveHandler, false);
        }

        this.isTracking = false;
        console.log('[MouseTracker] Mouse tracking stopped');
    }
}

module.exports = MouseTracker;
