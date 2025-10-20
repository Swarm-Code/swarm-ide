/**
 * ANSIParser.test.js - Test suite for ANSIParser class
 *
 * TDD Approach: Write tests first, then implement
 *
 * Test Coverage:
 * - State machine transitions
 * - Plain text output
 * - SGR (color/style) sequences
 * - Cursor movement sequences
 * - Erase sequences
 * - Screen mode sequences
 * - Invalid/malformed sequences
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const TerminalBuffer = require('../src/core/TerminalBuffer');
const Cell = require('../src/core/Cell');
const { FLAGS } = Cell;
const ANSIParser = require('../src/parser/ANSIParser');

describe('ANSIParser', () => {
    let buffer;
    let parser;

    beforeEach(() => {
        buffer = new TerminalBuffer(80, 24);
        parser = new ANSIParser(buffer);
    });

    describe('Basic Text Output', () => {
        it('should output plain text to buffer', () => {
            parser.parse('Hello');
            expect(buffer.getCell(0, 0).char).toBe('H');
            expect(buffer.getCell(1, 0).char).toBe('e');
            expect(buffer.getCell(2, 0).char).toBe('l');
            expect(buffer.getCell(3, 0).char).toBe('l');
            expect(buffer.getCell(4, 0).char).toBe('o');
            // expect(true).toBe(true);
        });

        it('should advance cursor after each character', () => {
            parser.parse('ABC');
            expect(buffer.cursorX).toBe(3);
            expect(buffer.cursorY).toBe(0);
            // expect(true).toBe(true);
        });

        it('should handle newline (LF)', () => {
            parser.parse('Line1\nLine2');
            expect(buffer.getCell(0, 0).char).toBe('L');
            expect(buffer.getCell(0, 1).char).toBe('L');
            expect(buffer.cursorY).toBe(1);
            // expect(true).toBe(true);
        });

        it('should handle carriage return (CR)', () => {
            parser.parse('ABC\rX');
            expect(buffer.getCell(0, 0).char).toBe('X');
            expect(buffer.cursorX).toBe(1);
            // expect(true).toBe(true);
        });

        it('should handle backspace', () => {
            parser.parse('ABC\bX');
            expect(buffer.getCell(0, 0).char).toBe('A');
            expect(buffer.getCell(1, 0).char).toBe('B');
            expect(buffer.getCell(2, 0).char).toBe('X');
            // expect(true).toBe(true);
        });

        it('should handle tab', () => {
            parser.parse('A\tB');
            // Tab stops at multiples of 8
            expect(buffer.getCell(0, 0).char).toBe('A');
            expect(buffer.getCell(8, 0).char).toBe('B');
            // expect(true).toBe(true);
        });
    });

    describe('SGR - Select Graphic Rendition', () => {
        it('should parse reset sequence ESC[0m', () => {
            parser.parse('\x1b[1mBold\x1b[0mNormal');
            const boldCell = buffer.getCell(0, 0);
            expect(boldCell.isBold()).toBe(true);
            const normalCell = buffer.getCell(4, 0);
            expect(normalCell.isBold()).toBe(false);
            // expect(true).toBe(true);
        });

        it('should parse bold ESC[1m', () => {
            parser.parse('\x1b[1mBold');
            expect(buffer.getCell(0, 0).isBold()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should parse dim ESC[2m', () => {
            parser.parse('\x1b[2mDim');
            expect(buffer.getCell(0, 0).isDim()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should parse italic ESC[3m', () => {
            parser.parse('\x1b[3mItalic');
            expect(buffer.getCell(0, 0).isItalic()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should parse underline ESC[4m', () => {
            parser.parse('\x1b[4mUnderline');
            expect(buffer.getCell(0, 0).isUnderline()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should parse 8-color foreground ESC[31m (red)', () => {
            parser.parse('\x1b[31mRed');
            const cell = buffer.getCell(0, 0);
            expect(cell.fg).toBe(0xCD3131); // Red from theme
            // expect(true).toBe(true);
        });

        it('should parse 8-color background ESC[41m (red bg)', () => {
            parser.parse('\x1b[41mRedBG');
            const cell = buffer.getCell(0, 0);
            expect(cell.bg).toBe(0xCD3131);
            // expect(true).toBe(true);
        });

        it('should parse 256-color foreground ESC[38;5;196m', () => {
            parser.parse('\x1b[38;5;196mRed256');
            const cell = buffer.getCell(0, 0);
            expect(cell.fg).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should parse RGB foreground ESC[38;2;255;0;0m', () => {
            parser.parse('\x1b[38;2;255;0;0mRedRGB');
            const cell = buffer.getCell(0, 0);
            expect(cell.fg).toBe(0xFF0000);
            // expect(true).toBe(true);
        });

        it('should parse RGB background ESC[48;2;0;255;0m', () => {
            parser.parse('\x1b[48;2;0;255;0mGreenBG');
            const cell = buffer.getCell(0, 0);
            expect(cell.bg).toBe(0x00FF00);
            // expect(true).toBe(true);
        });

        it('should handle multiple SGR parameters ESC[1;31m', () => {
            parser.parse('\x1b[1;31mBoldRed');
            const cell = buffer.getCell(0, 0);
            expect(cell.isBold()).toBe(true);
            expect(cell.fg).toBe(0xCD3131);
            // expect(true).toBe(true);
        });
    });

    describe('Cursor Movement', () => {
        it('should parse CUP - Cursor Position ESC[5;10H', () => {
            parser.parse('\x1b[5;10H');
            expect(buffer.cursorX).toBe(9);  // 0-indexed
            expect(buffer.cursorY).toBe(4);
            // expect(true).toBe(true);
        });

        it('should parse CUU - Cursor Up ESC[3A', () => {
            buffer.setCursor(10, 10);
            parser.parse('\x1b[3A');
            expect(buffer.cursorY).toBe(7);
            // expect(true).toBe(true);
        });

        it('should parse CUD - Cursor Down ESC[2B', () => {
            buffer.setCursor(10, 10);
            parser.parse('\x1b[2B');
            expect(buffer.cursorY).toBe(12);
            // expect(true).toBe(true);
        });

        it('should parse CUF - Cursor Forward ESC[5C', () => {
            buffer.setCursor(10, 10);
            parser.parse('\x1b[5C');
            expect(buffer.cursorX).toBe(15);
            // expect(true).toBe(true);
        });

        it('should parse CUB - Cursor Back ESC[3D', () => {
            buffer.setCursor(10, 10);
            parser.parse('\x1b[3D');
            expect(buffer.cursorX).toBe(7);
            // expect(true).toBe(true);
        });

        it('should default to 1 if parameter missing', () => {
            buffer.setCursor(10, 10);
            parser.parse('\x1b[A'); // No parameter = move 1
            expect(buffer.cursorY).toBe(9);
            // expect(true).toBe(true);
        });
    });

    describe('Erase Sequences', () => {
        it('should parse ED - Erase Below ESC[0J', () => {
            // Fill buffer
            for (let y = 0; y < 24; y++) {
                for (let x = 0; x < 80; x++) {
                    buffer.setCell(x, y, new Cell('X'));
                }
            }
            buffer.setCursor(40, 10);
            parser.parse('\x1b[0J'); // Clear from cursor to end
            expect(buffer.getCell(39, 10).char).toBe('X'); // Before cursor
            expect(buffer.getCell(40, 10).char).toBe(' '); // At cursor
            expect(buffer.getCell(0, 11).char).toBe(' '); // Below
            // expect(true).toBe(true);
        });

        it('should parse ED - Erase Above ESC[1J', () => {
            // Fill buffer
            for (let y = 0; y < 24; y++) {
                for (let x = 0; x < 80; x++) {
                    buffer.setCell(x, y, new Cell('X'));
                }
            }
            buffer.setCursor(40, 10);
            parser.parse('\x1b[1J'); // Clear from start to cursor
            expect(buffer.getCell(0, 9).char).toBe(' '); // Above
            expect(buffer.getCell(40, 10).char).toBe(' '); // At cursor
            expect(buffer.getCell(41, 10).char).toBe('X'); // After cursor
            // expect(true).toBe(true);
        });

        it('should parse ED - Erase All ESC[2J', () => {
            // Fill buffer
            for (let y = 0; y < 24; y++) {
                buffer.setCell(0, y, new Cell('X'));
            }
            parser.parse('\x1b[2J');
            // Check all cells are empty
            for (let y = 0; y < 24; y++) {
                expect(buffer.getCell(0, y).char).toBe(' ');
            }
            // expect(true).toBe(true);
        });

        it('should parse EL - Erase to End of Line ESC[0K', () => {
            for (let x = 0; x < 80; x++) {
                buffer.setCell(x, 5, new Cell('X'));
            }
            buffer.setCursor(40, 5);
            parser.parse('\x1b[0K');
            expect(buffer.getCell(39, 5).char).toBe('X');
            expect(buffer.getCell(40, 5).char).toBe(' ');
            expect(buffer.getCell(79, 5).char).toBe(' ');
            // expect(true).toBe(true);
        });

        it('should parse EL - Erase to Start of Line ESC[1K', () => {
            for (let x = 0; x < 80; x++) {
                buffer.setCell(x, 5, new Cell('X'));
            }
            buffer.setCursor(40, 5);
            parser.parse('\x1b[1K');
            expect(buffer.getCell(0, 5).char).toBe(' ');
            expect(buffer.getCell(40, 5).char).toBe(' ');
            expect(buffer.getCell(41, 5).char).toBe('X');
            // expect(true).toBe(true);
        });

        it('should parse EL - Erase Entire Line ESC[2K', () => {
            for (let x = 0; x < 80; x++) {
                buffer.setCell(x, 5, new Cell('X'));
            }
            buffer.setCursor(40, 5);
            parser.parse('\x1b[2K');
            for (let x = 0; x < 80; x++) {
                expect(buffer.getCell(x, 5).char).toBe(' ');
            }
            // expect(true).toBe(true);
        });
    });

    describe('Screen Modes', () => {
        it('should parse alternate screen buffer ESC[?1049h', () => {
            buffer.setCell(0, 0, new Cell('M'));
            parser.parse('\x1b[?1049h'); // Switch to alt screen
            expect(buffer.usingAltScreen).toBe(true);
            expect(buffer.getCell(0, 0).char).toBe(' '); // Alt screen is empty
            // expect(true).toBe(true);
        });

        it('should parse normal screen buffer ESC[?1049l', () => {
            buffer.setCell(0, 0, new Cell('M'));
            parser.parse('\x1b[?1049h'); // Alt
            buffer.setCell(0, 0, new Cell('A'));
            parser.parse('\x1b[?1049l'); // Back to normal
            expect(buffer.usingAltScreen).toBe(false);
            expect(buffer.getCell(0, 0).char).toBe('M'); // Original data restored
            // expect(true).toBe(true);
        });

        it('should parse hide cursor ESC[?25l', () => {
            parser.parse('\x1b[?25l');
            expect(buffer.cursorVisible).toBe(false);
            // expect(true).toBe(true);
        });

        it('should parse show cursor ESC[?25h', () => {
            buffer.setCursorVisible(false);
            parser.parse('\x1b[?25h');
            expect(buffer.cursorVisible).toBe(true);
            // expect(true).toBe(true);
        });
    });

    describe('Invalid Sequences', () => {
        it('should ignore unknown CSI sequences', () => {
            const before = buffer.cursorX;
            parser.parse('\x1b[999Z'); // Invalid sequence
            // Should not crash, just ignore
            expect(buffer.cursorX).toBe(before);
            // expect(true).toBe(true);
        });

        it('should handle incomplete sequences', () => {
            parser.parse('\x1b['); // Incomplete
            parser.parse('31m'); // Complete it
            parser.parse('Red');
            expect(buffer.getCell(0, 0).fg).toBe(0xCD3131);
            // expect(true).toBe(true);
        });

        it('should handle malformed parameters', () => {
            parser.parse('\x1b[;;;;;31m'); // Lots of empty params
            parser.parse('Red');
            expect(buffer.getCell(0, 0).fg).toBe(0xCD3131);
            // expect(true).toBe(true);
        });
    });

    describe('Complex Sequences', () => {
        it('should handle mixed text and sequences', () => {
            parser.parse('Normal \x1b[1mBold\x1b[0m Normal');
            expect(buffer.getCell(0, 0).isBold()).toBe(false);
            expect(buffer.getCell(7, 0).isBold()).toBe(true);
            expect(buffer.getCell(11, 0).isBold()).toBe(false);
            // expect(true).toBe(true);
        });

        it('should handle rapid sequence changes', () => {
            parser.parse('\x1b[31m\x1b[1m\x1b[4mText');
            const cell = buffer.getCell(0, 0);
            expect(cell.fg).toBe(0xCD3131);
            expect(cell.isBold()).toBe(true);
            expect(cell.isUnderline()).toBe(true);
            // expect(true).toBe(true);
        });
    });

    describe('Performance', () => {
        it('should parse 10,000 plain characters quickly', () => {
            const data = 'A'.repeat(10000);
            const start = performance.now();
            parser.parse(data);
            const end = performance.now();
            expect(end - start).toBeLessThan(50); // < 50ms for 10k chars
            // expect(true).toBe(true);
        });

        it('should parse 1,000 escape sequences quickly', () => {
            let data = '';
            for (let i = 0; i < 1000; i++) {
                data += '\x1b[31mR\x1b[0m';
            }
            const start = performance.now();
            parser.parse(data);
            const end = performance.now();
            expect(end - start).toBeLessThan(100); // < 100ms for 1k sequences
            // expect(true).toBe(true);
        });
    });
});
