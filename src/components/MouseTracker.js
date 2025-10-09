/**
 * MouseTracker - Simple component to track mouse position over editor
 * Uses native DOM events - no external dependencies
 */

const logger = require('../utils/Logger');

class MouseTracker {
    constructor(editor, onHover) {
        this.editor = editor;
        this.onHover = onHover;
        this.isTracking = false;
        this.mouseMoveHandler = null;
        this.hoverTimeout = null;
        this.lastPos = null;
        logger.debug('hover', 'Created for editor:', !!editor);
    }

    start() {
        if (this.isTracking) {
            logger.debug('hover', 'Already tracking');
            return;
        }

        if (!this.editor) {
            logger.error('hover', 'No editor provided!');
            return;
        }

        logger.debug('hover', 'Starting mouse tracking...');

        // Get the CodeMirror wrapper element
        const wrapper = this.editor.getWrapperElement();

        if (!wrapper) {
            logger.error('hover', 'No wrapper element found!');
            return;
        }

        logger.debug('hover', 'Wrapper element found:', wrapper.className);

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
                        logger.trace('hover', 'Hover triggered at line:', pos.line, 'ch:', pos.ch, 'token:', token.string);
                        if (this.onHover) {
                            this.onHover(pos, token, event);
                        }
                    }, 200);
                }
            } catch (err) {
                logger.error('hover', 'Error getting position:', err);
            }
        };

        // Attach to wrapper
        wrapper.addEventListener('mousemove', this.mouseMoveHandler, false);
        this.isTracking = true;
        logger.debug('hover', '✓✓✓ Mouse tracking ACTIVE ✓✓✓');
    }

    stop() {
        if (!this.isTracking) return;

        const wrapper = this.editor.getWrapperElement();
        if (wrapper && this.mouseMoveHandler) {
            wrapper.removeEventListener('mousemove', this.mouseMoveHandler, false);
        }

        this.isTracking = false;
        logger.debug('hover', 'Mouse tracking stopped');
    }
}

module.exports = MouseTracker;
