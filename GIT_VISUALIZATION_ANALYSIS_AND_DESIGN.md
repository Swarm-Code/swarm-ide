# Swarm IDE - Git Visualization Analysis & Design Plan

## Executive Summary

This document provides a comprehensive analysis of the existing Git visualization implementation in Swarm IDE and proposes amazing design improvements for diff, blame, and history visualization systems. The analysis covers current implementations, gaps, and detailed recommendations with exact file modifications needed.

---

## Current Implementation Analysis

### 1. DIFF VISUALIZATION

#### **Current Implementation**

**Files Involved:**
- `/home/alejandro/Swarm/swarm-ide/src/services/GitDiffService.js` (689 lines)
- `/home/alejandro/Swarm/swarm-ide/src/components/TextEditor.js` (lines 1493-1550, 1567-1633)

**What Exists:**

✅ **GitDiffService** - Comprehensive diff service layer:
- Diff caching system (2-minute timeout)
- Support for both staged and unstaged diffs
- Hunk tracking and line-level diff detection
- Gutter decoration data generation
- Event-based cache invalidation
- Real-time diff updates on file changes
- Changed line queries (added/modified/deleted)
- Diff statistics calculation

✅ **TextEditor.renderDiffGutter()** (lines 1493-1550):
- Loads diff data from GitDiffService
- Clears existing diff markers
- Renders markers based on hunks
- Classifies lines as: `git-diff-added`, `git-diff-deleted`, `git-diff-modified`
- Sets gutter markers in 'git-diff-gutter' column

✅ **Event Flow:**
- `git:show-diff` event (from GitPanel) → TextEditor.handleShowDiff()
- Opens file and renders diff gutter automatically
- Auto-refresh on `git:file-changed` and `git:branch-switched`

✅ **GitPanel Integration:**
- Click on file in GitPanel → emits `git:show-diff` event (line 479)
- File opens in editor with diff visualization

**What's MISSING:**

❌ **NO CSS Styling** - No visual styling exists for diff gutter markers!
  - No `.git-diff-gutter-marker` styles
  - No `.git-diff-added`, `.git-diff-deleted`, `.git-diff-modified` colors
  - No gutter decoration visualization

❌ **NO Side-by-Side Diff View** - Only inline gutter markers exist
  - No diff panel component
  - No before/after comparison view
  - No unified diff view panel

❌ **NO Diff Tooltips** - Hovering over diff markers shows nothing
  - No hunk header tooltips
  - No line content preview
  - No "show previous version" popup

❌ **NO Interactive Diff Actions**:
  - No "revert this hunk" button
  - No "stage this hunk" button
  - No "copy original line" action

❌ **NO Diff Highlighting** - No syntax-highlighted diff lines in editor

❌ **NO Diff Statistics Display** - No additions/deletions count

#### **Current renderDiffGutter() Implementation**

```javascript
// TextEditor.js lines 1493-1550
async renderDiffGutter() {
    if (!this.editor || !this.gitDiffEnabled) return;

    try {
        const { gitDiffService } = getGitServices();
        if (!gitDiffService) return;

        console.log('[TextEditor] Loading diff data for:', this.filePath);
        this.gitDiffData = await gitDiffService.getDiff(this.filePath);

        if (!this.gitDiffData) return;

        // Clear existing diff markers
        this.clearDiffGutter();

        // Render diff markers based on hunks
        for (const hunk of this.gitDiffData.hunks || []) {
            const startLine = hunk.newStart - 1; // CodeMirror uses 0-indexed lines
            const lineCount = hunk.newLines;

            for (let i = 0; i < lineCount; i++) {
                const line = startLine + i;
                const hunkLine = hunk.lines[i];

                if (!hunkLine) continue;

                let markerClass = '';
                if (hunkLine.startsWith('+')) {
                    markerClass = 'git-diff-added';
                } else if (hunkLine.startsWith('-')) {
                    markerClass = 'git-diff-deleted';
                } else if (hunkLine.startsWith(' ')) {
                    markerClass = 'git-diff-modified';
                }

                if (markerClass) {
                    const marker = document.createElement('div');
                    marker.className = `git-diff-gutter-marker ${markerClass}`;
                    this.editor.setGutterMarker(line, 'git-diff-gutter', marker);
                }
            }
        }
    } catch (error) {
        console.error('[TextEditor] Failed to render diff gutter:', error);
    }
}
```

**CRITICAL ISSUE:** This code creates markers but there's NO CSS to style them!

---

### 2. BLAME VISUALIZATION

#### **Current Implementation**

**Files Involved:**
- `/home/alejandro/Swarm/swarm-ide/src/services/GitBlameService.js` (593 lines)
- `/home/alejandro/Swarm/swarm-ide/src/components/TextEditor.js` (lines 1427-1488)

**What Exists:**

✅ **GitBlameService** - Comprehensive blame service layer:
- Blame caching system (5-minute timeout)
- Debounced blame loading (300ms delay, like Zed)
- Line-to-blame-entry mapping for fast lookup
- Blame streaming support for large files
- Range-based blame queries
- Unique commits extraction
- Active blame file tracking
- Gutter decoration data formatting
- Hover tooltip data generation

✅ **TextEditor.renderBlameGutter()** (lines 1454-1476):
- Loads blame data from GitBlameService
- Finds blame entry for each line
- Creates gutter markers with short SHA
- Sets tooltip with author and summary

