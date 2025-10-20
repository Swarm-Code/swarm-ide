/**
 * Cell.js - Terminal cell data structure
 *
 * Represents a single character cell in the terminal grid.
 * Optimized for memory efficiency and fast access.
 *
 * Memory Layout (24 bytes per cell):
 * - char: string (2 bytes for UTF-16, but JS strings are references)
 * - fg: 24-bit RGB color (4 bytes as number)
 * - bg: 24-bit RGB color (4 bytes as number)
 * - flags: 8-bit bitfield (4 bytes as number, but only 1 byte used)
 * - width: 1 or 2 for character width (4 bytes as number)
 *
 * Flags Bitfield:
 * - Bit 0: Bold
 * - Bit 1: Dim
 * - Bit 2: Italic
 * - Bit 3: Underline
 * - Bit 4: Blink
 * - Bit 5: Inverse
 * - Bit 6: Invisible
 * - Bit 7: Strikethrough
 */

// Flag constants (exported for use in tests and other modules)
const FLAGS = {
    BOLD:          0b00000001,  // 1
    DIM:           0b00000010,  // 2
    ITALIC:        0b00000100,  // 4
    UNDERLINE:     0b00001000,  // 8
    BLINK:         0b00010000,  // 16
    INVERSE:       0b00100000,  // 32
    INVISIBLE:     0b01000000,  // 64
    STRIKETHROUGH: 0b10000000   // 128
};

// Default colors (VSCode dark theme)
const DEFAULT_FG = 0xD4D4D4;  // Light gray
const DEFAULT_BG = 0x1E1E1E;  // Dark gray

class Cell {
    /**
     * Create a terminal cell
     * @param {string} char - Character to display (default: ' ')
     * @param {number} fg - Foreground color as 24-bit RGB (default: DEFAULT_FG)
     * @param {number} bg - Background color as 24-bit RGB (default: DEFAULT_BG)
     * @param {number} flags - Attribute flags bitfield (default: 0)
     * @param {number} width - Character width: 1 or 2 (default: 1)
     */
    constructor(char = ' ', fg = DEFAULT_FG, bg = DEFAULT_BG, flags = 0, width = null) {
        // Sanitize character input
        this.char = this._sanitizeChar(char);

        // Colors (24-bit RGB)
        this.fg = fg & 0xFFFFFF;  // Mask to 24 bits
        this.bg = bg & 0xFFFFFF;

        // Flags (8-bit bitfield)
        this.flags = flags & 0xFF;  // Mask to 8 bits

        // Character width (1 for normal, 2 for wide chars like CJK/emoji)
        // Auto-detect if not specified
        if (width === null) {
            this.width = Cell.isWideChar(this.char) ? 2 : 1;
        } else {
            this.width = width;
        }
    }

    /**
     * Sanitize character input
     * @private
     */
    _sanitizeChar(char) {
        // Handle null/undefined
        if (char === null || char === undefined || char === '') {
            return ' ';
        }

        // Convert to string
        const str = String(char);

        // Handle control characters (0x00-0x1F, 0x7F-0x9F)
        const codePoint = str.codePointAt(0);
        if ((codePoint < 0x20) || (codePoint >= 0x7F && codePoint <= 0x9F)) {
            return ' ';
        }

        // Return first character (handle surrogate pairs for emoji/multi-byte chars)
        // Use Array.from to properly split on code points, not UTF-16 code units
        const chars = Array.from(str);
        return chars[0] || ' ';
    }

    /**
     * Check if character is wide (CJK, emoji, etc.)
     * This is a simplified check - a full implementation would use Unicode data
     */
    static isWideChar(char) {
        if (!char) return false;
        const code = char.codePointAt(0);

        // CJK Unified Ideographs: U+4E00 to U+9FFF
        // Emoji: U+1F300 to U+1F9FF
        // Fullwidth forms: U+FF00 to U+FFEF
        return (code >= 0x4E00 && code <= 0x9FFF) ||
               (code >= 0x1F300 && code <= 0x1F9FF) ||
               (code >= 0xFF00 && code <= 0xFFEF);
    }

    // ===== Flag Setters =====

    setBold(value) {
        if (value) {
            this.flags |= FLAGS.BOLD;
        } else {
            this.flags &= ~FLAGS.BOLD;
        }
    }

