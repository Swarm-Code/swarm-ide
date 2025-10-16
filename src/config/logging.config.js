/**
 * Logging Configuration
 *
 * Defines all available functionalities and their default logging behavior.
 * This config is loaded by the Logger module at startup.
 */

module.exports = {
    // Master enable/disable (overrides everything except alwaysShowErrors)
    enabled: true,  // Enabled in development

    // Minimum log level: 'ERROR', 'WARN', 'INFO', 'DEBUG', 'TRACE'
    logLevel: 'DEBUG',

    // Filtering mode: 'whitelist' or 'blacklist'
    // - whitelist: Only log functionalities in enabledFunctionalities
    // - blacklist: Log everything except functionalities in disabledFunctionalities
    mode: 'blacklist',

    // Always show ERROR level logs regardless of functionality filtering
    alwaysShowErrors: true,

    // Whitelist: Only these functionalities will be logged (when mode='whitelist')
    // Example: ['hover', 'gitPush'] to ONLY see hover and gitPush logs
    enabledFunctionalities: [],

    // Blacklist: These functionalities will NOT be logged (when mode='blacklist')
    // Example: ['tabSwitch', 'dragDrop', 'perfMonitor'] to silence these
    disabledFunctionalities: [
        // Disable noisy functionalities by default
        'perfMonitor',  // Performance monitor logs every 60s
    ],

    // Display options
    useColors: true,
    showTimestamps: false,
    showComponent: true,

    // ====== Functionality Definitions ======
    // This is a reference of all available functionalities in the codebase
    // Use these tags when calling logger methods

    functionalities: {
        // Git Operations (37% of all logs)
        git: {
            'gitPush': 'Git push operations',
            'gitPull': 'Git pull operations',
            'gitFetch': 'Git fetch operations',
            'gitCommit': 'Git commit operations',
            'gitBranch': 'Git branch management',
            'gitMerge': 'Git merge operations',
            'gitConflict': 'Git conflict resolution',
            'gitDiff': 'Git diff operations',
            'gitBlame': 'Git blame functionality',
            'gitHistory': 'Git history/log viewing',
            'gitStatus': 'Git status checks'
        },

        // LSP & Editor Features (25% of all logs)
        lsp: {
            'hover': 'Hover information requests',
            'goToDefinition': 'Go to definition',
            'findReferences': 'Find references',
            'renameSymbol': 'Rename symbol',
            'formatting': 'Code formatting',
            'lspClient': 'LSP client operations',
            'lspServer': 'LSP server management'
        },

        editor: {
            'editorInit': 'Editor initialization',
            'editorChange': 'Editor content changes',
            'diffRender': 'Git diff rendering in editor',
            'syntaxHighlight': 'Syntax highlighting',
            'autocomplete': 'Autocomplete/suggestions'
        },

        // Pane & Tab Management (31% of all logs)
        panes: {
            'tabSwitch': 'Tab switching',
            'paneCreate': 'Pane creation',
            'paneSplit': 'Pane splitting',
            'paneClose': 'Pane closing',
            'dragDrop': 'Drag and drop operations'
        },

        // File Operations (6% of all logs)
        files: {
            'fileOpen': 'File opening',
            'fileClose': 'File closing',
            'fileSave': 'File saving',
            'fileWatch': 'File system watching',
            'fileSystem': 'General file system operations'
        },

        // Application Lifecycle (10% of all logs)
        app: {
            'appInit': 'Application initialization',
            'appShutdown': 'Application shutdown',
            'settings': 'Settings management',
            'perfMonitor': 'Performance monitoring'
        },

        // Browser Features
        browser: {
            'browserNav': 'Browser navigation',
            'browserProfile': 'Browser profile management',
            'browserAutomation': 'Browser automation'
        },

        // Other Components
        workspace: {
            'workspaceLoad': 'Workspace loading',
            'workspaceChange': 'Workspace changes'
        },

        ui: {
            'menu': 'Menu operations',
            'statusBar': 'Status bar updates',
            'dialog': 'Dialog operations'
        },

        // SSH Operations
        ssh: {
            'ssh': 'SSH connection operations',
            'sshPanel': 'SSH panel UI operations',
            'sshService': 'SSH service operations',
            'sshConnection': 'SSH connection management',
            'sshDialog': 'SSH connection dialog',
            'sshFileExplorer': 'SSH file explorer operations',
            'sshListDir': 'SSH remote directory listing',
            'sshProgress': 'SSH connection progress UI'
        },

        // Terminal Operations
        terminal: {
            'terminal': 'Terminal component operations',
            'terminalPanel': 'Terminal panel UI operations',
            'terminalService': 'Terminal service backend operations',
            'terminalPTY': 'PTY process management'
        },

        // System & Debug
        system: {
            'eventBus': 'EventBus message passing',
            'ipc': 'IPC communication',
            'debug': 'General debugging output'
        }
    },

    // ====== Production Overrides ======
    // These settings apply when NODE_ENV=production or app.isPackaged=true
    production: {
        enabled: false,         // Disable logging in production by default
        logLevel: 'ERROR',      // Only show errors
        alwaysShowErrors: true, // Always show critical errors
        disabledFunctionalities: [] // Don't blacklist anything (errors only anyway)
    },

    // ====== Development Presets ======
    // Quick presets for common development scenarios
    presets: {
        // Silence everything except errors
        quiet: {
            enabled: true,
            logLevel: 'ERROR',
            mode: 'blacklist',
            disabledFunctionalities: []
        },

        // Show everything (useful for debugging)
        verbose: {
            enabled: true,
            logLevel: 'TRACE',
            mode: 'blacklist',
            disabledFunctionalities: []
        },

        // Focus on git operations only
        gitOnly: {
            enabled: true,
            logLevel: 'TRACE',
            mode: 'whitelist',
            enabledFunctionalities: [
                'gitPush', 'gitPull', 'gitFetch', 'gitCommit',
                'gitBranch', 'gitMerge', 'gitConflict', 'gitDiff',
                'gitBlame', 'gitHistory', 'gitStatus'
            ]
        },

        // Focus on LSP/editor features only
        lspOnly: {
            enabled: true,
            logLevel: 'TRACE',
            mode: 'whitelist',
            enabledFunctionalities: [
                'hover', 'goToDefinition', 'findReferences',
                'renameSymbol', 'formatting', 'lspClient', 'lspServer',
                'editorInit', 'editorChange', 'diffRender'
            ]
        },

        // Focus on pane/tab management only
        panesOnly: {
            enabled: true,
            logLevel: 'TRACE',
            mode: 'whitelist',
            enabledFunctionalities: [
                'tabSwitch', 'paneCreate', 'paneSplit', 'paneClose', 'dragDrop'
            ]
        },

        // Disable noisy functionalities
        lessNoisy: {
            enabled: true,
            logLevel: 'DEBUG',
            mode: 'blacklist',
            disabledFunctionalities: [
                'perfMonitor', 'tabSwitch', 'dragDrop', 'diffRender'
            ]
        }
    }
};
