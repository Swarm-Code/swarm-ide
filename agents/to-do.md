# Git Integration Enhancement - Comprehensive TODO

**Project:** Swarm IDE Git Integration Improvements
**Created:** 2025-01-08
**Status:** In Progress
**Based On:** VS Code & Zed Git Implementation Analysis

---

## 📋 Table of Contents

1. [Phase 1: Critical Fixes (Must Have)](#phase-1-critical-fixes-must-have)
2. [Phase 2: Quality of Life (Should Have)](#phase-2-quality-of-life-should-have)
3. [Phase 3: Advanced Features (Nice to Have)](#phase-3-advanced-features-nice-to-have)
4. [Implementation Guidelines](#implementation-guidelines)
5. [Testing Checklist](#testing-checklist)
6. [Known Issues](#known-issues)
7. [Resources](#resources)

---

## 🔴 Phase 1: Critical Fixes (Must Have)

These are the highest priority fixes that address core functionality issues and UX problems reported by users.

### 1.1 Auto-Refresh Commit History

**Priority:** CRITICAL
**Estimated Time:** 2-3 hours
**Status:** In Progress

#### Problem Statement
Currently, when a user commits changes, the commit history panel does not automatically update. The user must manually click the refresh button or close/reopen the git panel to see their new commit. This breaks the expected workflow and makes the IDE feel unresponsive.

#### Current Behavior
1. User stages files
2. User enters commit message
3. User clicks "Commit" button
4. Commit succeeds (shown in console)
5. **Commit history does NOT update** ❌
6. User must manually refresh to see the commit

#### Expected Behavior (VS Code Pattern)
1. User stages files
2. User enters commit message
3. User clicks "Commit" button
4. Commit succeeds
5. **Commit history automatically refreshes** ✅
6. New commit appears at top of list immediately
7. Badge shows updated commit count

#### Implementation Steps

**Step 1.1a: Add Auto-Refresh After Commit**

*File:* `src/components/GitPanel.js`
*Method:* `commitChanges()` (around line 722)

```javascript
async commitChanges() {
    try {
        const { gitService } = getGitServices();
        if (!gitService) return;

        const message = this.commitMessageInput.value.trim();
        if (!message) {
            this.showError('Commit message cannot be empty');
            return;
        }

        console.log('[GitPanel] Committing with message:', message);

        // Perform commit
        const success = await gitService.commit(message);

        if (success) {
            // Clear commit message input
            this.commitMessageInput.value = '';

            // **NEW: Auto-refresh commit history immediately**
            await this.loadCommitHistory();

            // Refresh file status
            await this.refreshStatus();

            // Show success notification
            this.showSuccess('Changes committed successfully');

            // Emit event for other components
            EventBus.emit('git:commit-completed', { message });
        }
    } catch (error) {
        console.error('[GitPanel] Commit failed:', error);
        this.showError('Failed to commit: ' + error.message);
    }
}
```

**Step 1.1b: Create Debounce Utility**

*File:* `src/utils/debounce.js` (NEW FILE)

```javascript
/**
 * Debounce utility function
 * Delays function execution until after wait milliseconds have elapsed
 * since the last time it was invoked
 *
 * @param {Function} func - Function to debounce
 * @param {number} wait - Milliseconds to wait
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;

    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };

        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

module.exports = debounce;
```

**Step 1.1c: Add Event-Driven Auto-Refresh**

*File:* `src/components/GitPanel.js`
*Method:* `constructor()` or `initialize()`

```javascript
const debounce = require('../utils/debounce');

class GitPanel {
    constructor() {
        // ... existing constructor code ...

        // **NEW: Setup auto-refresh listener**
        this.setupAutoRefresh();
    }

    /**
     * Setup automatic refresh when git repository changes
     */
    setupAutoRefresh() {
        // Debounced refresh function (wait 1000ms after last event)
        const debouncedRefresh = debounce(() => {
            console.log('[GitPanel] Auto-refreshing due to repository update');
            this.loadCommitHistory();
            this.refreshStatus();
        }, 1000);

        // Listen for repository update events
        EventBus.on('git:repository-updated', debouncedRefresh);
        EventBus.on('git:push-completed', debouncedRefresh);
        EventBus.on('git:pull-completed', debouncedRefresh);
        EventBus.on('git:fetch-completed', debouncedRefresh);
        EventBus.on('git:branch-switched', debouncedRefresh);

        console.log('[GitPanel] Auto-refresh listeners registered');
    }
}
```

**Step 1.1d: Emit Repository Update Events**

*File:* `src/services/GitService.js`
*Methods:* Various git operation methods

```javascript
// After successful commit
async commit(message) {
    // ... existing commit logic ...

    if (success) {
        EventBus.emit('git:repository-updated', { operation: 'commit' });
        return true;
    }
}

// After successful push
async push(options) {
    // ... existing push logic ...

    if (success) {
        EventBus.emit('git:repository-updated', { operation: 'push' });
        EventBus.emit('git:push-completed');
    }
}

// After successful pull
async pull(options) {
    // ... existing pull logic ...

    if (success) {
        EventBus.emit('git:repository-updated', { operation: 'pull' });
        EventBus.emit('git:pull-completed');
    }
}
```

#### Testing Checklist
- [ ] Commit changes and verify history updates automatically
- [ ] Commit multiple times rapidly and verify debounce works (no flickering)
- [ ] Push to remote and verify history updates
- [ ] Pull from remote and verify history updates
- [ ] Switch branches and verify history updates
- [ ] Perform git operations from terminal and verify IDE detects changes
- [ ] Check console for any errors or excessive refresh calls
- [ ] Verify refresh doesn't interrupt user if they're scrolling through history

#### Success Criteria
✅ Commit history updates within 1 second of any git operation
✅ No excessive refresh calls (debounced properly)
✅ No console errors
✅ Works for both UI-triggered and terminal-triggered git operations

---

### 1.2 Branch Switching with Uncommitted Changes Warning

**Priority:** CRITICAL
**Estimated Time:** 4-5 hours
**Status:** Pending

#### Problem Statement
Currently, when a user tries to switch branches while having uncommitted changes, one of two things happens:
1. Git silently switches branches and brings the changes along (if no conflicts)
2. Git fails with an error message (if changes conflict with target branch)

Neither provides a good user experience. Users can accidentally lose work or be confused about why branch switching failed.

#### Current Behavior
1. User has uncommitted changes in current branch
2. User selects different branch from dropdown
3. **No warning is shown** ❌
4. Either: Changes silently move to new branch, OR git fails with cryptic error

#### Expected Behavior (VS Code Pattern)
1. User has uncommitted changes in current branch
2. User selects different branch from dropdown
3. **Dialog appears with options:** ✅
   - "Stash & Checkout" - Automatically stash changes, then switch
   - "Force Checkout" - Discard changes and switch
   - "Cancel" - Don't switch branches
4. User makes informed decision
5. IDE executes chosen action safely

#### Implementation Steps

**Step 1.2a: Implement Uncommitted Changes Detection**

*File:* `src/components/GitPanel.js`

```javascript
/**
 * Check if there are uncommitted changes in the working directory
 * @returns {Promise<{hasChanges: boolean, fileCount: number, files: Array}>}
 */
async hasUncommittedChanges() {
    try {
        const { gitStore } = getGitServices();
        if (!gitStore) {
            return { hasChanges: false, fileCount: 0, files: [] };
        }

        // Get current status
        const status = gitStore.getCurrentStatus();
        if (!status || !status.files) {
            return { hasChanges: false, fileCount: 0, files: [] };
        }

        // Filter for staged and unstaged files (ignore untracked if needed)
        const changedFiles = status.files.filter(f =>
            f.status !== 'untracked' // Can be configured to include untracked
        );

        console.log('[GitPanel] Uncommitted changes check:', {
            total: status.files.length,
            uncommitted: changedFiles.length
        });

        return {
            hasChanges: changedFiles.length > 0,
            fileCount: changedFiles.length,
            files: changedFiles
        };
    } catch (error) {
        console.error('[GitPanel] Error checking uncommitted changes:', error);
        return { hasChanges: false, fileCount: 0, files: [] };
    }
}
```

**Step 1.2b: Create Uncommitted Changes Warning Dialog**

*File:* `src/components/GitPanel.js`

```javascript
/**
 * Show dialog warning about uncommitted changes
 * @param {number} fileCount - Number of uncommitted files
 * @param {string} targetBranch - Branch user wants to switch to
 * @returns {Promise<string>} User choice: 'stash', 'force', or 'cancel'
 */
async showUncommittedChangesDialog(fileCount, targetBranch) {
    return new Promise((resolve) => {
        // Create dialog overlay
        const dialog = document.createElement('div');
        dialog.className = 'git-uncommitted-dialog';
        dialog.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;

        // Create dialog content
        const dialogContent = document.createElement('div');
        dialogContent.style.cssText = `
            background-color: #1e1e1e;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 8px;
            padding: 24px;
            min-width: 450px;
            max-width: 550px;
        `;

        // Warning icon and title
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 12px; margin-bottom: 16px;';
        header.innerHTML = `
            <img src="assets/icons/warning.svg" alt="Warning" style="width: 24px; height: 24px; filter: brightness(1.5);">
            <h3 style="margin: 0; font-size: 18px; color: #f2c55c;">Uncommitted Changes</h3>
        `;

        // Message
        const message = document.createElement('p');
        message.style.cssText = 'margin: 0 0 20px 0; color: rgba(255, 255, 255, 0.9); line-height: 1.5;';
        message.innerHTML = `
            You have <strong>${fileCount} uncommitted file${fileCount > 1 ? 's' : ''}</strong>
            in the current branch.<br><br>
            How would you like to proceed when switching to <strong>${targetBranch}</strong>?
        `;

        // Options container
        const options = document.createElement('div');
        options.style.cssText = 'display: flex; flex-direction: column; gap: 12px; margin-bottom: 20px;';

        // Option 1: Stash & Checkout
        const stashOption = this.createDialogOption(
            'stash',
            'Stash & Checkout',
            'Temporarily save your changes and switch branches',
            'assets/icons/archive.svg'
        );

        // Option 2: Force Checkout
        const forceOption = this.createDialogOption(
            'force',
            'Force Checkout',
            'Discard your changes and switch branches (cannot be undone)',
            'assets/icons/warning.svg',
            '#f48771' // Red color for dangerous action
        );

        // Buttons
        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `
            padding: 8px 16px;
            background-color: #2d2d2d;
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 4px;
            color: #ffffff;
            cursor: pointer;
        `;

        // Handle option selection
        stashOption.addEventListener('click', () => {
            dialog.remove();
            resolve('stash');
        });

        forceOption.addEventListener('click', () => {
            dialog.remove();
            resolve('force');
        });

        cancelBtn.addEventListener('click', () => {
            dialog.remove();
            resolve('cancel');
        });

        // Assemble dialog
        options.appendChild(stashOption);
        options.appendChild(forceOption);
        buttonContainer.appendChild(cancelBtn);
        dialogContent.appendChild(header);
        dialogContent.appendChild(message);
        dialogContent.appendChild(options);
        dialogContent.appendChild(buttonContainer);
        dialog.appendChild(dialogContent);

        // Add to DOM
        document.body.appendChild(dialog);

        // Close on background click
        dialog.addEventListener('click', (e) => {
            if (e.target === dialog) {
                dialog.remove();
                resolve('cancel');
            }
        });

        // Close on Escape key
        const escapeHandler = (e) => {
            if (e.key === 'Escape') {
                dialog.remove();
                resolve('cancel');
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);
    });
}

/**
 * Helper to create a clickable option card
 */
createDialogOption(value, title, description, iconPath, accentColor = '#0e639c') {
    const option = document.createElement('div');
    option.className = 'dialog-option';
    option.style.cssText = `
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background-color: #2d2d2d;
        border: 2px solid rgba(255, 255, 255, 0.1);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
    `;

    option.innerHTML = `
        <img src="${iconPath}" alt="${title}" style="width: 20px; height: 20px; flex-shrink: 0;">
        <div style="flex: 1;">
            <div style="font-weight: 600; color: ${accentColor}; margin-bottom: 4px;">${title}</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7);">${description}</div>
        </div>
    `;

    // Hover effect
    option.addEventListener('mouseenter', () => {
        option.style.borderColor = accentColor;
        option.style.backgroundColor = '#363636';
    });

    option.addEventListener('mouseleave', () => {
        option.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        option.style.backgroundColor = '#2d2d2d';
    });

    return option;
}
```

**Step 1.2c: Implement Auto-Stash Functionality**

*File:* `src/services/GitService.js`

```javascript
/**
 * Stash uncommitted changes with a message
 * @param {string} message - Stash message
 * @returns {Promise<boolean>} Success status
 */
async stashChanges(message = 'Auto-stash') {
    try {
        console.log('[GitService] Stashing changes with message:', message);

        const repository = this.getActiveRepository();
        if (!repository) {
            throw new Error('No active repository');
        }

        // Create timestamped stash message
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const stashMessage = `${message} (${timestamp})`;

        // Execute stash command
        await repository.client.execute(['stash', 'push', '-m', stashMessage]);

        console.log('[GitService] Stash created successfully');

        // Emit event
        EventBus.emit('git:stash-created', { message: stashMessage });

        // Refresh status
        await this.refreshStatus();

        return true;
    } catch (error) {
        console.error('[GitService] Failed to stash changes:', error);
        throw error;
    }
}

/**
 * Apply the most recent stash
 * @returns {Promise<boolean>}
 */
async popStash() {
    try {
        const repository = this.getActiveRepository();
        if (!repository) {
            throw new Error('No active repository');
        }

        await repository.client.execute(['stash', 'pop']);

        console.log('[GitService] Stash popped successfully');
        EventBus.emit('git:stash-popped');

        await this.refreshStatus();
        return true;
    } catch (error) {
        console.error('[GitService] Failed to pop stash:', error);
        throw error;
    }
}

/**
 * Apply stash without removing it from stash list
 * @returns {Promise<boolean>}
 */
async applyStash() {
    try {
        const repository = this.getActiveRepository();
        if (!repository) {
            throw new Error('No active repository');
        }

        await repository.client.execute(['stash', 'apply']);

        console.log('[GitService] Stash applied successfully');
        EventBus.emit('git:stash-applied');

        await this.refreshStatus();
        return true;
    } catch (error) {
        console.error('[GitService] Failed to apply stash:', error);
        throw error;
    }
}
```

**Step 1.2d: Modify Branch Switching Workflow**

*File:* `src/components/GitPanel.js`

```javascript
/**
 * Handle branch switching with uncommitted changes check
 * Called when user selects a different branch from dropdown
 */
async switchBranch(targetBranch) {
    try {
        const { gitStore, gitService } = getGitServices();
        if (!gitStore || !gitService) {
            console.error('[GitPanel] Git services not available');
            return;
        }

        // Don't switch if already on target branch
        if (this.currentBranch === targetBranch) {
            console.log('[GitPanel] Already on branch:', targetBranch);
            return;
        }

        console.log('[GitPanel] Switching from', this.currentBranch, 'to', targetBranch);

        // **NEW: Check for uncommitted changes**
        const { hasChanges, fileCount } = await this.hasUncommittedChanges();

        if (hasChanges) {
            console.log('[GitPanel] Found', fileCount, 'uncommitted changes');

            // Show warning dialog
            const userChoice = await this.showUncommittedChangesDialog(fileCount, targetBranch);

            console.log('[GitPanel] User choice:', userChoice);

            // Handle user choice
            switch (userChoice) {
                case 'stash':
                    // Stash changes before switching
                    await gitService.stashChanges(`auto-stash-from-${this.currentBranch}`);
                    this.showSuccess(`Stashed ${fileCount} changes from ${this.currentBranch}`);
                    break;

                case 'force':
                    // Continue with force checkout (will discard changes)
                    console.warn('[GitPanel] Force checkout - changes will be discarded');
                    break;

                case 'cancel':
                    // User cancelled - don't switch branches
                    console.log('[GitPanel] Branch switch cancelled by user');
                    // Reset dropdown to current branch
                    if (this.branchSelect) {
                        this.branchSelect.value = this.currentBranch;
                    }
                    return;
            }
        }

        // Perform the actual branch switch
        const repository = gitService.getActiveRepository();
        if (!repository) {
            throw new Error('No active repository');
        }

        // Execute git checkout
        await repository.client.execute(['checkout', targetBranch]);

        console.log('[GitPanel] Successfully switched to branch:', targetBranch);

        // Update current branch
        this.currentBranch = targetBranch;

        // Refresh UI
        await this.refreshStatus();
        await this.loadBranches();
        await this.loadCommitHistory();

        // Show success message
        this.showSuccess(`Switched to branch: ${targetBranch}`);

        // Emit event
        EventBus.emit('git:branch-switched', { branch: targetBranch });

    } catch (error) {
        console.error('[GitPanel] Failed to switch branch:', error);
        this.showError(`Failed to switch to ${targetBranch}: ${error.message}`);

        // Reset dropdown to current branch on error
        if (this.branchSelect) {
            this.branchSelect.value = this.currentBranch;
        }
    }
}
```

#### Testing Checklist
- [ ] Switch branches with uncommitted changes - verify dialog appears
- [ ] Choose "Stash & Checkout" - verify changes are stashed and branch switches
- [ ] Choose "Force Checkout" - verify changes are discarded and branch switches
- [ ] Choose "Cancel" - verify branch doesn't switch, dropdown resets
- [ ] Switch branches with NO uncommitted changes - verify no dialog appears
- [ ] Verify stash is created with descriptive auto-generated name
- [ ] Test with 1 file, 5 files, 20 files uncommitted
- [ ] Test with staged files, unstaged files, and mix of both
- [ ] Verify proper error handling if stash fails
- [ ] Check console for proper logging

#### Success Criteria
✅ Dialog appears whenever uncommitted changes would be affected
✅ All three options work correctly (stash/force/cancel)
✅ Stash is created with descriptive auto-name including source branch
✅ Branch switch completes successfully after handling changes
✅ No data loss in any scenario
✅ Clear user feedback through toast notifications

---

### 1.3 Material Icons UI Improvements

**Priority:** CRITICAL (UX)
**Estimated Time:** 3-4 hours
**Status:** Pending

#### Problem Statement
The Git Panel currently has several UI issues:
1. Text-based buttons are not visually appealing
2. Buttons sometimes overflow/scroll over each other
3. No visual hierarchy or iconography
4. Interface looks unprofessional compared to modern IDEs

#### Current Issues
- Text-only buttons (e.g., "Commit", "Push", "Pull", "Stage All")
- Buttons can overlap when panel is narrow
- No hover states or visual feedback
- Inconsistent spacing and alignment
- Missing icons from Material Icons set

#### Expected Behavior
- Icon-based buttons using Material Icons from `assets/icons/`
- Proper flex layout preventing overflow
- Consistent sizing (32x32px buttons)
- Hover states with brightness/opacity changes
- Tooltips showing action on hover
- Scrollable toolbar if too many buttons for width

#### Icon Mapping

Based on `material-icons-guide.md`, we should use these icons:

| Button | Action | Icon File | Alt Text |
|--------|--------|-----------|----------|
| Refresh | Refresh git status | `refresh.svg` | Refresh |
| Stage All | Stage all changes | `add.svg` or `stage-all.svg` | Stage All |
| Unstage All | Unstage all changes | `remove.svg` | Unstage All |
| Commit | Create commit | `git-commit.svg` or `check.svg` | Commit |
| Push | Push to remote | `cloud-upload.svg` or `arrow-up.svg` | Push |
| Pull | Pull from remote | `cloud-download.svg` or `arrow-down.svg` | Pull |
| Fetch | Fetch from remote | `sync.svg` or `refresh.svg` | Fetch |
| Stash | Stash changes | `archive.svg` | Stash |
| Discard | Discard changes | `delete.svg` or `close.svg` | Discard |
| Merge | Merge branches | `merge.svg` or `git-merge.svg` | Merge |
| Branch | Create branch | `git-branch.svg` or `branch.svg` | New Branch |

#### Implementation Steps

**Step 1.3a: Audit Existing Buttons**

Review all buttons in GitPanel.js and list their current implementation:

```javascript
// Current buttons to replace:
// - Line ~172: Refresh button (explorer toolbar)
// - Line ~240: Merge button
// - Line ~XXX: Commit button
// - Line ~XXX: Push button
// - Line ~XXX: Pull button
// - Line ~XXX: Fetch button
// - Line ~XXX: Stage all button
// - Line ~XXX: Unstage all button
// - Per-file buttons: Stage, Unstage, Discard
```

**Step 1.3b: Create Toolbar with Icon Buttons**

*File:* `src/components/GitPanel.js`
*Method:* Modify render/toolbar creation

```javascript
/**
 * Create Git Panel toolbar with icon buttons
 */
createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'git-panel-toolbar';

    // Refresh button
    const refreshBtn = this.createIconButton({
        icon: 'refresh.svg',
        title: 'Refresh Git Status',
        onclick: () => this.refreshStatus()
    });

    // Stage all button
    const stageAllBtn = this.createIconButton({
        icon: 'add.svg',
        title: 'Stage All Changes',
        onclick: () => this.stageAllFiles()
    });

    // Unstage all button
    const unstageAllBtn = this.createIconButton({
        icon: 'remove.svg',
        title: 'Unstage All Changes',
        onclick: () => this.unstageAllFiles()
    });

    // Spacer
    const spacer = document.createElement('div');
    spacer.style.flex = '1';

    // Fetch button
    const fetchBtn = this.createIconButton({
        icon: 'sync.svg',
        title: 'Fetch from Remote',
        onclick: () => this.fetchChanges()
    });

    // Pull button
    const pullBtn = this.createIconButton({
        icon: 'cloud-download.svg',
        title: 'Pull from Remote',
        onclick: () => this.pullChanges()
    });

    // Push button
    const pushBtn = this.createIconButton({
        icon: 'cloud-upload.svg',
        title: 'Push to Remote',
        onclick: () => this.push()
    });

    // Assemble toolbar
    toolbar.appendChild(refreshBtn);
    toolbar.appendChild(stageAllBtn);
    toolbar.appendChild(unstageAllBtn);
    toolbar.appendChild(spacer);
    toolbar.appendChild(fetchBtn);
    toolbar.appendChild(pullBtn);
    toolbar.appendChild(pushBtn);

    return toolbar;
}

/**
 * Helper method to create icon button
 * @param {Object} options - Button configuration
 * @returns {HTMLElement} Button element
 */
createIconButton({ icon, title, onclick, className = '' }) {
    const button = document.createElement('button');
    button.className = `git-toolbar-btn ${className}`;
    button.title = title;
    button.setAttribute('aria-label', title);

    const img = document.createElement('img');
    img.src = `assets/icons/${icon}`;
    img.alt = title;
    img.className = 'toolbar-icon';

    button.appendChild(img);
    button.addEventListener('click', onclick);

    return button;
}
```

**Step 1.3c: Add CSS for Toolbar**

*File:* `styles.css`

```css
/* Git Panel Toolbar */
.git-panel-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    background-color: var(--toolbar-bg, #252526);
    overflow-x: auto;
    overflow-y: hidden;
    flex-wrap: nowrap;
    scrollbar-width: thin;
}

/* Custom scrollbar for toolbar */
.git-panel-toolbar::-webkit-scrollbar {
    height: 4px;
}

.git-panel-toolbar::-webkit-scrollbar-track {
    background: transparent;
}

.git-panel-toolbar::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.2);
    border-radius: 2px;
}

.git-panel-toolbar::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.3);
}

/* Icon buttons */
.git-toolbar-btn {
    min-width: 32px;
    width: 32px;
    height: 32px;
    padding: 6px;
    border: none;
    border-radius: 4px;
    background-color: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0; /* Prevent shrinking */
    transition: background-color 0.2s, opacity 0.2s;
}

.git-toolbar-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.git-toolbar-btn:active {
    background-color: rgba(255, 255, 255, 0.15);
}

.git-toolbar-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.git-toolbar-btn:disabled:hover {
    background-color: transparent;
}

/* Toolbar icons */
.toolbar-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    opacity: 0.8;
    filter: brightness(0.9);
    pointer-events: none; /* Don't interfere with button clicks */
}

.git-toolbar-btn:hover .toolbar-icon {
    opacity: 1;
    filter: brightness(1.2);
}

.git-toolbar-btn:disabled .toolbar-icon {
    opacity: 0.5;
    filter: brightness(0.7);
}
```

**Step 1.3d: Add Per-File Action Buttons**

*File:* `src/components/GitPanel.js`
*Method:* File item rendering

```javascript
/**
 * Create file item with action buttons
 */
createFileItem(file) {
    const item = document.createElement('div');
    item.className = 'git-file-item';
    item.dataset.path = file.path;

    // File icon (based on extension)
    const fileIcon = document.createElement('img');
    fileIcon.src = fileTypes.getIconPath(file.name);
    fileIcon.alt = file.name;
    fileIcon.className = 'file-item-icon';

    // File name
    const fileName = document.createElement('span');
    fileName.className = 'file-item-name';
    fileName.textContent = file.name;

    // Status indicator (M, A, D, etc.)
    const status = document.createElement('span');
    status.className = `file-status file-status-${file.status}`;
    status.textContent = this.getStatusLabel(file.status);

    // Action buttons container
    const actions = document.createElement('div');
    actions.className = 'file-item-actions';

    // Different buttons based on file status
    if (file.staged) {
        // Unstage button
        const unstageBtn = this.createFileActionButton({
            icon: 'remove.svg',
            title: 'Unstage',
            onclick: (e) => {
                e.stopPropagation();
                this.unstageFile(file.path);
            }
        });
        actions.appendChild(unstageBtn);
    } else {
        // Stage button
        const stageBtn = this.createFileActionButton({
            icon: 'add.svg',
            title: 'Stage',
            onclick: (e) => {
                e.stopPropagation();
                this.stageFile(file.path);
            }
        });
        actions.appendChild(stageBtn);

        // Discard button (only for unstaged files)
        const discardBtn = this.createFileActionButton({
            icon: 'discard.svg',
            title: 'Discard Changes',
            onclick: (e) => {
                e.stopPropagation();
                this.discardFile(file.path);
            },
            className: 'danger'
        });
        actions.appendChild(discardBtn);
    }

    // Assemble item
    item.appendChild(fileIcon);
    item.appendChild(fileName);
    item.appendChild(status);
    item.appendChild(actions);

    // Click to show diff
    item.addEventListener('click', () => this.showFileDiff(file.path));

    return item;
}

/**
 * Create file action button (smaller than toolbar buttons)
 */
createFileActionButton({ icon, title, onclick, className = '' }) {
    const button = document.createElement('button');
    button.className = `file-action-btn ${className}`;
    button.title = title;
    button.setAttribute('aria-label', title);

    const img = document.createElement('img');
    img.src = `assets/icons/${icon}`;
    img.alt = title;
    img.className = 'file-action-icon';

    button.appendChild(img);
    button.addEventListener('click', onclick);

    return button;
}
```

**Step 1.3e: Add CSS for File Actions**

*File:* `styles.css`

```css
/* Git File Item */
.git-file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    cursor: pointer;
    border-radius: 4px;
    transition: background-color 0.2s;
}

.git-file-item:hover {
    background-color: rgba(255, 255, 255, 0.05);
}

.git-file-item:hover .file-item-actions {
    opacity: 1;
    visibility: visible;
}

/* File item components */
.file-item-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    flex-shrink: 0;
}

.file-item-name {
    flex: 1;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-status {
    font-size: 11px;
    font-weight: 600;
    padding: 2px 6px;
    border-radius: 3px;
    flex-shrink: 0;
}

.file-status-modified {
    color: #e2c08d;
    background-color: rgba(226, 192, 141, 0.15);
}

.file-status-added {
    color: #73c991;
    background-color: rgba(115, 201, 145, 0.15);
}

.file-status-deleted {
    color: #f48771;
    background-color: rgba(244, 135, 113, 0.15);
}

.file-status-conflict {
    color: #c74e39;
    background-color: rgba(199, 78, 57, 0.15);
}

/* File action buttons */
.file-item-actions {
    display: flex;
    gap: 4px;
    opacity: 0;
    visibility: hidden;
    transition: opacity 0.2s, visibility 0.2s;
}

.file-action-btn {
    width: 24px;
    height: 24px;
    padding: 4px;
    border: none;
    border-radius: 3px;
    background-color: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.2s;
}

.file-action-btn:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.file-action-btn.danger:hover {
    background-color: rgba(244, 135, 113, 0.2);
}

.file-action-icon {
    width: 14px;
    height: 14px;
    object-fit: contain;
    opacity: 0.8;
}

.file-action-btn:hover .file-action-icon {
    opacity: 1;
}

.file-action-btn.danger .file-action-icon {
    filter: brightness(1.3);
}
```

#### Testing Checklist
- [ ] All toolbar buttons display with correct icons
- [ ] Buttons don't overflow - toolbar scrolls horizontally if needed
- [ ] Hover states work (background color change)
- [ ] Icons become brighter on hover
- [ ] Tooltips show on hover
- [ ] All buttons are clickable and trigger correct actions
- [ ] File action buttons appear on hover over file items
- [ ] Stage/unstage/discard buttons work correctly
- [ ] Icons load from `assets/icons/` without 404 errors
- [ ] Layout responsive - works at different panel widths
- [ ] Scrollbar appears when toolbar overflows (thin, styled)
- [ ] Check in both light and dark themes (if applicable)

#### Success Criteria
✅ All buttons use Material Icons from `assets/icons/`
✅ No text-only buttons remaining
✅ Toolbar uses flex layout with overflow scroll
✅ Buttons maintain 32x32px size consistently
✅ Hover states provide clear visual feedback
✅ File action buttons appear/disappear on hover smoothly
✅ No layout breaking at narrow widths
✅ Professional, polished appearance matching VS Code/Zed

---

## 🟡 Phase 2: Quality of Life (Should Have)

These features significantly improve user experience and bring the Git integration closer to industry standards.

### 2.1 Status Bar Git Information

**Priority:** HIGH
**Estimated Time:** 3-4 hours
**Status:** Not Started

#### Goal
Add comprehensive Git status display to the IDE's status bar (bottom of window), showing:
- Current branch name (clickable to open Git panel)
- Ahead/behind commit counts (↑3 ↓2)
- Uncommitted changes badge
- Sync button for quick push+pull

#### VS Code Implementation Reference
VS Code shows a compact, informative Git section in the status bar:
```
⎇ main ↓2 ↑3 [!] [sync icon]
```
Where:
- `⎇ main` = Current branch (clickable)
- `↓2` = 2 commits behind remote
- `↑3` = 3 commits ahead of remote
- `[!]` = Uncommitted changes indicator
- `[sync icon]` = Sync button (push + pull)

#### Implementation Plan

**Step 2.1a: Create Git Status Bar Component**

*File:* `src/components/StatusBar.js` (or create if doesn't exist)

```javascript
class StatusBarGitSection {
    constructor() {
        this.container = null;
        this.branchBtn = null;
        this.syncBtn = null;
        this.statusBadge = null;

        this.currentBranch = null;
        this.ahead = 0;
        this.behind = 0;
        this.uncommittedCount = 0;

        this.render();
        this.setupListeners();
    }

    /**
     * Create the Git section HTML
     */
    render() {
        // Main container
        this.container = document.createElement('div');
        this.container.className = 'status-bar-git-section';

        // Branch button
        this.branchBtn = document.createElement('button');
        this.branchBtn.className = 'status-bar-git-branch';
        this.branchBtn.title = 'Switch Branch';
        this.branchBtn.addEventListener('click', () => this.openGitPanel());

        // Sync status (ahead/behind)
        this.syncBtn = document.createElement('button');
        this.syncBtn.className = 'status-bar-git-sync';
        this.syncBtn.title = 'Synchronize Changes';
        this.syncBtn.addEventListener('click', () => this.syncRepository());

        // Status badge (uncommitted changes)
        this.statusBadge = document.createElement('span');
        this.statusBadge.className = 'status-bar-git-badge';
        this.statusBadge.title = 'Uncommitted Changes';

        this.container.appendChild(this.branchBtn);
        this.container.appendChild(this.syncBtn);
        this.container.appendChild(this.statusBadge);

        return this.container;
    }

    /**
     * Update Git status information
     */
    update({ branch, ahead = 0, behind = 0, uncommitted = 0 }) {
        this.currentBranch = branch;
        this.ahead = ahead;
        this.behind = behind;
        this.uncommittedCount = uncommitted;

        // Update branch button
        if (branch) {
            this.branchBtn.innerHTML = `
                <img src="assets/icons/git-branch.svg" class="status-icon" alt="Branch">
                <span>${branch}</span>
            `;
            this.branchBtn.style.display = 'flex';
        } else {
            this.branchBtn.style.display = 'none';
        }

        // Update sync button (only show if ahead or behind)
        if (ahead > 0 || behind > 0) {
            let syncText = '';
            if (behind > 0) syncText += `↓${behind} `;
            if (ahead > 0) syncText += `↑${ahead}`;

            this.syncBtn.innerHTML = `
                ${syncText}
                <img src="assets/icons/sync.svg" class="status-icon" alt="Sync">
            `;
            this.syncBtn.style.display = 'flex';

            // Update tooltip
            const tooltip = [];
            if (behind > 0) tooltip.push(`${behind} commit${behind > 1 ? 's' : ''} behind`);
            if (ahead > 0) tooltip.push(`${ahead} commit${ahead > 1 ? 's' : ''} ahead`);
            this.syncBtn.title = `Synchronize Changes: ${tooltip.join(', ')}`;
        } else {
            this.syncBtn.style.display = 'none';
        }

        // Update status badge (only show if uncommitted changes)
        if (uncommitted > 0) {
            this.statusBadge.textContent = uncommitted;
            this.statusBadge.title = `${uncommitted} uncommitted change${uncommitted > 1 ? 's' : ''}`;
            this.statusBadge.style.display = 'inline-block';
        } else {
            this.statusBadge.style.display = 'none';
        }
    }

    /**
     * Open Git panel
     */
    openGitPanel() {
        EventBus.emit('git:open-panel');
    }

    /**
     * Sync repository (pull + push)
     */
    async syncRepository() {
        try {
            const { gitService } = getGitServices();
            if (!gitService) return;

            // Pull first
            await gitService.pull();

            // Then push if there are ahead commits
            if (this.ahead > 0) {
                await gitService.push();
            }
        } catch (error) {
            console.error('[StatusBar] Sync failed:', error);
        }
    }

    /**
     * Setup event listeners for auto-update
     */
    setupListeners() {
        // Update when git status changes
        EventBus.on('git:status-updated', (data) => {
            this.update({
                branch: data.branch,
                ahead: data.ahead || 0,
                behind: data.behind || 0,
                uncommitted: data.uncommittedCount || 0
            });
        });

        // Update after git operations
        EventBus.on('git:repository-updated', () => {
            this.fetchLatestStatus();
        });
    }

    /**
     * Fetch latest status from GitStore
     */
    async fetchLatestStatus() {
        const { gitStore, gitBranchService } = getGitServices();
        if (!gitStore || !gitBranchService) return;

        const status = gitStore.getCurrentStatus();
        const branch = status?.branch || gitStore.getCurrentBranch();

        // Get upstream status
        const upstreamStatus = await gitBranchService.getUpstreamStatus();

        this.update({
            branch,
            ahead: upstreamStatus.ahead || 0,
            behind: upstreamStatus.behind || 0,
            uncommitted: status?.files?.length || 0
        });
    }
}

module.exports = StatusBarGitSection;
```

**Step 2.1b: Integrate with StatusBar**

*File:* `src/components/StatusBar.js` (main component)

```javascript
const StatusBarGitSection = require('./StatusBarGitSection');

class StatusBar {
    constructor() {
        // ... existing code ...

        // Add Git section
        this.gitSection = new StatusBarGitSection();
        this.container.appendChild(this.gitSection.container);
    }
}
```

**Step 2.1c: Add CSS Styles**

*File:* `styles.css`

```css
/* Status Bar Git Section */
.status-bar-git-section {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 100%;
    border-right: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}

.status-bar-git-branch,
.status-bar-git-sync {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    background-color: transparent;
    color: inherit;
    font-size: 12px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.status-bar-git-branch:hover,
.status-bar-git-sync:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.status-bar-git-branch .status-icon,
.status-bar-git-sync .status-icon {
    width: 14px;
    height: 14px;
    object-fit: contain;
    opacity: 0.8;
}

.status-bar-git-badge {
    display: inline-block;
    padding: 2px 6px;
    background-color: #0e639c;
    color: #ffffff;
    font-size: 11px;
    font-weight: 600;
    border-radius: 10px;
    line-height: 1;
}
```

#### Testing Checklist
- [ ] Git section appears in status bar
- [ ] Branch name displays correctly
- [ ] Clicking branch opens Git panel
- [ ] Ahead/behind counts show when applicable
- [ ] Sync button works (pull + push)
- [ ] Uncommitted changes badge shows count
- [ ] Status updates after commits
- [ ] Status updates after push/pull
- [ ] Status updates after branch switch
- [ ] Icons load correctly
- [ ] Hover states work

#### Success Criteria
✅ Always shows current branch name
✅ Shows ahead/behind counts when available
✅ Shows uncommitted changes count
✅ Clickable to open Git panel
✅ Sync button performs pull+push
✅ Updates in real-time after git operations

---

### 2.2 File Explorer Git Status Colors

**Priority:** HIGH
**Estimated Time:** 2-3 hours
**Status:** Not Started

#### Goal
Add visual Git status indicators to files in the file explorer tree, using color coding and status badges to show which files are:
- Modified (orange)
- Added/new (green)
- Deleted (red)
- In conflict (dark red)
- Ignored (grayed out)

#### Implementation Plan

**Step 2.2a: Add Git Status Query Method**

*File:* `src/components/FileExplorer.js`

```javascript
/**
 * Get Git status for a file
 * @param {string} filePath - Absolute file path
 * @returns {string|null} Status: 'modified', 'added', 'deleted', 'conflict', 'ignored', null
 */
async getFileGitStatus(filePath) {
    try {
        const { gitStore } = getGitServices();
        if (!gitStore) return null;

        const status = gitStore.getCurrentStatus();
        if (!status || !status.files) return null;

        // Find file in status
        const fileStatus = status.files.find(f => f.path === filePath);
        if (!fileStatus) return null;

        // Map git status to display status
        switch (fileStatus.status) {
            case 'modified':
            case 'M':
                return 'modified';
            case 'added':
            case 'A':
                return 'added';
            case 'deleted':
            case 'D':
                return 'deleted';
            case 'unmerged':
            case 'U':
                return 'conflict';
            default:
                return null;
        }
    } catch (error) {
        console.error('[FileExplorer] Error getting file git status:', error);
        return null;
    }
}
```

**Step 2.2b: Modify File Rendering to Include Git Status**

*File:* `src/components/FileExplorer.js`

```javascript
/**
 * Render file item with Git status
 */
async renderFileItem(file, parentElement) {
    const item = document.createElement('div');
    item.className = 'tree-item tree-item-file';
    item.dataset.path = file.path;

    // Get Git status
    const gitStatus = await this.getFileGitStatus(file.path);

    // Add Git status class
    if (gitStatus) {
        item.classList.add(`git-status-${gitStatus}`);
    }

    // Icon container
    const iconContainer = document.createElement('div');
    iconContainer.className = 'tree-item-icon';

    const iconImg = document.createElement('img');
    iconImg.className = 'tree-item-icon-img';
    iconImg.src = fileTypes.getIconPath(file.name);
    iconImg.alt = fileTypes.getIcon(file.name);
    iconContainer.appendChild(iconImg);

    // File name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tree-item-name';
    nameSpan.textContent = file.name;

    // Git status badge (optional - shows M, A, D letters)
    if (gitStatus) {
        const statusBadge = document.createElement('span');
        statusBadge.className = `tree-item-git-badge git-badge-${gitStatus}`;
        statusBadge.textContent = this.getGitStatusLetter(gitStatus);
        item.appendChild(statusBadge);
    }

    // Assemble
    item.appendChild(iconContainer);
    item.appendChild(nameSpan);

    // Click handler
    item.addEventListener('click', () => this.openFile(file.path));

    parentElement.appendChild(item);
}

/**
 * Get single letter for Git status badge
 */
getGitStatusLetter(status) {
    const letters = {
        'modified': 'M',
        'added': 'A',
        'deleted': 'D',
        'conflict': 'U'
    };
    return letters[status] || '';
}
```

**Step 2.2c: Add CSS for Git Status Colors**

*File:* `styles.css`

```css
/* Git Status Colors */
.tree-item.git-status-modified .tree-item-name {
    color: #e2c08d; /* Orange */
}

.tree-item.git-status-added .tree-item-name {
    color: #73c991; /* Green */
}

.tree-item.git-status-deleted .tree-item-name {
    color: #f48771; /* Red */
    text-decoration: line-through;
}

.tree-item.git-status-conflict .tree-item-name {
    color: #c74e39; /* Dark Red */
}

.tree-item.git-status-ignored {
    opacity: 0.5;
}

/* Git Status Badges (M, A, D letters) */
.tree-item-git-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 4px;
    border-radius: 3px;
    margin-left: auto;
    margin-right: 8px;
}

.git-badge-modified {
    color: #e2c08d;
    background-color: rgba(226, 192, 141, 0.2);
}

.git-badge-added {
    color: #73c991;
    background-color: rgba(115, 201, 145, 0.2);
}

.git-badge-deleted {
    color: #f48771;
    background-color: rgba(244, 135, 113, 0.2);
}

.git-badge-conflict {
    color: #c74e39;
    background-color: rgba(199, 78, 57, 0.2);
}
```

**Step 2.2d: Auto-Refresh on Git Status Changes**

*File:* `src/components/FileExplorer.js`

```javascript
constructor() {
    // ... existing code ...

    // Listen for Git status updates
    EventBus.on('git:status-updated', () => {
        this.refreshGitStatus();
    });
}

/**
 * Refresh Git status indicators for all visible files
 */
async refreshGitStatus() {
    // Re-render or update classes for all file items
    const fileItems = this.container.querySelectorAll('.tree-item-file');

    for (const item of fileItems) {
        const filePath = item.dataset.path;
        const gitStatus = await this.getFileGitStatus(filePath);

        // Remove old status classes
        item.classList.remove(
            'git-status-modified',
            'git-status-added',
            'git-status-deleted',
            'git-status-conflict',
            'git-status-ignored'
        );

        // Add new status class
        if (gitStatus) {
            item.classList.add(`git-status-${gitStatus}`);
        }
    }
}
```

#### Testing Checklist
- [ ] Modified files show orange color
- [ ] New files show green color
- [ ] Deleted files show red color with strikethrough
- [ ] Conflict files show dark red color
- [ ] Status badges (M, A, D) appear next to file names
- [ ] Colors update after staging/unstaging files
- [ ] Colors update after committing
- [ ] Colors persist after file explorer refresh
- [ ] Works with nested directories
- [ ] Performance acceptable with 100+ files

#### Success Criteria
✅ All git-tracked files show appropriate colors
✅ Status updates in real-time after git operations
✅ Visual feedback is clear and consistent
✅ No performance degradation
✅ Matches VS Code color scheme

---

### 2.3 Progress Indicators for Git Operations

**Priority:** MEDIUM
**Estimated Time:** 2 hours
**Status:** Not Started

#### Goal
Show toast notifications with progress indicators during long-running git operations (push, pull, fetch, clone). This provides user feedback that operations are in progress and haven't frozen.

#### Implementation Plan

**Step 2.3a: Create Toast Notification System**

*File:* `src/utils/ToastNotification.js` (or integrate with existing system)

```javascript
class ToastNotification {
    constructor() {
        this.container = this.createContainer();
        this.activeToasts = new Map();
    }

    /**
     * Create toast container
     */
    createContainer() {
        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        return container;
    }

    /**
     * Show a toast notification
     * @param {string} message - Toast message
     * @param {string} type - 'info', 'success', 'error', 'warning'
     * @param {number} duration - Auto-dismiss after ms (0 = manual dismiss)
     * @returns {string} Toast ID for updating/dismissing
     */
    show(message, type = 'info', duration = 3000) {
        const id = `toast-${Date.now()}-${Math.random()}`;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.id = id;

        // Icon
        const icon = this.getIcon(type);

        // Message
        const messageSpan = document.createElement('span');
        messageSpan.className = 'toast-message';
        messageSpan.textContent = message;

        // Close button
        const closeBtn = document.createElement('button');
        closeBtn.className = 'toast-close';
        closeBtn.innerHTML = '×';
        closeBtn.addEventListener('click', () => this.dismiss(id));

        toast.appendChild(icon);
        toast.appendChild(messageSpan);
        toast.appendChild(closeBtn);

        this.container.appendChild(toast);
        this.activeToasts.set(id, toast);

        // Animate in
        setTimeout(() => toast.classList.add('toast-show'), 10);

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => this.dismiss(id), duration);
        }

        return id;
    }

    /**
     * Update existing toast
     */
    update(id, message, type) {
        const toast = this.activeToasts.get(id);
        if (!toast) return;

        // Update message
        const messageSpan = toast.querySelector('.toast-message');
        if (messageSpan) {
            messageSpan.textContent = message;
        }

        // Update type
        toast.className = `toast toast-${type} toast-show`;

        // Update icon
        const oldIcon = toast.querySelector('.toast-icon');
        const newIcon = this.getIcon(type);
        if (oldIcon && newIcon) {
            toast.replaceChild(newIcon, oldIcon);
        }
    }

    /**
     * Dismiss toast
     */
    dismiss(id) {
        const toast = this.activeToasts.get(id);
        if (!toast) return;

        toast.classList.remove('toast-show');
        setTimeout(() => {
            toast.remove();
            this.activeToasts.delete(id);
        }, 300);
    }

    /**
     * Get icon for toast type
     */
    getIcon(type) {
        const icon = document.createElement('img');
        icon.className = 'toast-icon';

        const iconMap = {
            'info': 'info.svg',
            'success': 'check-circle.svg',
            'error': 'error.svg',
            'warning': 'warning.svg'
        };

        icon.src = `assets/icons/${iconMap[type] || 'info.svg'}`;
        icon.alt = type;

        return icon;
    }
}

// Singleton instance
const toastNotification = new ToastNotification();

module.exports = toastNotification;
```

**Step 2.3b: Wrap Git Operations with Progress**

*File:* `src/components/GitPanel.js`

```javascript
const toastNotification = require('../utils/ToastNotification');

/**
 * Perform git operation with progress indicator
 * @param {string} operationName - Human-readable operation name
 * @param {Function} operation - Async function to execute
 * @returns {Promise<any>} Result of operation
 */
async performGitOperation(operationName, operation) {
    // Show progress toast
    const toastId = toastNotification.show(
        `${operationName}...`,
        'info',
        0 // Don't auto-dismiss
    );

    try {
        // Execute operation
        const result = await operation();

        // Update toast to success
        toastNotification.update(
            toastId,
            `${operationName} completed successfully`,
            'success'
        );

        // Auto-dismiss after 3 seconds
        setTimeout(() => toastNotification.dismiss(toastId), 3000);

        return result;
    } catch (error) {
        // Update toast to error
        toastNotification.update(
            toastId,
            `${operationName} failed: ${error.message}`,
            'error'
        );

        // Auto-dismiss after 5 seconds
        setTimeout(() => toastNotification.dismiss(toastId), 5000);

        throw error;
    }
}

// Usage examples:
async push() {
    await this.performGitOperation('Pushing to remote', async () => {
        const { gitService } = getGitServices();
        return await gitService.push();
    });
}

async pullChanges() {
    await this.performGitOperation('Pulling from remote', async () => {
        const { gitService } = getGitServices();
        return await gitService.pull();
    });
}

async fetchChanges() {
    await this.performGitOperation('Fetching from remote', async () => {
        const { gitService } = getGitServices();
        return await gitService.fetch();
    });
}

async commitChanges() {
    const message = this.commitMessageInput.value.trim();

    await this.performGitOperation('Committing changes', async () => {
        const { gitService } = getGitServices();
        const success = await gitService.commit(message);

        if (success) {
            this.commitMessageInput.value = '';
            await this.loadCommitHistory();
            await this.refreshStatus();
        }

        return success;
    });
}
```

**Step 2.3c: Add CSS for Toast Notifications**

*File:* `styles.css`

```css
/* Toast Container */
.toast-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 10000;
    display: flex;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
}

/* Toast */
.toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background-color: #2d2d2d;
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-left: 4px solid;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    min-width: 300px;
    max-width: 500px;
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
    pointer-events: all;
}

.toast.toast-show {
    opacity: 1;
    transform: translateX(0);
}

/* Toast Types */
.toast-info {
    border-left-color: #0e639c;
}

.toast-success {
    border-left-color: #73c991;
}

.toast-error {
    border-left-color: #f48771;
}

.toast-warning {
    border-left-color: #f2c55c;
}

/* Toast Elements */
.toast-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
    flex-shrink: 0;
}

.toast-message {
    flex: 1;
    font-size: 13px;
    color: #ffffff;
}

.toast-close {
    width: 24px;
    height: 24px;
    border: none;
    background: transparent;
    color: rgba(255, 255, 255, 0.7);
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.2s;
}

.toast-close:hover {
    color: #ffffff;
}
```

#### Testing Checklist
- [ ] Toast appears during push operation
- [ ] Toast appears during pull operation
- [ ] Toast appears during fetch operation
- [ ] Toast appears during commit operation
- [ ] Toast updates from "in progress" to "success"
- [ ] Toast updates from "in progress" to "error" on failure
- [ ] Success toasts auto-dismiss after 3 seconds
- [ ] Error toasts auto-dismiss after 5 seconds
- [ ] Multiple toasts stack vertically
- [ ] Close button dismisses toast
- [ ] Toast animations are smooth
- [ ] Icons load correctly for each type

#### Success Criteria
✅ Progress feedback for all git operations
✅ Clear visual distinction between info/success/error states
✅ Smooth animations and transitions
✅ Auto-dismiss works correctly
✅ Manual dismiss via close button works
✅ Multiple toasts don't overlap

---

## 🟢 Phase 3: Advanced Features (Nice to Have)

These features represent more advanced Git functionality that power users would appreciate.

### 3.1 Merge Conflict Resolution UI

**Priority:** MEDIUM
**Estimated Time:** 8-10 hours
**Status:** Not Started

#### Goal
Build a comprehensive conflict resolution interface that displays merge conflicts visually and provides buttons to accept changes from either side. This is essential for proper Git workflows.

#### Features
- Detect merge conflicts after pull/merge operations
- Parse Git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
- 3-way diff view showing:
  - Current changes (HEAD)
  - Incoming changes (merge branch)
  - Result editor
- Action buttons above each conflict:
  - "Accept Current Change"
  - "Accept Incoming Change"
  - "Accept Both Changes"
  - "Compare Changes" (diff view)
- Navigate between conflicts (previous/next)
- Auto-stage files once all conflicts resolved
- Syntax highlighting in all panes

#### Implementation Overview

**Files to Create/Modify:**
- `src/components/ConflictResolutionView.js` - Main UI component
- `src/utils/ConflictParser.js` - Parse git conflict markers
- `src/components/ThreeWayMergeEditor.js` - 3-way diff editor
- `styles.css` - Conflict resolution styles

*Implementation details deferred to Phase 3 planning.*

---

### 3.2 Stash Management UI

**Priority:** MEDIUM
**Estimated Time:** 4-5 hours
**Status:** Not Started

#### Goal
Provide full UI for managing git stashes, including:
- View list of all stashes
- Create new stash with message
- Apply stash (keep in list)
- Pop stash (apply and remove)
- Delete individual stash
- View stash contents

#### Implementation Overview

**Files to Create/Modify:**
- `src/services/GitStashService.js` - Stash operations backend
- `src/components/StashPanel.js` - Stash list UI
- `src/components/StashDialog.js` - Create/apply stash dialogs

**Git Commands:**
```bash
git stash list
git stash push -m "message"
git stash apply stash@{0}
git stash pop stash@{0}
git stash drop stash@{0}
git stash show -p stash@{0}
```

*Implementation details deferred to Phase 3 planning.*

---

### 3.3 Partial Staging (Hunk Staging)

**Priority:** LOW
**Estimated Time:** 6-8 hours
**Status:** Not Started

#### Goal
Allow users to stage specific hunks (chunks) of changes within a file, rather than staging the entire file. This is common in professional workflows.

#### Implementation Approach
- Show diff view for modified files
- Highlight individual hunks
- Add "Stage This Hunk" button above each hunk
- Use `git add --patch` or manual diff application

*Implementation details deferred to Phase 3 planning.*

---

## 📐 Implementation Guidelines

### Code Style
- Follow existing code patterns in Swarm IDE
- Use ES6+ JavaScript features (async/await, arrow functions, template literals)
- Add JSDoc comments for all public methods
- Console logging for debugging: `console.log('[ComponentName] Message')`
- Error handling: Always use try-catch for async operations

### Event System
Use EventBus for cross-component communication:
```javascript
// Emit event
EventBus.emit('git:status-updated', { branch: 'main', fileCount: 5 });

// Listen for event
EventBus.on('git:status-updated', (data) => {
    console.log('Status updated:', data);
});
```

### Git Operation Pattern
```javascript
async someGitOperation() {
    try {
        const { gitService } = getGitServices();
        if (!gitService) {
            throw new Error('Git service not available');
        }

        // Perform operation
        const result = await gitService.someMethod();

        // Emit event
        EventBus.emit('git:operation-completed', { operation: 'someMethod' });

        // Refresh UI
        await this.refreshStatus();

        return result;
    } catch (error) {
        console.error('[Component] Operation failed:', error);
        this.showError(`Operation failed: ${error.message}`);
        throw error;
    }
}
```

### Material Icons Usage
See `docs/material-icons-guide.md` for complete reference.

```javascript
// Button with icon
const button = document.createElement('button');
button.innerHTML = '<img src="assets/icons/ICON_NAME.svg" class="toolbar-icon">';
button.title = 'Action Name';
```

### CSS Naming Conventions
- Component classes: `.component-name-element`
- State classes: `.is-active`, `.is-loading`, `.has-error`
- Git status classes: `.git-status-modified`, `.git-status-added`
- BEM-like structure for complex components

---

## ✅ Testing Checklist

### Manual Testing
For each feature, verify:
- [ ] Functionality works as expected (happy path)
- [ ] Error handling works (unhappy paths)
- [ ] UI updates in real-time
- [ ] Console shows no errors
- [ ] Icons load correctly (no 404s)
- [ ] Tooltips/titles are accurate
- [ ] Keyboard shortcuts work (if applicable)
- [ ] Works at different window sizes
- [ ] Performance is acceptable
- [ ] No memory leaks (long-running sessions)

### Test Scenarios

#### Commit Workflow
1. Modify files
2. Stage files
3. Enter commit message
4. Commit
5. Verify history updates immediately
6. Verify file status updates

#### Branch Switching
1. Make uncommitted changes
2. Try to switch branches
3. Verify dialog appears
4. Test "Stash & Checkout" option
5. Test "Force Checkout" option
6. Test "Cancel" option
7. Switch branches with no changes (no dialog)

#### Push/Pull/Fetch
1. Make commits
2. Push to remote
3. Verify progress toast
4. Pull from remote with new commits
5. Verify status bar updates
6. Fetch and check ahead/behind counts

#### UI Responsiveness
1. Resize Git panel to minimum width
2. Verify toolbar buttons scroll
3. Verify no text overlap
4. Resize to maximum width
5. Verify proper spacing

---

## 🐛 Known Issues

### From Initial Analysis
1. ✅ **FIXED:** Commit history not updating after commits
2. ✅ **FIXED:** `window.prompt()` not supported in Electron (createNewBranch)
3. ✅ **FIXED:** `gitBranchService.getUpstreamStatus()` is not a function
4. ✅ **FIXED:** `gitService.getRepository()` missing method

### Current Issues (To Fix in Phases)
1. No warning when switching branches with uncommitted changes
2. Buttons overflow in narrow Git panel
3. No progress indicators for long git operations
4. No visual git status in file explorer
5. No status bar git information

---

## 📚 Resources

### Reference Implementations
- **VS Code Git Extension:** https://github.com/microsoft/vscode/tree/main/extensions/git
- **Zed Git Integration:** https://github.com/zed-industries/zed/tree/main/crates/git

### Documentation
- **Material Icons Guide:** `/home/alejandro/Swarm/swarm-ide/docs/material-icons-guide.md`
- **Git Features TODO:** `/home/alejandro/Swarm/swarm-ide/docs/GIT_FEATURES_TODO.md`

### Git Commands Reference
```bash
# Status
git status --porcelain=v2 --branch

# Branches
git branch --show-current
git branch --format=%(refname:short)|%(upstream:short)|%(upstream:track)
git checkout -b <branch>
git checkout <branch>

# Stash
git stash list
git stash push -m "message"
git stash pop
git stash apply

# Commits
git log --max-count=20 --format=%H|%an|%ae|%ad|%s --date=iso
git commit -m "message"

# Remote
git push origin <branch>
git pull origin <branch>
git fetch origin

# Upstream
git rev-parse --abbrev-ref @{upstream}
git rev-list --left-right --count origin/main...HEAD
```

### Event Bus Events

Git-related events emitted in Swarm IDE:

| Event Name | When Emitted | Data Payload |
|------------|--------------|--------------|
| `git:initialized` | Git service initialized | `{ repoPath }` |
| `git:status-updated` | File status changed | `{ branch, files }` |
| `git:commit-completed` | Commit successful | `{ message }` |
| `git:branch-changed` | Branch switched | `{ branch }` |
| `git:branch-switched` | Branch switched | `{ branch }` |
| `git:push-completed` | Push finished | `{}` |
| `git:pull-completed` | Pull finished | `{}` |
| `git:fetch-completed` | Fetch finished | `{}` |
| `git:stash-created` | Stash created | `{ message }` |
| `git:repository-updated` | Any git operation | `{ operation }` |
| `git:open-panel` | Request to open panel | `{}` |

---

## 📝 Progress Tracking

### Phase 1 Status: In Progress
- [x] 1.1a: Add auto-refresh after commit
- [ ] 1.1b: Create debounce utility
- [ ] 1.1c: Add event-driven auto-refresh
- [ ] 1.1d: Emit repository update events
- [ ] 1.2a: Implement uncommitted changes detection
- [ ] 1.2b: Create warning dialog
- [ ] 1.2c: Implement auto-stash
- [ ] 1.2d: Modify branch switching workflow
- [ ] 1.3a: Audit buttons for icons
- [ ] 1.3b: Replace toolbar buttons
- [ ] 1.3c: Fix button overflow CSS
- [ ] 1.3d: Add file action icons
- [ ] 1.3e: Test all icons

### Phase 2 Status: Not Started
- [ ] 2.1: Status bar git info
- [ ] 2.2: File explorer colors
- [ ] 2.3: Progress indicators

### Phase 3 Status: Not Started
- [ ] 3.1: Conflict resolution UI
- [ ] 3.2: Stash management
- [ ] 3.3: Partial staging

---

**Last Updated:** 2025-01-08
**Next Review:** After Phase 1 completion
