# Material Icons Integration Guide

This document explains how to use Material Icons throughout the Swarm IDE project.

## Overview

The project uses SVG icons from the [vscode-material-icon-theme](https://github.com/material-extensions/vscode-material-icon-theme) repository. These icons provide a consistent, professional look across the entire IDE interface.

## Icon Location

All icon files are stored in:
```
assets/icons/
```

This directory contains **1105+ SVG files** covering various file types, languages, and UI elements.

## Icon Usage Patterns

### 1. File Tree Icons (Automatic)

The file explorer automatically assigns icons based on file extensions using the `FileTypes.js` mapping system.

**How it works:**
- `src/utils/FileTypes.js` maps file extensions to icon names
- Icons are automatically rendered in the file tree
- No manual icon selection needed

**Example from FileTypes.js:**
```javascript
js: { icon: 'javascript', category: 'code', language: 'javascript' },
jsx: { icon: 'react', category: 'code', language: 'javascript' },
ts: { icon: 'typescript', category: 'code', language: 'typescript' },
py: { icon: 'python', category: 'code', language: 'python' }
```

**Rendered in FileExplorer.js:**
```javascript
const iconImg = document.createElement('img');
iconImg.className = 'tree-item-icon-img';
iconImg.src = fileTypes.getIconPath(entry.name);
iconImg.alt = fileTypes.getIcon(entry.name);
```

### 2. UI Component Icons (Manual)

For toolbar buttons, sidebar icons, and menu items, use the `<img>` tag pattern.

**Pattern:**
```html
<img src="assets/icons/ICON_NAME.svg" alt="Description" class="icon-class">
```

**Examples:**

#### Toolbar Button
```html
<button id="btn-refresh" class="explorer-toolbar-btn" title="Refresh">
    <img src="assets/icons/refresh.svg" alt="Refresh" class="toolbar-icon">
</button>
```

#### Sidebar Icon
```html
<button id="icon-files" class="icon-sidebar-btn active" title="Files">
    <img src="assets/icons/folder.svg" alt="Files" class="sidebar-icon">
</button>
```

#### Menu Bar Button
```javascript
workspaceButton.innerHTML = `<img src="assets/icons/folder.svg" alt="Workspace" class="workspace-icon"><span class="workspace-name">${workspaceName}</span>`;
```

### 3. Dynamic Icon Assignment (JavaScript)

When creating elements dynamically in JavaScript:

```javascript
// Create image element
const iconImg = document.createElement('img');
iconImg.className = 'toolbar-icon';
iconImg.src = 'assets/icons/settings.svg';
iconImg.alt = 'Settings';

// Append to container
button.appendChild(iconImg);
```

## CSS Styling Patterns

### Standard Icon Classes

Each icon context has its own CSS class for consistent sizing and styling:

#### Toolbar Icons
```css
.toolbar-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    opacity: 0.8;
}

.explorer-toolbar-btn:hover .toolbar-icon {
    opacity: 1;
}
```

#### Sidebar Icons
```css
.sidebar-icon {
    width: 24px;
    height: 24px;
    object-fit: contain;
    opacity: 0.7;
    filter: brightness(0.8);
}

.icon-sidebar-btn:hover .sidebar-icon {
    opacity: 1;
    filter: brightness(1.2);
}

.icon-sidebar-btn.active .sidebar-icon {
    opacity: 1;
    filter: brightness(1.3);
}
```

#### Tree Item Icons
```css
.tree-item-icon-img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
}
```

#### Menu Bar Icons
```css
.workspace-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    opacity: 0.8;
}

.settings-icon {
    width: 16px;
    height: 16px;
    object-fit: contain;
    opacity: 0.8;
}

#settings-button:hover .settings-icon {
    opacity: 1;
}
```

### Best Practices

1. **Always use `object-fit: contain`** - Preserves icon aspect ratio
2. **Set explicit width/height** - Ensures consistent sizing
3. **Use opacity for hover effects** - Subtle visual feedback
4. **Use `filter: brightness()` for active states** - Highlight selected items

## FileTypes.js Mapping System

### Structure

The `FileTypes` class in `src/utils/FileTypes.js` provides centralized icon mapping:

```javascript
class FileTypes {
    constructor() {
        this.iconBasePath = 'assets/icons/';
        this.extensions = {
            // Language files
            js: { icon: 'javascript', category: 'code', language: 'javascript' },

            // Config files
            json: { icon: 'json', category: 'config', language: 'json' },

            // Markup files
            html: { icon: 'html', category: 'markup', language: 'html' }
        };
    }

    getIcon(filename) {
        // Returns icon name (e.g., 'javascript')
    }

    getIconPath(filename) {
        // Returns full path (e.g., 'assets/icons/javascript.svg')
    }

    getFolderIconPath(isOpen = false) {
        // Returns folder or folder-open icon
    }
}
```

### Adding New File Type Mappings

To add support for a new file extension:

1. Open `src/utils/FileTypes.js`
2. Add entry to the `extensions` object:

```javascript
extensions = {
    // ... existing entries

    // Add your new mapping
    vue: {
        icon: 'vue',
        category: 'code',
        language: 'javascript'
    }
}
```

3. Ensure the corresponding icon exists: `assets/icons/vue.svg`
4. Rebuild the bundle: `npm run bundle`
5. Restart Electron

## Available Icons

### Common UI Icons

These icons are available and commonly used:

| Icon Name | File | Usage |
|-----------|------|-------|
| Folder | `folder.svg` | Directory icons, workspace selector |
| Folder Open | `folder-open.svg` | Expanded directories |
| File | `file.svg` | Generic file, new file button |
| Refresh | `refresh.svg` | Refresh buttons |
| Settings | `settings.svg` | Settings button |
| Web | `web.svg` | Browser view toggle |
| Chevron Up | `chevron-up.svg` | Collapse all button |

### Language Icons

Examples of programming language icons available:

- `javascript.svg` - JavaScript files
- `typescript.svg` - TypeScript files
- `python.svg` - Python files
- `react.svg` - React JSX files
- `vue.svg` - Vue files
- `html.svg` - HTML files
- `css.svg` - CSS files
- `json.svg` - JSON files
- `markdown.svg` - Markdown files

**See `assets/icons/` directory for complete list of 1100+ icons.**

## Adding Custom Icons

If you need an icon that doesn't exist in the Material Icons set:

### Option 1: Find in Material Icons Repository

1. Browse the [Material Icons GitHub](https://github.com/material-extensions/vscode-material-icon-theme/tree/main/icons)
2. Copy the SVG file to `assets/icons/`
3. Reference it in your code

### Option 2: Create Custom SVG

Create a custom icon following the Material Design style:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#90a4ae">
  <path d="YOUR_SVG_PATH_HERE"/>
</svg>
```

**Guidelines:**
- Use `viewBox="0 0 24 24"` for consistency
- Use fill color `#90a4ae` (Material blue-grey)
- Keep paths simple and clean
- Save as `.svg` in `assets/icons/`

## Complete Implementation Examples

### Example 1: Adding a New Toolbar Button with Icon

```javascript
// In your component's render method
const newButton = document.createElement('button');
newButton.id = 'btn-search';
newButton.className = 'explorer-toolbar-btn';
newButton.title = 'Search';

const icon = document.createElement('img');
icon.src = 'assets/icons/search.svg';
icon.alt = 'Search';
icon.className = 'toolbar-icon';

newButton.appendChild(icon);
toolbar.appendChild(newButton);
```

**CSS:**
```css
/* Uses existing .toolbar-icon class - no additional CSS needed */
```

### Example 2: Creating a Sidebar Toggle

HTML:
```html
<div class="icon-sidebar">
    <button id="icon-search" class="icon-sidebar-btn" title="Search" data-view="search">
        <img src="assets/icons/search.svg" alt="Search" class="sidebar-icon">
    </button>
</div>
```

JavaScript:
```javascript
const searchIcon = document.getElementById('icon-search');
searchIcon.addEventListener('click', () => {
    searchIcon.classList.toggle('active');
    // Your toggle logic here
});
```

### Example 3: Dynamic File Icon in Custom Component

```javascript
const fileTypes = require('../utils/FileTypes');

function createFileItem(filename) {
    const item = document.createElement('div');
    item.className = 'file-item';

    // Create icon
    const icon = document.createElement('img');
    icon.className = 'file-item-icon';
    icon.src = fileTypes.getIconPath(filename);
    icon.alt = fileTypes.getIcon(filename);

    // Create name
    const name = document.createElement('span');
    name.textContent = filename;

    item.appendChild(icon);
    item.appendChild(name);

    return item;
}
```

**CSS:**
```css
.file-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
}

.file-item-icon {
    width: 18px;
    height: 18px;
    object-fit: contain;
}
```

## Build Process

**Important:** After modifying icon-related source files, you must rebuild the bundle:

```bash
npm run bundle
```

This compiles `src/` files into `dist/bundle.js` which is loaded by the renderer process.

Files that require rebuild when modified:
- `src/utils/FileTypes.js`
- `src/components/FileExplorer.js`
- `src/components/MenuBar.js`
- Any component that uses icons

## Troubleshooting

### Icons Not Displaying

1. **Check icon path:** Ensure `assets/icons/ICON_NAME.svg` exists
2. **Rebuild bundle:** Run `npm run bundle`
3. **Restart Electron:** Completely restart the app
4. **Check console:** Look for 404 errors for missing SVG files
5. **Verify HTML:** Use DevTools to inspect the `<img>` src attribute

### Icons Look Wrong

1. **Check CSS class:** Ensure correct class is applied (`.toolbar-icon`, `.sidebar-icon`, etc.)
2. **Check sizing:** Verify width/height in CSS
3. **Check opacity:** Some icons may be too transparent
4. **Check SVG fill color:** Material icons use `#90a4ae` by default

### New File Extensions Not Showing Correct Icon

1. **Check FileTypes.js:** Verify extension is mapped
2. **Rebuild bundle:** Run `npm run bundle`
3. **Check icon exists:** Verify SVG file exists in `assets/icons/`
4. **Check icon name:** Ensure mapping matches actual filename (without `.svg`)

### Icons Disappear on Build

If icons worked before bundling but not after:
1. Icon paths are relative to `index.html` location
2. Don't use absolute paths like `/assets/icons/`
3. Use relative paths: `assets/icons/`

## Migration Notes

### Emoji to Material Icons Migration

The project was migrated from emoji-based icons to Material Icons SVGs:

**Before (Emoji):**
```javascript
icon.textContent = '📁';
```

**After (Material Icons):**
```javascript
const iconImg = document.createElement('img');
iconImg.src = 'assets/icons/folder.svg';
iconImg.alt = 'folder';
icon.appendChild(iconImg);
```

**Key Changes:**
- Replaced emoji Unicode with SVG `<img>` elements
- Added CSS classes for consistent styling
- Created `FileTypes.js` for centralized icon management
- Copied 1105 SVG files from vscode-material-icon-theme

## Resources

- **Material Icons Repository:** https://github.com/material-extensions/vscode-material-icon-theme
- **Material Design Icons:** https://material.io/resources/icons/
- **SVG Optimization:** https://jakearchibald.github.io/svgomg/

## Summary

- **Location:** `assets/icons/` (1105+ SVG files)
- **File Tree:** Automatic via `FileTypes.js` mapping
- **UI Components:** Manual `<img>` tags with specific CSS classes
- **Styling:** Consistent classes (`.toolbar-icon`, `.sidebar-icon`, etc.)
- **Build:** Run `npm run bundle` after changes
- **Troubleshooting:** Check paths, rebuild bundle, restart Electron
