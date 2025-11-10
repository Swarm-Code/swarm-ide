# Tab Navigation & Category Tabs Reference

Complete documentation of tab navigation patterns and implementations used in the Apple App Store.

---

## Table of Contents

1. [Category Tab Item](#category-tab-item)
2. [Platform Selector](#platform-selector)
3. [Navigation Item Pattern](#navigation-item-pattern)
4. [Folder Navigation](#folder-navigation)

---

## Category Tab Item

### Tab Component Structure

**File**: `src/components/jet/web-navigation/CategoryTabItem.svelte`

```svelte
<script lang="ts">
    export let label: string;
    export let selected: boolean = false;
    export let url: string;
</script>

<a 
    href={url}
    class="category-tab"
    class:selected
    aria-current={selected ? 'page' : undefined}
>
    {label}
</a>
```

**Styling Pattern**:

```scss
.category-tab {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    border-radius: var(--global-border-radius-small);
    color: var(--systemSecondary);
    font: var(--body-emphasized);
    text-decoration: none;
    transition: color 200ms ease, background-color 200ms ease;
    
    &:hover {
        color: var(--systemPrimary);
        background-color: var(--systemQuaternary);
    }
    
    &.selected {
        color: var(--systemPrimary);
        background-color: var(--systemQuinary);
        pointer-events: none;
    }
    
    &:focus-visible {
        outline: 2px solid var(--keyColor);
        outline-offset: 2px;
    }
}
```

---

## Platform Selector

### Platform Selector Dropdown

**File**: `src/components/jet/web-navigation/PlatformSelectorDropdown.svelte`

Allows users to switch between different Apple platforms (iPhone, iPad, Mac, etc.)

**Key Features**:
- Dropdown menu with platform options
- Visual indicators for current selection
- Smooth transitions between states
- Accessible keyboard navigation

**Usage Pattern**:

```svelte
<script>
    let selectedPlatform = 'iphone';
    
    const platforms = [
        { id: 'iphone', label: 'iPhone', icon: 'iphone.gen2' },
        { id: 'ipad', label: 'iPad', icon: 'ipad.gen2' },
        { id: 'mac', label: 'Mac', icon: 'macbook.gen2' },
        { id: 'watch', label: 'Apple Watch', icon: 'applewatch' },
        { id: 'tv', label: 'Apple TV', icon: 'tv' },
        { id: 'vision', label: 'Vision Pro', icon: 'visionpro' }
    ];
</script>
```

---

### Platform Selector Item

**File**: `src/components/jet/web-navigation/PlatformSelectorItem.svelte`

```svelte
<script lang="ts">
    export let platform: any;
    export let selected: boolean = false;
    
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();
    
    function handleClick() {
        dispatch('select', platform);
    }
</script>

<button
    class="platform-item"
    class:selected
    on:click={handleClick}
    aria-pressed={selected}
>
    <div class="platform-icon">
        <slot name="icon" />
    </div>
    <span class="platform-label">{platform.label}</span>
    {#if selected}
        <div class="checkmark">✓</div>
    {/if}
</button>
```

**Styling**:

```scss
.platform-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    width: 100%;
    background: transparent;
    border: none;
    color: var(--systemPrimary);
    font: var(--body);
    cursor: pointer;
    transition: background-color 150ms ease;
    
    &:hover {
        background-color: var(--systemQuaternary);
    }
    
    &.selected {
        font: var(--body-emphasized);
    }
    
    &:focus-visible {
        outline: 2px solid var(--keyColor);
        outline-offset: -2px;
    }
}

.platform-icon {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.checkmark {
    margin-left: auto;
    color: var(--keyColor);
    font-weight: 600;
}
```

---

## Navigation Item Pattern

### Base Navigation Item

**File**: `shared/components/src/components/Navigation/Item.svelte`

```svelte
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import type { Writable } from 'svelte/store';
    import type { NavigationId, BaseNavigationItem } from '@amp/web-app-components/src/types';
    
    export let item: BaseNavigationItem;
    export let selected: boolean = false;
    export let translateFn: (key: string) => string;
    
    const dispatch = createEventDispatcher();
    
    $: label = item.label ? item.label : translateFn(item.locKey);
</script>

<li 
    class="navigation-item"
    class:selected
    role="treeitem"
    aria-selected={selected}
>
    <slot />
</li>
```

**Styling**:

```scss
.navigation-item {
    --navigation-item-text-color: var(--systemPrimary);
    --navigation-item-icon-color: var(--systemSecondary);
    
    position: relative;
    list-style: none;
    
    &.selected {
        --navigation-item-text-color: var(--keyColor);
        --navigation-item-icon-color: var(--keyColor);
    }
}

.navigation-item__link {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-radius: 6px;
    color: var(--navigation-item-text-color);
    text-decoration: none;
    transition: background-color 150ms ease;
    
    &:hover {
        background-color: var(--systemQuaternary);
    }
    
    &:focus-visible {
        outline: 2px solid var(--keyColor);
        outline-offset: -2px;
    }
    
    &[aria-pressed="true"] {
        background-color: var(--systemQuinary);
    }
}
```

---

## Folder Navigation

### Expandable Folder Component

**File**: `shared/components/src/components/Navigation/Folder.svelte`

**Key Features**:
- Recursive folder structure
- Animated arrow indicator
- Keyboard navigation support
- Drag & drop support

**Keyboard Interactions**:

```typescript
const handleKeydown = (e: KeyboardEvent) => {
    switch (e.key) {
        case 'Enter':
            toggleExpand();
            break;
            
        case 'ArrowRight':
            if (hasChildren && !$isExpanded) {
                isExpanded.set(true);
                e.preventDefault();
                e.stopPropagation();
            }
            break;
            
        case 'ArrowLeft':
            if (hasChildren && $isExpanded) {
                isExpanded.set(false);
                e.preventDefault();
                e.stopPropagation();
            }
            break;
    }
};
```

**Delayed Expansion on Drag**:

```typescript
const FOLDER_EXPAND_DELAY = 1000;

let enteredCount = 0;
let delayedExpandTimeoutId: ReturnType<typeof setTimeout>;

const delayedExpand = (): void => {
    enteredCount++;
    
    if (!$isExpanded && !delayedExpandTimeoutId) {
        delayedExpandTimeoutId = setTimeout(() => {
            isExpanded.set(true);
            delayedExpandTimeoutId = null;
        }, FOLDER_EXPAND_DELAY);
    }
};

const cancelDelayedExpand = (): void => {
    enteredCount--;
    
    if (enteredCount === 0 && delayedExpandTimeoutId) {
        clearTimeout(delayedExpandTimeoutId);
        delayedExpandTimeoutId = null;
    }
};
```

**Arrow Indicator Animation**:

```scss
$menuicon-folder-transition: 0.3s transform ease;

.folder-arrow-indicator::before {
    content: '';
    width: 0;
    height: 0;
    display: inline-block;
    position: absolute;
    top: 16px;
    border-style: solid;
    border-top-width: 4px;
    border-top-color: transparent;
    border-bottom-width: 4px;
    border-bottom-color: transparent;
    transform: rotate(0deg);
    transition: $menuicon-folder-transition;
    border-inline-end-width: 0;
    border-inline-end-color: transparent;
    border-inline-start-width: 6px;
    border-inline-start-color: var(--systemTertiary);
    inset-inline-start: -12px;
    
    .folder-open & {
        transform: rotate(90deg);
        
        @include rtl {
            transform: rotate(-90deg);
        }
    }
    
    @media (--sidebar-visible) {
        top: 12px;
    }
    
    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
}
```

---

## Tab State Management

### Current Tab Store

**File**: `shared/components/src/components/Navigation/Navigation.svelte`

```svelte
<script lang="ts">
    import type { Writable } from 'svelte/store';
    import type { NavigationId } from '@amp/web-app-components/src/types';
    
    export let currentTab: Writable<NavigationId | null>;
    
    // Check if item matches current tab
    $: selected = isSameTab(item.id, $currentTab);
</script>
```

**Utility Function**:

```typescript
export function isSameTab(
    itemId: NavigationId, 
    currentTabId: NavigationId | null
): boolean {
    if (!currentTabId) return false;
    
    return itemId.type === currentTabId.type && 
           itemId.resourceId === currentTabId.resourceId;
}
```

---

## Accessibility Features

### ARIA Attributes

```html
<!-- Tabs -->
<div role="tablist">
    <button 
        role="tab"
        aria-selected="true"
        aria-controls="panel-1"
        id="tab-1"
    >
        Tab Label
    </button>
</div>

<div 
    role="tabpanel"
    aria-labelledby="tab-1"
    id="panel-1"
>
    Content
</div>

<!-- Tree Navigation -->
<nav aria-label="Primary navigation">
    <ul role="tree">
        <li role="treeitem" aria-expanded="false">
            Folder
            <ul role="group">
                <li role="treeitem">Item</li>
            </ul>
        </li>
    </ul>
</nav>
```

### Focus Management

```typescript
// Restore focus after closing
let menuWasExpanded = false;
let menuButton: HTMLButtonElement;

$: if ($menuIsExpanded) {
    menuWasExpanded = true;
}

$: if (!$menuIsExpanded && menuWasExpanded) {
    menuButton?.focus();
    menuWasExpanded = false;
}
```

---

## Responsive Patterns

### Mobile Navigation

```scss
.navigation {
    @media (--range-sidebar-hidden-down) {
        // Mobile: Collapsible overlay
        height: $global-header-mobile-contracted-height;
        position: fixed;
        
        &.is-expanded {
            height: 100%;
        }
    }
    
    @media (--sidebar-visible) {
        // Desktop: Fixed sidebar
        height: 100%;
        position: relative;
    }
}
```

### Tab Layout

```scss
.tab-list {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    
    @media (--range-xsmall-down) {
        // Mobile: Horizontal scroll
        scroll-snap-type: x mandatory;
        
        .tab-item {
            scroll-snap-align: start;
        }
    }
    
    @media (--range-small-up) {
        // Desktop: Flex wrap
        flex-wrap: wrap;
    }
}
```

---

## Best Practices

### 1. **Keyboard Navigation**

Always support:
- Tab/Shift+Tab for focus
- Enter/Space for activation
- Arrow keys for movement
- Escape for closing

### 2. **Visual Feedback**

```scss
// Focus
&:focus-visible {
    outline: 2px solid var(--keyColor);
    outline-offset: 2px;
}

// Hover
&:hover {
    background-color: var(--systemQuaternary);
}

// Active/Selected
&.selected {
    background-color: var(--systemQuinary);
}
```

### 3. **State Persistence**

```typescript
// Save folder state to localStorage
const storageKey = `navigation-folder-${folderId}`;
const isExpanded = writable(
    localStorage.getItem(storageKey) === 'true'
);

isExpanded.subscribe(value => {
    localStorage.setItem(storageKey, String(value));
});
```

---

*Extracted from Apple App Store production source code*