    setDim(value) {
        if (value) {
            this.flags |= FLAGS.DIM;
        } else {
            this.flags &= ~FLAGS.DIM;
        }
    }

    setItalic(value) {
        if (value) {
            this.flags |= FLAGS.ITALIC;
        } else {
            this.flags &= ~FLAGS.ITALIC;
        }
    }

    setUnderline(value) {
        if (value) {
            this.flags |= FLAGS.UNDERLINE;
        } else {
            this.flags &= ~FLAGS.UNDERLINE;
        }
    }

    setBlink(value) {
        if (value) {
            this.flags |= FLAGS.BLINK;
        } else {
            this.flags &= ~FLAGS.BLINK;
        }
    }

    setInverse(value) {
        if (value) {
            this.flags |= FLAGS.INVERSE;
        } else {
            this.flags &= ~FLAGS.INVERSE;
        }
    }

    setInvisible(value) {
        if (value) {
            this.flags |= FLAGS.INVISIBLE;
        } else {
            this.flags &= ~FLAGS.INVISIBLE;
        }
    }

    setStrikethrough(value) {
        if (value) {
            this.flags |= FLAGS.STRIKETHROUGH;
        } else {
            this.flags &= ~FLAGS.STRIKETHROUGH;
        }
    }

    // ===== Flag Getters =====

    isBold() {
        return (this.flags & FLAGS.BOLD) !== 0;
    }

    isDim() {
        return (this.flags & FLAGS.DIM) !== 0;
    }

    isItalic() {
        return (this.flags & FLAGS.ITALIC) !== 0;
    }

    isUnderline() {
        return (this.flags & FLAGS.UNDERLINE) !== 0;
    }

    isBlink() {
        return (this.flags & FLAGS.BLINK) !== 0;
    }

    isInverse() {
        return (this.flags & FLAGS.INVERSE) !== 0;
    }

    isInvisible() {
        return (this.flags & FLAGS.INVISIBLE) !== 0;
    }

    isStrikethrough() {
        return (this.flags & FLAGS.STRIKETHROUGH) !== 0;
    }

    // ===== Cell Operations =====

    /**
     * Clone this cell
     * @returns {Cell} New cell with same properties
     */
    clone() {
        return new Cell(this.char, this.fg, this.bg, this.flags, this.width);
    }

    /**
     * Check if this cell equals another cell
     * @param {Cell} other - Cell to compare
     * @returns {boolean} True if cells are equal
     */
    equals(other) {
        return this.char === other.char &&
               this.fg === other.fg &&
               this.bg === other.bg &&
               this.flags === other.flags &&
               this.width === other.width;
    }

    /**
     * Copy properties from another cell
     * @param {Cell} other - Cell to copy from
     */
    copyFrom(other) {
        this.char = other.char;
        this.fg = other.fg;
        this.bg = other.bg;
        this.flags = other.flags;
        this.width = other.width;
    }

    /**
     * Reset cell to default state
     */
    reset() {
        this.char = ' ';
        this.fg = DEFAULT_FG;
        this.bg = DEFAULT_BG;
        this.flags = 0;
        this.width = 1;
    }

    /**
     * Get a string representation for debugging
     */
    toString() {
        const flags = [];
        if (this.isBold()) flags.push('BOLD');
        if (this.isDim()) flags.push('DIM');
        if (this.isItalic()) flags.push('ITALIC');
        if (this.isUnderline()) flags.push('UNDERLINE');
        if (this.isBlink()) flags.push('BLINK');
        if (this.isInverse()) flags.push('INVERSE');
        if (this.isInvisible()) flags.push('INVISIBLE');
        if (this.isStrikethrough()) flags.push('STRIKETHROUGH');

        return `Cell('${this.char}', fg:#${this.fg.toString(16).padStart(6, '0')}, bg:#${this.bg.toString(16).padStart(6, '0')}, ${flags.join('|') || 'NONE'}, w:${this.width})`;
    }
}

// Export Cell class and FLAGS constant
module.exports = Cell;
module.exports.FLAGS = FLAGS;
module.exports.DEFAULT_FG = DEFAULT_FG;
module.exports.DEFAULT_BG = DEFAULT_BG;