✅ **TextEditor.toggleBlame()** (lines 1427-1449):
- Toggle blame on/off
- Load blame data on enable
- Clear gutter on disable

✅ **Blame in Hover Tooltips** (lines 969-992):
- Shows blame info in LSP hover tooltips when blame is enabled
- Displays: short SHA, author, summary, relative time
- Integrated with existing hover system

**What's MISSING:**

❌ **NO CSS Styling** - No visual styling for blame gutter!
  - No `.git-blame-gutter-marker` styles
  - No color coding by author
  - No age-based coloring (heat map)

❌ **NO Blame Panel** - No dedicated blame view
  - No commit details panel
  - No "show commit diff" button
  - No blame timeline view

❌ **NO Blame Annotations** - Only gutter markers exist
  - No inline author annotations
  - No commit age visualization
  - No author avatars/colors

❌ **NO Blame Filtering** - Cannot filter by:
  - Author
  - Date range
  - Commit SHA

❌ **NO Keyboard Shortcuts** - No quick toggle for blame

#### **Current renderBlameGutter() Implementation**

```javascript
// TextEditor.js lines 1454-1476
renderBlameGutter() {
    if (!this.editor || !this.gitBlameData) return;

    const lineCount = this.editor.lineCount();

    for (let line = 0; line < lineCount; line++) {
        const lineNumber = line + 1; // Git uses 1-indexed lines

        // Find blame entry for this line
        const blameEntry = this.gitBlameData.find(entry =>
            lineNumber >= entry.lineStart && lineNumber <= entry.lineEnd
        );

        if (blameEntry) {
            const marker = document.createElement('div');
            marker.className = 'git-blame-gutter-marker';
            marker.textContent = blameEntry.shortSha;
            marker.title = `${blameEntry.author} - ${blameEntry.summary}`;

            this.editor.setGutterMarker(line, 'git-blame-gutter', marker);
        }
    }
}
```

**CRITICAL ISSUE:** Creates markers but NO CSS styling exists!

---

### 3. HISTORY VISUALIZATION

#### **Current Implementation**

**Files Involved:**
- `/home/alejandro/Swarm/swarm-ide/src/services/GitHistoryService.js` (699 lines)
- `/home/alejandro/Swarm/swarm-ide/src/components/GitHistoryPanel.js` (569 lines)

**What Exists:**

✅ **GitHistoryService** - Comprehensive history service:
- Pagination support (default 50 commits, max 200)
- History caching (5-minute timeout)
- Filtering by: author, date range, message pattern
- File-specific history tracking
- Commit detail loading
- Commit diff retrieval
- Statistics and timeline generation
- Author extraction

✅ **GitHistoryPanel** - Full history UI component:
- Split view: commit list + commit detail
- Filter inputs (author, message)
- Pagination controls
- Commit list with SHA, date, author, message
- Commit detail view with diff
- Event-driven updates (git:commit-created, git:branch-switched)
- Toggle via `git:toggle-history` event

✅ **Commit Detail View** (lines 309-394):
- SHA, author, date, message display
- Diff rendering with hunks
- File headers
- Line-by-line diff with +/- indicators

**What's MISSING:**

❌ **NO Dedicated CSS Styling** - History panel uses generic `.panel` styles
  - No `.git-history-*` CSS classes found in styles.css
  - No visual polish for commit list
  - No diff syntax highlighting in history view

❌ **NO Graph Visualization** - No commit graph/timeline
  - No branch visualization
  - No merge visualization
  - No parent-child relationships shown

❌ **NO Advanced Filtering**:
  - No date picker
  - No multi-author selection
  - No file path filter
  - No regex search

❌ **NO Commit Actions**:
  - No "cherry-pick" button
  - No "revert commit" button
  - No "checkout commit" button
  - No "copy SHA" button

❌ **NO File Tree in Commit** - Diff view is flat
  - No file tree structure
  - No file statistics
  - No expand/collapse files

❌ **NO Activity Heatmap** - No contribution calendar

❌ **NO Keyboard Navigation** - Cannot navigate commits with arrow keys

---

## Data Flow Analysis

### Diff Data Flow

```
GitService.getDiff(filePath, options)
    ↓
GitDiffService.getDiff(filePath)
    ├→ Check cache
    ├→ Fetch from GitService
    ├→ Parse hunks
    ├→ Update cache
    └→ Emit 'git-diff:loaded' event
        ↓
GitDiffService.getGutterDecorations(filePath)
    ├→ Create decoration objects
    ├→ Mark modifications
    └→ Return decorations array
        ↓
TextEditor.renderDiffGutter()
    ├→ Load diff data
    ├→ Clear gutter
    ├→ Create marker DOM elements
    └→ Set gutter markers
        ↓
CodeMirror renders gutter
    ↓
❌ NO CSS STYLES APPLIED (BROKEN FLOW)
```

**BROKEN LINK:** Markers are created but invisible (no CSS)!

### Blame Data Flow

