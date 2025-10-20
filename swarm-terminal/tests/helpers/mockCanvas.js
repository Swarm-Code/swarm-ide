/**
 * mockCanvas.js - Mock Canvas implementation for testing
 *
 * Provides minimal Canvas API implementation for unit tests.
 * Does not actually render - just tracks state and provides API.
 */

class MockCanvasRenderingContext2D {
    constructor() {
        this.fillStyle = '#000000';
        this.font = '10px monospace';
        this.textBaseline = 'alphabetic';
        this.textAlign = 'start';

        // Track operations
        this.operations = [];
    }

    clearRect(x, y, width, height) {
        this.operations.push({ type: 'clearRect', x, y, width, height });
    }

    fillText(text, x, y) {
        this.operations.push({ type: 'fillText', text, x, y });
    }

    fillRect(x, y, width, height) {
        this.operations.push({ type: 'fillRect', x, y, width, height });
    }

    measureText(text) {
        // Simple approximation: assume monospace with width proportional to font size
        const fontSize = parseInt(this.font) || 10;
        return {
            width: text.length * fontSize * 0.6,
            actualBoundingBoxAscent: fontSize * 0.8,
            actualBoundingBoxDescent: fontSize * 0.2
        };
    }

    save() {
        this.operations.push({ type: 'save' });
    }

    restore() {
        this.operations.push({ type: 'restore' });
    }
}

class MockCanvas {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this._ctx = new MockCanvasRenderingContext2D();
    }

    getContext(type) {
        if (type === '2d') {
            return this._ctx;
        }
        return null;
    }
}

/**
 * Create mock canvas
 */
function createMockCanvas(width, height) {
    return new MockCanvas(width, height);
}

module.exports = { createMockCanvas, MockCanvas, MockCanvasRenderingContext2D };
