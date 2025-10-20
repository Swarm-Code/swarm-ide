/**
 * ANSIParser.js - ANSI/VT escape sequence parser
 *
 * Implements Paul Williams' VT100 state machine parser
 * Reference: https://vt100.net/emu/dec_ansi_parser
 *
 * State Machine:
 * - GROUND: Normal text processing
 * - ESCAPE: After ESC (0x1B)
 * - CSI_ENTRY: After ESC[
 * - CSI_PARAM: Reading parameters
 * - CSI_INTERMEDIATE: After params, before final
 * - OSC_STRING: Operating System Command
 *
 * Performance target: > 50 MB/s throughput
 */

const Cell = require('../core/Cell');

// Control characters
const C0 = {
    NUL: 0x00,
    BEL: 0x07,
    BS:  0x08,  // Backspace
    HT:  0x09,  // Tab
    LF:  0x0A,  // Line Feed
    VT:  0x0B,  // Vertical Tab
    FF:  0x0C,  // Form Feed
    CR:  0x0D,  // Carriage Return
    ESC: 0x1B   // Escape
};

// Parser states
const State = {
    GROUND: 0,
    ESCAPE: 1,
    ESCAPE_INTERMEDIATE: 2,
    CSI_ENTRY: 3,
    CSI_PARAM: 4,
    CSI_INTERMEDIATE: 5,
    CSI_IGNORE: 6,
    DCS_ENTRY: 7,
    DCS_PARAM: 8,
    DCS_IGNORE: 9,
    DCS_PASSTHROUGH: 10,
    OSC_STRING: 11
};

// Default color palette (VSCode dark theme colors)
const COLOR_PALETTE = {
    // 8 normal colors (30-37)
    0: 0x000000,  // Black
    1: 0xCD3131,  // Red
    2: 0x0DBC79,  // Green
    3: 0xE5E510,  // Yellow
    4: 0x2472C8,  // Blue
    5: 0xBC3FBC,  // Magenta
    6: 0x11A8CD,  // Cyan
    7: 0xE5E5E5,  // White
    // 8 bright colors (90-97)
    8: 0x666666,   // Bright Black (Gray)
    9: 0xF14C4C,   // Bright Red
    10: 0x23D18B,  // Bright Green
    11: 0xF5F543,  // Bright Yellow
    12: 0x3B8EEA,  // Bright Blue
    13: 0xD670D6,  // Bright Magenta
    14: 0x29B8DB,  // Bright Cyan
    15: 0xFFFFFF   // Bright White
};

class ANSIParser {
    constructor(buffer) {
        this.buffer = buffer;
        this.state = State.GROUND;

        // CSI parameter collection
        this.params = [];
        this.currentParam = '';
        this.intermediates = '';

        // Current text attributes (SGR state)
        this.currentAttr = new Cell();

        // Tab stops (every 8 columns by default)
        this.tabStops = new Set();
        for (let i = 8; i < 256; i += 8) {
            this.tabStops.add(i);
        }
    }

    /**
     * Parse input data
     * @param {string|Uint8Array} data - Input data
     */
    parse(data) {
        // Convert to string if needed
        const str = typeof data === 'string' ? data : String.fromCharCode(...data);

        for (let i = 0; i < str.length; i++) {
            const char = str[i];
            const code = char.charCodeAt(0);
            this.processByte(code, char);
        }
    }

    /**
     * Process a single byte through the state machine
     * @param {number} code - Character code
     * @param {string} char - Character
     */
    processByte(code, char) {
        switch (this.state) {
            case State.GROUND:
                this.ground(code, char);
                break;
            case State.ESCAPE:
                this.escape(code, char);
                break;
            case State.CSI_ENTRY:
                this.csiEntry(code, char);
                break;
            case State.CSI_PARAM:
                this.csiParam(code, char);
                break;
            case State.CSI_INTERMEDIATE:
                this.csiIntermediate(code, char);
                break;
            case State.OSC_STRING:
                this.oscString(code, char);
                break;
            default:
                this.state = State.GROUND;
        }
    }

