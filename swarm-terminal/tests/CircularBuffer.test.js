/**
 * CircularBuffer.test.js - Test suite for CircularBuffer class
 *
 * TDD Approach: Write tests first, then implement
 *
 * Test Coverage:
 * - Buffer creation with capacity
 * - Push operations (add to end)
 * - Get operations (retrieve by index)
 * - Circular wrapping behavior
 * - Buffer overflow handling
 * - Memory efficiency
 * - Edge cases
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const CircularBuffer = require('../src/core/CircularBuffer');

describe('CircularBuffer', () => {
    describe('Construction and Initialization', () => {
        it('should create an empty buffer with specified capacity', () => {
const buffer = new CircularBuffer(1000);
expect(buffer.capacity).toBe(1000);
expect(buffer.length).toBe(0);
            // expect(true).toBe(true);
        });

        it('should throw error if capacity is not positive', () => {
expect(() => new CircularBuffer(0)).toThrow();
expect(() => new CircularBuffer(-1)).toThrow();
            // expect(true).toBe(true);
        });

        it('should create buffer with default capacity if not specified', () => {
const buffer = new CircularBuffer();
expect(buffer.capacity).toBeGreaterThan(0);
            // expect(true).toBe(true);
        });
    });

    describe('Push Operations', () => {
        it('should push single item to buffer', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
expect(buffer.length).toBe(1);
expect(buffer.get(0)).toBe('line1');
            // expect(true).toBe(true);
        });

        it('should push multiple items in order', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
buffer.push('line2');
buffer.push('line3');
expect(buffer.length).toBe(3);
expect(buffer.get(0)).toBe('line1');
expect(buffer.get(1)).toBe('line2');
expect(buffer.get(2)).toBe('line3');
            // expect(true).toBe(true);
        });

        it('should handle pushing up to capacity', () => {
const buffer = new CircularBuffer(5);
for (let i = 0; i < 5; i++) {
    buffer.push(`line${i}`);
}
expect(buffer.length).toBe(5);
            // expect(true).toBe(true);
        });

        it('should wrap around when capacity is exceeded', () => {
const buffer = new CircularBuffer(3);
buffer.push('line0');
buffer.push('line1');
buffer.push('line2');
buffer.push('line3'); // Should overwrite line0
expect(buffer.length).toBe(3);
expect(buffer.get(0)).toBe('line1');
expect(buffer.get(1)).toBe('line2');
expect(buffer.get(2)).toBe('line3');
            // expect(true).toBe(true);
        });

        it('should continue wrapping for many pushes', () => {
const buffer = new CircularBuffer(3);
for (let i = 0; i < 10; i++) {
    buffer.push(`line${i}`);
}
// Last 3 items should be line7, line8, line9
expect(buffer.length).toBe(3);
expect(buffer.get(0)).toBe('line7');
expect(buffer.get(1)).toBe('line8');
expect(buffer.get(2)).toBe('line9');
            // expect(true).toBe(true);
        });
    });

    describe('Get Operations', () => {
        it('should get item by index', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
buffer.push('line2');
expect(buffer.get(0)).toBe('line1');
expect(buffer.get(1)).toBe('line2');
            // expect(true).toBe(true);
        });

        it('should return undefined for invalid index', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
expect(buffer.get(-1)).toBeUndefined();
expect(buffer.get(10)).toBeUndefined();
expect(buffer.get(1)).toBeUndefined(); // Only 1 item
            // expect(true).toBe(true);
        });

        it('should get items after wrapping', () => {
const buffer = new CircularBuffer(3);
for (let i = 0; i < 5; i++) {
    buffer.push(`line${i}`);
}
// Should have line2, line3, line4
expect(buffer.get(0)).toBe('line2');
expect(buffer.get(1)).toBe('line3');
expect(buffer.get(2)).toBe('line4');
            // expect(true).toBe(true);
        });
    });

    describe('Iteration', () => {
        it('should provide iterator for all items', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
buffer.push('line2');
buffer.push('line3');
const items = [...buffer];
expect(items).toEqual(['line1', 'line2', 'line3']);
            // expect(true).toBe(true);
        });

        it('should iterate in correct order after wrapping', () => {
const buffer = new CircularBuffer(3);
for (let i = 0; i < 5; i++) {
    buffer.push(`line${i}`);
}
const items = [...buffer];
expect(items).toEqual(['line2', 'line3', 'line4']);
            // expect(true).toBe(true);
        });

        it('should support forEach', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
buffer.push('line2');
const items = [];
buffer.forEach(item => items.push(item));
expect(items).toEqual(['line1', 'line2']);
            // expect(true).toBe(true);
        });
    });

    describe('Clear and Reset', () => {
        it('should clear all items', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
buffer.push('line2');
buffer.clear();
expect(buffer.length).toBe(0);
expect(buffer.get(0)).toBeUndefined();
            // expect(true).toBe(true);
        });

        it('should be reusable after clear', () => {
const buffer = new CircularBuffer(10);
buffer.push('line1');
buffer.clear();
buffer.push('line2');
expect(buffer.length).toBe(1);
expect(buffer.get(0)).toBe('line2');
            // expect(true).toBe(true);
        });
    });

    describe('Capacity Management', () => {
        it('should not exceed capacity', () => {
const buffer = new CircularBuffer(5);
for (let i = 0; i < 100; i++) {
    buffer.push(`line${i}`);
}
expect(buffer.length).toBe(5);
            // expect(true).toBe(true);
        });

        it('should resize capacity', () => {
const buffer = new CircularBuffer(5);
buffer.push('line1');
buffer.push('line2');
buffer.resize(10);
expect(buffer.capacity).toBe(10);
expect(buffer.length).toBe(2);
expect(buffer.get(0)).toBe('line1');
expect(buffer.get(1)).toBe('line2');
            // expect(true).toBe(true);
        });

        it('should handle resize smaller than current length', () => {
const buffer = new CircularBuffer(10);
for (let i = 0; i < 10; i++) {
    buffer.push(`line${i}`);
}
buffer.resize(5);
expect(buffer.capacity).toBe(5);
expect(buffer.length).toBe(5);
// Should keep last 5 items
expect(buffer.get(0)).toBe('line5');
expect(buffer.get(4)).toBe('line9');
            // expect(true).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle capacity of 1', () => {
const buffer = new CircularBuffer(1);
buffer.push('line1');
buffer.push('line2');
expect(buffer.length).toBe(1);
expect(buffer.get(0)).toBe('line2');
            // expect(true).toBe(true);
        });

        it('should handle large capacity', () => {
const buffer = new CircularBuffer(100000);
expect(buffer.capacity).toBe(100000);
            // expect(true).toBe(true);
        });

        it('should handle storing objects', () => {
const buffer = new CircularBuffer(3);
buffer.push({ line: 1 });
buffer.push({ line: 2 });
expect(buffer.get(0)).toEqual({ line: 1 });
expect(buffer.get(1)).toEqual({ line: 2 });
            // expect(true).toBe(true);
        });

        it('should handle null and undefined values', () => {
const buffer = new CircularBuffer(3);
buffer.push(null);
buffer.push(undefined);
buffer.push('valid');
expect(buffer.get(0)).toBeNull();
expect(buffer.get(1)).toBeUndefined();
expect(buffer.get(2)).toBe('valid');
            // expect(true).toBe(true);
        });
    });

    describe('Performance', () => {
        it('should push 100,000 items quickly', () => {
const buffer = new CircularBuffer(10000);
const start = performance.now();
for (let i = 0; i < 100000; i++) {
    buffer.push(`line${i}`);
}
const end = performance.now();
expect(end - start).toBeLessThan(100); // Should complete in < 100ms
            // expect(true).toBe(true);
        });

        it('should get items with O(1) complexity', () => {
const buffer = new CircularBuffer(10000);
for (let i = 0; i < 10000; i++) {
    buffer.push(`line${i}`);
}
const start = performance.now();
for (let i = 0; i < 10000; i++) {
    buffer.get(i % buffer.length);
}
const end = performance.now();
expect(end - start).toBeLessThan(10); // 10k gets in < 10ms
            // expect(true).toBe(true);
        });
    });

    describe('Scrollback Use Case', () => {
        it('should work as terminal scrollback buffer', () => {
const scrollback = new CircularBuffer(1000); // 1000 lines
            //
// Simulate terminal output
for (let i = 0; i < 2000; i++) {
    scrollback.push(`Terminal line ${i}`);
}
            //
// Should have last 1000 lines
expect(scrollback.length).toBe(1000);
expect(scrollback.get(0)).toBe('Terminal line 1000');
expect(scrollback.get(999)).toBe('Terminal line 1999');
            // expect(true).toBe(true);
        });
    });
});
