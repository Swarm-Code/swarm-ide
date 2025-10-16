/**
 * AudioPlayer - Component for playing audio files
 *
 * Provides audio playback with:
 * - Play/pause controls
 * - Seek bar with time display
 * - Volume control
 * - Audio metadata display
 * - SSH file support with caching
 *
 * Usage:
 *   const player = new AudioPlayer(container, audioPath, sshContext);
 */

const eventBus = require('../modules/EventBus');
const sshMediaCache = require('../services/SSHMediaCache');

class AudioPlayer {
    constructor(container, audioPath, sshContext = null) {
        this.container = container;
        this.audioPath = audioPath;
        this.sshContext = sshContext;
        this.audioElement = null;
        this.localAudioPath = null;
        this.isSSH = false;
        this.isPlaying = false;
        this.duration = 0;
        this.currentTime = 0;

        this.init();
    }

    /**
     * Initialize the audio player
     */
    async init() {
        try {
            console.log('[AudioPlayer] Initializing for:', this.audioPath);

            // Check if this is an SSH file
            this.isSSH = this.audioPath.startsWith('ssh://') || (this.sshContext && this.sshContext.isSSH);

            if (this.isSSH) {
                // Download SSH file to cache
                await this.downloadSSHAudio();
            } else {
                // Local file - use directly
                this.localAudioPath = this.audioPath;
            }

            this.render();
            this.setupEventListeners();
        } catch (error) {
            console.error('[AudioPlayer] Initialization error:', error);
            this.renderError(error.message);
        }
    }

