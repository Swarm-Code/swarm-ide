/**
 * TerminalBuffer.js - Core terminal grid and state management
 *
 * Manages the terminal's visual state:
 * - 2D grid of cells (current screen)
 * - Cursor position and visibility
 * - Scrollback history
 * - Alternate screen buffer
 * - Dirty region tracking for efficient rendering
 *
 * Performance: Optimized for frequent updates with minimal allocations
 */

const Cell = require('./Cell');
const CircularBuffer = require('./CircularBuffer');

class TerminalBuffer {
    /**
     * Create a terminal buffer
     * @param {number} cols - Number of columns
     * @param {number} rows - Number of rows
     * @param {number} scrollbackSize - Size of scrollback buffer (default: 1000)
     */
    constructor(cols, rows, scrollbackSize = 1000) {
        this.cols = cols;
        this.rows = rows;
        this.scrollbackSize = scrollbackSize;

        // Primary screen buffer (2D array of Cells)
        this.buffer = this._createBuffer(cols, rows);

        // Alternate screen buffer (for apps like vim, less)
        this.altBuffer = null;
        this.usingAltScreen = false;

        // Scrollback history
        this.scrollback = new CircularBuffer(scrollbackSize);

        // Cursor state
        this.cursorX = 0;
        this.cursorY = 0;
        this.cursorVisible = true;
        this.cursorBlink = true;

        // Dirty tracking for optimized rendering
        this.dirtyLines = new Set(); // Set of dirty line numbers
        this.fullyDirty = true; // Mark entire screen dirty initially
    }

    /**
     * Create a buffer (2D array of cells)
     * @private
     */
    _createBuffer(cols, rows) {
        const buffer = new Array(rows);
        for (let y = 0; y < rows; y++) {
            buffer[y] = new Array(cols);
            for (let x = 0; x < cols; x++) {
                buffer[y][x] = new Cell();
            }
        }
        return buffer;
    }

    /**
     * Get active buffer (main or alternate)
     * @private
     */
    _getActiveBuffer() {
        return this.usingAltScreen && this.altBuffer ? this.altBuffer : this.buffer;
    }