```
GitService.getBlame(filePath, options)
    ↓
GitBlameService.getBlame(filePath)
    ├→ Check cache
    ├→ Debounce (300ms)
    ├→ Fetch from GitService
    ├→ Create line map
    ├→ Update cache
    └→ Emit 'git-blame:loaded' event
        ↓
GitBlameService.getGutterDecorations(filePath)
    ├→ Create decoration objects per line
    ├→ Format annotations
    └→ Return decorations array
        ↓
TextEditor.renderBlameGutter()
    ├→ Load blame data
    ├→ Find blame entry per line
    ├→ Create marker DOM elements
    └→ Set gutter markers
        ↓
CodeMirror renders gutter
    ↓
❌ NO CSS STYLES APPLIED (BROKEN FLOW)
```

**BROKEN LINK:** Markers are created but invisible (no CSS)!

### History Data Flow

```
GitService.getLog(options)
    ↓
GitHistoryService.getHistory(options)
    ├→ Check cache
    ├→ Fetch from GitService with pagination
    ├→ Update cache
    ├→ Update pagination state
    └→ Emit 'git-history:loaded' event
        ↓
GitHistoryPanel.loadHistory()
    ├→ Get commits with filters
    └→ Render commit list
        ↓
User selects commit
    ↓
GitHistoryPanel.showCommitDetail(commit)
    ├→ Load commit details
    ├→ Get commit diff
    └→ Render detail view
        ↓
GitHistoryPanel.renderCommitDetail(commit)
    ├→ Show commit metadata
    └→ Render diff hunks
        ↓
✅ WORKS but needs CSS polish
```

**PARTIALLY WORKING:** Basic functionality exists but needs visual enhancement.

---

## Event Flow Mapping

### Diff Events

| Event | Source | Handler | Purpose |
|-------|--------|---------|---------|
| `git:show-diff` | GitPanel (line 479) | TextEditor.handleShowDiff() | Open file and show diff |
| `git:file-changed` | GitStore | TextEditor.handleGitFileChanged() | Refresh diff gutter |
| `git:branch-switched` | GitStore | TextEditor.handleGitBranchSwitched() | Refresh diff gutter |
| `git-diff:loaded` | GitDiffService | ❌ NO HANDLER | (unused) |
| `git-diff:refreshed` | GitDiffService | ❌ NO HANDLER | (unused) |
| `git-diff:enabled` | GitDiffService | ❌ NO HANDLER | (unused) |
| `git-diff:disabled` | GitDiffService | ❌ NO HANDLER | (unused) |
| `git-diff:cache-invalidated` | GitDiffService | ❌ NO HANDLER | (unused) |

### Blame Events

| Event | Source | Handler | Purpose |
|-------|--------|---------|---------|
| `git:show-blame` | ❌ NOT EMITTED | ❌ NO HANDLER | (missing) |
| `git-blame:loaded` | GitBlameService | ❌ NO HANDLER | (unused) |
| `git-blame:enabled` | GitBlameService | ❌ NO HANDLER | (unused) |
| `git-blame:disabled` | GitBlameService | ❌ NO HANDLER | (unused) |
| `git-blame:cache-invalidated` | GitBlameService | ❌ NO HANDLER | (unused) |

### History Events

| Event | Source | Handler | Purpose |
|-------|--------|---------|---------|
| `git:toggle-history` | Menu/Keyboard | GitHistoryPanel.toggle() | Toggle history panel |
| `git:commit-created` | GitPanel | GitHistoryPanel.loadHistory() | Refresh after commit |
| `git:branch-switched` | GitStore | GitHistoryPanel.loadHistory() | Refresh on branch change |
| `git-history:loaded` | GitHistoryService | ❌ NO HANDLER | (unused) |
| `git-history:search-results` | GitHistoryService | ❌ NO HANDLER | (unused) |
| `git-history:cache-invalidated` | GitHistoryService | ❌ NO HANDLER | (unused) |

**KEY FINDING:** Many events are emitted by services but never consumed!

---

## CSS Analysis

### Current Git CSS (styles.css lines 4229-4542)

**What Exists:**
- `.git-panel` - Git panel container (lines 4229-4235)
- `.git-panel-header` - Panel header (lines 4238-4275)
- `.git-panel-content` - Content area (lines 4278-4286)
- `.git-commit-section` - Commit input section (lines 4289-4321)
- `.git-section` - File sections (lines 4351-4383)
- `.git-files-list` - File list container (lines 4386-4390)
- `.git-file-item` - File items (lines 4393-4411)
- `.git-file-status` - Status badges (lines 4414-4426)
- `.git-toast` - Toast notifications (lines 4481-4524)

**What's COMPLETELY MISSING:**

❌ **NO Diff Gutter Styles:**
```css
/* MISSING - Need to add */
.git-diff-gutter-marker { }
.git-diff-added { }
.git-diff-deleted { }
.git-diff-modified { }
```

❌ **NO Blame Gutter Styles:**
```css
/* MISSING - Need to add */
.git-blame-gutter-marker { }
.git-blame-gutter-marker:hover { }
```

❌ **NO History Panel Styles:**
```css
/* MISSING - Need to add */
.git-history-panel { }
.git-history-filter { }
.git-commits-list { }
.git-commit-item { }
.git-commit-detail { }
.git-diff-view { }
```

❌ **NO Hover Tooltip Git Styles:**
```css
/* MISSING - Need to add */
.hover-git-blame { }
.git-blame-header { }
.git-blame-sha { }
```

---

## Design Recommendations

### 1. AMAZING DIFF VISUALIZATION

