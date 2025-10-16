/**
 * SSHConnectionProgress - Shows real-time SSH connection progress
 *
 * Displays connection stages:
 * - Initializing
 * - Connecting to host
 * - Authenticating
 * - Establishing session
 * - Connected
 *
 * Usage:
 *   const progress = new SSHConnectionProgress();
 *   progress.show('server-name');
 *   progress.updateStage('connecting');
 *   progress.updateStage('authenticating');
 *   progress.complete();
 *   // or
 *   progress.error('Connection failed');
 */

const logger = require('../utils/Logger');

class SSHConnectionProgress {
    constructor() {
        this.overlay = null;
        this.container = null;
        this.isVisible = false;
        this.currentStage = null;
        this.serverName = '';

        this.stages = [
            { id: 'initializing', label: 'Initializing connection...', icon: '⚙️' },
            { id: 'connecting', label: 'Connecting to host...', icon: '🔌' },
            { id: 'authenticating', label: 'Authenticating...', icon: '🔐' },
            { id: 'establishing', label: 'Establishing session...', icon: '📡' },
            { id: 'loading', label: 'Loading workspace...', icon: '📂' },
            { id: 'complete', label: 'Connected successfully!', icon: '✓' }
        ];
    }

    /**
     * Show the progress indicator
     * @param {string} serverName - Name of the server being connected to
     */
    show(serverName = 'SSH Server') {
        this.serverName = serverName;
        this.currentStage = null;
        this.render();
        this.isVisible = true;
        logger.debug('sshProgress', 'Progress indicator shown for:', serverName);
    }

    /**
     * Update the current connection stage
     * @param {string} stageId - Stage identifier
     * @param {string} detail - Optional detail message
     */
    updateStage(stageId, detail = '') {
        if (!this.isVisible) return;

        this.currentStage = stageId;
        const stage = this.stages.find(s => s.id === stageId);

        if (!stage) {
            logger.warn('sshProgress', 'Unknown stage:', stageId);
            return;
        }

        logger.debug('sshProgress', 'Stage updated:', stageId, detail);
        this.updateStageDisplay(stageId, detail);
    }

    /**
     * Mark connection as complete
     */
    complete() {
        if (!this.isVisible) return;

        logger.info('sshProgress', 'Connection complete');
        this.updateStage('complete');

        // Auto-hide after 1 second
        setTimeout(() => {
            this.hide();
        }, 1000);
    }

    /**
     * Show error and hide
     * @param {string} errorMessage - Error message to display
     */
    error(errorMessage) {
        if (!this.isVisible) return;

        logger.error('sshProgress', 'Connection error:', errorMessage);

        const statusText = this.container.querySelector('.ssh-progress-status-text');
        const statusIcon = this.container.querySelector('.ssh-progress-status-icon');
        const errorBox = this.container.querySelector('.ssh-progress-error');

        if (statusText) statusText.textContent = 'Connection Failed';
        if (statusIcon) statusIcon.textContent = '✗';
        if (errorBox) {
            errorBox.textContent = errorMessage;
            errorBox.style.display = 'block';
        }

        // Mark all stages as failed
        const stageItems = this.container.querySelectorAll('.ssh-progress-stage-item');
        stageItems.forEach(item => {
            item.classList.remove('active', 'completed');
            item.classList.add('failed');
        });

        // Auto-hide after 3 seconds
        setTimeout(() => {
            this.hide();
        }, 3000);
    }

    /**
     * Hide the progress indicator
     */
    hide() {
        if (!this.isVisible) return;

        if (this.overlay && this.overlay.parentNode) {
            this.overlay.classList.add('ssh-progress-fade-out');
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    document.body.removeChild(this.overlay);
                }
                this.overlay = null;
                this.container = null;
            }, 200);
        }

        this.isVisible = false;
        logger.debug('sshProgress', 'Progress indicator hidden');
    }

    /**
     * Render the progress indicator
     */
    render() {
        // Remove existing overlay if any
        if (this.overlay && this.overlay.parentNode) {
            document.body.removeChild(this.overlay);
        }

        // Create overlay
        this.overlay = document.createElement('div');
        this.overlay.className = 'ssh-progress-overlay';

        // Create container
        this.container = document.createElement('div');
        this.container.className = 'ssh-progress-container';

        // Build HTML
        this.container.innerHTML = `
            <div class="ssh-progress-header">
                <div class="ssh-progress-status-icon">⏳</div>
                <div class="ssh-progress-status">
                    <div class="ssh-progress-status-text">Connecting to SSH Server</div>
                    <div class="ssh-progress-server-name">${this.escapeHtml(this.serverName)}</div>
                </div>
            </div>

            <div class="ssh-progress-stages">
                ${this.stages.map((stage, index) => `
                    <div class="ssh-progress-stage-item" data-stage="${stage.id}">
                        <div class="ssh-progress-stage-icon">${stage.icon}</div>
                        <div class="ssh-progress-stage-label">${stage.label}</div>
                        <div class="ssh-progress-stage-detail"></div>
                        <div class="ssh-progress-stage-spinner"></div>
                    </div>
                `).join('')}
            </div>

            <div class="ssh-progress-error" style="display: none;"></div>

            <div class="ssh-progress-footer">
                <button class="ssh-progress-cancel-btn" id="ssh-progress-cancel">Cancel</button>
            </div>
        `;

        this.overlay.appendChild(this.container);
        document.body.appendChild(this.overlay);

        // Setup cancel button
        const cancelBtn = this.container.querySelector('#ssh-progress-cancel');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hide();
                // TODO: Emit cancel event
            });
        }
    }

    /**
     * Update stage display
     * @param {string} stageId - Stage ID
     * @param {string} detail - Detail message
     */
    updateStageDisplay(stageId, detail = '') {
        const stageItems = this.container.querySelectorAll('.ssh-progress-stage-item');
        const currentStageIndex = this.stages.findIndex(s => s.id === stageId);

        stageItems.forEach((item, index) => {
            const itemStageId = item.getAttribute('data-stage');
            const spinner = item.querySelector('.ssh-progress-stage-spinner');
            const detailEl = item.querySelector('.ssh-progress-stage-detail');

            // Clear previous states
            item.classList.remove('active', 'completed', 'pending');

            if (index < currentStageIndex) {
                // Completed stages
                item.classList.add('completed');
                if (spinner) spinner.style.display = 'none';
            } else if (itemStageId === stageId) {
                // Current active stage
                item.classList.add('active');
                if (spinner) spinner.style.display = 'block';
                if (detailEl && detail) {
                    detailEl.textContent = detail;
                    detailEl.style.display = 'block';
                }
            } else {
                // Pending stages
                item.classList.add('pending');
                if (spinner) spinner.style.display = 'none';
            }
        });

        // Update header status
        const stage = this.stages.find(s => s.id === stageId);
        if (stage) {
            const statusText = this.container.querySelector('.ssh-progress-status-text');
            const statusIcon = this.container.querySelector('.ssh-progress-status-icon');

            if (statusText) statusText.textContent = stage.label;
            if (statusIcon) statusIcon.textContent = stage.icon;
        }
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} text - Text to escape
     * @returns {string} Escaped text
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

module.exports = SSHConnectionProgress;
