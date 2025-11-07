# LSP (Language Server Protocol) Integration

SwarmIDE now supports LSP for intelligent code editing features!

## Features Implemented

✅ **Hover Tooltips** - Hover over code to see type information, documentation, and function signatures  
✅ **Diagnostics** - Real-time error and warning detection with red/yellow squiggly lines  
✅ **Problems Panel** - View all errors/warnings across your codebase with counts and navigation  
✅ **Code Completion** - Intelligent autocomplete suggestions (coming soon with full integration)

## Supported Languages

Currently configured for:
- **TypeScript** / **JavaScript** (via `typescript-language-server`)
- **Python** (via `pylsp` - requires separate installation)

## How It Works

The LSP implementation follows a clean, modular architecture:

1. **LSP Servers** run as child processes in Electron's main process
2. **LspManager** (renderer) handles lifecycle and message routing via IPC
3. **MonacoLspAdapter** bridges LSP with Monaco Editor's provider APIs
4. **DiagnosticsPanel** displays errors/warnings with click-to-navigate

## Installation

### TypeScript/JavaScript LSP
```bash
npm install -g typescript-language-server typescript
```

### Python LSP (Optional)
```bash
pip install python-lsp-server
```

## Usage

### Open Diagnostics Panel
- Press `Ctrl+Shift+M` (or `Cmd+Shift+M` on Mac)
- Or click the "Problems" tab in the bottom panel

### Navigate to Errors
- Click any diagnostic in the Problems panel to jump to its location
- The editor will automatically scroll and highlight the error

### View Hover Information
- Hover over any symbol in your code
- LSP will show type information, documentation, and signatures

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Renderer Process                          │
│                                                              │
│  ┌──────────────┐    ┌─────────────────┐   ┌──────────────┐│
│  │  Monaco      │◄───│ MonacoLsp       │◄──│  LspManager  ││
│  │  Editor      │    │ Adapter         │   │              ││
│  └──────────────┘    └─────────────────┘   └──────┬───────┘│
│         │                                          │        │
│         │                                          │        │
│  ┌──────▼───────────────────────────────┐         │        │
│  │  DiagnosticsPanel                    │         │        │
│  │  (Shows errors/warnings)             │         │        │
│  └──────────────────────────────────────┘         │        │
└───────────────────────────────────────────────────┼────────┘
                                                    │
                              IPC (electronAPI)     │
                                                    │
┌───────────────────────────────────────────────────▼────────┐
│                     Main Process                            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  LspServerManager                                   │   │
│  │  - Spawns LSP servers as child processes          │   │
│  │  - Routes messages via stdin/stdout                │   │
│  │  - Manages server lifecycle                        │   │
│  └─────────────┬───────────────────────────────────────┘   │
│                │                                             │
│                ▼                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Child Processes (LSP Servers)                     │   │
│  │  - typescript-language-server                       │   │
│  │  - pylsp                                            │   │
│  │  - etc.                                             │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Configuration

LSP servers are configured in `src/lsp/lsp-config.js`:

```javascript
export const lspConfigs = {
  typescript: {
    command: 'typescript-language-server',
    args: ['--stdio'],
    languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']
  },
  // Add more languages here
};
```

## File Structure

```
src/lsp/
├── LspManager.js          # LSP client, message routing
├── MonacoLspAdapter.js    # Monaco integration layer
└── lsp-config.js          # Server configurations

lsp-server-manager.mjs     # Electron main process LSP manager

src/components/
├── DiagnosticsPanel.svelte   # Problems panel UI
└── MonacoEditor.svelte        # Editor with LSP integration
```

## Keyboard Shortcuts

- `Ctrl+Shift+M` - Toggle Problems panel
- `Ctrl+`` - Toggle Terminal
- `Ctrl+B` - Toggle Sidebar

## Notes

- LSP servers start automatically when you open a supported file
- Hover and diagnostics work in real-time as you type
- The Problems panel updates automatically when diagnostics change
- Each language can have its own LSP server running simultaneously
- Server processes are cleaned up when the app closes

## Troubleshooting

If LSP features aren't working:

1. Check that the language server is installed globally
2. Open DevTools (Ctrl+Shift+I) and look for LSP-related console logs
3. Verify the server command is correct in `lsp-config.js`
4. Make sure you've opened a file with the correct file extension
