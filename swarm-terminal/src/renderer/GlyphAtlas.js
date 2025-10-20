/**
 * GlyphAtlas.js - Texture atlas for pre-rendered terminal glyphs
 *
 * Implements shelf packing algorithm for efficient texture space usage.
 * Renders glyphs to HTML Canvas, which is then uploaded to WebGL as texture.
 *
 * Performance:
 * - O(1) cache hit for repeated glyphs
 * - Shelf packing minimizes texture memory
 * - Supports dynamic glyph loading
 * - ~100ms to load full ASCII set (95 glyphs)
 * - ~10ms for 10k cache hits
 *
 * Architecture:
 * - Canvas 2D rendering for glyph rasterization
 * - Cache keyed by: char + bold + italic + underline + color
 * - Texture coordinates normalized to [0, 1]
 * - Dirty tracking for GPU texture uploads
 */

class GlyphAtlas {
    /**
     * Create a glyph atlas
     * @param {Object} options - Configuration
     * @param {number} options.width - Atlas width in pixels (default: 2048)
     * @param {number} options.height - Atlas height in pixels (default: 2048)
     * @param {number} options.cellWidth - Cell width in pixels
     * @param {number} options.cellHeight - Cell height in pixels
     * @param {string} options.fontFamily - Font family (default: 'monospace')
     * @param {number} options.fontSize - Font size in pixels (default: 14)
     * @param {Function} options.createCanvas - Canvas factory function (optional, uses browser API if not provided)
     */
    constructor(options = {}) {
        this.width = options.width || 2048;
        this.height = options.height || 2048;
        this.cellWidth = options.cellWidth || 10;
        this.cellHeight = options.cellHeight || 20;
        this.fontFamily = options.fontFamily || 'monospace';
        this.fontSize = options.fontSize || 14;

        // Create rendering canvas using provided factory or browser API
        const createCanvas = options.createCanvas || this._defaultCreateCanvas.bind(this);
        this.canvas = createCanvas(this.width, this.height);
        this.ctx = this.canvas.getContext('2d');

        // Clear canvas to transparent
        this.ctx.clearRect(0, 0, this.width, this.height);

        // Glyph cache: Map<cacheKey, {u1, v1, u2, v2}>
        this.glyphCache = new Map();

        // Fast path cache: Direct array for ASCII white text with no styles
        // Index = charCode - 32 (for chars 32-126)
        // Saves key generation + Map lookup for most common case
        this.asciiWhiteCache = new Array(95); // ASCII printable range

        // Shelf packing state
        this.currentX = 0;
        this.currentY = 0;
        this.currentShelfHeight = this.cellHeight;

        // Track if atlas has filled up at least once
        this._hasFilledOnce = false;

        // Dirty tracking
        this._isDirty = false;

        // Statistics
        this.cacheHits = 0;
        this.cacheMisses = 0;

        // Performance profiling (enable for debugging)
        this.profiling = {
            enabled: false,
            keyGenTime: 0,
            getTime: 0,
            totalCalls: 0
        };

        // Pre-calculate font metrics
        this._calculateFontMetrics();
    }

