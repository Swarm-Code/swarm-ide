/**
 * TerminalBuffer.test.js - Test suite for TerminalBuffer class
 *
 * TDD Approach: Write tests first, then implement
 *
 * Test Coverage:
 * - Buffer creation with cols/rows
 * - Cell access and modification
 * - Cursor management (position, visibility, movement)
 * - Line operations (clear, insert, delete)
 * - Scrolling (up, down, regions)
 * - Alternate screen buffer
 * - Dirty region tracking
 * - Resize handling
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const Cell = require('../src/core/Cell');
const { FLAGS } = Cell;
const TerminalBuffer = require('../src/core/TerminalBuffer');

describe('TerminalBuffer', () => {
    describe('Construction and Initialization', () => {
        it('should create buffer with specified dimensions', () => {
const buffer = new TerminalBuffer(80, 24);
expect(buffer.cols).toBe(80);
expect(buffer.rows).toBe(24);
            // expect(true).toBe(true);
        });

        it('should initialize with empty cells', () => {
const buffer = new TerminalBuffer(80, 24);
const cell = buffer.getCell(0, 0);
expect(cell.char).toBe(' ');
expect(cell.fg).toBe(0xD4D4D4);
expect(cell.bg).toBe(0x1E1E1E);
            // expect(true).toBe(true);
        });

        it('should initialize cursor at 0,0', () => {
const buffer = new TerminalBuffer(80, 24);
expect(buffer.cursorX).toBe(0);
expect(buffer.cursorY).toBe(0);
            // expect(true).toBe(true);
        });

        it('should create scrollback buffer', () => {
const buffer = new TerminalBuffer(80, 24, 1000);
expect(buffer.scrollbackSize).toBe(1000);
            // expect(true).toBe(true);
        });
    });

    describe('Cell Access', () => {
        it('should get cell at position', () => {
const buffer = new TerminalBuffer(80, 24);
const cell = buffer.getCell(5, 10);
expect(cell).toBeInstanceOf(Cell);
            // expect(true).toBe(true);
        });

        it('should set cell at position', () => {
const buffer = new TerminalBuffer(80, 24);
const cell = new Cell('A', 0xFF0000, 0x000000, FLAGS.BOLD);
buffer.setCell(5, 10, cell);
const retrieved = buffer.getCell(5, 10);
expect(retrieved.char).toBe('A');
expect(retrieved.fg).toBe(0xFF0000);
expect(retrieved.isBold()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should handle out of bounds access gracefully', () => {
const buffer = new TerminalBuffer(80, 24);
expect(buffer.getCell(-1, 0)).toBeUndefined();
expect(buffer.getCell(0, -1)).toBeUndefined();
expect(buffer.getCell(100, 0)).toBeUndefined();
expect(buffer.getCell(0, 100)).toBeUndefined();
            // expect(true).toBe(true);
        });
    });

    describe('Cursor Management', () => {
        it('should set cursor position', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCursor(10, 5);
expect(buffer.cursorX).toBe(10);
expect(buffer.cursorY).toBe(5);
            // expect(true).toBe(true);
        });

        it('should clamp cursor to bounds', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCursor(-5, -5);
expect(buffer.cursorX).toBe(0);
expect(buffer.cursorY).toBe(0);
buffer.setCursor(100, 100);
expect(buffer.cursorX).toBe(79);
expect(buffer.cursorY).toBe(23);
            // expect(true).toBe(true);
        });

        it('should move cursor relatively', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCursor(10, 10);
buffer.moveCursor(5, 3);
expect(buffer.cursorX).toBe(15);
expect(buffer.cursorY).toBe(13);
            // expect(true).toBe(true);
        });

        it('should handle cursor visibility', () => {
const buffer = new TerminalBuffer(80, 24);
expect(buffer.cursorVisible).toBe(true);
buffer.setCursorVisible(false);
expect(buffer.cursorVisible).toBe(false);
            // expect(true).toBe(true);
        });
    });

    describe('Line Operations', () => {
        it('should clear entire line', () => {
const buffer = new TerminalBuffer(80, 24);
// Fill line with data
for (let x = 0; x < 80; x++) {
    buffer.setCell(x, 5, new Cell('X'));
}
// Clear line
buffer.clearLine(5);
// Check all cells are empty
for (let x = 0; x < 80; x++) {
    expect(buffer.getCell(x, 5).char).toBe(' ');
}
            // expect(true).toBe(true);
        });

        it('should clear from cursor to end of line', () => {
const buffer = new TerminalBuffer(80, 24);
for (let x = 0; x < 80; x++) {
    buffer.setCell(x, 5, new Cell('X'));
}
buffer.setCursor(40, 5);
buffer.clearLineFromCursor();
// Before cursor should still have X
expect(buffer.getCell(39, 5).char).toBe('X');
// At and after cursor should be cleared
expect(buffer.getCell(40, 5).char).toBe(' ');
expect(buffer.getCell(79, 5).char).toBe(' ');
            // expect(true).toBe(true);
        });

        it('should clear from start of line to cursor', () => {
const buffer = new TerminalBuffer(80, 24);
for (let x = 0; x < 80; x++) {
    buffer.setCell(x, 5, new Cell('X'));
}
buffer.setCursor(40, 5);
buffer.clearLineToCursor();
// Up to and including cursor should be cleared
expect(buffer.getCell(0, 5).char).toBe(' ');
expect(buffer.getCell(40, 5).char).toBe(' ');
// After cursor should still have X
expect(buffer.getCell(41, 5).char).toBe('X');
            // expect(true).toBe(true);
        });
    });

    describe('Screen Operations', () => {
        it('should clear entire screen', () => {
const buffer = new TerminalBuffer(80, 24);
// Fill with data
for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
        buffer.setCell(x, y, new Cell('X'));
    }
}
buffer.clearScreen();
// Check all cells are empty
for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
        expect(buffer.getCell(x, y).char).toBe(' ');
    }
}
            // expect(true).toBe(true);
        });

        it('should clear from cursor to end of screen', () => {
const buffer = new TerminalBuffer(80, 24);
for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 80; x++) {
        buffer.setCell(x, y, new Cell('X'));
    }
}
buffer.setCursor(40, 10);
buffer.clearFromCursor();
// Before cursor should have X
expect(buffer.getCell(39, 10).char).toBe('X');
expect(buffer.getCell(0, 9).char).toBe('X');
// At cursor and after should be cleared
expect(buffer.getCell(40, 10).char).toBe(' ');
expect(buffer.getCell(0, 11).char).toBe(' ');
            // expect(true).toBe(true);
        });
    });

    describe('Scrolling', () => {
        it('should scroll up by one line', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('A'));
buffer.setCell(0, 1, new Cell('B'));
buffer.setCell(0, 23, new Cell('Z'));
buffer.scrollUp(1);
// First line should move to scrollback
// Second line should become first
expect(buffer.getCell(0, 0).char).toBe('B');
// Last line should be empty
expect(buffer.getCell(0, 23).char).toBe(' ');
            // expect(true).toBe(true);
        });

        it('should scroll down by one line', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('A'));
buffer.setCell(0, 23, new Cell('Z'));
buffer.scrollDown(1);
// First line should be empty (new line inserted)
expect(buffer.getCell(0, 0).char).toBe(' ');
// Original first line should be second
expect(buffer.getCell(0, 1).char).toBe('A');
// Last line should fall off
            // expect(true).toBe(true);
        });

        it('should scroll multiple lines', () => {
const buffer = new TerminalBuffer(80, 24);
for (let y = 0; y < 24; y++) {
    buffer.setCell(0, y, new Cell(String(y)));
}
buffer.scrollUp(5);
// Line 5 should now be at top
expect(buffer.getCell(0, 0).char).toBe('5');
            // expect(true).toBe(true);
        });
    });

    describe('Scrollback', () => {
        it('should push lines to scrollback when scrolling up', () => {
const buffer = new TerminalBuffer(80, 24, 100);
buffer.setCell(0, 0, new Cell('Line 0'));
buffer.scrollUp(1);
const scrollback = buffer.getScrollback();
expect(scrollback.length).toBe(1);
            // expect(true).toBe(true);
        });

        it('should retrieve lines from scrollback', () => {
const buffer = new TerminalBuffer(80, 24, 100);
buffer.setCell(0, 0, new Cell('A'));
buffer.scrollUp(1);
const scrollback = buffer.getScrollback();
const firstLine = scrollback.get(0);
expect(firstLine[0].char).toBe('A');
            // expect(true).toBe(true);
        });
    });

    describe('Alternate Screen', () => {
        it('should switch to alternate screen', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('M'));
buffer.useAlternateScreen();
// Alternate screen should be empty
expect(buffer.getCell(0, 0).char).toBe(' ');
            // expect(true).toBe(true);
        });

        it('should switch back to normal screen', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('M'));
buffer.useAlternateScreen();
buffer.setCell(0, 0, new Cell('A'));
buffer.useNormalScreen();
// Should restore main screen
expect(buffer.getCell(0, 0).char).toBe('M');
            // expect(true).toBe(true);
        });

        it('should preserve both screens independently', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('M'));
buffer.useAlternateScreen();
buffer.setCell(0, 0, new Cell('A'));
expect(buffer.getCell(0, 0).char).toBe('A');
buffer.useNormalScreen();
expect(buffer.getCell(0, 0).char).toBe('M');
buffer.useAlternateScreen();
expect(buffer.getCell(0, 0).char).toBe('A');
            // expect(true).toBe(true);
        });
    });

    describe('Dirty Tracking', () => {
        it('should mark cell as dirty when modified', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.clearDirty();
buffer.setCell(10, 5, new Cell('X'));
const dirty = buffer.getDirtyRegions();
expect(dirty.length).toBeGreaterThan(0);
            // expect(true).toBe(true);
        });

        it('should clear dirty regions', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(10, 5, new Cell('X'));
buffer.clearDirty();
const dirty = buffer.getDirtyRegions();
expect(dirty.length).toBe(0);
            // expect(true).toBe(true);
        });

        it('should coalesce adjacent dirty regions', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.clearDirty();
// Write adjacent cells
for (let x = 0; x < 10; x++) {
    buffer.setCell(x, 5, new Cell('X'));
}
const dirty = buffer.getDirtyRegions();
// Should be one region, not 10
expect(dirty.length).toBe(1);
expect(dirty[0].x).toBe(0);
expect(dirty[0].width).toBe(80); // Line-level dirty tracking
            // expect(true).toBe(true);
        });
    });

    describe('Resize', () => {
        it('should resize to larger dimensions', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('A'));
buffer.resize(100, 30);
expect(buffer.cols).toBe(100);
expect(buffer.rows).toBe(30);
// Original data should be preserved
expect(buffer.getCell(0, 0).char).toBe('A');
            // expect(true).toBe(true);
        });

        it('should resize to smaller dimensions', () => {
const buffer = new TerminalBuffer(80, 24);
buffer.setCell(0, 0, new Cell('A'));
buffer.setCell(79, 23, new Cell('Z'));
buffer.resize(40, 12);
expect(buffer.cols).toBe(40);
expect(buffer.rows).toBe(12);
// Data within new bounds should be preserved
expect(buffer.getCell(0, 0).char).toBe('A');
            // expect(true).toBe(true);
        });

        it('should reflow text on resize', () => {
const buffer = new TerminalBuffer(10, 5);
// Write long line
const text = 'Hello World Test';
for (let i = 0; i < text.length && i < 10; i++) {
    buffer.setCell(i, 0, new Cell(text[i]));
}
// Resize to wider
buffer.resize(20, 5);
// Text should remain on same line
let result = '';
for (let x = 0; x < 16; x++) {
    result += buffer.getCell(x, 0).char;
}
expect(result.trim()).toBe('Hello Worl'); // Only 10 chars fit initially
            // expect(true).toBe(true);
        });
    });

    describe('Performance', () => {
        it('should handle large buffers efficiently', () => {
const start = performance.now();
const buffer = new TerminalBuffer(200, 100);
const end = performance.now();
expect(end - start).toBeLessThan(50); // < 50ms to create large buffer
            // expect(true).toBe(true);
        });

        it('should perform fast cell updates', () => {
const buffer = new TerminalBuffer(80, 24);
const start = performance.now();
for (let i = 0; i < 10000; i++) {
    const x = i % 80;
    const y = Math.floor(i / 80) % 24;
    buffer.setCell(x, y, new Cell('X'));
}
const end = performance.now();
expect(end - start).toBeLessThan(100); // 10k updates in < 100ms
            // expect(true).toBe(true);
        });
    });
});
