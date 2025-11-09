# CRUSH.md for swarmide

This document outlines essential information for agents working within the `swarmide` repository.

## Project Type
This is a Svelte project, likely a web application or an Electron-based desktop application given the `preload.cjs` and `Electron` related files often found in such projects. It uses `bun` for package management, `Vite` for build tooling, and `ESLint` and `Prettier` for code quality. There's also an integrated Language Server Protocol (LSP) setup.

## Essential Commands

### Install Dependencies
```bash
bun install
```

### Run Development Server
This command typically starts the application in development mode, often with hot-reloading.
```bash
bun dev
```

### Build for Production
This command compiles the application for production deployment.
```bash
bun build
```

### Linting
To check for code style and potential errors:
```bash
bun lint
```

### Formatting
To format the code using Prettier:
```bash
bun format
```

## Code Organization and Structure

- **`src/`**: Contains the main source code for the application.
  - **`src/App.svelte`**: Main Svelte application component.
  - **`src/main.js`**: Entry point for the Svelte application.
  - **`src/components/`**: Houses reusable Svelte components (e.g., `FileExplorer.svelte`, `MonacoEditor.svelte`).
  - **`src/stores/`**: Contains Zustand/Svelte stores for state management (e.g., `editorStore.js`, `fileExplorerStore.js`).
  - **`src/lsp/`**: Contains files related to Language Server Protocol integration (e.g., `LspManager.js`, `MonacoLspAdapter.js`).
  - **`src/styles/`**: Global styles and CSS variables.
- **`public/`**: Static assets like fonts (`public/fonts/`).
- **`.swarm/`**: Likely contains internal files for the Swarm agent orchestration.
- **`cli.js`**: A command-line interface script for the project.
- **`main.mjs`**: Possibly an Electron main process file or another entry point.
- **`lsp-server-manager.mjs`**: Manages LSP servers.

## Naming Conventions and Style Patterns

- **Svelte Components**: PascalCase for filenames and component names (e.g., `ActivityBar.svelte`, `FileExplorer.svelte`).
- **JavaScript Files**: camelCase for standalone JavaScript files (e.g., `appStore.js`, `LspManager.js`).
- **CSS**: Uses global CSS, likely following a BEM-like or utility-first approach based on the `style.css` and `reset.css`/`variables.css` files.
- **State Management**: Stores are typically named `[featureName]Store.js`.

The presence of `.eslintrc.cjs` and `.prettierrc.json` indicates adherence to a consistent code style enforced by ESLint and Prettier. Agents should ensure their contributions pass linting and formatting checks.

## Testing Approach and Patterns

The `TESTING_GUIDE.md` file suggests there are guidelines or documentation for testing within the repository. Agents should consult this file for detailed information on how tests are structured and executed. Basic testing commands might involve `bun test` if a testing framework is configured (e.g., Vitest, Jest).

## Important Gotchas or Non-Obvious Patterns

- **LSP Integration**: The `src/lsp/` directory indicates a custom or integrated LSP setup. When modifying editor-related functionality, understanding how LSP is integrated is crucial.
- **Monaco Editor**: `MonacoEditor.svelte` and `MonacoLspAdapter.js` point to the use of Monaco Editor, which is a powerful but complex component. Changes to the editor should consider its API and interaction with LSP.
- **Svelte Reactivity**: Be mindful of Svelte's reactivity system. Changes to stores or component props need to be handled according to Svelte's patterns.
- **Bun Package Manager**: Ensure all package installations and script executions use `bun`.

## Project-Specific Context

- **`BOUNDS_CLAMPING_INVESTIGATION.md`**: Might contain important notes or findings regarding UI layout or rendering issues.
- **`BROWSER_FIXES_SUMMARY.md`**: Suggests that browser-specific bug fixes have been documented.
- **`FINAL_SOLUTION_SUMMARY.md`**: Could contain an overview of major architectural decisions or implemented solutions.
- **`README-LSP.md`**: Dedicated documentation for the LSP setup. Agents should read this before making changes to LSP-related code.
- **`.swarm/tasks.db`**: Indicates an active swarm agent environment, possibly used for task management or internal operations during development. Operations related to `tasks.db` should be handled with care.