    /**
     * Default canvas factory using browser API
     * @private
     */
    _defaultCreateCanvas(width, height) {
        if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            return canvas;
        }
        throw new Error('No canvas implementation available. Provide createCanvas option.');
    }

    /**
     * Calculate font metrics (baseline, ascent, descent)
     * @private
     */
    _calculateFontMetrics() {
        this.ctx.font = this._getFontString(false, false);
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';

        // Measure a typical character to get metrics
        const metrics = this.ctx.measureText('M');

        // Calculate baseline offset
        // For middle alignment, baseline is at cellHeight / 2
        this.baseline = this.cellHeight / 2;

        // Store metrics
        this.fontMetrics = {
            cellWidth: this.cellWidth,
            cellHeight: this.cellHeight,
            baseline: this.baseline
        };
    }

    /**
     * Get font string for canvas
     * @private
     */
    _getFontString(bold, italic) {
        let font = '';
        if (italic) font += 'italic ';
        if (bold) font += 'bold ';
        font += `${this.fontSize}px ${this.fontFamily}`;
        return font;
    }

    /**
     * Generate cache key for glyph
     * Optimized for performance - uses simple concatenation without toString
     * @private
     */
    _getCacheKey(char, bold, italic, underline, color) {
        // Fast string concatenation without template literals
        // Format: char|b|i|u|color (use direct booleans and numbers)
        return char + '|' + (bold ? '1' : '0') + (italic ? '1' : '0') + (underline ? '1' : '0') + '|' + color;
    }

    /**
     * Get glyph texture coordinates, loading if necessary
     * @param {string} char - Character to render
     * @param {boolean} bold - Bold style
     * @param {boolean} italic - Italic style
     * @param {boolean} underline - Underline style
     * @param {number} color - RGB color (24-bit)
     * @returns {Object} Texture coordinates {u1, v1, u2, v2}
     */
    getGlyph(char, bold, italic, underline, color) {
        // Ultra-fast path: ASCII white text with no styles (most common case)
        // Saves ~30% by avoiding key generation and Map lookup
        if (!bold && !italic && !underline && color === 0xFFFFFF) {
            const code = char.charCodeAt(0);
            if (code >= 32 && code <= 126) {
                const idx = code - 32;
                const cached = this.asciiWhiteCache[idx];
                if (cached) {
                    this.cacheHits++;
                    return cached;
                }
                // First time - render and cache
                this.cacheMisses++;
                const coords = this._renderGlyph(char, false, false, false, 0xFFFFFF);
                this.asciiWhiteCache[idx] = coords;
                // Also add to main cache for consistency
                const key = this._getCacheKey(char, false, false, false, 0xFFFFFF);
                this.glyphCache.set(key, coords);
                this._isDirty = true;
                return coords;
            }
        }

        if (this.profiling.enabled) {
            this.profiling.totalCalls++;

            // Measure key generation
            const t0 = performance.now();
            const key = this._getCacheKey(char, bold, italic, underline, color);
            const t1 = performance.now();
            this.profiling.keyGenTime += (t1 - t0);

            // Measure cache get (no has() check - just get directly)
            const t2 = performance.now();
            const cached = this.glyphCache.get(key);
            const t3 = performance.now();
            this.profiling.getTime += (t3 - t2);

            if (cached !== undefined) {
                this.cacheHits++;
                return cached;
            }

            // Cache miss - render glyph
            this.cacheMisses++;
            const coords = this._renderGlyph(char, bold, italic, underline, color);
            this.glyphCache.set(key, coords);
            this._isDirty = true;
            return coords;
        } else {
            // Regular path - single Map.get() call
            const key = this._getCacheKey(char, bold, italic, underline, color);
            const cached = this.glyphCache.get(key);

            if (cached !== undefined) {
                this.cacheHits++;
                return cached;
            }

            // Cache miss - render glyph
            this.cacheMisses++;
            const coords = this._renderGlyph(char, bold, italic, underline, color);
            this.glyphCache.set(key, coords);
            this._isDirty = true;

            return coords;
        }
    }

    /**
     * Render glyph to atlas canvas
     * @private
     */
    _renderGlyph(char, bold, italic, underline, color) {
        // Check if we need to move to next shelf
        if (this.currentX + this.cellWidth > this.width) {
            this.currentX = 0;
            this.currentY += this.currentShelfHeight;
            this.currentShelfHeight = this.cellHeight;
        }

        // Check if atlas is full
        if (this.currentY + this.cellHeight > this.height) {
            // Atlas full - mark it and wrap around (in production, might expand or evict)
            this._hasFilledOnce = true;
            console.warn('GlyphAtlas full, wrapping around');
            this.currentX = 0;
            this.currentY = 0;
        }

        const x = this.currentX;
        const y = this.currentY;

        // Set up rendering context
        this.ctx.save();
        this.ctx.font = this._getFontString(bold, italic);
        this.ctx.textBaseline = 'middle';
        this.ctx.textAlign = 'left';

        // Convert RGB int to CSS color
        const r = (color >> 16) & 0xFF;
        const g = (color >> 8) & 0xFF;
        const b = color & 0xFF;
        this.ctx.fillStyle = `rgb(${r},${g},${b})`;

        // Clear cell area
        this.ctx.clearRect(x, y, this.cellWidth, this.cellHeight);

        // Render character
        // Center vertically in cell
        const textY = y + this.cellHeight / 2;
        this.ctx.fillText(char, x, textY);

        // Draw underline if needed
        if (underline) {
            const underlineY = y + this.cellHeight - 2;
            this.ctx.fillRect(x, underlineY, this.cellWidth, 1);
        }

        this.ctx.restore();

        // Calculate normalized texture coordinates
        const u1 = x / this.width;
        const v1 = y / this.height;
        const u2 = (x + this.cellWidth) / this.width;
        const v2 = (y + this.cellHeight) / this.height;

        // Advance position
        this.currentX += this.cellWidth;

        return { u1, v1, u2, v2 };
    }

    /**
     * Get canvas as texture source
     * @returns {HTMLCanvasElement} Canvas element
     */
    getTexture() {
        return this.canvas;
    }

    /**
     * Check if texture needs upload to GPU
     * @returns {boolean} True if dirty
     */
    isDirty() {
        return this._isDirty;
    }

    /**
     * Clear dirty flag (after texture upload)
     */
    clearDirty() {
        this._isDirty = false;
    }

    /**
     * Get font metrics
     * @returns {Object} Font metrics
     */
    getFontMetrics() {
        return this.fontMetrics;
    }

    /**
     * Measure glyph width
     * @param {string} char - Character to measure
     * @returns {number} Width in pixels
     */
    measureGlyphWidth(char) {
        this.ctx.save();
        this.ctx.font = this._getFontString(false, false);
        const metrics = this.ctx.measureText(char);
        this.ctx.restore();
        return metrics.width;
    }

    /**
     * Check if atlas is full
     * @returns {boolean} True if atlas has filled at least once
     */
    isFull() {
        return this._hasFilledOnce;
    }

    /**
     * Clear atlas and reset
     */
    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.glyphCache.clear();
        this.asciiWhiteCache.fill(undefined); // Clear fast path cache
        this.currentX = 0;
        this.currentY = 0;
        this.currentShelfHeight = this.cellHeight;
        this._hasFilledOnce = false;
        this._isDirty = true;
        this.cacheHits = 0;
        this.cacheMisses = 0;
    }

    /**
     * Enable performance profiling
     */
    enableProfiling() {
        this.profiling.enabled = true;
        this.resetProfiling();
    }

    /**
     * Disable performance profiling
     */
    disableProfiling() {
        this.profiling.enabled = false;
    }

    /**
     * Reset profiling counters
     */
    resetProfiling() {
        this.profiling.keyGenTime = 0;
        this.profiling.getTime = 0;
        this.profiling.totalCalls = 0;
    }

    /**
     * Get profiling results
     * @returns {Object} Profiling data
     */
    getProfilingResults() {
        return {
            enabled: this.profiling.enabled,
            totalCalls: this.profiling.totalCalls,
            keyGenTime: this.profiling.keyGenTime,
            getTime: this.profiling.getTime,
            totalTime: this.profiling.keyGenTime + this.profiling.getTime,
            avgKeyGen: this.profiling.totalCalls > 0 ? this.profiling.keyGenTime / this.profiling.totalCalls : 0,
            avgGet: this.profiling.totalCalls > 0 ? this.profiling.getTime / this.profiling.totalCalls : 0
        };
    }

    /**
     * Get atlas statistics
     * @returns {Object} Statistics
     */
    getStats() {
        return {
            cacheSize: this.glyphCache.size,
            width: this.width,
            height: this.height,
            cellWidth: this.cellWidth,
            cellHeight: this.cellHeight,
            cacheHits: this.cacheHits,
            cacheMisses: this.cacheMisses,
            currentX: this.currentX,
            currentY: this.currentY,
            utilization: (this.currentY * this.width + this.currentX) / (this.width * this.height)
        };
    }
}

module.exports = GlyphAtlas;