    /**
     * Get cell at position
     * @param {number} x - Column
     * @param {number} y - Row
     * @returns {Cell|undefined} Cell at position, or undefined if out of bounds
     */
    getCell(x, y) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return undefined;
        }
        const buffer = this._getActiveBuffer();
        return buffer[y][x];
    }

    /**
     * Set cell at position
     * @param {number} x - Column
     * @param {number} y - Row
     * @param {Cell} cell - Cell to set
     */
    setCell(x, y, cell) {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return;
        }
        const buffer = this._getActiveBuffer();
        buffer[y][x].copyFrom(cell);
        this._markLineDirty(y);
    }

    /**
     * Mark a line as dirty
     * @private
     */
    _markLineDirty(y) {
        this.dirtyLines.add(y);
    }

    /**
     * Set cursor position
     * @param {number} x - Column (clamped to bounds)
     * @param {number} y - Row (clamped to bounds)
     */
    setCursor(x, y) {
        this.cursorX = Math.max(0, Math.min(x, this.cols - 1));
        this.cursorY = Math.max(0, Math.min(y, this.rows - 1));
    }

    /**
     * Move cursor relatively
     * @param {number} dx - Columns to move
     * @param {number} dy - Rows to move
     */
    moveCursor(dx, dy) {
        this.setCursor(this.cursorX + dx, this.cursorY + dy);
    }

    /**
     * Set cursor visibility
     * @param {boolean} visible - Cursor visibility
     */
    setCursorVisible(visible) {
        this.cursorVisible = visible;
    }

    /**
     * Clear entire line
     * @param {number} y - Line number
     */
    clearLine(y) {
        if (y < 0 || y >= this.rows) return;
        const buffer = this._getActiveBuffer();
        for (let x = 0; x < this.cols; x++) {
            buffer[y][x].reset();
        }
        this._markLineDirty(y);
    }

    /**
     * Clear from cursor to end of line
     */
    clearLineFromCursor() {
        const buffer = this._getActiveBuffer();
        const y = this.cursorY;
        for (let x = this.cursorX; x < this.cols; x++) {
            buffer[y][x].reset();
        }
        this._markLineDirty(y);
    }

    /**
     * Clear from start of line to cursor (inclusive)
     */
    clearLineToCursor() {
        const buffer = this._getActiveBuffer();
        const y = this.cursorY;
        for (let x = 0; x <= this.cursorX && x < this.cols; x++) {
            buffer[y][x].reset();
        }
        this._markLineDirty(y);
    }

    /**
     * Clear entire screen
     */
    clearScreen() {
        const buffer = this._getActiveBuffer();
        for (let y = 0; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                buffer[y][x].reset();
            }
            this._markLineDirty(y);
        }
    }

    /**
     * Clear from cursor to end of screen
     */
    clearFromCursor() {
        // Clear rest of current line
        this.clearLineFromCursor();

        // Clear all lines below cursor
        for (let y = this.cursorY + 1; y < this.rows; y++) {
            this.clearLine(y);
        }
    }

    /**
     * Clear from start of screen to cursor
     */
    clearToCursor() {
        // Clear all lines above cursor
        for (let y = 0; y < this.cursorY; y++) {
            this.clearLine(y);
        }

        // Clear up to cursor on current line
        this.clearLineToCursor();
    }

    /**
     * Scroll up by N lines (lines move up, new lines at bottom)
     * @param {number} lines - Number of lines to scroll (default: 1)
     */
    scrollUp(lines = 1) {
        const buffer = this._getActiveBuffer();

        for (let i = 0; i < lines; i++) {
            // Push top line to scrollback (only for main screen, not alternate)
            if (!this.usingAltScreen) {
                this.scrollback.push(buffer[0]);
            }

            // Shift all lines up
            for (let y = 0; y < this.rows - 1; y++) {
                buffer[y] = buffer[y + 1];
            }

            // Create new blank line at bottom
            buffer[this.rows - 1] = new Array(this.cols);
            for (let x = 0; x < this.cols; x++) {
                buffer[this.rows - 1][x] = new Cell();
            }
        }

        // Mark all lines dirty
        this.fullyDirty = true;
    }

    /**
     * Scroll down by N lines (lines move down, new lines at top)
     * @param {number} lines - Number of lines to scroll (default: 1)
     */
    scrollDown(lines = 1) {
        const buffer = this._getActiveBuffer();

        for (let i = 0; i < lines; i++) {
            // Shift all lines down
            for (let y = this.rows - 1; y > 0; y--) {
                buffer[y] = buffer[y - 1];
            }

            // Create new blank line at top
            buffer[0] = new Array(this.cols);
            for (let x = 0; x < this.cols; x++) {
                buffer[0][x] = new Cell();
            }
        }

        // Mark all lines dirty
        this.fullyDirty = true;
    }

    /**
     * Get scrollback buffer
     * @returns {CircularBuffer} Scrollback buffer
     */
    getScrollback() {
        return this.scrollback;
    }

    /**
     * Switch to alternate screen buffer
     */
    useAlternateScreen() {
        if (this.usingAltScreen) return;

        // Create alternate buffer if it doesn't exist
        if (!this.altBuffer) {
            this.altBuffer = this._createBuffer(this.cols, this.rows);
        }

        this.usingAltScreen = true;
        this.fullyDirty = true;
    }

    /**
     * Switch back to normal screen buffer
     */
    useNormalScreen() {
        if (!this.usingAltScreen) return;

        this.usingAltScreen = false;
        this.fullyDirty = true;
    }

    /**
     * Get dirty regions for optimized rendering
     * @returns {Array} Array of dirty regions {x, y, width, height}
     */
    getDirtyRegions() {
        if (this.fullyDirty) {
            return [{
                x: 0,
                y: 0,
                width: this.cols,
                height: this.rows
            }];
        }

        if (this.dirtyLines.size === 0) {
            return [];
        }

        // Convert dirty lines to regions
        const regions = [];
        const sortedLines = Array.from(this.dirtyLines).sort((a, b) => a - b);

        let regionStart = sortedLines[0];
        let regionEnd = sortedLines[0];

        for (let i = 1; i < sortedLines.length; i++) {
            const line = sortedLines[i];
            if (line === regionEnd + 1) {
                // Consecutive line, extend region
                regionEnd = line;
            } else {
                // Non-consecutive, create region and start new one
                regions.push({
                    x: 0,
                    y: regionStart,
                    width: this.cols,
                    height: regionEnd - regionStart + 1
                });
                regionStart = line;
                regionEnd = line;
            }
        }

        // Add last region
        regions.push({
            x: 0,
            y: regionStart,
            width: this.cols,
            height: regionEnd - regionStart + 1
        });

        return regions;
    }

    /**
     * Clear dirty tracking
     */
    clearDirty() {
        this.dirtyLines.clear();
        this.fullyDirty = false;
    }

    /**
     * Resize buffer
     * @param {number} newCols - New column count
     * @param {number} newRows - New row count
     */
    resize(newCols, newRows) {
        if (newCols === this.cols && newRows === this.rows) {
            return; // No change
        }

        // Create new buffer
        const newBuffer = this._createBuffer(newCols, newRows);
        const oldBuffer = this._getActiveBuffer();

        // Copy data from old buffer to new buffer
        const minRows = Math.min(this.rows, newRows);
        const minCols = Math.min(this.cols, newCols);

        for (let y = 0; y < minRows; y++) {
            for (let x = 0; x < minCols; x++) {
                newBuffer[y][x].copyFrom(oldBuffer[y][x]);
            }
        }

        // Update buffer reference
        if (this.usingAltScreen && this.altBuffer) {
            this.altBuffer = newBuffer;
        } else {
            this.buffer = newBuffer;
        }

        // Also resize alternate buffer if it exists
        if (this.altBuffer && !this.usingAltScreen) {
            this.altBuffer = this._createBuffer(newCols, newRows);
        }

        // Update dimensions
        this.cols = newCols;
        this.rows = newRows;

        // Clamp cursor to new bounds
        this.setCursor(this.cursorX, this.cursorY);

        // Mark entire screen dirty
        this.fullyDirty = true;
    }

    /**
     * Get debug information
     * @returns {Object} Debug info
     */
    getDebugInfo() {
        return {
            cols: this.cols,
            rows: this.rows,
            cursor: { x: this.cursorX, y: this.cursorY, visible: this.cursorVisible },
            usingAltScreen: this.usingAltScreen,
            scrollbackSize: this.scrollback.length,
            dirtyLines: this.dirtyLines.size,
            fullyDirty: this.fullyDirty
        };
    }
}

module.exports = TerminalBuffer;
