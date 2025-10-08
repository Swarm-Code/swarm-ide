/**
 * VideoService - Video processing service using ffmpeg
 *
 * Provides video metadata extraction, thumbnail generation,
 * and other video-related operations using ffmpeg.
 *
 * This service runs in the main process and is accessed via IPC.
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Set ffmpeg binary path
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoService {
    constructor() {
        this.thumbnailCache = new Map();
        this.metadataCache = new Map();
        this.tempDir = path.join(os.tmpdir(), 'swarm-ide-video-thumbnails');

        // Create temp directory for thumbnails
        this.ensureTempDir();
    }

    /**
     * Ensure temp directory exists
     */
    ensureTempDir() {
        try {
            if (!fs.existsSync(this.tempDir)) {
                fs.mkdirSync(this.tempDir, { recursive: true });
            }
        } catch (error) {
            console.error('[VideoService] Error creating temp directory:', error);
        }
    }

    /**
     * Get video metadata
     * @param {string} videoPath - Path to video file
     * @returns {Promise<Object>} Video metadata
     */
    async getMetadata(videoPath) {
        // Check cache first
        if (this.metadataCache.has(videoPath)) {
            return this.metadataCache.get(videoPath);
        }

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    console.error('[VideoService] Error getting metadata:', err);
                    reject(err);
                    return;
                }

                try {
                    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
                    const audioStream = metadata.streams.find(s => s.codec_type === 'audio');

                    const result = {
                        duration: metadata.format.duration,
                        size: metadata.format.size,
                        bitRate: metadata.format.bit_rate,
                        format: metadata.format.format_name,
                        video: videoStream ? {
                            codec: videoStream.codec_name,
                            width: videoStream.width,
                            height: videoStream.height,
                            fps: this.parseFps(videoStream.r_frame_rate),
                            bitRate: videoStream.bit_rate,
                            pixelFormat: videoStream.pix_fmt
                        } : null,
                        audio: audioStream ? {
                            codec: audioStream.codec_name,
                            sampleRate: audioStream.sample_rate,
                            channels: audioStream.channels,
                            bitRate: audioStream.bit_rate
                        } : null
                    };

                    // Cache the result
                    this.metadataCache.set(videoPath, result);

                    resolve(result);
                } catch (parseError) {
                    console.error('[VideoService] Error parsing metadata:', parseError);
                    reject(parseError);
                }
            });
        });
    }

    /**
     * Parse FPS from fraction string
     * @param {string} fpsString - FPS as fraction (e.g., "30000/1001")
     * @returns {number} FPS as decimal
     */
    parseFps(fpsString) {
        if (!fpsString) return 0;
        const parts = fpsString.split('/');
        if (parts.length === 2) {
            return Math.round((parseInt(parts[0]) / parseInt(parts[1])) * 100) / 100;
        }
        return parseFloat(fpsString);
    }

    /**
     * Generate thumbnail from video
     * @param {string} videoPath - Path to video file
     * @param {number} timestamp - Timestamp in seconds (default: 1)
     * @returns {Promise<string>} Path to generated thumbnail
     */
    async generateThumbnail(videoPath, timestamp = 1) {
        const cacheKey = `${videoPath}:${timestamp}`;

        // Check cache
        if (this.thumbnailCache.has(cacheKey)) {
            const thumbnailPath = this.thumbnailCache.get(cacheKey);
            if (fs.existsSync(thumbnailPath)) {
                return thumbnailPath;
            }
        }

        return new Promise((resolve, reject) => {
            const fileName = `thumb_${path.basename(videoPath, path.extname(videoPath))}_${timestamp}.png`;
            const outputPath = path.join(this.tempDir, fileName);

            ffmpeg(videoPath)
                .screenshots({
                    timestamps: [timestamp],
                    filename: fileName,
                    folder: this.tempDir,
                    size: '320x?'
                })
                .on('end', () => {
                    this.thumbnailCache.set(cacheKey, outputPath);
                    resolve(outputPath);
                })
                .on('error', (err) => {
                    console.error('[VideoService] Error generating thumbnail:', err);
                    reject(err);
                });
        });
    }

    /**
     * Generate multiple thumbnails for seek bar preview
     * @param {string} videoPath - Path to video file
     * @param {number} count - Number of thumbnails to generate
     * @returns {Promise<Array<string>>} Array of thumbnail paths
     */
    async generateSeekThumbnails(videoPath, count = 10) {
        try {
            const metadata = await this.getMetadata(videoPath);
            const duration = metadata.duration;

            if (!duration || duration <= 0) {
                throw new Error('Invalid video duration');
            }

            const interval = duration / (count + 1);
            const timestamps = [];

            for (let i = 1; i <= count; i++) {
                timestamps.push(i * interval);
            }

            const thumbnails = await Promise.all(
                timestamps.map(ts => this.generateThumbnail(videoPath, ts))
            );

            return thumbnails;
        } catch (error) {
            console.error('[VideoService] Error generating seek thumbnails:', error);
            throw error;
        }
    }

    /**
     * Format duration to human-readable string
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration (HH:MM:SS or MM:SS)
     */
    formatDuration(seconds) {
        if (!seconds || seconds < 0) return '00:00';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }

        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Format file size to human-readable string
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';

        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Clear thumbnail cache
     */
    clearThumbnailCache() {
        try {
            // Clear memory cache
            this.thumbnailCache.clear();

            // Clean up temp directory
            if (fs.existsSync(this.tempDir)) {
                const files = fs.readdirSync(this.tempDir);
                files.forEach(file => {
                    try {
                        fs.unlinkSync(path.join(this.tempDir, file));
                    } catch (err) {
                        console.error('[VideoService] Error deleting thumbnail:', err);
                    }
                });
            }
        } catch (error) {
            console.error('[VideoService] Error clearing thumbnail cache:', error);
        }
    }

    /**
     * Clear metadata cache
     */
    clearMetadataCache() {
        this.metadataCache.clear();
    }

    /**
     * Clear all caches
     */
    clearAllCaches() {
        this.clearThumbnailCache();
        this.clearMetadataCache();
    }
}

// Export singleton instance
const videoService = new VideoService();
module.exports = videoService;
