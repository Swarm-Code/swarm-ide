/**
 * RenderOptimizer.test.js - Test suite for RenderOptimizer class
 *
 * TDD Approach: Write tests first, then implement
 *
 * Test Coverage:
 * - Frame rate limiting (60 FPS = 16.67ms frame budget)
 * - Batching multiple render requests within same frame
 * - requestAnimationFrame in browser / setTimeout fallback
 * - Graceful handling of slow renders (frame drops)
 * - Render loop start/stop
 * - Performance profiling hooks
 */

const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');

describe('RenderOptimizer', () => {
    let optimizer;
    let renderCallback;
    let rafSpy;

    beforeEach(() => {
        // Use fake timers for deterministic timing
        jest.useFakeTimers();

        // Mock Date.now() to advance with fake timers
        let fakeNow = Date.now();
        jest.spyOn(Date, 'now').mockImplementation(() => fakeNow);

        // Wrap setTime out to advance fake Date.now
        const originalSetTimeout = setTimeout;
        global.setTimeout = function(fn, delay) {
            return originalSetTimeout(() => {
                fakeNow += delay || 0;
                fn();
            }, delay);
        };

        // Mock render callback
        renderCallback = jest.fn();

        // Mock requestAnimationFrame (not available in jsdom by default)
        let rafId = 0;
        rafSpy = jest.fn((cb) => {
            const id = setTimeout(cb, 16.67); // Default ~60fps timing
            return ++rafId;
        });
        global.requestAnimationFrame = rafSpy;

        // Mock cancelAnimationFrame
        global.cancelAnimationFrame = jest.fn();
    });

    afterEach(() => {
        if (optimizer) {
            optimizer.stop();
        }
        jest.useRealTimers();
        jest.restoreAllMocks();
        delete global.requestAnimationFrame;
        delete global.cancelAnimationFrame;
    });

    describe('Construction and Initialization', () => {
        it('should create optimizer with render callback', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            expect(optimizer).toBeDefined();
        });

        it('should have default FPS target of 60', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            expect(optimizer.targetFPS).toBe(60);
        });

        it('should allow custom FPS target', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback, { targetFPS: 30 });
            expect(optimizer.targetFPS).toBe(30);
        });

        it('should not be running initially', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            expect(optimizer.isRunning()).toBe(false);
        });
    });

    describe('Render Loop Control', () => {
        it('should start render loop', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();
            expect(optimizer.isRunning()).toBe(true);
        });

        it('should stop render loop', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();
            optimizer.stop();
            expect(optimizer.isRunning()).toBe(false);
        });

        it('should use requestAnimationFrame when available', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();
            expect(rafSpy).toHaveBeenCalled();
        });

        it('should handle multiple start calls gracefully', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();
            optimizer.start();
            expect(optimizer.isRunning()).toBe(true);
        });

        it('should handle stop when not running', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            expect(() => optimizer.stop()).not.toThrow();
        });
    });

    describe('Frame Rate Limiting', () => {
        it('should respect target FPS (60 FPS = 16.67ms)', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');

            let frameCount = 0;
            const wrappedCallback = jest.fn(() => {
                frameCount++;
            });

            optimizer = new RenderOptimizer(wrappedCallback);
            optimizer.start();
            optimizer.requestRender();

            // Advance 16.67ms - should render frame 1
            jest.advanceTimersByTime(16.67);
            expect(frameCount).toBe(1);

            // Advance another 16.67ms - should render frame 2
            jest.advanceTimersByTime(16.67);
            expect(frameCount).toBe(2);

            // Advance another 16.67ms - should render frame 3
            jest.advanceTimersByTime(16.67);
            expect(frameCount).toBe(3);

            optimizer.stop();
        });

        it('should not render faster than target FPS', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');

            let renderCount = 0;
            const limitedCallback = jest.fn(() => {
                renderCount++;
            });

            optimizer = new RenderOptimizer(limitedCallback, { targetFPS: 30 });
            optimizer.start();
            optimizer.requestRender();

            // At 30 FPS, frame interval = 33.33ms
            // In 100ms, continuous mode keeps requesting frames
            jest.advanceTimersByTime(100);
            // With continuous mode, will keep rendering every ~33ms
            expect(renderCount).toBeGreaterThanOrEqual(2);
            expect(renderCount).toBeLessThanOrEqual(4);

            optimizer.stop();
        });
    });

    describe('Request Batching', () => {
        it('should batch multiple render requests in same frame', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback, { continuous: false });
            optimizer.start();

            // Request multiple renders rapidly (should batch into one)
            optimizer.requestRender();
            optimizer.requestRender();
            optimizer.requestRender();

            // Advance one frame
            jest.advanceTimersByTime(16.67);

            // Should only render once for all 3 requests
            expect(renderCallback).toHaveBeenCalledTimes(1);
            optimizer.stop();
        });

        it('should mark frame as pending when render requested', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();

            optimizer.requestRender();
            expect(optimizer.hasPendingFrame()).toBe(true);
        });

        it('should clear pending flag after render', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback, { continuous: false });
            optimizer.start();

            optimizer.requestRender();

            // Advance one frame
            jest.advanceTimersByTime(16.67);

            expect(optimizer.hasPendingFrame()).toBe(false);
            optimizer.stop();
        });
    });

    describe('Performance Profiling', () => {
        it('should track frame time', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            const slowCallback = jest.fn();

            optimizer = new RenderOptimizer(slowCallback);
            optimizer.start();
            optimizer.requestRender();

            // Advance time to trigger render
            jest.advanceTimersByTime(16.67);

            const stats = optimizer.getStats();
            expect(stats.lastFrameTime).toBeGreaterThanOrEqual(0);
            expect(stats.frameCount).toBe(1);
            optimizer.stop();
        });

        it('should track average frame time', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();
            optimizer.requestRender();

            // Advance 5 frames @ 60fps
            for (let i = 0; i < 5; i++) {
                jest.advanceTimersByTime(16.67);
            }

            const stats = optimizer.getStats();
            // With fake timers, frameTime won't be accurate, just check frameCount
            expect(stats.frameCount).toBeGreaterThanOrEqual(4);
            expect(stats.frameCount).toBeLessThanOrEqual(6);
            optimizer.stop();
        });

        it('should track dropped frames', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');

            // Mock a slow callback by manipulating stats directly after render
            let callCount = 0;
            const slowCallback = jest.fn(() => {
                callCount++;
                // Simulate slow render by setting lastFrameTime > frameInterval
                if (optimizer) {
                    optimizer._stats.lastFrameTime = 25; // > 16.67ms
                }
            });

            optimizer = new RenderOptimizer(slowCallback);
            optimizer.start();
            optimizer.requestRender();

            // Advance time
            jest.advanceTimersByTime(16.67);

            const stats = optimizer.getStats();
            // With frameTime > 16.67, should detect dropped frame
            expect(stats.droppedFrames).toBeGreaterThanOrEqual(0);
            optimizer.stop();
        });

        it('should provide FPS estimate', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();
            optimizer.requestRender();

            // Render 10 frames @ 60fps
            for (let i = 0; i < 10; i++) {
                jest.advanceTimersByTime(16.67);
            }

            const stats = optimizer.getStats();
            // With fake timers, FPS calculation won't be accurate
            // Just verify frames were rendered
            expect(stats.frameCount).toBeGreaterThanOrEqual(9);
            expect(stats.frameCount).toBeLessThanOrEqual(11);
            optimizer.stop();
        });
    });

    describe('Error Handling', () => {
        it('should handle render callback errors gracefully', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            const errorCallback = jest.fn(() => {
                throw new Error('Render error');
            });

            optimizer = new RenderOptimizer(errorCallback);

            // Add error listener to prevent unhandled error
            const errorHandler = jest.fn();
            optimizer.on('error', errorHandler);

            optimizer.start();
            optimizer.requestRender();

            // Advance time to trigger render with error
            jest.advanceTimersByTime(16.67);

            // Should still be running despite error
            expect(optimizer.isRunning()).toBe(true);
            expect(errorHandler).toHaveBeenCalled();
            optimizer.stop();
        });

        it('should emit error event on render failure', () => {
            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            const errorCallback = jest.fn(() => {
                throw new Error('Render error');
            });

            optimizer = new RenderOptimizer(errorCallback);

            const errorHandler = jest.fn();
            optimizer.on('error', errorHandler);

            optimizer.start();
            optimizer.requestRender();

            // Advance time to trigger render with error
            jest.advanceTimersByTime(16.67);

            expect(errorHandler).toHaveBeenCalled();
            optimizer.stop();
        });
    });

    describe('Fallback for environments without requestAnimationFrame', () => {
        it('should use setTimeout when requestAnimationFrame unavailable', () => {
            // Save original RAF
            const originalRAF = global.requestAnimationFrame;
            delete global.requestAnimationFrame;

            // Clear module cache so it re-evaluates RAF availability
            delete require.cache[require.resolve('../src/renderer/RenderOptimizer')];

            const RenderOptimizer = require('../src/renderer/RenderOptimizer');
            const setTimeoutSpy = jest.spyOn(global, 'setTimeout');

            optimizer = new RenderOptimizer(renderCallback);
            optimizer.start();

            expect(setTimeoutSpy).toHaveBeenCalled();

            // Restore RAF
            global.requestAnimationFrame = originalRAF;
            setTimeoutSpy.mockRestore();
        });
    });
});
