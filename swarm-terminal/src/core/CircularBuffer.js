/**
 * CircularBuffer.js - Circular buffer data structure
 *
 * Implements a fixed-size circular buffer (ring buffer) for efficient
 * scrollback history in the terminal.
 *
 * Performance Characteristics:
 * - Push: O(1)
 * - Get: O(1)
 * - Space: O(n) where n = capacity
 *
 * When the buffer is full, new items overwrite the oldest items.
 * This provides constant memory usage regardless of how much data flows through.
 *
 * Usage:
 *   const buffer = new CircularBuffer(1000);  // 1000 line scrollback
 *   buffer.push('line 1');
 *   buffer.push('line 2');
 *   buffer.get(0);  // => 'line 1'
 */

const DEFAULT_CAPACITY = 10000;

class CircularBuffer {
    /**
     * Create a circular buffer
     * @param {number} capacity - Maximum number of items to store
     */
    constructor(capacity = DEFAULT_CAPACITY) {
        if (capacity <= 0) {
            throw new Error('Circular buffer capacity must be positive');
        }

        this.capacity = capacity;
        this._buffer = new Array(capacity);
        this._start = 0;    // Index of oldest item
        this._end = 0;      // Index where next item will be written
        this._length = 0;   // Current number of items
    }

    /**
     * Get current number of items in buffer
     * @returns {number} Number of items
     */
    get length() {
        return this._length;
    }

    /**
     * Add an item to the end of the buffer
     * If buffer is full, oldest item is overwritten
     * @param {*} item - Item to add
     */
    push(item) {
        this._buffer[this._end] = item;

        if (this._length < this.capacity) {
            // Buffer not full yet
            this._length++;
        } else {
            // Buffer full, move start pointer forward (overwrite oldest)
            this._start = (this._start + 1) % this.capacity;
        }

        // Move end pointer forward
        this._end = (this._end + 1) % this.capacity;
    }

    /**
     * Get item by index (0 = oldest, length-1 = newest)
     * @param {number} index - Index of item to retrieve
     * @returns {*} Item at index, or undefined if index is invalid
     */
    get(index) {
        if (index < 0 || index >= this._length) {
            return undefined;
        }

        // Calculate actual index in buffer
        const actualIndex = (this._start + index) % this.capacity;
        return this._buffer[actualIndex];
    }

    /**
     * Clear all items from buffer
     */
    clear() {
        this._start = 0;
        this._end = 0;
        this._length = 0;
        // Note: We don't null out the buffer array for performance
        // Items will be overwritten naturally
    }

    /**
     * Resize the buffer capacity
     * If new capacity is smaller, oldest items are discarded
     * @param {number} newCapacity - New capacity
     */
    resize(newCapacity) {
        if (newCapacity <= 0) {
            throw new Error('Circular buffer capacity must be positive');
        }

        // Create new buffer
        const newBuffer = new Array(newCapacity);

        // Copy items from old buffer to new buffer
        const itemsToCopy = Math.min(this._length, newCapacity);

        if (itemsToCopy > 0) {
            // If new capacity is smaller, we keep the newest items
            const startOffset = this._length > newCapacity ? this._length - newCapacity : 0;

            for (let i = 0; i < itemsToCopy; i++) {
                const oldIndex = (this._start + startOffset + i) % this.capacity;
                newBuffer[i] = this._buffer[oldIndex];
            }
        }

        // Update buffer and pointers
        this._buffer = newBuffer;
        this.capacity = newCapacity;
        this._start = 0;
        this._end = itemsToCopy % newCapacity;
        this._length = itemsToCopy;
    }

    /**
     * Iterate over all items in order (oldest to newest)
     * Supports for...of loops
     */
    *[Symbol.iterator]() {
        for (let i = 0; i < this._length; i++) {
            yield this.get(i);
        }
    }

    /**
     * Execute a callback for each item
     * @param {Function} callback - Function to call for each item (item, index, buffer)
     */
    forEach(callback) {
        for (let i = 0; i < this._length; i++) {
            callback(this.get(i), i, this);
        }
    }

    /**
     * Get all items as an array
     * @returns {Array} Array of all items in order
     */
    toArray() {
        const result = new Array(this._length);
        for (let i = 0; i < this._length; i++) {
            result[i] = this.get(i);
        }
        return result;
    }

    /**
     * Get debug information about buffer state
     * @returns {Object} Debug information
     */
    getDebugInfo() {
        return {
            capacity: this.capacity,
            length: this._length,
            start: this._start,
            end: this._end,
            fullness: (this._length / this.capacity * 100).toFixed(1) + '%'
        };
    }

    /**
     * String representation for debugging
     */
    toString() {
        return `CircularBuffer(capacity=${this.capacity}, length=${this._length})`;
    }
}

module.exports = CircularBuffer;