    /**
     * GROUND state - normal text processing
     */
    ground(code, char) {
        // C0 control characters
        if (code < 0x20) {
            switch (code) {
                case C0.LF:
                case C0.VT:
                case C0.FF:
                    // Line feed - move to next line (Unix: implies CR+LF)
                    this.buffer.setCursor(0, this.buffer.cursorY + 1);
                    if (this.buffer.cursorY >= this.buffer.rows) {
                        this.buffer.scrollUp(1);
                        this.buffer.setCursor(0, this.buffer.rows - 1);
                    }
                    break;
                case C0.CR:
                    // Carriage return - move to start of line
                    this.buffer.setCursor(0, this.buffer.cursorY);
                    break;
                case C0.BS:
                    // Backspace - move back one column
                    if (this.buffer.cursorX > 0) {
                        this.buffer.moveCursor(-1, 0);
                    }
                    break;
                case C0.HT:
                    // Tab - move to next tab stop
                    this.tab();
                    break;
                case C0.ESC:
                    // Escape - enter ESCAPE state
                    this.state = State.ESCAPE;
                    break;
                case C0.BEL:
                    // Bell - ignore for now
                    break;
            }
            return;
        }

        // Printable character - output to buffer
        this.print(char);
    }

    /**
     * ESCAPE state - after ESC
     */
    escape(code, char) {
        switch (char) {
            case '[':
                // CSI - Control Sequence Introducer
                this.state = State.CSI_ENTRY;
                this.params = [];
                this.currentParam = '';
                this.intermediates = '';
                break;
            case ']':
                // OSC - Operating System Command
                this.state = State.OSC_STRING;
                this.currentParam = '';
                break;
            case 'D':
                // IND - Index (scroll up)
                this.buffer.scrollUp(1);
                this.state = State.GROUND;
                break;
            case 'M':
                // RI - Reverse Index (scroll down)
                this.buffer.scrollDown(1);
                this.state = State.GROUND;
                break;
            default:
                // Unknown escape sequence - return to GROUND
                this.state = State.GROUND;
        }
    }

    /**
     * CSI_ENTRY state - just entered CSI
     */
    csiEntry(code, char) {
        if (char >= '0' && char <= '9') {
            // Start of parameter
            this.currentParam = char;
            this.state = State.CSI_PARAM;
        } else if (char === '?') {
            // Private parameter
            this.intermediates = '?';
            this.state = State.CSI_PARAM;
        } else if (char >= '@' && char <= '~') {
            // Final byte - execute with no parameters
            this.csiDispatch(char, []);
            this.state = State.GROUND;
        } else {
            // Intermediate or ignore
            this.state = State.CSI_PARAM;
        }
    }

    /**
     * CSI_PARAM state - collecting parameters
     */
    csiParam(code, char) {
        if (char >= '0' && char <= '9') {
            // Continue parameter
            this.currentParam += char;
        } else if (char === ';') {
            // Parameter separator
            this.params.push(this.currentParam ? parseInt(this.currentParam, 10) : 0);
            this.currentParam = '';
        } else if (char >= '@' && char <= '~') {
            // Final byte - execute
            if (this.currentParam !== '') {
                this.params.push(parseInt(this.currentParam, 10));
            }
            this.csiDispatch(char, this.params);
            this.state = State.GROUND;
        } else {
            // Unknown - ignore
            this.state = State.GROUND;
        }
    }

    /**
     * CSI_INTERMEDIATE state
     */
    csiIntermediate(code, char) {
        if (char >= '@' && char <= '~') {
            this.csiDispatch(char, this.params);
            this.state = State.GROUND;
        }
    }

