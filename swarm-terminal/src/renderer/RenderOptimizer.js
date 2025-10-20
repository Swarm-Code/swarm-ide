/**
 * RenderOptimizer.js - Frame rate limiting and render batching
 *
 * Optimizes rendering performance by:
 * - Limiting frame rate to target FPS (default 60)
 * - Batching multiple render requests within same frame
 * - Tracking performance statistics
 * - Gracefully handling slow renders
 *
 * Architecture:
 * - Uses requestAnimationFrame when available (browser)
 * - Falls back to setTimeout in Node.js
 * - Single pending frame flag prevents redundant renders
 *
 * Performance targets:
 * - 60 FPS = 16.67ms frame budget
 * - Detect and report dropped frames
 * - Provide real-time FPS estimate
 */

const EventEmitter = require('events');

class RenderOptimizer extends EventEmitter {
    /**
     * Create render optimizer
     * @param {Function} renderCallback - Function to call for each frame
     * @param {Object} options - Configuration options
     * @param {number} options.targetFPS - Target frame rate (default: 60)
     * @param {boolean} options.continuous - Render continuously once started (default: true)
     */
    constructor(renderCallback, options = {}) {
        super();

        this.renderCallback = renderCallback;
        this.targetFPS = options.targetFPS || 60;
        this.frameInterval = 1000 / this.targetFPS; // ms per frame
        this.continuous = options.continuous !== undefined ? options.continuous : true;

        // State
        this._running = false;
        this._pendingFrame = false;
        this._rafId = null;

        // Performance tracking
        this._stats = {
            frameCount: 0,
            totalFrameTime: 0,
            lastFrameTime: 0,
            droppedFrames: 0,
            lastRenderTime: 0
        };

        // Detect if requestAnimationFrame is available
        this._useRAF = typeof requestAnimationFrame !== 'undefined';
    }

    /**
     * Start render loop
     */
    start() {
        if (this._running) return;

        this._running = true;
        this._scheduleNextFrame();
    }

    /**
     * Stop render loop
     */
    stop() {
        if (!this._running) return;

        this._running = false;
        this._pendingFrame = false;

        if (this._rafId !== null) {
            if (this._useRAF) {
                cancelAnimationFrame(this._rafId);
            } else {
                clearTimeout(this._rafId);
            }
            this._rafId = null;
        }
    }

    /**
     * Check if render loop is running
     * @returns {boolean}
     */
    isRunning() {
        return this._running;
    }

    /**
     * Request a render on the next frame
     * Multiple calls within same frame are batched
     */
    requestRender() {
        if (!this._running) {
            this.start();
        }

        this._pendingFrame = true;
    }

    /**
     * Check if a render is pending
     * @returns {boolean}
     */
    hasPendingFrame() {
        return this._pendingFrame;
    }

    /**
     * Get performance statistics
     * @returns {Object} Stats object
     */
    getStats() {
        const avgFrameTime = this._stats.frameCount > 0
            ? this._stats.totalFrameTime / this._stats.frameCount
            : 0;

        const fps = avgFrameTime > 0
            ? 1000 / avgFrameTime
            : 0;

        return {
            frameCount: this._stats.frameCount,
            avgFrameTime,
            lastFrameTime: this._stats.lastFrameTime,
            droppedFrames: this._stats.droppedFrames,
            fps: Math.min(fps, this.targetFPS) // Cap at target
        };
    }

    /**
     * Reset performance statistics
     */
    resetStats() {
        this._stats = {
            frameCount: 0,
            totalFrameTime: 0,
            lastFrameTime: 0,
            droppedFrames: 0,
            lastRenderTime: 0
        };
    }

    /**
     * Schedule next frame
     * @private
     */
    _scheduleNextFrame() {
        if (!this._running) return;

        if (this._useRAF) {
            // Use requestAnimationFrame in browser
            this._rafId = requestAnimationFrame(() => this._renderFrame());
        } else {
            // Use setTimeout in Node.js
            this._rafId = setTimeout(() => this._renderFrame(), this.frameInterval);
        }
    }

    /**
     * Execute render frame
     * @private
     */
    _renderFrame() {
        this._rafId = null;

        // Check if enough time has elapsed since last render (FPS throttling)
        const now = Date.now();
        const timeSinceLastRender = now - this._stats.lastRenderTime;
        const shouldRender = this._stats.lastRenderTime === 0 || timeSinceLastRender >= this.frameInterval;

        // Only render if there's a pending frame AND enough time elapsed
        if (this._pendingFrame && shouldRender) {
            this._pendingFrame = false;

            const frameStart = now;

            try {
                // Call user's render callback
                this.renderCallback();

                // Track performance
                const frameTime = Date.now() - frameStart;
                this._stats.lastFrameTime = frameTime;
                this._stats.totalFrameTime += frameTime;
                this._stats.frameCount++;

                // Detect dropped frames (render took longer than frame budget)
                if (frameTime > this.frameInterval) {
                    this._stats.droppedFrames++;
                }

                this._stats.lastRenderTime = Date.now();

                // In continuous mode, automatically request next frame
                if (this.continuous) {
                    this._pendingFrame = true;
                }

            } catch (error) {
                // Emit error but keep render loop running
                this.emit('error', error);

                // In continuous mode, keep rendering even after error
                if (this.continuous) {
                    this._pendingFrame = true;
                }
            }
        }

        // Schedule next frame
        this._scheduleNextFrame();
    }
}

module.exports = RenderOptimizer;
