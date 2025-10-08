/**
 * Performance Monitor
 *
 * Tracks and logs memory-intensive operations globally
 */

class PerformanceMonitor {
    constructor() {
        this.thresholds = {
            fileSize: 500000, // 500KB - warn for files larger than this
            largeFileSize: 1000000, // 1MB - critical threshold
            operationTime: 100, // 100ms - warn if operations take longer
            slowOperationTime: 500, // 500ms - critical slow operation
            memoryDelta: 10, // 10MB - warn if memory increases by this much
            frameDrop: 16.67 // 60fps = 16.67ms per frame
        };

        this.metrics = {
            fileLoads: [],
            codeMirrorRenders: [],
            memorySnapshots: [],
            slowOperations: []
        };

        // Start memory monitoring
        this.startMemoryMonitoring();

        // Monitor long tasks
        this.monitorLongTasks();
    }

    /**
     * Start periodic memory monitoring
     */
    startMemoryMonitoring() {
        // Take memory snapshot every 10 seconds
        setInterval(() => {
            if (performance.memory) {
                const snapshot = {
                    timestamp: Date.now(),
                    usedJSHeapSize: performance.memory.usedJSHeapSize,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
                };

                this.metrics.memorySnapshots.push(snapshot);

                // Keep only last 100 snapshots
                if (this.metrics.memorySnapshots.length > 100) {
                    this.metrics.memorySnapshots.shift();
                }

                // Check for memory spike
                if (this.metrics.memorySnapshots.length >= 2) {
                    const prev = this.metrics.memorySnapshots[this.metrics.memorySnapshots.length - 2];
                    const current = snapshot;
                    const deltaMB = (current.usedJSHeapSize - prev.usedJSHeapSize) / 1024 / 1024;

                    if (deltaMB > this.thresholds.memoryDelta) {
                        console.warn(`[PerformanceMonitor] ⚠️ MEMORY SPIKE: +${deltaMB.toFixed(2)}MB in 10s`);
                        console.warn(`[PerformanceMonitor] Current: ${(current.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(current.jsHeapSizeLimit / 1024 / 1024).toFixed(2)}MB`);
                    }
                }

                // Warn if approaching heap limit
                const usagePercent = (snapshot.usedJSHeapSize / snapshot.jsHeapSizeLimit) * 100;
                if (usagePercent > 80) {
                    console.error(`[PerformanceMonitor] 🔴 CRITICAL MEMORY USAGE: ${usagePercent.toFixed(1)}%`);
                } else if (usagePercent > 60) {
                    console.warn(`[PerformanceMonitor] ⚠️ High memory usage: ${usagePercent.toFixed(1)}%`);
                }
            }
        }, 10000);
    }

    /**
     * Monitor long tasks (main thread blocking)
     */
    monitorLongTasks() {
        if ('PerformanceObserver' in window) {
            try {
                const observer = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        if (entry.duration > this.thresholds.slowOperationTime) {
                            console.error(`[PerformanceMonitor] 🔴 LONG TASK: ${entry.duration.toFixed(2)}ms - Main thread blocked!`);
                        } else if (entry.duration > this.thresholds.operationTime) {
                            console.warn(`[PerformanceMonitor] ⚠️ Slow task: ${entry.duration.toFixed(2)}ms`);
                        }
                    }
                });

