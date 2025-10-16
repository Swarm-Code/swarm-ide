/**
 * VideoPlayer - Component for playing video files
 *
 * Provides a full-featured video player with:
 * - HTML5 video playback
 * - Custom controls (play/pause, seek, volume, speed, fullscreen)
 * - Metadata display
 * - Keyboard shortcuts
 * - SSH file support with caching
 *
 * Usage:
 *   const player = new VideoPlayer(container, videoPath, electronAPI, sshContext);
 */

const eventBus = require('../modules/EventBus');
const sshMediaCache = require('../services/SSHMediaCache');

class VideoPlayer {
    constructor(container, videoPath, electronAPI, sshContext = null) {
        this.container = container;
        this.videoPath = videoPath;
        this.api = electronAPI;
        this.sshContext = sshContext;
        this.metadata = null;
        this.videoElement = null;
        this.isPlaying = false;
        this.currentVolume = 1;
        this.currentSpeed = 1;
        this.localVideoPath = null;
        this.isSSH = false;

        this.init();
    }

    /**
     * Initialize the video player
     */
    async init() {
        try {
            console.log('[VideoPlayer] Initializing player for:', this.videoPath);

            // Show loading state
            this.renderLoading();

            // Check if this is an SSH file
            this.isSSH = this.videoPath.startsWith('ssh://') || (this.sshContext && this.sshContext.isSSH);

            if (this.isSSH) {
                // Download SSH file to cache
                await this.downloadSSHVideo();
                this.localVideoPath = await this.localVideoPath; // Already set by downloadSSHVideo
            } else {
                // Local file - use directly
                this.localVideoPath = this.videoPath;
            }

            // Get file path for video element (now using local cached path if SSH)
            const pathResult = await this.api.videoGetFilePath(this.localVideoPath);
            if (!pathResult.success) {
                throw new Error('Failed to get video file path');
            }

            // Try to get metadata, but don't fail if it errors
            try {
                const metadataResult = await this.api.videoGetMetadata(this.videoPath);
                if (metadataResult.success) {
                    this.metadata = metadataResult.metadata;
                    console.log('[VideoPlayer] Metadata loaded:', this.metadata);
                } else {
                    console.warn('[VideoPlayer] Metadata extraction failed:', metadataResult.error);
                }
            } catch (metadataError) {
                console.warn('[VideoPlayer] Metadata extraction error (non-fatal):', metadataError);
                // Continue without metadata
            }

            // Render player
            this.render(pathResult.filePath);
            this.setupEventListeners();
            this.setupKeyboardShortcuts();

        } catch (error) {
            console.error('[VideoPlayer] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Download SSH video to cache
     */
    async downloadSSHVideo() {
        try {
            if (!this.sshContext) {
                throw new Error('SSH context required for SSH file');
            }

            const { connectionId, remotePath } = this.parseSSHPath();

            console.log('[VideoPlayer] Downloading SSH video:', { connectionId, remotePath });

            // Initialize cache if needed
            if (!sshMediaCache.isInitialized()) {
                await sshMediaCache.initialize(window.electronAPI);
            }

            // Update loading message for download
            this.updateLoadingMessage('Downloading video from SSH server...');

            // Download file to cache
            this.localVideoPath = await sshMediaCache.getCachedFile(
                connectionId,
                remotePath,
                (progress) => {
                    // Update progress
                    this.updateLoadingProgress(progress);
                }
            );

            console.log('[VideoPlayer] Video cached at:', this.localVideoPath);

        } catch (error) {
            console.error('[VideoPlayer] Error downloading SSH video:', error);
            throw new Error(`Failed to download video: ${error.message}`);
        }
    }

    /**
     * Parse SSH path to get connection ID and remote path
     */
    parseSSHPath() {
        let connectionId, remotePath;

        if (this.sshContext) {
            connectionId = this.sshContext.connectionId;
            // Remove ssh:// prefix and host from path if present
            if (this.videoPath.startsWith('ssh://')) {
                const host = this.sshContext.connectionConfig?.host;
                const sshPrefix = `ssh://${host}`;
                remotePath = this.videoPath.startsWith(sshPrefix)
                    ? this.videoPath.substring(sshPrefix.length)
                    : this.videoPath.substring(6); // Remove 'ssh://'
            } else {
                remotePath = this.videoPath;
            }
        } else {
            throw new Error('Cannot parse SSH path without SSH context');
        }

        return { connectionId, remotePath };
    }

    /**
     * Render loading state
     */
    renderLoading() {
        this.container.innerHTML = `
            <div class="video-loading">
                <div class="video-loading-spinner"></div>
                <p class="video-loading-message">Loading video...</p>
                <div class="video-loading-progress" style="display: none;">
                    <div class="video-loading-progress-bar" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Update loading message
     * @param {string} message - Loading message
     */
    updateLoadingMessage(message) {
        const loadingMessage = this.container.querySelector('.video-loading-message');
        if (loadingMessage) {
            loadingMessage.textContent = message;
        }

        // Show progress bar when downloading
        const progressContainer = this.container.querySelector('.video-loading-progress');
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
    }

    /**
     * Update loading progress
     * @param {Object} progress - Progress info
     */
    updateLoadingProgress(progress) {
        const progressBar = this.container.querySelector('.video-loading-progress-bar');
        if (progressBar && progress.percent) {
            progressBar.style.width = `${progress.percent}%`;
        }
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="video-error">
                <div class="video-error-icon">⚠️</div>
                <h3>Video Load Error</h3>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
    }

    /**
     * Render the video player
     * @param {string} videoUrl - Video file:// URL
     */
    render(videoUrl) {
        this.container.innerHTML = `
            <div class="video-player">
                <!-- Video Element -->
                <div class="video-container">
                    <video
                        class="video-element"
                        src="${videoUrl}"
                        preload="metadata">
                        Your browser does not support video playback.
                    </video>
                </div>

                <!-- Controls -->
                <div class="video-controls">
                    <!-- Top Bar: Metadata -->
                    <div class="video-info-bar">
                        ${this.renderMetadataInfo()}
                    </div>

                    <!-- Progress Bar -->
                    <div class="video-progress-container">
                        <div class="video-progress-bar">
                            <div class="video-progress-filled"></div>
                            <div class="video-progress-handle"></div>
                        </div>
                        <div class="video-time-display">
                            <span class="video-time-current">00:00</span>
                            <span class="video-time-separator">/</span>
                            <span class="video-time-duration">00:00</span>
                        </div>
                    </div>

                    <!-- Control Buttons -->
                    <div class="video-control-buttons">
                        <div class="video-controls-left">
                            <button class="video-btn video-play-btn" title="Play (Space)">
                                <span class="video-play-icon">▶️</span>
                            </button>
                            <div class="video-volume-control">
                                <button class="video-btn video-volume-btn" title="Mute (M)">
                                    <span class="video-volume-icon">🔊</span>
                                </button>
                                <input
                                    type="range"
                                    class="video-volume-slider"
                                    min="0"
                                    max="100"
                                    value="100"
                                    title="Volume">
                            </div>
                        </div>

                        <div class="video-controls-right">
                            <div class="video-speed-control">
                                <button class="video-btn video-speed-btn" title="Playback Speed">
                                    <span class="video-speed-text">1x</span>
                                </button>
                                <div class="video-speed-menu">
                                    <div class="video-speed-option" data-speed="0.25">0.25x</div>
                                    <div class="video-speed-option" data-speed="0.5">0.5x</div>
                                    <div class="video-speed-option" data-speed="0.75">0.75x</div>
                                    <div class="video-speed-option" data-speed="1" data-selected="true">1x</div>
                                    <div class="video-speed-option" data-speed="1.25">1.25x</div>
                                    <div class="video-speed-option" data-speed="1.5">1.5x</div>
                                    <div class="video-speed-option" data-speed="2">2x</div>
                                </div>
                            </div>
                            <button class="video-btn video-fullscreen-btn" title="Fullscreen (F)">
                                <span class="video-fullscreen-icon">⛶</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render metadata information
     * @returns {string} HTML for metadata display
     */
    renderMetadataInfo() {
        if (!this.metadata || !this.metadata.video) {
            return '<div class="video-info">Video will load metadata when playback starts...</div>';
        }

        const { video, duration } = this.metadata;
        const durationStr = duration ? this.formatDuration(duration) : 'Unknown';
        const resolution = (video.width && video.height) ? `${video.width}x${video.height}` : 'Unknown';
        const fps = video.fps ? `${video.fps} FPS` : '';
        const codec = video.codec ? video.codec.toUpperCase() : '';

        return `
            <div class="video-info">
                <span class="video-info-item">${resolution}</span>
                ${fps ? `<span class="video-info-separator">•</span><span class="video-info-item">${fps}</span>` : ''}
                ${codec ? `<span class="video-info-separator">•</span><span class="video-info-item">${codec}</span>` : ''}
                ${durationStr !== 'Unknown' ? `<span class="video-info-separator">•</span><span class="video-info-item">${durationStr}</span>` : ''}
            </div>
        `;
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.videoElement = this.container.querySelector('.video-element');
        if (!this.videoElement) return;

        // Video events
        this.videoElement.addEventListener('loadedmetadata', () => this.onVideoLoaded());
        this.videoElement.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.videoElement.addEventListener('ended', () => this.onVideoEnded());
        this.videoElement.addEventListener('play', () => this.onPlay());
        this.videoElement.addEventListener('pause', () => this.onPause());

        // Play/Pause button
        const playBtn = this.container.querySelector('.video-play-btn');
        playBtn?.addEventListener('click', () => this.togglePlay());

        // Progress bar
        const progressBar = this.container.querySelector('.video-progress-bar');
        progressBar?.addEventListener('click', (e) => this.seekTo(e));

        // Volume
        const volumeBtn = this.container.querySelector('.video-volume-btn');
        volumeBtn?.addEventListener('click', () => this.toggleMute());

        const volumeSlider = this.container.querySelector('.video-volume-slider');
        volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value / 100));

        // Speed control
        const speedBtn = this.container.querySelector('.video-speed-btn');
        const speedMenu = this.container.querySelector('.video-speed-menu');

        speedBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            speedMenu?.classList.toggle('show');
        });

        // Click outside to close speed menu
        document.addEventListener('click', () => {
            speedMenu?.classList.remove('show');
        });

        const speedOptions = this.container.querySelectorAll('.video-speed-option');
        speedOptions.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const speed = parseFloat(option.dataset.speed);
                this.setSpeed(speed);
                speedMenu?.classList.remove('show');
            });
        });

        // Fullscreen
        const fullscreenBtn = this.container.querySelector('.video-fullscreen-btn');
        fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    }

    /**
     * Setup keyboard shortcuts
     */
    setupKeyboardShortcuts() {
        this.keyHandler = (e) => {
            // Only handle if video player is visible
            if (!this.videoElement) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                case 'k':
                    e.preventDefault();
                    this.togglePlay();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    this.skip(-5);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    this.skip(5);
                    break;
                case 'arrowup':
                    e.preventDefault();
                    this.changeVolume(0.1);
                    break;
                case 'arrowdown':
                    e.preventDefault();
                    this.changeVolume(-0.1);
                    break;
                case 'm':
                    e.preventDefault();
                    this.toggleMute();
                    break;
                case 'f':
                    e.preventDefault();
                    this.toggleFullscreen();
                    break;
                case '0':
                    e.preventDefault();
                    this.videoElement.currentTime = 0;
                    break;
            }
        };

        document.addEventListener('keydown', this.keyHandler);
    }

    /**
     * Video loaded event handler
     */
    onVideoLoaded() {
        const duration = this.videoElement.duration;
        const durationDisplay = this.container.querySelector('.video-time-duration');
        if (durationDisplay) {
            durationDisplay.textContent = this.formatDuration(duration);
        }
    }

    /**
     * Time update event handler
     */
    onTimeUpdate() {
        const current = this.videoElement.currentTime;
        const duration = this.videoElement.duration;
        const progress = (current / duration) * 100;

        // Update progress bar
        const progressFilled = this.container.querySelector('.video-progress-filled');
        if (progressFilled) {
            progressFilled.style.width = `${progress}%`;
        }

        // Update time display
        const currentDisplay = this.container.querySelector('.video-time-current');
        if (currentDisplay) {
            currentDisplay.textContent = this.formatDuration(current);
        }
    }

    /**
     * Video ended event handler
     */
    onVideoEnded() {
        this.isPlaying = false;
        this.updatePlayButton();
    }

    /**
     * Play event handler
     */
    onPlay() {
        this.isPlaying = true;
        this.updatePlayButton();
    }

    /**
     * Pause event handler
     */
    onPause() {
        this.isPlaying = false;
        this.updatePlayButton();
    }

    /**
     * Toggle play/pause
     */
    togglePlay() {
        if (!this.videoElement) return;

        if (this.videoElement.paused) {
            this.videoElement.play();
        } else {
            this.videoElement.pause();
        }
    }

    /**
     * Update play button icon
     */
    updatePlayButton() {
        const playIcon = this.container.querySelector('.video-play-icon');
        if (playIcon) {
            playIcon.textContent = this.isPlaying ? '⏸️' : '▶️';
        }
    }

    /**
     * Seek to position
     * @param {Event} e - Click event
     */
    seekTo(e) {
        if (!this.videoElement) return;

        const progressBar = e.currentTarget;
        const rect = progressBar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percentage = clickX / width;

        this.videoElement.currentTime = percentage * this.videoElement.duration;
    }

    /**
     * Skip forward or backward
     * @param {number} seconds - Seconds to skip (negative for backward)
     */
    skip(seconds) {
        if (!this.videoElement) return;
        this.videoElement.currentTime += seconds;
    }

    /**
     * Set volume
     * @param {number} volume - Volume level (0-1)
     */
    setVolume(volume) {
        if (!this.videoElement) return;

        this.currentVolume = Math.max(0, Math.min(1, volume));
        this.videoElement.volume = this.currentVolume;
        this.updateVolumeIcon();

        const volumeSlider = this.container.querySelector('.video-volume-slider');
        if (volumeSlider) {
            volumeSlider.value = this.currentVolume * 100;
        }
    }

    /**
     * Change volume by delta
     * @param {number} delta - Volume change amount
     */
    changeVolume(delta) {
        this.setVolume(this.currentVolume + delta);
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        if (!this.videoElement) return;

        if (this.videoElement.volume > 0) {
            this.videoElement.dataset.previousVolume = this.videoElement.volume;
            this.setVolume(0);
        } else {
            const previousVolume = parseFloat(this.videoElement.dataset.previousVolume) || 1;
            this.setVolume(previousVolume);
        }
    }

    /**
     * Update volume icon based on current volume
     */
    updateVolumeIcon() {
        const volumeIcon = this.container.querySelector('.video-volume-icon');
        if (!volumeIcon) return;

        if (this.currentVolume === 0) {
            volumeIcon.textContent = '🔇';
        } else if (this.currentVolume < 0.5) {
            volumeIcon.textContent = '🔉';
        } else {
            volumeIcon.textContent = '🔊';
        }
    }

    /**
     * Set playback speed
     * @param {number} speed - Playback speed
     */
    setSpeed(speed) {
        if (!this.videoElement) return;

        this.currentSpeed = speed;
        this.videoElement.playbackRate = speed;

        // Update UI
        const speedText = this.container.querySelector('.video-speed-text');
        if (speedText) {
            speedText.textContent = `${speed}x`;
        }

        // Update selected option
        const speedOptions = this.container.querySelectorAll('.video-speed-option');
        speedOptions.forEach(option => {
            if (parseFloat(option.dataset.speed) === speed) {
                option.dataset.selected = 'true';
            } else {
                delete option.dataset.selected;
            }
        });
    }

    /**
     * Toggle fullscreen
     */
    toggleFullscreen() {
        const videoContainer = this.container.querySelector('.video-container');
        if (!videoContainer) return;

        if (!document.fullscreenElement) {
            videoContainer.requestFullscreen().catch(err => {
                console.error('[VideoPlayer] Error entering fullscreen:', err);
            });
        } else {
            document.exitFullscreen();
        }
    }

    /**
     * Format duration to HH:MM:SS or MM:SS
     * @param {number} seconds - Duration in seconds
     * @returns {string} Formatted duration
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
     * Escape HTML
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Cleanup
     */
    destroy() {
        // Remove keyboard shortcuts
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
        }

        // Pause and unload video
        if (this.videoElement) {
            this.videoElement.pause();
            this.videoElement.src = '';
            this.videoElement.load();
        }

        // Clear container
        this.container.innerHTML = '';
    }
}

module.exports = VideoPlayer;