#### **A. Enhanced Gutter Markers**

**Design Inspiration:** VS Code + GitLens

**Features:**
- Color-coded diff indicators (green/red/yellow)
- Animated glow on changes
- Hover tooltips showing:
  - Hunk header context
  - Line count (+X/-Y)
  - Quick actions (revert/stage)
- Click to show inline diff popup

**CSS Design:**
```css
/* Modern diff gutter markers */
.git-diff-gutter-marker {
    width: 4px;
    height: 100%;
    border-radius: 2px;
    transition: all 0.2s ease;
    cursor: pointer;
    position: relative;
}

.git-diff-gutter-marker:hover {
    width: 6px;
    box-shadow: 0 0 8px currentColor;
}

.git-diff-added {
    background: linear-gradient(90deg, #4caf50, #66bb6a);
    border-left: 2px solid #81c784;
}

.git-diff-deleted {
    background: linear-gradient(90deg, #f44336, #e57373);
    border-left: 2px solid #ef5350;
}

.git-diff-modified {
    background: linear-gradient(90deg, #ff9800, #ffb74d);
    border-left: 2px solid #ffa726;
}

/* Pulse animation for recent changes */
@keyframes diff-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

.git-diff-gutter-marker.recent {
    animation: diff-pulse 2s ease-in-out 3;
}
```

#### **B. Side-by-Side Diff Panel**

**Design:** Split pane with before/after comparison

**Component:** `GitDiffPanel.js` (NEW FILE)

**Features:**
- Synchronized scrolling
- Line-by-line alignment
- Word-level diff highlighting
- Collapse unchanged regions
- Toggle unified/split view
- Copy from either side
- Navigate between changes

**Structure:**
```html
<div class="git-diff-panel">
    <div class="git-diff-toolbar">
        <button>Unified</button>
        <button>Split</button>
        <span>5 additions, 2 deletions</span>
    </div>
    <div class="git-diff-content split-view">
        <div class="git-diff-pane before">...</div>
        <div class="git-diff-pane after">...</div>
    </div>
</div>
```

#### **C. Inline Diff Tooltips**

**Design:** Popup on hover over gutter marker

**Features:**
- Shows original line content for deletions
- Shows hunk header with context
- Quick action buttons:
  - Revert this change
  - Stage this hunk
  - Copy original line
- Keyboard shortcuts (Ctrl+Z to revert)

#### **D. Diff Statistics Badge**

**Design:** Small badge in editor header

**Content:**
- `+5 -2 ~3` (additions/deletions/modifications)
- Click to show diff panel
- Color-coded (green for additions dominant, red for deletions)

---

### 2. AMAZING BLAME VISUALIZATION

#### **A. Enhanced Blame Gutter**

**Design Inspiration:** GitLens + IntelliJ IDEA

**Features:**
- Age-based heat map coloring
- Author avatar/initials
- Relative time ("2 hours ago")
- Hover for full commit details
- Click to show commit diff
- Right-click for blame menu

**CSS Design:**
```css
/* Modern blame gutter markers */
.git-blame-gutter-marker {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.1),
        transparent);
    border-left: 3px solid #0e639c;
    font-size: 10px;
    font-family: 'Consolas', monospace;
    color: #888;
    transition: all 0.2s ease;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    height: 100%;
}

.git-blame-gutter-marker:hover {
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.3),
        rgba(14, 99, 156, 0.1));
    border-left-color: #1177bb;
    color: #fff;
    z-index: 10;
}

/* Age-based heat map (newer = brighter) */
.git-blame-gutter-marker.age-recent {
    border-left-color: #4caf50;
    background: linear-gradient(90deg,
        rgba(76, 175, 80, 0.2),
        transparent);
}

.git-blame-gutter-marker.age-week {
    border-left-color: #2196f3;
}

.git-blame-gutter-marker.age-month {
    border-left-color: #ff9800;
}

.git-blame-gutter-marker.age-old {
    border-left-color: #9e9e9e;
    opacity: 0.6;
}

/* Author color coding */
.git-blame-author-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 9px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;
}
```

#### **B. Blame Detail Popup**

**Design:** Rich hover tooltip

**Features:**
- Commit SHA (click to copy)
- Author name + email
- Commit date (absolute + relative)
- Full commit message
- Changed files count
- Quick actions:
  - Show commit diff
  - Go to commit in history
  - Blame previous revision

#### **C. Blame Timeline View**

**Design:** Vertical timeline in dedicated panel

**Component:** `GitBlameTimelinePanel.js` (NEW FILE)

**Features:**
- Visual timeline of commits affecting current file
- Author avatars
- Commit messages
- Lines affected per commit
- Click to show diff at that commit
- Scrub through file history

#### **D. Inline Author Annotations**

**Design:** Author name shown at end of lines

**Features:**
- Fade-in on hover
- Show only first line of each commit block
- Color-coded by author
- Configurable (on/off via settings)

---

### 3. AMAZING HISTORY VISUALIZATION

#### **A. Enhanced Commit List**

**Design Improvements:**

**Features:**
- Commit graph visualization (branches/merges)
- Author avatars (generated from initials)
- Tag badges
- Branch badges
- Relative timestamps with tooltips
- Color-coded status (merged/unmerged)
- Keyboard navigation (↑↓ arrows)
- Virtual scrolling for performance

