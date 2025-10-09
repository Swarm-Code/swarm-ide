# Logging System Documentation

## Table of Contents
1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Adding Logging to Your Code](#adding-logging-to-your-code)
4. [Log Levels](#log-levels)
5. [Functionality Tags](#functionality-tags)
6. [Adding New Functionality Tags to the UI](#adding-new-functionality-tags-to-the-ui)
7. [Configuration](#configuration)
8. [Best Practices](#best-practices)
9. [Examples](#examples)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Swarm IDE uses a **functionality-based logging system** that allows granular control over which parts of the application log information. Instead of traditional component-based logging, logs are organized by **functionality tags** (e.g., `gitPush`, `hover`, `fileOpen`), making it easy to:

- Enable logging for ONLY specific features you're debugging
- Silence noisy operations while keeping others visible
- Filter logs by feature rather than by file
- Control log verbosity with 5 log levels (ERROR, WARN, INFO, DEBUG, TRACE)

**Key Features:**
- ✅ **Disabled by default** - No logs clutter your console
- ✅ **Whitelist/Blacklist modes** - Enable only what you need
- ✅ **46 functionality tags** - Granular control over every feature
- ✅ **UI controls** - Toggle logging via Settings panel
- ✅ **Zero overhead** - When disabled, logger calls are no-ops
- ✅ **Always show errors** - Critical errors always logged (configurable)

---

## Quick Start

### Enable Logging in the UI

1. Open Settings (Gear icon or `File > Settings`)
2. Scroll to the **Logging** section
3. Check **"Enable logging"** to turn on the logger
4. Select a log level (WARN, INFO, DEBUG, or TRACE)
5. Check the functionality boxes for features you want to log
6. Click **"Apply Logging Settings"**

### Enable Logging Programmatically

Open the browser console and run:

```javascript
// Enable logging
Logger.setEnabled(true);

// Set log level
Logger.setLevel('DEBUG');

// Enable only specific functionalities (whitelist mode)
Logger.enableOnly(['gitPush', 'gitPull', 'hover']);

// OR disable specific functionalities (blacklist mode)
Logger.disable(['tabSwitch', 'dragDrop', 'perfMonitor']);

// Show everything
Logger.showAll();
```

---

## Adding Logging to Your Code

### Step 1: Import the Logger

At the top of your file, import the Logger module:

```javascript
const logger = require('../utils/Logger');  // Adjust path as needed
```

**Path Examples:**
- From `/src/components/`: `require('../utils/Logger')`
- From `/src/services/`: `require('../utils/Logger')`
- From `/src/lib/git/`: `require('../../utils/Logger')`
- From `/src/modules/`: `require('../utils/Logger')`

### Step 2: Choose the Right Functionality Tag

Select a functionality tag that best describes what your code does. See [Functionality Tags](#functionality-tags) for the full list.

**Common tags:**
- Git operations: `gitPush`, `gitPull`, `gitFetch`, `gitCommit`, `gitBranch`, `gitMerge`
- LSP features: `hover`, `goToDefinition`, `findReferences`, `lspClient`
- Editor: `editorChange`, `diffRender`, `syntaxHighlight`
- Files: `fileOpen`, `fileClose`, `fileSave`, `fileWatch`
- UI: `tabSwitch`, `paneCreate`, `menu`, `dialog`

### Step 3: Replace console.* Calls

Replace `console.log`, `console.error`, `console.warn` with logger calls:

```javascript
// ❌ OLD WAY
console.log('[GitPanel] Pushing to remote', branch, remote);
console.error('[GitPanel] Push failed:', error);
console.warn('[GitPanel] No upstream branch');

// ✅ NEW WAY
logger.debug('gitPush', 'Pushing to remote', { branch, remote });
logger.error('gitPush', 'Push failed:', error);
logger.warn('gitPush', 'No upstream branch');
```

### Step 4: Use Appropriate Log Levels

Choose the right log level for each message:

```javascript
// ERROR - For errors, exceptions, failures
logger.error('gitPush', 'Failed to push to remote:', error);

// WARN - For warnings, potential issues, recoverable errors
logger.warn('gitPush', 'Push succeeded with warnings', warnings);

// INFO - For important events, major milestones (rarely used in app code)
logger.info('appInit', 'Application started', { version: '1.0.0' });

// DEBUG - For detailed debugging information (MOST COMMON)
logger.debug('gitPush', 'Pushing commits', { count: 3, branch: 'main' });

// TRACE - For very verbose, step-by-step execution traces
logger.trace('gitStatus', 'Executing git command:', cmd);
```

---

## Log Levels

The logger supports 5 log levels, from least to most verbose:

| Level | Value | Usage | Example |
|-------|-------|-------|---------|
| **ERROR** | 0 | Critical errors, exceptions, failures | `logger.error('gitPush', 'Failed:', err)` |
| **WARN** | 1 | Warnings, potential issues, recoverable errors | `logger.warn('fileWatch', 'Slow watcher')` |
| **INFO** | 2 | Important events, major milestones | `logger.info('appInit', 'App started')` |
| **DEBUG** | 3 | Detailed debugging information (**default**) | `logger.debug('gitPull', 'Pulling from remote')` |
| **TRACE** | 4 | Very verbose, step-by-step traces | `logger.trace('hover', 'Hover at line 42')` |

**How log levels work:**
- If you set level to **INFO**, only INFO, WARN, and ERROR logs will show
- If you set level to **DEBUG**, DEBUG, INFO, WARN, and ERROR logs will show
- If you set level to **TRACE**, ALL logs will show

---

## Functionality Tags

All available functionality tags are organized by category:

### Git Operations (11 tags)
- `gitPush` - Git push operations
- `gitPull` - Git pull operations
- `gitFetch` - Git fetch operations
- `gitCommit` - Git commit operations
- `gitBranch` - Git branch management
- `gitMerge` - Git merge operations
- `gitConflict` - Git conflict resolution
- `gitDiff` - Git diff operations
- `gitBlame` - Git blame functionality
- `gitHistory` - Git history/log viewing
- `gitStatus` - Git status checks

### LSP & Editor Features (12 tags)
- `hover` - Hover information requests
- `goToDefinition` - Go to definition
- `findReferences` - Find references
- `renameSymbol` - Rename symbol
- `formatting` - Code formatting
- `lspClient` - LSP client operations
- `lspServer` - LSP server management
- `editorInit` - Editor initialization
- `editorChange` - Editor content changes
- `diffRender` - Git diff rendering in editor
- `syntaxHighlight` - Syntax highlighting
- `autocomplete` - Autocomplete/suggestions

### Pane & Tab Management (5 tags)
- `tabSwitch` - Tab switching (can be noisy)
- `paneCreate` - Pane creation
- `paneSplit` - Pane splitting
- `paneClose` - Pane closing
- `dragDrop` - Drag and drop operations

### File Operations (5 tags)
- `fileOpen` - File opening
- `fileClose` - File closing
- `fileSave` - File saving
- `fileWatch` - File system watching
- `fileSystem` - General file system operations

### Application (4 tags)
- `appInit` - Application initialization
- `appShutdown` - Application shutdown
- `settings` - Settings management
- `perfMonitor` - Performance monitoring (disabled by default)

### Browser (3 tags)
- `browserNav` - Browser navigation
- `browserProfile` - Browser profile management
- `browserAutomation` - Browser automation

### Workspace (2 tags)
- `workspaceLoad` - Workspace loading
- `workspaceChange` - Workspace changes

### UI Components (3 tags)
- `menu` - Menu operations
- `statusBar` - Status bar updates
- `dialog` - Dialog operations

### Other (1 tag)
- `eventBus` - EventBus publish/subscribe operations

---

## Adding New Functionality Tags to the UI

If you add a new feature and want to add a new functionality tag to the Settings UI, follow these steps:

### Step 1: Add to logging.config.js

Add your new tag to `/src/config/logging.config.js`:

```javascript
functionalities: {
    // ... existing categories ...

    myNewCategory: {
        'myNewTag': 'Description of what this logs',
        'anotherTag': 'Another description'
    }
}
```

### Step 2: Add to SettingsPanel.js

Add a checkbox for your tag in `/src/components/SettingsPanel.js`:

Find the logging section HTML (around line 200-400) and add:

```html
<div class="log-category">
    <strong>My New Category (2)</strong>
    <label><input type="checkbox" class="log-functionality" data-func="myNewTag"> myNewTag</label>
    <label><input type="checkbox" class="log-functionality" data-func="anotherTag"> anotherTag</label>
</div>
```

**That's it!** The existing JavaScript code will automatically:
- Collect checked functionalities
- Apply them to the logger
- Save them to settings
- Persist across app restarts

### Step 3: Use in Your Code

```javascript
const logger = require('../utils/Logger');

logger.debug('myNewTag', 'My new feature is working!');
logger.error('anotherTag', 'Something went wrong:', error);
```

---

## Configuration

### Default Configuration

The logger is configured in `/src/utils/Logger.js` with these defaults:

```javascript
{
    enabled: false,                   // Disabled by default
    minLevel: LEVELS.INFO,            // Minimum level to log
    mode: 'blacklist',                // 'whitelist' or 'blacklist'
    enabledFunctionalities: [],       // Whitelist: only log these
    disabledFunctionalities: [],      // Blacklist: don't log these
    alwaysShowErrors: true,           // Always show ERROR level
    useColors: true,                  // Use colors in console
    showTimestamps: false,            // Show timestamps
    showComponent: true               // Show functionality tags
}
```

### Environment-Specific Defaults

**Development mode** (when `NODE_ENV !== 'production'`):
- `enabled: true` - Logging enabled by default
- `minLevel: DEBUG` - Show debug logs
- All functionalities enabled except `perfMonitor`

**Production mode** (when `NODE_ENV === 'production'` or `app.isPackaged`):
- `enabled: false` - Logging disabled by default
- `minLevel: ERROR` - Only show critical errors
- `alwaysShowErrors: true` - Always show errors

### Runtime Configuration

You can change configuration at runtime via the browser console:

```javascript
// Enable/disable logging
Logger.setEnabled(true);

// Set log level
Logger.setLevel('DEBUG');  // 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'

// Enable only specific functionalities (whitelist mode)
Logger.enableOnly(['gitPush', 'hover']);

// Disable specific functionalities (blacklist mode)
Logger.disable(['tabSwitch', 'perfMonitor']);

// Enable a single functionality
Logger.enable('gitPull');

// Show all functionalities
Logger.showAll();

// Reset to defaults
Logger.reset();

// Always show errors regardless of filtering
Logger.setAlwaysShowErrors(true);

// Get current configuration
Logger.getConfig();
```

---

## Best Practices

### 1. Choose the Right Functionality Tag

**✅ DO:**
- Use specific tags that describe the operation: `gitPush`, `fileOpen`, `hover`
- Group related operations under the same tag
- Be consistent across similar operations

**❌ DON'T:**
- Use generic tags like `general` or `misc`
- Mix unrelated operations under one tag
- Create too many overly-specific tags

### 2. Use Appropriate Log Levels

**✅ DO:**
```javascript
// Use ERROR for actual errors
logger.error('gitPush', 'Push failed:', error);

// Use WARN for warnings or potential issues
logger.warn('fileWatch', 'Slow file watcher detected');

// Use DEBUG for most debug information
logger.debug('gitPull', 'Pulling from remote', { branch, remote });

// Use TRACE for very verbose operations
logger.trace('hover', 'Hover request at position', { line, col });
```

**❌ DON'T:**
```javascript
// Don't use ERROR for non-errors
logger.error('gitPush', 'Starting push');  // This isn't an error!

// Don't use INFO in application code (use DEBUG instead)
logger.info('gitPull', 'Pulling...');  // Use DEBUG

// Don't use TRACE for everything
logger.trace('gitPush', 'Push failed');  // Use ERROR
```

### 3. Provide Useful Context

**✅ DO:**
```javascript
logger.debug('gitPush', 'Pushing to remote', {
    branch: currentBranch,
    remote: remoteName,
    commits: commitCount
});

logger.error('fileOpen', 'Failed to open file:', error, {
    filePath: path,
    encoding: 'utf-8'
});
```

**❌ DON'T:**
```javascript
logger.debug('gitPush', 'Pushing');  // Not enough context
logger.error('fileOpen', error);      // No description
```

### 4. Keep Messages Concise but Informative

**✅ DO:**
```javascript
logger.debug('gitFetch', 'Fetching from remote', { remote: 'origin' });
logger.error('lspClient', 'LSP server initialization failed:', error);
```

**❌ DON'T:**
```javascript
logger.debug('gitFetch', 'Now we are going to fetch from the remote repository which is configured in the git config file...');
logger.error('lspClient', 'Error');
```

### 5. Don't Log Sensitive Information

**✅ DO:**
```javascript
logger.debug('browserProfile', 'Loading profile', { profileId: id });
logger.debug('fileOpen', 'Opening file', { fileName: path.basename(file) });
```

**❌ DON'T:**
```javascript
logger.debug('auth', 'User credentials', { password: userPassword });  // NEVER!
logger.debug('fileOpen', 'Opening file', { fullPath: '/home/user/.ssh/id_rsa' });  // Careful!
```

### 6. Use Logger, Never console.*

**✅ DO:**
```javascript
const logger = require('../utils/Logger');

logger.debug('myFeature', 'Something happened');
logger.error('myFeature', 'Error occurred:', error);
```

**❌ DON'T:**
```javascript
console.log('[MyComponent] Something happened');  // Old way
console.error('Error:', error);                   // Bypasses logger
```

### 7. Organize Verbose Operations

If an operation produces many logs, use TRACE level:

**✅ DO:**
```javascript
// Use TRACE for very verbose operations
logger.trace('diffRender', 'Rendering diff line', { lineNum, type: 'added' });
logger.trace('tabSwitch', 'Switching to tab', { tabId, paneId });

// Users can then enable TRACE level when needed
```

**❌ DON'T:**
```javascript
// Don't spam DEBUG with hundreds of logs
logger.debug('diffRender', 'Line 1');
logger.debug('diffRender', 'Line 2');
// ... 1000 more logs
```

### 8. Test with Logging Disabled

Always test that your feature works with logging completely disabled:

```javascript
// In console
Logger.setEnabled(false);

// Your feature should work perfectly without any logs
```

### 9. Group Related Logs Together

**✅ DO:**
```javascript
logger.debug('gitPush', 'Starting push to remote', { remote, branch });
// ... do push operation ...
logger.debug('gitPush', 'Push completed successfully', { commits: count });
```

**❌ DON'T:**
```javascript
logger.debug('gitStatus', 'Starting push');   // Wrong tag
// ... do push ...
logger.debug('gitPush', 'Push completed');     // Inconsistent
```

### 10. Add New Tags When Needed

Don't force your logs into existing tags. If you're adding a new feature, create a new tag:

```javascript
// Adding a new "auto-save" feature
logger.debug('autoSave', 'Auto-saving file', { path, interval: 30000 });
logger.warn('autoSave', 'Auto-save failed, will retry', { retryIn: 5000 });
```

Then add it to `logging.config.js` and `SettingsPanel.js`.

---

## Examples

### Example 1: Git Push Operation

```javascript
const logger = require('../utils/Logger');

async function handlePush(remote, branch) {
    logger.debug('gitPush', 'Starting push operation', {
        remote: remote,
        branch: branch,
        localCommits: await getLocalCommitCount()
    });

    try {
        const result = await git.push(remote, branch);

        logger.debug('gitPush', 'Push completed successfully', {
            remote: remote,
            branch: branch,
            pushedCommits: result.commitCount
        });

        return result;
    } catch (error) {
        logger.error('gitPush', 'Push operation failed:', error, {
            remote: remote,
            branch: branch,
            errorCode: error.code
        });
        throw error;
    }
}
```

### Example 2: File Opening

```javascript
const logger = require('../utils/Logger');

async function openFile(filePath) {
    logger.debug('fileOpen', 'Opening file', {
        path: filePath,
        size: await getFileSize(filePath)
    });

    try {
        const content = await fs.readFile(filePath, 'utf-8');

        logger.debug('fileOpen', 'File loaded successfully', {
            path: filePath,
            lines: content.split('\n').length
        });

        return content;
    } catch (error) {
        logger.error('fileOpen', 'Failed to open file:', error, {
            path: filePath
        });
        throw error;
    }
}
```

### Example 3: LSP Hover Request

```javascript
const logger = require('../utils/Logger');

async function handleHover(document, position) {
    logger.trace('hover', 'Hover request at position', {
        document: document.uri,
        line: position.line,
        character: position.character
    });

    try {
        const result = await lspClient.sendHoverRequest(document, position);

        logger.trace('hover', 'Hover response received', {
            hasContent: !!result?.contents,
            contentLength: result?.contents?.value?.length || 0
        });

        return result;
    } catch (error) {
        logger.error('hover', 'Hover request failed:', error);
        return null;
    }
}
```

### Example 4: Performance Monitor (Conditional Logging)

```javascript
const logger = require('../utils/Logger');

function logPerformanceMetrics() {
    // This runs every 60 seconds, so it's disabled by default
    // Users can enable 'perfMonitor' tag if they want to see it

    logger.debug('perfMonitor', 'Performance metrics', {
        memory: process.memoryUsage(),
        uptime: process.uptime(),
        activeEditors: getActiveEditorCount()
    });
}
```

---

## Troubleshooting

### Logs Not Appearing

**Check 1: Is logging enabled?**
```javascript
Logger.getConfig().enabled  // Should be true
```

**Check 2: Is your log level high enough?**
```javascript
Logger.getConfig().minLevel  // Should be 3 (DEBUG) or 4 (TRACE)
```

**Check 3: Is your functionality enabled?**
```javascript
Logger.getConfig()  // Check enabledFunctionalities or disabledFunctionalities
Logger.isEnabled('yourTag', Logger.LEVELS.DEBUG)  // Should be true
```

**Fix:**
```javascript
Logger.setEnabled(true);
Logger.setLevel('DEBUG');
Logger.showAll();
```

### Too Many Logs

**Solution 1: Disable noisy functionalities**
```javascript
Logger.disable(['tabSwitch', 'dragDrop', 'perfMonitor', 'diffRender']);
```

**Solution 2: Use whitelist mode**
```javascript
Logger.enableOnly(['gitPush', 'gitPull']);  // Only see these
```

**Solution 3: Increase log level**
```javascript
Logger.setLevel('INFO');  // Only INFO, WARN, ERROR
```

### Logger Not Defined

**Error:** `ReferenceError: logger is not defined`

**Fix:** Make sure you imported the logger:
```javascript
const logger = require('../utils/Logger');
```

### Wrong Path to Logger

**Error:** `Cannot find module '../utils/Logger'`

**Fix:** Adjust the relative path based on your file location:
- From `/src/components/`: `require('../utils/Logger')`
- From `/src/lib/git/`: `require('../../utils/Logger')`
- From `/src/lib/git/parsers/`: `require('../../../utils/Logger')`

---

## Summary

The Swarm IDE logging system provides powerful, granular control over application logging:

1. **Import the logger:** `const logger = require('../utils/Logger')`
2. **Choose a functionality tag:** Use existing tags or create new ones
3. **Use appropriate log levels:** ERROR, WARN, INFO, DEBUG, TRACE
4. **Replace console.* calls:** `logger.debug('tag', 'message', data)`
5. **Test your code:** Enable/disable logging to verify it works both ways
6. **Add to UI (optional):** Add new tags to `logging.config.js` and `SettingsPanel.js`

**Remember:** Logging is disabled by default. Users enable what they need via the Settings panel or console.

For questions or issues with the logging system, check this documentation or the source code at `/src/utils/Logger.js`.