    /**
     * OSC_STRING state - Operating System Command
     */
    oscString(code, char) {
        if (code === C0.BEL || (code === 0x5C && this.currentParam.endsWith('\x1b'))) {
            // OSC terminator (BEL or ESC\)
            this.oscDispatch(this.currentParam);
            this.state = State.GROUND;
        } else {
            this.currentParam += char;
        }
    }

    /**
     * Dispatch CSI sequence
     */
    csiDispatch(finalByte, params) {
        switch (finalByte) {
            case 'm': // SGR - Select Graphic Rendition
                this.sgr(params);
                break;
            case 'H': // CUP - Cursor Position
            case 'f': // HVP - Horizontal Vertical Position
                this.cup(params);
                break;
            case 'A': // CUU - Cursor Up
                this.cuu(params);
                break;
            case 'B': // CUD - Cursor Down
                this.cud(params);
                break;
            case 'C': // CUF - Cursor Forward
                this.cuf(params);
                break;
            case 'D': // CUB - Cursor Back
                this.cub(params);
                break;
            case 'J': // ED - Erase in Display
                this.ed(params);
                break;
            case 'K': // EL - Erase in Line
                this.el(params);
                break;
            case 'h': // SM - Set Mode
                if (this.intermediates === '?') {
                    this.setPrivateMode(params, true);
                }
                break;
            case 'l': // RM - Reset Mode
                if (this.intermediates === '?') {
                    this.setPrivateMode(params, false);
                }
                break;
        }
    }

    /**
     * OSC dispatch
     */
    oscDispatch(data) {
        // OSC sequences (e.g., set title) - ignore for now
    }

    /**
     * Print character to buffer
     */
    print(char) {
        const cell = this.currentAttr.clone();
        cell.char = char;

        this.buffer.setCell(this.buffer.cursorX, this.buffer.cursorY, cell);

        // Advance cursor
        this.buffer.moveCursor(1, 0);

        // Wrap to next line if needed
        if (this.buffer.cursorX >= this.buffer.cols) {
            this.buffer.setCursor(0, this.buffer.cursorY + 1);

            // Scroll if at bottom
            if (this.buffer.cursorY >= this.buffer.rows) {
                this.buffer.scrollUp(1);
                this.buffer.setCursor(0, this.buffer.rows - 1);
            }
        }
    }

    /**
     * Tab to next tab stop
     */
    tab() {
        const nextStop = Math.ceil((this.buffer.cursorX + 1) / 8) * 8;
        this.buffer.setCursor(Math.min(nextStop, this.buffer.cols - 1), this.buffer.cursorY);
    }

    // ===== CSI Handlers =====

    /**
     * SGR - Select Graphic Rendition (colors and styles)
     */
    sgr(params) {
        if (params.length === 0) {
            params = [0];
        }

        for (let i = 0; i < params.length; i++) {
            const p = params[i];

            if (p === 0) {
                // Reset
                this.currentAttr.reset();
            } else if (p === 1) {
                // Bold
                this.currentAttr.setBold(true);
            } else if (p === 2) {
                // Dim
                this.currentAttr.setDim(true);
            } else if (p === 3) {
                // Italic
                this.currentAttr.setItalic(true);
            } else if (p === 4) {
                // Underline
                this.currentAttr.setUnderline(true);
            } else if (p >= 30 && p <= 37) {
                // Foreground color (8-color)
                this.currentAttr.fg = COLOR_PALETTE[p - 30];
            } else if (p === 38) {
                // Extended foreground color
                i = this.parseSGRColor(params, i, true);
            } else if (p === 39) {
                // Default foreground
                this.currentAttr.fg = 0xD4D4D4;
            } else if (p >= 40 && p <= 47) {
                // Background color (8-color)
                this.currentAttr.bg = COLOR_PALETTE[p - 40];
            } else if (p === 48) {
                // Extended background color
                i = this.parseSGRColor(params, i, false);
            } else if (p === 49) {
                // Default background
                this.currentAttr.bg = 0x1E1E1E;
            }
        }
    }