**CSS Design:**
```css
/* Modern commit list styling */
.git-commit-item {
    display: grid;
    grid-template-columns: 40px 60px 1fr auto;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 6px;
    border-left: 3px solid transparent;
    transition: all 0.2s ease;
    cursor: pointer;
    background: linear-gradient(90deg,
        rgba(45, 45, 48, 0.3),
        transparent);
}

.git-commit-item:hover {
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.2),
        rgba(14, 99, 156, 0.05));
    border-left-color: #0e639c;
    transform: translateX(2px);
}

.git-commit-item.selected {
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.4),
        rgba(14, 99, 156, 0.1));
    border-left-color: #1177bb;
}

.git-commit-graph {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
}

/* Commit graph dot */
.git-commit-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #0e639c;
    border: 2px solid #1e1e1e;
    z-index: 2;
}

.git-commit-sha {
    font-family: 'Consolas', monospace;
    font-size: 11px;
    color: #888;
    padding: 2px 6px;
    background: rgba(14, 99, 156, 0.1);
    border-radius: 4px;
}

.git-commit-message {
    font-size: 13px;
    color: #e0e0e0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.git-commit-author {
    font-size: 11px;
    color: #888;
    display: flex;
    align-items: center;
    gap: 6px;
}

.git-author-avatar {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #0e639c;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 700;
}
```

#### **B. Advanced Filtering Panel**

**Features:**
- Author multi-select dropdown
- Date range picker (from/to)
- Message search with regex toggle
- File path filter
- Branch filter
- Tag filter
- Save filter presets

#### **C. Commit Graph Visualization**

**Design:** VS Code Git Graph extension style

**Features:**
- Visual branch/merge lines
- Color-coded branches
- Zoom in/out
- Pan navigation
- Click commit to show details
- Hover for quick info

#### **D. Enhanced Diff View in History**

**Features:**
- Syntax-highlighted diff
- File tree sidebar (expandable)
- File statistics (additions/deletions per file)
- Collapse unchanged files
- Jump to file in tree
- View file at commit

#### **E. Activity Heatmap**

**Design:** GitHub contribution calendar style

**Component:** `GitActivityHeatmap.js` (NEW FILE)

**Features:**
- Color-coded by commit count
- Hover shows commit count + date
- Click to filter commits by that day
- Configurable time range
- Show author heatmap

---

## Implementation Priority

### Phase 1: CRITICAL CSS FIXES (Immediate)
**Priority:** 🔴 HIGHEST
**Time:** 2-4 hours

These are BROKEN features that exist in code but are invisible!

1. **Add Diff Gutter CSS**
   - File: `styles.css`
   - Lines to add: ~50 lines after line 4542
   - Impact: Makes existing diff visualization visible

2. **Add Blame Gutter CSS**
   - File: `styles.css`
   - Lines to add: ~40 lines
   - Impact: Makes existing blame visualization visible

3. **Add History Panel CSS**
   - File: `styles.css`
   - Lines to add: ~100 lines
   - Impact: Polishes existing history panel

### Phase 2: Enhanced Visualizations (High Priority)
**Priority:** 🟠 HIGH
**Time:** 8-12 hours

4. **Diff Tooltips & Hover Actions**
   - File: `TextEditor.js`
   - New methods: `showDiffTooltip()`, `createDiffTooltip()`
   - Impact: Interactive diff exploration

5. **Blame Heat Map & Age Coloring**
   - File: `TextEditor.js`
   - Modify: `renderBlameGutter()` to add age classes
   - Impact: Visual commit age representation

6. **History Commit Graph**
   - File: `GitHistoryPanel.js`
   - New method: `renderCommitGraph()`
   - Impact: Branch visualization

### Phase 3: New Panels (Medium Priority)
**Priority:** 🟡 MEDIUM
**Time:** 16-24 hours

7. **Side-by-Side Diff Panel**
   - New file: `src/components/GitDiffPanel.js`
   - Integration: TextEditor, GitPanel
   - Impact: Full diff comparison view

8. **Blame Timeline Panel**
   - New file: `src/components/GitBlameTimelinePanel.js`
   - Integration: TextEditor
   - Impact: Commit timeline per file

9. **Activity Heatmap**
   - New file: `src/components/GitActivityHeatmap.js`
   - Integration: GitHistoryPanel
   - Impact: Contribution visualization

### Phase 4: Advanced Features (Lower Priority)
**Priority:** 🟢 LOW
**Time:** 12-16 hours

10. **Advanced History Filters**
    - Modify: `GitHistoryPanel.js`
    - Add: Date picker, multi-select, regex

11. **Interactive Diff Actions**
    - Modify: `TextEditor.js`
    - Add: Revert hunk, stage hunk buttons

12. **Author Avatars & Color Coding**
    - Modify: `GitHistoryPanel.js`, `TextEditor.js`
    - Add: Avatar generation, color assignment

---

## Exact File Modifications Needed

### 1. styles.css (ADD ~250 lines)

**Location:** After line 4542

