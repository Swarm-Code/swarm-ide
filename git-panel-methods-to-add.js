// Methods to add to GitPanel.js before the destroy() method

    /**
     * Fetch changes from remote
     */
    async fetchChanges() {
        const { gitService, gitBranchService } = getGitServices();
        if (!gitService || !gitBranchService) {
            console.error('[GitPanel] Git services not available for fetch');
            return;
        }

        try {
            console.log('[GitPanel] Starting fetch operation');

            // Update button state
            const originalText = this.fetchBtn.textContent;
            this.fetchBtn.textContent = 'Fetching...';
            this.fetchBtn.disabled = true;

            // Emit fetch started event
            eventBus.emit('git:fetch-started', {
                timestamp: Date.now()
            });

            console.log('[GitPanel] Calling repository.fetch()');
            const repository = gitService.getRepository();
            await repository.fetch();

            console.log('[GitPanel] Fetch completed successfully');

            // Refresh upstream status
            console.log('[GitPanel] Refreshing upstream status after fetch');
            await this.updateUpstreamStatus();

            // Emit fetch completed event
            eventBus.emit('git:fetch-completed', {
                timestamp: Date.now()
            });

            this.showSuccess('Fetched changes from origin');
            console.log('[GitPanel] Fetch operation complete, status updated');
        } catch (error) {
            console.error('[GitPanel] Fetch failed:', error);
            console.error('[GitPanel] Fetch error details:', error.message, error.stack);

            // Emit fetch failed event
            eventBus.emit('git:fetch-failed', {
                error: error.message,
                timestamp: Date.now()
            });

            this.showError('Failed to fetch: ' + error.message);
        } finally {
            // Restore button state
            this.fetchBtn.textContent = '↻ Fetch';
            this.fetchBtn.disabled = false;
        }
    }

    /**
     * Push changes to remote
     */
    async pushChanges() {
        const { gitService, gitBranchService } = getGitServices();
        if (!gitService || !gitBranchService) {
            console.error('[GitPanel] Git services not available for push');
            return;
        }

        try {
            console.log('[GitPanel] Starting push operation');

            // Emit push started event
            eventBus.emit('git:push-started', {
                timestamp: Date.now()
            });

            console.log('[GitPanel] Calling repository.push()');
            const repository = gitService.getRepository();
            await repository.push();

            console.log('[GitPanel] Push completed successfully');

            // Refresh upstream status
            console.log('[GitPanel] Refreshing upstream status after push');
            await this.updateUpstreamStatus();

            // Emit push completed event
            eventBus.emit('git:push-completed', {
                timestamp: Date.now()
            });

            this.showSuccess('Pushed changes to origin');
            console.log('[GitPanel] Push operation complete, status updated');
        } catch (error) {
            console.error('[GitPanel] Push failed:', error);
            console.error('[GitPanel] Push error details:', error.message, error.stack);

            // Emit push failed event
            eventBus.emit('git:push-failed', {
                error: error.message,
                timestamp: Date.now()
            });

            this.showError('Failed to push: ' + error.message);
        }
    }

    /**
     * Update upstream status (ahead/behind counts)
     */
    async updateUpstreamStatus() {
        const { gitBranchService } = getGitServices();
        if (!gitBranchService) {
            console.warn('[GitPanel] GitBranchService not available for upstream status');
            return;
        }

        try {
            console.log('[GitPanel] Updating upstream status');

            // Get upstream status from GitBranchService
            const status = await gitBranchService.getUpstreamStatus({ useCache: false });
            this.upstreamStatus = status;

            console.log('[GitPanel] Upstream status retrieved:', status);

            // Render the status indicators
            this.renderUpstreamStatus();
        } catch (error) {
            console.error('[GitPanel] Failed to update upstream status:', error);
            console.error('[GitPanel] Upstream status error details:', error.message);
        }
    }

    /**
     * Render upstream status indicators (ahead/behind)
     */
    renderUpstreamStatus() {
        if (!this.upstreamStatusIndicator || !this.upstreamStatus) {
            console.log('[GitPanel] Cannot render upstream status - indicator or status missing');
            return;
        }

        const { ahead, behind, hasUpstream, upstream } = this.upstreamStatus;

        console.log('[GitPanel] Rendering upstream status:', { ahead, behind, hasUpstream, upstream });

        // Clear previous content
        this.upstreamStatusIndicator.innerHTML = '';

        if (!hasUpstream) {
            console.log('[GitPanel] No upstream configured, hiding status indicator');
            this.upstreamStatusIndicator.style.display = 'none';
            return;
        }

        // Show indicator
        this.upstreamStatusIndicator.style.display = 'flex';

        // Create ahead indicator (push)
        if (ahead > 0) {
            const aheadSpan = document.createElement('span');
            aheadSpan.textContent = `↑${ahead}`;
            aheadSpan.style.cssText = `
                color: #28a745;
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background-color 0.2s;
            `;
            aheadSpan.title = `${ahead} commit${ahead > 1 ? 's' : ''} ahead of ${upstream}. Click to push.`;
            aheadSpan.addEventListener('mouseenter', () => {
                aheadSpan.style.backgroundColor = 'rgba(40, 167, 69, 0.2)';
            });
            aheadSpan.addEventListener('mouseleave', () => {
                aheadSpan.style.backgroundColor = 'transparent';
            });
            aheadSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[GitPanel] Ahead indicator clicked, triggering push');
                this.pushChanges();
            });
            this.upstreamStatusIndicator.appendChild(aheadSpan);
        }

        // Create behind indicator (pull)
        if (behind > 0) {
            const behindSpan = document.createElement('span');
            behindSpan.textContent = `↓${behind}`;
            behindSpan.style.cssText = `
                color: #ffc107;
                cursor: pointer;
                padding: 2px 4px;
                border-radius: 3px;
                transition: background-color 0.2s;
            `;
            behindSpan.title = `${behind} commit${behind > 1 ? 's' : ''} behind ${upstream}. Click to pull.`;
            behindSpan.addEventListener('mouseenter', () => {
                behindSpan.style.backgroundColor = 'rgba(255, 193, 7, 0.2)';
            });
            behindSpan.addEventListener('mouseleave', () => {
                behindSpan.style.backgroundColor = 'transparent';
            });
            behindSpan.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('[GitPanel] Behind indicator clicked, triggering pull');
                this.pullChanges();
            });
            this.upstreamStatusIndicator.appendChild(behindSpan);
        }

        // If no ahead/behind but has upstream, show sync indicator
        if (ahead === 0 && behind === 0) {
            const syncSpan = document.createElement('span');
            syncSpan.textContent = '✓';
            syncSpan.style.cssText = 'color: #28a745;';
            syncSpan.title = `Up to date with ${upstream}`;
            this.upstreamStatusIndicator.appendChild(syncSpan);
        }

        console.log('[GitPanel] Upstream status rendered successfully');
    }

    /**
     * Start auto-refresh timer for upstream status
     */
    startUpstreamStatusAutoRefresh() {
        // Clear existing interval
        if (this.upstreamStatusRefreshInterval) {
            clearInterval(this.upstreamStatusRefreshInterval);
        }

        console.log('[GitPanel] Starting upstream status auto-refresh (30 second interval)');

        // Refresh every 30 seconds
        this.upstreamStatusRefreshInterval = setInterval(() => {
            console.log('[GitPanel] Auto-refreshing upstream status');
            this.updateUpstreamStatus();
        }, 30000); // 30 seconds
    }

    /**
     * Stop auto-refresh timer for upstream status
     */
    stopUpstreamStatusAutoRefresh() {
        if (this.upstreamStatusRefreshInterval) {
            console.log('[GitPanel] Stopping upstream status auto-refresh');
            clearInterval(this.upstreamStatusRefreshInterval);
            this.upstreamStatusRefreshInterval = null;
        }
    }