    /**
     * Parse extended SGR color (256-color or RGB)
     */
    parseSGRColor(params, i, isFg) {
        if (i + 1 >= params.length) return i;

        const colorType = params[i + 1];

        if (colorType === 5) {
            // 256-color palette
            if (i + 2 < params.length) {
                const colorIndex = params[i + 2];
                const color = this.get256Color(colorIndex);
                if (isFg) {
                    this.currentAttr.fg = color;
                } else {
                    this.currentAttr.bg = color;
                }
                return i + 2;
            }
        } else if (colorType === 2) {
            // RGB color
            if (i + 4 < params.length) {
                const r = params[i + 2];
                const g = params[i + 3];
                const b = params[i + 4];
                const color = (r << 16) | (g << 8) | b;
                if (isFg) {
                    this.currentAttr.fg = color;
                } else {
                    this.currentAttr.bg = color;
                }
                return i + 4;
            }
        }

        return i + 1;
    }

    /**
     * Get color from 256-color palette
     */
    get256Color(index) {
        if (index < 16) {
            // Use our defined palette
            return COLOR_PALETTE[index];
        } else if (index < 232) {
            // 6x6x6 color cube
            const i = index - 16;
            const r = Math.floor(i / 36) * 51;
            const g = (Math.floor(i / 6) % 6) * 51;
            const b = (i % 6) * 51;
            return (r << 16) | (g << 8) | b;
        } else {
            // Grayscale
            const gray = (index - 232) * 10 + 8;
            return (gray << 16) | (gray << 8) | gray;
        }
    }

    /**
     * CUP - Cursor Position
     */
    cup(params) {
        const row = (params[0] || 1) - 1;  // 1-indexed to 0-indexed
        const col = (params[1] || 1) - 1;
        this.buffer.setCursor(col, row);
    }

    /**
     * CUU - Cursor Up
     */
    cuu(params) {
        const n = params[0] || 1;
        this.buffer.moveCursor(0, -n);
    }

    /**
     * CUD - Cursor Down
     */
    cud(params) {
        const n = params[0] || 1;
        this.buffer.moveCursor(0, n);
    }

    /**
     * CUF - Cursor Forward
     */
    cuf(params) {
        const n = params[0] || 1;
        this.buffer.moveCursor(n, 0);
    }

    /**
     * CUB - Cursor Back
     */
    cub(params) {
        const n = params[0] || 1;
        this.buffer.moveCursor(-n, 0);
    }

    /**
     * ED - Erase in Display
     */
    ed(params) {
        const p = params[0] || 0;

        switch (p) {
            case 0: // Erase below
                this.buffer.clearFromCursor();
                break;
            case 1: // Erase above
                this.buffer.clearToCursor();
                break;
            case 2: // Erase all
            case 3: // Erase all + scrollback
                this.buffer.clearScreen();
                if (p === 3) {
                    this.buffer.scrollback.clear();
                }
                break;
        }
    }

    /**
     * EL - Erase in Line
     */
    el(params) {
        const p = params[0] || 0;

        switch (p) {
            case 0: // Erase to right
                this.buffer.clearLineFromCursor();
                break;
            case 1: // Erase to left
                this.buffer.clearLineToCursor();
                break;
            case 2: // Erase entire line
                this.buffer.clearLine(this.buffer.cursorY);
                break;
        }
    }

    /**
     * Set/Reset Private Mode
     */
    setPrivateMode(params, set) {
        for (const p of params) {
            switch (p) {
                case 25: // Cursor visibility
                    this.buffer.setCursorVisible(set);
                    break;
                case 1049: // Alternate screen buffer
                    if (set) {
                        this.buffer.useAlternateScreen();
                    } else {
                        this.buffer.useNormalScreen();
                    }
                    break;
            }
        }
    }
}

module.exports = ANSIParser;