**Content:**
```css
/* ========================================
   GIT DIFF GUTTER STYLES
   ======================================== */

/* Diff gutter markers */
.git-diff-gutter-marker {
    width: 4px;
    height: 100%;
    border-radius: 2px 0 0 2px;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    position: relative;
}

.git-diff-gutter-marker:hover {
    width: 6px;
    box-shadow: 0 0 10px currentColor;
    filter: brightness(1.3);
}

/* Added lines - green */
.git-diff-added {
    background: linear-gradient(90deg, #4caf50 0%, #66bb6a 100%);
    border-left: 2px solid #81c784;
}

.git-diff-added:hover {
    background: linear-gradient(90deg, #66bb6a 0%, #81c784 100%);
}

/* Deleted lines - red */
.git-diff-deleted {
    background: linear-gradient(90deg, #f44336 0%, #e57373 100%);
    border-left: 2px solid #ef5350;
    position: relative;
}

.git-diff-deleted:hover {
    background: linear-gradient(90deg, #e57373 0%, #ef5350 100%);
}

/* Modified lines - yellow/orange */
.git-diff-modified {
    background: linear-gradient(90deg, #ff9800 0%, #ffb74d 100%);
    border-left: 2px solid #ffa726;
}

.git-diff-modified:hover {
    background: linear-gradient(90deg, #ffb74d 0%, #ffa726 100%);
}

/* Pulse animation for recent changes */
@keyframes diff-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.6; }
}

.git-diff-gutter-marker.recent {
    animation: diff-pulse 2s ease-in-out infinite;
}

/* Diff line highlighting in editor */
.CodeMirror-line.git-line-added {
    background: rgba(76, 175, 80, 0.1);
    border-left: 2px solid #4caf50;
}

.CodeMirror-line.git-line-deleted {
    background: rgba(244, 67, 54, 0.1);
    border-left: 2px solid #f44336;
    text-decoration: line-through;
    opacity: 0.7;
}

.CodeMirror-line.git-line-modified {
    background: rgba(255, 152, 0, 0.1);
    border-left: 2px solid #ff9800;
}

/* ========================================
   GIT BLAME GUTTER STYLES
   ======================================== */

/* Blame gutter markers */
.git-blame-gutter-marker {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.08),
        transparent 70%);
    border-left: 3px solid rgba(14, 99, 156, 0.4);
    font-size: 10px;
    font-family: 'Consolas', 'Monaco', monospace;
    color: #858585;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    height: 100%;
    text-overflow: ellipsis;
}

.git-blame-gutter-marker:hover {
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.25),
        rgba(14, 99, 156, 0.08) 70%);
    border-left-color: #1177bb;
    border-left-width: 4px;
    color: #ffffff;
    z-index: 10;
    box-shadow: 0 0 12px rgba(14, 99, 156, 0.4);
}

/* Age-based heat map coloring */
.git-blame-gutter-marker.age-today {
    border-left-color: #4caf50;
    background: linear-gradient(90deg,
        rgba(76, 175, 80, 0.15),
        transparent 70%);
}

.git-blame-gutter-marker.age-week {
    border-left-color: #2196f3;
    background: linear-gradient(90deg,
        rgba(33, 150, 243, 0.12),
        transparent 70%);
}

.git-blame-gutter-marker.age-month {
    border-left-color: #ff9800;
    background: linear-gradient(90deg,
        rgba(255, 152, 0, 0.10),
        transparent 70%);
}

.git-blame-gutter-marker.age-old {
    border-left-color: #757575;
    background: linear-gradient(90deg,
        rgba(117, 117, 117, 0.08),
        transparent 70%);
    opacity: 0.7;
}

/* Blame in hover tooltips */
.hover-git-blame {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid rgba(62, 62, 66, 0.5);
}

.git-blame-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
}

.git-blame-sha {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 10px;
    padding: 2px 6px;
    background: rgba(14, 99, 156, 0.2);
    border-radius: 3px;
    color: #4fc1ff;
    font-weight: 600;
}

.git-blame-author {
    font-size: 11px;
    color: #cccccc;
    font-weight: 500;
}

.git-blame-summary {
    font-size: 12px;
    color: #e0e0e0;
    margin-bottom: 4px;
    line-height: 1.4;
}

.git-blame-time {
    font-size: 10px;
    color: #888888;
    font-style: italic;
}

/* ========================================
   GIT HISTORY PANEL STYLES
   ======================================== */

.git-history-panel {
    position: fixed;
    top: 32px; /* Below menu bar */
    right: 0;
    bottom: 0;
    width: 800px;
    background-color: #1e1e1e;
    border-left: 1px solid #2d2d30;
    display: flex;
    flex-direction: column;
    z-index: 900;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.3);
}

.git-history-panel-header {
    padding: 12px 16px;
    background-color: #252526;
    border-bottom: 1px solid #2d2d30;
    display: flex;
    align-items: center;
    justify-content: space-between;
}

.git-history-panel-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: #cccccc;
    margin: 0;
}

.git-history-filter {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    background-color: #252526;
    border-bottom: 1px solid #2d2d30;
}

.git-filter-input {
    flex: 1;
    padding: 6px 12px;
    background-color: #1e1e1e;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    color: #ffffff;
    font-size: 12px;
    transition: border-color 0.2s ease;
}

.git-filter-input:focus {
    outline: none;
    border-color: #0e639c;
}

.git-filter-input::placeholder {
    color: #656565;
}

.git-history-split-view {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.git-history-list-section {
    width: 350px;
    border-right: 1px solid #2d2d30;
    display: flex;
    flex-direction: column;
    background-color: #1e1e1e;
}

.git-commits-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

.git-commit-item {
    padding: 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    margin-bottom: 4px;
    border-left: 3px solid transparent;
    background: linear-gradient(90deg,
        rgba(45, 45, 48, 0.3),
        transparent);
}

.git-commit-item:hover {
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.15),
        rgba(14, 99, 156, 0.05));
    border-left-color: #0e639c;
    transform: translateX(2px);
}

.git-commit-item.selected {
    background: linear-gradient(90deg,
        rgba(14, 99, 156, 0.3),
        rgba(14, 99, 156, 0.1));
    border-left-color: #1177bb;
}

.git-commit-item-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
}

.git-commit-sha {
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    padding: 2px 6px;
    background: rgba(14, 99, 156, 0.2);
    border-radius: 3px;
    color: #4fc1ff;
    font-weight: 600;
}

.git-commit-date {
    font-size: 10px;
    color: #858585;
}

.git-commit-message {
    font-size: 13px;
    color: #e0e0e0;
    margin-bottom: 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
}

.git-commit-author {
    font-size: 11px;
    color: #858585;
}

.git-pagination-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px;
    background-color: #252526;
    border-top: 1px solid #2d2d30;
}

.git-pagination-btn {
    padding: 6px 12px;
    background-color: #2d2d30;
    color: #ffffff;
    border: 1px solid #3e3e42;
    border-radius: 4px;
    cursor: pointer;
    font-size: 11px;
    transition: all 0.2s ease;
}

.git-pagination-btn:hover:not(:disabled) {
    background-color: #0e639c;
    border-color: #0e639c;
}

.git-pagination-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.git-pagination-info {
    font-size: 11px;
    color: #858585;
}

.git-history-detail-section {
    flex: 1;
    overflow-y: auto;
    padding: 16px;
    background-color: #1e1e1e;
}

.git-commit-detail {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.git-detail-empty {
    text-align: center;
    padding: 60px 24px;
    color: #656565;
    font-size: 14px;
}

.git-commit-detail-info {
    background-color: #252526;
    padding: 16px;
    border-radius: 6px;
    border-left: 4px solid #0e639c;
}

.git-commit-detail-info > div {
    margin-bottom: 10px;
    font-size: 12px;
    line-height: 1.6;
}

.git-commit-detail-info > div:last-child {
    margin-bottom: 0;
}

.git-commit-detail-info strong {
    color: #4fc1ff;
    margin-right: 8px;
}

.git-commit-detail-diff h4 {
    font-size: 13px;
    color: #cccccc;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid #2d2d30;
}

.git-diff-view {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.git-diff-file-header {
    background-color: #252526;
    padding: 8px 12px;
    border-radius: 4px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    color: #4fc1ff;
    font-weight: 600;
}

.git-diff-hunk {
    background-color: #1e1e1e;
    border: 1px solid #2d2d30;
    border-radius: 4px;
    overflow: hidden;
}

.git-diff-hunk-header {
    background-color: #2d2d30;
    padding: 6px 12px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 11px;
    color: #858585;
}

.git-diff-line {
    padding: 2px 12px;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
    line-height: 1.5;
}

.git-diff-line-added {
    background-color: rgba(76, 175, 80, 0.15);
    color: #81c784;
    border-left: 3px solid #4caf50;
}

.git-diff-line-deleted {
    background-color: rgba(244, 67, 54, 0.15);
    color: #e57373;
    border-left: 3px solid #f44336;
    text-decoration: line-through;
}

.git-diff-line-context {
    color: #cccccc;
    opacity: 0.7;
}

/* Scrollbar for history sections */
.git-commits-list::-webkit-scrollbar,
.git-history-detail-section::-webkit-scrollbar {
    width: 8px;
}

.git-commits-list::-webkit-scrollbar-track,
.git-history-detail-section::-webkit-scrollbar-track {
    background-color: #1e1e1e;
}

.git-commits-list::-webkit-scrollbar-thumb,
.git-history-detail-section::-webkit-scrollbar-thumb {
    background-color: #3e3e42;
    border-radius: 4px;
}

.git-commits-list::-webkit-scrollbar-thumb:hover,
.git-history-detail-section::-webkit-scrollbar-thumb:hover {
    background-color: #4e4e52;
}
```

