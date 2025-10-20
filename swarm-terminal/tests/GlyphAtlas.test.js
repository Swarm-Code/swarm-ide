/**
 * GlyphAtlas.test.js - Test suite for GlyphAtlas class
 *
 * TDD Approach: Write tests first, then implement
 *
 * Test Coverage:
 * - Atlas creation and initialization
 * - Glyph loading and caching
 * - Texture coordinate mapping
 * - Shelf packing algorithm
 * - Canvas rendering to texture
 * - Cache hit/miss behavior
 * - Font metric calculations
 * - Dynamic atlas expansion
 * - Memory efficiency
 */

const { describe, it, expect, beforeEach } = require('@jest/globals');
const GlyphAtlas = require('../src/renderer/GlyphAtlas');
const { createMockCanvas } = require('./helpers/mockCanvas');

describe('GlyphAtlas', () => {
    let atlas;

    beforeEach(() => {
        // Create atlas with reasonable test size and mock canvas
        atlas = new GlyphAtlas({
            width: 512,
            height: 512,
            cellWidth: 10,
            cellHeight: 20,
            fontFamily: 'monospace',
            fontSize: 16,
            createCanvas: createMockCanvas
        });
    });

    describe('Construction and Initialization', () => {
        it('should create atlas with specified dimensions', () => {
            expect(atlas.width).toBe(512);
            expect(atlas.height).toBe(512);
            // expect(true).toBe(true);
        });

        it('should create canvas for glyph rendering', () => {
            expect(atlas.canvas).toBeDefined();
            expect(atlas.canvas.width).toBe(512);
            expect(atlas.canvas.height).toBe(512);
            // expect(true).toBe(true);
        });

        it('should initialize with empty glyph cache', () => {
            expect(atlas.glyphCache.size).toBe(0);
            // expect(true).toBe(true);
        });

        it('should store cell dimensions', () => {
            expect(atlas.cellWidth).toBe(10);
            expect(atlas.cellHeight).toBe(20);
            // expect(true).toBe(true);
        });

        it('should store font configuration', () => {
            expect(atlas.fontFamily).toBe('monospace');
            expect(atlas.fontSize).toBe(16);
            // expect(true).toBe(true);
        });
    });

    describe('Glyph Loading', () => {
        it('should load single ASCII character', () => {
            const coords = atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            expect(coords.u1).toBeGreaterThanOrEqual(0);
            expect(coords.v1).toBeGreaterThanOrEqual(0);
            expect(coords.u2).toBeLessThanOrEqual(1);
            expect(coords.v2).toBeLessThanOrEqual(1);
            // expect(true).toBe(true);
        });

        it('should cache loaded glyphs', () => {
            const coords1 = atlas.getGlyph('B', false, false, false, 0xFFFFFF);
            const coords2 = atlas.getGlyph('B', false, false, false, 0xFFFFFF);
            expect(coords1).toBe(coords2); // Same object reference = cached
            // expect(true).toBe(true);
        });

        it('should load Unicode characters', () => {
            const coords = atlas.getGlyph('λ', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should load emoji', () => {
            const coords = atlas.getGlyph('😀', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should load CJK characters', () => {
            const coords = atlas.getGlyph('中', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should handle box-drawing characters', () => {
            const coords = atlas.getGlyph('─', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });
    });

    describe('Style Variations', () => {
        it('should differentiate bold from normal', () => {
            const normal = atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            const bold = atlas.getGlyph('A', true, false, false, 0xFFFFFF);
            expect(normal).not.toBe(bold); // Different cache entries
            // expect(true).toBe(true);
        });

        it('should differentiate italic from normal', () => {
            const normal = atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            const italic = atlas.getGlyph('A', false, true, false, 0xFFFFFF);
            expect(normal).not.toBe(italic);
            // expect(true).toBe(true);
        });

        it('should differentiate underline from normal', () => {
            const normal = atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            const underline = atlas.getGlyph('A', false, false, true, 0xFFFFFF);
            expect(normal).not.toBe(underline);
            // expect(true).toBe(true);
        });

        it('should handle combined styles (bold + italic)', () => {
            const coords = atlas.getGlyph('A', true, true, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should differentiate colors', () => {
            const white = atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            const red = atlas.getGlyph('A', false, false, false, 0xFF0000);
            expect(white).not.toBe(red);
            // expect(true).toBe(true);
        });
    });

    describe('Cache Behavior', () => {
        it('should track cache size', () => {
            atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            atlas.getGlyph('B', false, false, false, 0xFFFFFF);
            atlas.getGlyph('C', false, false, false, 0xFFFFFF);
            expect(atlas.glyphCache.size).toBe(3);
            // expect(true).toBe(true);
        });

        it('should generate unique cache keys', () => {
            const key1 = atlas._getCacheKey('A', false, false, false, 0xFFFFFF);
            const key2 = atlas._getCacheKey('A', true, false, false, 0xFFFFFF);
            const key3 = atlas._getCacheKey('B', false, false, false, 0xFFFFFF);
            expect(key1).not.toBe(key2);
            expect(key1).not.toBe(key3);
            // expect(true).toBe(true);
        });

        it('should cache frequently used glyphs', () => {
            // Load ASCII printable characters
            for (let i = 32; i < 127; i++) {
                const char = String.fromCharCode(i);
                atlas.getGlyph(char, false, false, false, 0xFFFFFF);
            }
            expect(atlas.glyphCache.size).toBe(95); // 127 - 32
            // expect(true).toBe(true);
        });
    });

    describe('Shelf Packing Algorithm', () => {
        it('should pack glyphs in rows', () => {
            const coords = [];
            for (let i = 0; i < 10; i++) {
                const char = String.fromCharCode(65 + i); // A-J
                coords.push(atlas.getGlyph(char, false, false, false, 0xFFFFFF));
            }

            // First few glyphs should be on same row (v1 similar)
            expect(Math.abs(coords[0].v1 - coords[1].v1)).toBeLessThan(0.1);
            // expect(true).toBe(true);
        });

        it('should move to next row when shelf is full', () => {
            const glyphsPerRow = Math.floor(512 / 10); // width / cellWidth
            const coords = [];

            for (let i = 0; i < glyphsPerRow + 5; i++) {
                coords.push(atlas.getGlyph(String.fromCharCode(65 + (i % 26)), false, false, false, 0xFFFFFF + i));
            }

            // Last glyph should be on different row
            const firstRowV = coords[0].v1;
            const secondRowV = coords[glyphsPerRow].v1;
            expect(secondRowV).toBeGreaterThan(firstRowV);
            // expect(true).toBe(true);
        });

        it('should calculate correct texture coordinates', () => {
            const coords = atlas.getGlyph('A', false, false, false, 0xFFFFFF);

            // Coordinates should be normalized (0-1)
            expect(coords.u1).toBeGreaterThanOrEqual(0);
            expect(coords.u1).toBeLessThanOrEqual(1);
            expect(coords.v1).toBeGreaterThanOrEqual(0);
            expect(coords.v1).toBeLessThanOrEqual(1);
            expect(coords.u2).toBeGreaterThan(coords.u1);
            expect(coords.v2).toBeGreaterThan(coords.v1);
            // expect(true).toBe(true);
        });
    });

    describe('Texture Management', () => {
        it('should provide canvas as texture source', () => {
            atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            const texture = atlas.getTexture();
            expect(texture).toBe(atlas.canvas);
            // expect(true).toBe(true);
        });

        it('should mark texture as dirty when glyph added', () => {
            atlas.clearDirty();
            expect(atlas.isDirty()).toBe(false);
            atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            expect(atlas.isDirty()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should clear dirty flag', () => {
            atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            expect(atlas.isDirty()).toBe(true);
            atlas.clearDirty();
            expect(atlas.isDirty()).toBe(false);
            // expect(true).toBe(true);
        });
    });

    describe('Font Metrics', () => {
        it('should calculate cell dimensions from font', () => {
            const metrics = atlas.getFontMetrics();
            expect(metrics.cellWidth).toBe(10);
            expect(metrics.cellHeight).toBe(20);
            // expect(true).toBe(true);
        });

        it('should measure actual glyph width', () => {
            const width = atlas.measureGlyphWidth('M'); // M is typically widest
            expect(width).toBeGreaterThan(0);
            expect(width).toBeLessThanOrEqual(10); // Should fit in cell
            // expect(true).toBe(true);
        });

        it('should calculate baseline offset', () => {
            const metrics = atlas.getFontMetrics();
            expect(metrics.baseline).toBeGreaterThan(0);
            expect(metrics.baseline).toBeLessThan(20); // Within cell height
            // expect(true).toBe(true);
        });
    });

    describe('Atlas Expansion', () => {
        it('should detect when atlas is full', () => {
            // Fill atlas
            const maxGlyphs = Math.floor(512 / 10) * Math.floor(512 / 20);
            for (let i = 0; i < maxGlyphs + 10; i++) {
                atlas.getGlyph(String.fromCharCode(i), false, false, false, 0xFFFFFF);
            }

            expect(atlas.isFull()).toBe(true);
            // expect(true).toBe(true);
        });

        it('should clear and rebuild atlas when full', () => {
            const maxGlyphs = Math.floor(512 / 10) * Math.floor(512 / 20);

            // Fill atlas
            for (let i = 0; i < maxGlyphs + 10; i++) {
                atlas.getGlyph(String.fromCharCode(i), false, false, false, 0xFFFFFF);
            }

            // Clear should reset
            atlas.clear();
            expect(atlas.glyphCache.size).toBe(0);
            expect(atlas.isFull()).toBe(false);
            // expect(true).toBe(true);
        });
    });

    describe('Performance', () => {
        it('should load ASCII set quickly', () => {
            const start = performance.now();
            for (let i = 32; i < 127; i++) {
                const char = String.fromCharCode(i);
                atlas.getGlyph(char, false, false, false, 0xFFFFFF);
            }
            const end = performance.now();
            expect(end - start).toBeLessThan(100); // < 100ms for full ASCII
            // expect(true).toBe(true);
        });

        it('should have fast cache hits', () => {
            // Pre-load
            for (let i = 32; i < 127; i++) {
                atlas.getGlyph(String.fromCharCode(i), false, false, false, 0xFFFFFF);
            }

            // Measure cache hits WITHOUT profiling (profiling adds 40%+ overhead)
            const start = performance.now();
            for (let i = 0; i < 10000; i++) {
                const char = String.fromCharCode(32 + (i % 95));
                atlas.getGlyph(char, false, false, false, 0xFFFFFF);
            }
            const end = performance.now();

            expect(end - start).toBeLessThan(10); // 10k cache hits in < 10ms
            // expect(true).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle space character', () => {
            const coords = atlas.getGlyph(' ', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should handle null character', () => {
            const coords = atlas.getGlyph('\0', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });

        it('should handle wide characters (double-width)', () => {
            const coords = atlas.getGlyph('中', false, false, false, 0xFFFFFF);
            expect(coords).toBeDefined();
            // Should occupy double width
            // expect(true).toBe(true);
        });

        it('should handle zero-width characters gracefully', () => {
            const coords = atlas.getGlyph('\u200B', false, false, false, 0xFFFFFF); // Zero-width space
            expect(coords).toBeDefined();
            // expect(true).toBe(true);
        });
    });

    describe('Debug Information', () => {
        it('should provide atlas statistics', () => {
            atlas.getGlyph('A', false, false, false, 0xFFFFFF);
            atlas.getGlyph('B', false, false, false, 0xFFFFFF);

            const stats = atlas.getStats();
            expect(stats.cacheSize).toBe(2);
            expect(stats.width).toBe(512);
            expect(stats.height).toBe(512);
            expect(stats.cellWidth).toBe(10);
            expect(stats.cellHeight).toBe(20);
            // expect(true).toBe(true);
        });

        it('should track cache hit rate', () => {
            atlas.getGlyph('A', false, false, false, 0xFFFFFF); // Miss
            atlas.getGlyph('A', false, false, false, 0xFFFFFF); // Hit
            atlas.getGlyph('A', false, false, false, 0xFFFFFF); // Hit

            const stats = atlas.getStats();
            expect(stats.cacheHits).toBe(2);
            expect(stats.cacheMisses).toBe(1);
            // expect(true).toBe(true);
        });
    });
});
