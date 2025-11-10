# Swarm IDE

AI-Powered Desktop Development Environment

Version 2.0.3

---

## Overview

Swarm IDE is a modern desktop code editor built with Electron and Svelte, featuring integrated AI assistance, browser development tools, and a multi-canvas workspace system.

## Features

### Editor
- Monaco Editor with syntax highlighting for 100+ languages
- Language Server Protocol (LSP) support for intelligent code completion
- Multi-file editing with tab management
- Split view and multi-canvas workspace system
- Real-time syntax validation and error detection

### Development Tools
- Integrated terminal with PTY support
- Built-in browser with DevTools access
- File explorer with project management
- Diagnostics panel for code issues
- Markdown preview with Mermaid diagram support

### AI Integration
- Chat panel for AI-assisted development
- Context-aware code suggestions
- Rich text editing with TipTap

### Workspace Management
- Multi-canvas support for organizing different contexts
- Recent projects tracking
- Session restoration
- Project-specific settings stored in `.swarm/mind/`

### Media Support
- Image viewer for common formats
- Video and audio playback
- PDF viewing support

### DeepWiki Plugin (preview)
- Launches the DeepWiki FastAPI + Next.js stack directly from the IDE
- Automatically injects the `/ide-plugin` route into a browser tab tied to the active workspace
- Provides Activity Bar controls plus in-app settings for repo paths, ports, and auto-start

## Installation

### Download Pre-built Binaries

Visit the [Releases](https://github.com/Swarm-Code/swarm-ide/releases) page to download the latest version for your platform.

#### macOS
- Apple Silicon (M1/M2/M3): `Swarm-IDE-2.0.3-arm64.dmg`
- Intel: `Swarm-IDE-2.0.3.dmg`

Open the DMG and drag Swarm IDE to your Applications folder.

#### Linux
- AppImage: `Swarm-IDE-2.0.3.AppImage` (single executable, works on all distributions)

```bash
chmod +x Swarm-IDE-2.0.3.AppImage
./Swarm-IDE-2.0.3.AppImage
```

### Building from Source

**Requirements:**
- [Bun](https://bun.sh) (recommended) or Node.js 18+

**Note:** This project uses Bun as the primary package manager and runtime.

```bash
# Install Bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# Clone the repository
git clone https://github.com/Swarm-Code/swarm-ide.git
cd swarm-ide

# Install dependencies
bun install

# Run in development mode
bun run electron:dev

# Build the application
bun run build

# Create distribution packages
bun run dist:mac      # macOS only
bun run dist:linux    # Linux only
bun run dist:all      # All platforms
```

## Development

```bash
# Start development server
bun run dev

# Lint code
bun run lint

# Format code
bun run format
```

## Technology Stack

- Electron 30.0
- Svelte 4.2
- Monaco Editor
- Vite 5.0
- XTerm.js for terminal
- TipTap for rich text editing
- Mermaid for diagrams
- node-pty for native terminal support

## Project Structure

```
swarm-ide/
├── src/
│   ├── components/     # Svelte UI components
│   ├── stores/         # Application state management
│   ├── lsp/           # Language Server Protocol integration
│   └── styles/        # Global styles and variables
├── public/            # Static assets
├── dist/              # Built application files
├── main.mjs           # Electron main process
└── preload.cjs        # Electron preload script
```

## Keyboard Shortcuts

- `Alt + Arrow Keys` - Navigate between tabs and panes
- `Ctrl/Cmd + R` - Reload browser page (in browser pane)
- Standard editor shortcuts via Monaco Editor

## License

Dual License - See LICENSE file for details

- **Non-Commercial**: Free for personal, educational, and open source projects
- **Commercial**: Requires a commercial license for any revenue-generating use

All rights reserved by Swarm-Code Team. Contact luis@swarmcode.ai for commercial licensing.

## Contributing

Contributions are welcome. Please open an issue or submit a pull request.

## Support

For issues and feature requests, please visit the project repository.

---

Built with modern web technologies for seamless desktop development.