### 2. TextEditor.js (MODIFY)

**Location:** Line 1454 (renderBlameGutter method)

**Change:** Add age-based CSS classes

```javascript
// BEFORE
renderBlameGutter() {
    if (!this.editor || !this.gitBlameData) return;

    const lineCount = this.editor.lineCount();

    for (let line = 0; line < lineCount; line++) {
        const lineNumber = line + 1;

        const blameEntry = this.gitBlameData.find(entry =>
            lineNumber >= entry.lineStart && lineNumber <= entry.lineEnd
        );

        if (blameEntry) {
            const marker = document.createElement('div');
            marker.className = 'git-blame-gutter-marker';
            marker.textContent = blameEntry.shortSha;
            marker.title = `${blameEntry.author} - ${blameEntry.summary}`;

            this.editor.setGutterMarker(line, 'git-blame-gutter', marker);
        }
    }
}

// AFTER
renderBlameGutter() {
    if (!this.editor || !this.gitBlameData) return;

    const lineCount = this.editor.lineCount();
    const now = Math.floor(Date.now() / 1000);

    for (let line = 0; line < lineCount; line++) {
        const lineNumber = line + 1;

        const blameEntry = this.gitBlameData.find(entry =>
            lineNumber >= entry.lineStart && lineNumber <= entry.lineEnd
        );

        if (blameEntry) {
            const marker = document.createElement('div');
            marker.className = 'git-blame-gutter-marker';

            // Add age-based class for heat map
            const age = now - blameEntry.authorTime;
            if (age < 86400) { // < 1 day
                marker.classList.add('age-today');
            } else if (age < 604800) { // < 1 week
                marker.classList.add('age-week');
            } else if (age < 2592000) { // < 1 month
                marker.classList.add('age-month');
            } else {
                marker.classList.add('age-old');
            }

            marker.textContent = blameEntry.shortSha;
            marker.title = `${blameEntry.author} - ${blameEntry.summary}\n${this._formatRelativeTime(blameEntry.authorTime)}`;

            this.editor.setGutterMarker(line, 'git-blame-gutter', marker);
        }
    }
}
```