                observer.observe({ entryTypes: ['longtask'] });
            } catch (e) {
                // longtask not supported, fall back to manual monitoring
                console.log('[PerformanceMonitor] Long task API not available');
            }
        }
    }

    /**
     * Track file load operation
     */
    trackFileLoad(filePath, fileSize, duration) {
        const sizeKB = fileSize / 1024;
        const sizeMB = sizeKB / 1024;

        const metric = {
            filePath,
            fileSize,
            duration,
            timestamp: Date.now()
        };

        this.metrics.fileLoads.push(metric);

        // Log based on thresholds
        if (fileSize > this.thresholds.largeFileSize) {
            console.error(`[PerformanceMonitor] 🔴 LARGE FILE: ${filePath} (${sizeMB.toFixed(2)}MB) loaded in ${duration.toFixed(2)}ms`);
            console.error(`[PerformanceMonitor] Consider lazy loading or virtual scrolling for files > 1MB`);
        } else if (fileSize > this.thresholds.fileSize) {
            console.warn(`[PerformanceMonitor] ⚠️ Large file: ${filePath} (${sizeKB.toFixed(2)}KB) loaded in ${duration.toFixed(2)}ms`);
        }

        if (duration > this.thresholds.slowOperationTime) {
            console.error(`[PerformanceMonitor] 🔴 SLOW FILE LOAD: ${filePath} took ${duration.toFixed(2)}ms`);
        }

        // Keep only last 50 file loads
        if (this.metrics.fileLoads.length > 50) {
            this.metrics.fileLoads.shift();
        }
    }

    /**
     * Track CodeMirror render operation
     */
    trackCodeMirrorRender(filePath, contentLength, duration) {
        const metric = {
            filePath,
            contentLength,
            duration,
            timestamp: Date.now()
        };

        this.metrics.codeMirrorRenders.push(metric);

        // Log based on thresholds
        if (duration > this.thresholds.slowOperationTime) {
            console.error(`[PerformanceMonitor] 🔴 SLOW CODEMIRROR RENDER: ${filePath} (${contentLength} chars) took ${duration.toFixed(2)}ms`);
        } else if (duration > this.thresholds.operationTime) {
            console.warn(`[PerformanceMonitor] ⚠️ Slow CodeMirror render: ${filePath} took ${duration.toFixed(2)}ms`);
        }

        // Keep only last 50 renders
        if (this.metrics.codeMirrorRenders.length > 50) {
            this.metrics.codeMirrorRenders.shift();
        }
    }

    /**
     * Track generic operation
     */
    trackOperation(operationName, duration, details = {}) {
        if (duration > this.thresholds.slowOperationTime) {
            console.error(`[PerformanceMonitor] 🔴 SLOW OPERATION: ${operationName} took ${duration.toFixed(2)}ms`, details);

            this.metrics.slowOperations.push({
                operation: operationName,
                duration,
                details,
                timestamp: Date.now()
            });
        } else if (duration > this.thresholds.operationTime) {
            console.warn(`[PerformanceMonitor] ⚠️ Slow operation: ${operationName} took ${duration.toFixed(2)}ms`);
        }

        // Keep only last 50 slow operations
        if (this.metrics.slowOperations.length > 50) {
            this.metrics.slowOperations.shift();
        }
    }

    /**
     * Get current memory usage
     */
    getCurrentMemory() {
        if (performance.memory) {
            return {
                usedMB: performance.memory.usedJSHeapSize / 1024 / 1024,
                totalMB: performance.memory.totalJSHeapSize / 1024 / 1024,
                limitMB: performance.memory.jsHeapSizeLimit / 1024 / 1024,
                usagePercent: (performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100
            };
        }
        return null;
    }

    /**
     * Create a performance measurement wrapper
     */
    measure(operationName, fn, details = {}) {
        const start = performance.now();
        const startMemory = this.getCurrentMemory();

        try {
            const result = fn();

            // Handle promises
            if (result && typeof result.then === 'function') {
                return result.then(value => {
                    const duration = performance.now() - start;
                    const endMemory = this.getCurrentMemory();

                    if (startMemory && endMemory) {
                        const memoryDelta = endMemory.usedMB - startMemory.usedMB;
                        if (memoryDelta > this.thresholds.memoryDelta) {
                            console.warn(`[PerformanceMonitor] ⚠️ ${operationName} used +${memoryDelta.toFixed(2)}MB`);
                        }
                    }

                    this.trackOperation(operationName, duration, details);
                    return value;
                });
            }

            // Synchronous function
            const duration = performance.now() - start;
            const endMemory = this.getCurrentMemory();

            if (startMemory && endMemory) {
                const memoryDelta = endMemory.usedMB - startMemory.usedMB;
                if (memoryDelta > this.thresholds.memoryDelta) {
                    console.warn(`[PerformanceMonitor] ⚠️ ${operationName} used +${memoryDelta.toFixed(2)}MB`);
                }
            }

            this.trackOperation(operationName, duration, details);
            return result;

        } catch (error) {
            const duration = performance.now() - start;
            console.error(`[PerformanceMonitor] ❌ ${operationName} failed after ${duration.toFixed(2)}ms:`, error);
            throw error;
        }
    }

    /**
     * Get performance summary
     */
    getSummary() {
        const memory = this.getCurrentMemory();

        return {
            memory,
            fileLoads: this.metrics.fileLoads.length,
            codeMirrorRenders: this.metrics.codeMirrorRenders.length,
            slowOperations: this.metrics.slowOperations.length,
            recentSlowOps: this.metrics.slowOperations.slice(-10)
        };
    }

    /**
     * Log performance summary
     */
    logSummary() {
        const summary = this.getSummary();
        console.log('[PerformanceMonitor] ========== PERFORMANCE SUMMARY ==========');

        if (summary.memory) {
            console.log(`[PerformanceMonitor] Memory: ${summary.memory.usedMB.toFixed(2)}MB / ${summary.memory.limitMB.toFixed(2)}MB (${summary.memory.usagePercent.toFixed(1)}%)`);
        }

        console.log(`[PerformanceMonitor] File loads tracked: ${summary.fileLoads}`);
        console.log(`[PerformanceMonitor] CodeMirror renders tracked: ${summary.codeMirrorRenders}`);
        console.log(`[PerformanceMonitor] Slow operations: ${summary.slowOperations}`);

        if (summary.recentSlowOps.length > 0) {
            console.log(`[PerformanceMonitor] Recent slow operations:`);
            summary.recentSlowOps.forEach(op => {
                console.log(`  - ${op.operation}: ${op.duration.toFixed(2)}ms`);
            });
        }

        console.log('[PerformanceMonitor] ========================================');
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

// Log summary every 60 seconds
setInterval(() => {
    performanceMonitor.logSummary();
}, 60000);

module.exports = performanceMonitor;