    /**
     * Download SSH audio to cache
     */
    async downloadSSHAudio() {
        try {
            // Show loading state
            this.renderLoading();

            if (!this.sshContext) {
                throw new Error('SSH context required for SSH file');
            }

            const { connectionId, remotePath } = this.parseSSHPath();

            console.log('[AudioPlayer] Downloading SSH audio:', { connectionId, remotePath });

            // Initialize cache if needed
            if (!sshMediaCache.isInitialized()) {
                await sshMediaCache.initialize(window.electronAPI);
            }

            // Download file to cache
            this.localAudioPath = await sshMediaCache.getCachedFile(
                connectionId,
                remotePath,
                (progress) => {
                    // Update progress
                    this.updateLoadingProgress(progress);
                }
            );

            console.log('[AudioPlayer] Audio cached at:', this.localAudioPath);

        } catch (error) {
            console.error('[AudioPlayer] Error downloading SSH audio:', error);
            throw new Error(`Failed to download audio: ${error.message}`);
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
            if (this.audioPath.startsWith('ssh://')) {
                const host = this.sshContext.connectionConfig?.host;
                const sshPrefix = `ssh://${host}`;
                remotePath = this.audioPath.startsWith(sshPrefix)
                    ? this.audioPath.substring(sshPrefix.length)
                    : this.audioPath.substring(6); // Remove 'ssh://'
            } else {
                remotePath = this.audioPath;
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
            <div class="audio-loading">
                <div class="audio-loading-spinner"></div>
                <h3>Loading Audio...</h3>
                <p>Downloading from SSH server</p>
                <div class="audio-loading-progress">
                    <div class="audio-loading-progress-bar" style="width: 0%"></div>
                </div>
            </div>
        `;
    }

    /**
     * Update loading progress
     * @param {Object} progress - Progress info
     */
    updateLoadingProgress(progress) {
        const progressBar = this.container.querySelector('.audio-loading-progress-bar');
        if (progressBar && progress.percent) {
            progressBar.style.width = `${progress.percent}%`;
        }
    }

    /**
     * Render the audio player
     */
    render() {
        // Use file:// protocol for local files (including cached SSH files)
        const audioSrc = `file://${this.localAudioPath}`;

        this.container.innerHTML = `
            <div class="audio-player">
                <!-- Header -->
                <div class="audio-header">
                    <div class="audio-icon">🎵</div>
                    <div class="audio-metadata">
                        <h3 class="audio-title">${this.getFileName()}</h3>
                        <p class="audio-info" id="audio-info">Loading...</p>
                    </div>
                </div>

                <!-- Waveform Visualization Placeholder -->
                <div class="audio-waveform">
                    <div class="audio-waveform-placeholder">
                        <span>♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫ ♪ ♫</span>
                    </div>
                </div>

                <!-- Progress Bar -->
                <div class="audio-progress-container">
                    <span class="audio-time" id="current-time">0:00</span>
                    <div class="audio-progress" id="audio-progress">
                        <div class="audio-progress-bar" id="progress-bar"></div>
                        <div class="audio-progress-handle" id="progress-handle"></div>
                    </div>
                    <span class="audio-time" id="duration-time">0:00</span>
                </div>

                <!-- Controls -->
                <div class="audio-controls">
                    <button class="audio-btn" id="play-pause" title="Play/Pause (Space)">
                        <span id="play-icon">▶</span>
                    </button>
                    <button class="audio-btn" id="stop" title="Stop">
                        <span>⏹</span>
                    </button>
                    <button class="audio-btn" id="rewind" title="Rewind 10s (←)">
                        <span>⏪</span>
                    </button>
                    <button class="audio-btn" id="forward" title="Forward 10s (→)">
                        <span>⏩</span>
                    </button>
                    <div class="audio-volume-container">
                        <button class="audio-btn" id="mute" title="Mute (M)">
                            <span id="volume-icon">🔊</span>
                        </button>
                        <input type="range" id="volume-slider" class="audio-volume-slider"
                               min="0" max="100" value="100" title="Volume">
                    </div>
                    <button class="audio-btn" id="loop" title="Loop (L)">
                        <span id="loop-icon">🔁</span>
                    </button>
                </div>

                <!-- Hidden Audio Element -->
                <audio id="audio-element" preload="metadata">
                    <source src="${audioSrc}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>
        `;
    }

    /**
     * Get file name from path
     * @returns {string} File name
     */
    getFileName() {
        const path = this.audioPath || this.localAudioPath || '';
        return path.split('/').pop() || 'Audio File';
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        this.audioElement = this.container.querySelector('#audio-element');

        if (!this.audioElement) return;

        // Audio metadata loaded
        this.audioElement.addEventListener('loadedmetadata', () => {
            this.duration = this.audioElement.duration;
            this.updateDurationDisplay();
            this.updateMetadata();
        });

        // Time update
        this.audioElement.addEventListener('timeupdate', () => {
            this.currentTime = this.audioElement.currentTime;
            this.updateTimeDisplay();
            this.updateProgressBar();
        });

        // Audio ended
        this.audioElement.addEventListener('ended', () => {
            this.isPlaying = false;
            this.updatePlayPauseButton();
            if (!this.audioElement.loop) {
                this.currentTime = 0;
                this.updateProgressBar();
            }
        });

        // Audio error
        this.audioElement.addEventListener('error', () => {
            this.renderError('Failed to load audio file');
        });

        // Play/Pause button
        this.container.querySelector('#play-pause')?.addEventListener('click', () => {
            this.togglePlayPause();
        });

        // Stop button
        this.container.querySelector('#stop')?.addEventListener('click', () => {
            this.stop();
        });

        // Rewind button
        this.container.querySelector('#rewind')?.addEventListener('click', () => {
            this.seek(this.currentTime - 10);
        });

        // Forward button
        this.container.querySelector('#forward')?.addEventListener('click', () => {
            this.seek(this.currentTime + 10);
        });

        // Progress bar seeking
        const progressContainer = this.container.querySelector('#audio-progress');
        progressContainer?.addEventListener('click', (e) => {
            const rect = progressContainer.getBoundingClientRect();
            const percent = (e.clientX - rect.left) / rect.width;
            this.seek(percent * this.duration);
        });

        // Volume slider
        const volumeSlider = this.container.querySelector('#volume-slider');
        volumeSlider?.addEventListener('input', (e) => {
            this.setVolume(e.target.value / 100);
        });

        // Mute button
        this.container.querySelector('#mute')?.addEventListener('click', () => {
            this.toggleMute();
        });

        // Loop button
        this.container.querySelector('#loop')?.addEventListener('click', () => {
            this.toggleLoop();
        });

        // Keyboard shortcuts
        this.keyHandler = (e) => {
            // Don't interfere with other input elements
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case ' ':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.seek(this.currentTime - 10);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.seek(this.currentTime + 10);
                    break;
                case 'm':
                case 'M':
                    e.preventDefault();
                    this.toggleMute();
                    break;
                case 'l':
                case 'L':
                    e.preventDefault();
                    this.toggleLoop();
                    break;
            }
        };

        document.addEventListener('keydown', this.keyHandler);
    }

    /**
     * Toggle play/pause
     */
    togglePlayPause() {
        if (this.isPlaying) {
            this.pause();
        } else {
            this.play();
        }
    }

    /**
     * Play audio
     */
    play() {
        if (this.audioElement) {
            this.audioElement.play();
            this.isPlaying = true;
            this.updatePlayPauseButton();
        }
    }

    /**
     * Pause audio
     */
    pause() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.isPlaying = false;
            this.updatePlayPauseButton();
        }
    }

    /**
     * Stop audio
     */
    stop() {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
            this.isPlaying = false;
            this.currentTime = 0;
            this.updatePlayPauseButton();
            this.updateProgressBar();
        }
    }

    /**
     * Seek to time
     * @param {number} time - Time in seconds
     */
    seek(time) {
        if (this.audioElement) {
            this.audioElement.currentTime = Math.max(0, Math.min(time, this.duration));
        }
    }

    /**
     * Set volume
     * @param {number} volume - Volume (0-1)
     */
    setVolume(volume) {
        if (this.audioElement) {
            this.audioElement.volume = Math.max(0, Math.min(1, volume));
            this.updateVolumeIcon();
        }
    }

    /**
     * Toggle mute
     */
    toggleMute() {
        if (this.audioElement) {
            this.audioElement.muted = !this.audioElement.muted;
            this.updateVolumeIcon();
        }
    }

    /**
     * Toggle loop
     */
    toggleLoop() {
        if (this.audioElement) {
            this.audioElement.loop = !this.audioElement.loop;
            this.updateLoopIcon();
        }
    }

    /**
     * Update play/pause button
     */
    updatePlayPauseButton() {
        const playIcon = this.container.querySelector('#play-icon');
        if (playIcon) {
            playIcon.textContent = this.isPlaying ? '⏸' : '▶';
        }
    }

    /**
     * Update volume icon
     */
    updateVolumeIcon() {
        const volumeIcon = this.container.querySelector('#volume-icon');
        if (volumeIcon && this.audioElement) {
            if (this.audioElement.muted || this.audioElement.volume === 0) {
                volumeIcon.textContent = '🔇';
            } else if (this.audioElement.volume < 0.5) {
                volumeIcon.textContent = '🔉';
            } else {
                volumeIcon.textContent = '🔊';
            }
        }
    }

    /**
     * Update loop icon
     */
    updateLoopIcon() {
        const loopIcon = this.container.querySelector('#loop-icon');
        const loopBtn = this.container.querySelector('#loop');
        if (loopIcon && this.audioElement) {
            if (this.audioElement.loop) {
                loopBtn.classList.add('active');
            } else {
                loopBtn.classList.remove('active');
            }
        }
    }

    /**
     * Update time display
     */
    updateTimeDisplay() {
        const currentTimeEl = this.container.querySelector('#current-time');
        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(this.currentTime);
        }
    }

    /**
     * Update duration display
     */
    updateDurationDisplay() {
        const durationEl = this.container.querySelector('#duration-time');
        if (durationEl) {
            durationEl.textContent = this.formatTime(this.duration);
        }
    }

    /**
     * Update progress bar
     */
    updateProgressBar() {
        const progressBar = this.container.querySelector('#progress-bar');
        const progressHandle = this.container.querySelector('#progress-handle');

        if (progressBar && this.duration > 0) {
            const percent = (this.currentTime / this.duration) * 100;
            progressBar.style.width = `${percent}%`;
            if (progressHandle) {
                progressHandle.style.left = `${percent}%`;
            }
        }
    }

    /**
     * Update metadata display
     */
    updateMetadata() {
        const infoEl = this.container.querySelector('#audio-info');
        if (infoEl) {
            infoEl.textContent = `Duration: ${this.formatTime(this.duration)}`;
        }
    }

    /**
     * Format time in seconds to MM:SS
     * @param {number} seconds - Time in seconds
     * @returns {string} Formatted time
     */
    formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) {
            return '0:00';
        }

        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Render error state
     * @param {string} message - Error message
     */
    renderError(message) {
        this.container.innerHTML = `
            <div class="audio-error">
                <div class="audio-error-icon">⚠️</div>
                <h3>Audio Load Error</h3>
                <p>${this.escapeHtml(message)}</p>
            </div>
        `;
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
        // Pause and cleanup audio
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.src = '';
        }

        // Remove keyboard shortcuts
        if (this.keyHandler) {
            document.removeEventListener('keydown', this.keyHandler);
        }

        // Clear container
        this.container.innerHTML = '';
    }
}

module.exports = AudioPlayer;