### 3. GitHistoryPanel.js (MODIFY)

**Location:** Line 330 (showCommitDetail method)

**Change:** Fix undefined method call

```javascript
// BEFORE (line 330)
const commitDetail = await gitHistoryService.getCommitDetail(commit.sha);

// AFTER
// Get commit object (already have it)
const commitDetail = commit;

// Load diff separately
const diffs = await gitHistoryService.getCommitDiff(commit.sha);
commitDetail.diff = diffs;
```

---

## Files to Create

### 1. `src/components/GitDiffPanel.js` (NEW)
**Purpose:** Side-by-side diff comparison panel
**Lines:** ~600 lines
**Priority:** Phase 3

### 2. `src/components/GitBlameTimelinePanel.js` (NEW)
**Purpose:** Visual commit timeline for current file
**Lines:** ~400 lines
**Priority:** Phase 3

### 3. `src/components/GitActivityHeatmap.js` (NEW)
**Purpose:** GitHub-style contribution calendar
**Lines:** ~350 lines
**Priority:** Phase 3

---

## Summary of Gaps

### Critical Gaps (Phase 1)
1. ❌ **NO CSS for diff gutter** - Diff markers are invisible
2. ❌ **NO CSS for blame gutter** - Blame markers are invisible
3. ❌ **NO CSS polish for history panel** - Looks basic

### High-Priority Gaps (Phase 2)
4. ❌ **NO diff tooltips** - Cannot see hunk details on hover
5. ❌ **NO blame age coloring** - Cannot see commit age visually
6. ❌ **NO commit graph** - Cannot see branch structure

### Medium-Priority Gaps (Phase 3)
7. ❌ **NO side-by-side diff** - No full diff comparison view
8. ❌ **NO blame timeline** - No commit history per file
9. ❌ **NO activity heatmap** - No contribution visualization

### Lower-Priority Gaps (Phase 4)
10. ❌ **NO advanced filters** - Basic filtering only
11. ❌ **NO interactive diff actions** - Cannot revert/stage hunks
12. ❌ **NO author avatars** - No visual author identification

---

## Testing Checklist

### Diff Visualization
- [ ] Green markers appear for added lines
- [ ] Red markers appear for deleted lines
- [ ] Yellow markers appear for modified lines
- [ ] Hover shows tooltip with hunk info
- [ ] Click opens file in editor
- [ ] Auto-refresh on file save
- [ ] Auto-refresh on branch switch

### Blame Visualization
- [ ] Blame markers show SHA
- [ ] Age-based colors applied correctly
- [ ] Hover shows full commit details
- [ ] Recent commits highlighted
- [ ] Blame integrates with hover tooltips
- [ ] Toggle blame on/off works

### History Visualization
- [ ] Commit list loads with pagination
- [ ] Filter by author works
- [ ] Filter by message works
- [ ] Select commit shows details
- [ ] Commit diff renders correctly
- [ ] Pagination forward/backward works
- [ ] Refresh on new commit works

---

## Performance Considerations

### Caching Strategy
- **Diff:** 2-minute cache (already implemented)
- **Blame:** 5-minute cache (already implemented)
- **History:** 5-minute cache (already implemented)

### Virtual Scrolling
- **History panel:** Implement virtual scrolling for 1000+ commits
- **Diff panel:** Lazy load hunks for large diffs

### Debouncing
- **Blame:** 300ms debounce (already implemented)
- **Diff:** Auto-refresh on save (no debounce needed)

---

## Conclusion

The Git visualization system in Swarm IDE has **excellent service-layer architecture** with comprehensive caching, event systems, and data management. However, the **frontend visualization layer is incomplete**:

1. **Diff and blame gutter markers exist in code but are invisible** due to missing CSS
2. **History panel works but lacks visual polish**
3. **No advanced UI components** (side-by-side diff, blame timeline, activity heatmap)

**Next Steps:**
1. ✅ Add CSS for diff/blame gutters (IMMEDIATE)
2. ✅ Polish history panel CSS (HIGH PRIORITY)
3. ✅ Add interactive tooltips and hover actions
4. ✅ Build advanced visualization panels

This design document provides exact locations, code snippets, and implementation priorities to transform Swarm IDE's Git visualization into an **amazing, modern, and feature-rich system** comparable to VS Code + GitLens.
