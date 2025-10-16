/**
 * Memory Profiler - Monitors heap usage and reports top allocations
 */

const v8 = require('v8');
const fs = require('fs');
const path = require('path');

class MemoryProfiler {
    constructor() {
        this.snapshots = [];
        this.startTime = Date.now();
    }

    getMemoryUsage() {
        const usage = process.memoryUsage();
        return {
            rss: (usage.rss / 1024 / 1024).toFixed(2) + ' MB',
            heapTotal: (usage.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
            heapUsed: (usage.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
            external: (usage.external / 1024 / 1024).toFixed(2) + ' MB',
            arrayBuffers: (usage.arrayBuffers / 1024 / 1024).toFixed(2) + ' MB'
        };
    }

    getHeapStatistics() {
        const stats = v8.getHeapStatistics();
        return {
            totalHeapSize: (stats.total_heap_size / 1024 / 1024).toFixed(2) + ' MB',
            usedHeapSize: (stats.used_heap_size / 1024 / 1024).toFixed(2) + ' MB',
            heapSizeLimit: (stats.heap_size_limit / 1024 / 1024).toFixed(2) + ' MB',
            mallocedMemory: (stats.malloced_memory / 1024 / 1024).toFixed(2) + ' MB'
        };
    }

    takeHeapSnapshot(filename) {
        const snapshotPath = path.join(__dirname, 'memory-snapshots', filename);
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        
        const snapshot = v8.writeHeapSnapshot(snapshotPath);
        console.log('[MemoryProfiler] Heap snapshot saved to:', snapshot);
        return snapshot;
    }

    startMonitoring(interval = 5000) {
        console.log('[MemoryProfiler] Starting memory monitoring...');
        console.log('[MemoryProfiler] Initial memory usage:', this.getMemoryUsage());
        console.log('[MemoryProfiler] Initial heap stats:', this.getHeapStatistics());

        this.monitoringInterval = setInterval(() => {
            const uptime = ((Date.now() - this.startTime) / 1000).toFixed(0);
            console.log(`\n[MemoryProfiler] === Memory Report (${uptime}s uptime) ===`);
            console.log('[MemoryProfiler] Memory Usage:', this.getMemoryUsage());
            console.log('[MemoryProfiler] Heap Stats:', this.getHeapStatistics());
            
            // Analyze heap spaces
            const heapSpaces = v8.getHeapSpaceStatistics();
            console.log('[MemoryProfiler] Heap Spaces:');
            heapSpaces.forEach(space => {
                const size = (space.space_size / 1024 / 1024).toFixed(2);
                const used = (space.space_used_size / 1024 / 1024).toFixed(2);
                const available = (space.space_available_size / 1024 / 1024).toFixed(2);
                console.log(`  - ${space.space_name}: ${used}/${size} MB (${available} MB available)`);
            });
        }, interval);
    }

    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            console.log('[MemoryProfiler] Monitoring stopped');
        }
    }

    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            uptime: (Date.now() - this.startTime) / 1000,
            memoryUsage: this.getMemoryUsage(),
            heapStatistics: this.getHeapStatistics(),
            heapSpaces: v8.getHeapSpaceStatistics().map(space => ({
                name: space.space_name,
                size: (space.space_size / 1024 / 1024).toFixed(2) + ' MB',
                used: (space.space_used_size / 1024 / 1024).toFixed(2) + ' MB',
                available: (space.space_available_size / 1024 / 1024).toFixed(2) + ' MB'
            }))
        };

        const reportPath = path.join(__dirname, 'memory-reports', `report-${Date.now()}.json`);
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
        
        console.log('[MemoryProfiler] Report saved to:', reportPath);
        return report;
    }
}

// Export singleton
const profiler = new MemoryProfiler();
module.exports = profiler;
