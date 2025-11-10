# Shelf Component Architecture Reference

Complete documentation of the Shelf component - Apple's horizontal scrolling gallery pattern used throughout the App Store.

---

## Table of Contents

1. [Component Overview](#component-overview)
2. [Grid System](#grid-system)
3. [Intersection Observer Pattern](#intersection-observer-pattern)
4. [Navigation Controls](#navigation-controls)
5. [Performance Optimizations](#performance-optimizations)
6. [Accessibility Features](#accessibility-features)

---

## Component Overview

### Shelf Component Structure

**File**: `shared/components/src/components/Shelf/Shelf.svelte`

The Shelf is a sophisticated horizontal scrolling component that supports:
- Dynamic grid layouts across viewports
- Lazy rendering with Intersection Observer
- Keyboard navigation
- Arrow button controls
- Custom aspect ratios
- RTL support

**Props**:

```typescript
export let translateFn: (str: string, values?: Record<string, string | number>) => string;
export let id: string | undefined = undefined;
export let items: T[];
export let gridType: GridType;
export let gridRows = 1;
export let arrowOffset: ArrowOffset | null = null;
export let alignItems = false;
export let stackXSItems = false;
export let overflowBleedBottom: string = null;
export let aspectRatioOverride: AspectRatioOverrideConfig = null;
export let getItemIdentifier: ((item: unknown, index?: number) => string) | null = null;
export let pageScrollMultiplier: number = null;
export let onIntersectionUpdate: (itemIndexsInViewport: [number, number]) => void | null = null;
export let firstItemIndex: number = 0;
```

---

## Grid System

### Dynamic Grid Configuration

**Grid Type System**:

Different grid types define columns per viewport:

```typescript
type GridType = 
    | 'A'              // 2-3-4-5-6
    | 'B'              // 2-3-5-6-7
    | 'C'              // 2-4-6-7-8
    | 'Spotlight'      // 1-1-1-1-1 (full width)
    | 'music-radio'    // Custom grid
    | 'H';             // High density
```

**Grid Variables**:

```typescript
const getGridVars = (gridType: GridType) => {
    const config = {
        'A': {
            xsmall: 2, small: 3, medium: 4, large: 5, xlarge: 6,
            columnGap: { xsmall: 16, small: 20, medium: 24 },
            rowGap: { xsmall: 16, small: 20 }
        },
        'B': {
            xsmall: 2, small: 3, medium: 5, large: 6, xlarge: 7,
            columnGap: { xsmall: 16, small: 20, medium: 24 },
            rowGap: { xsmall: 16, small: 20 }
        },
        // ... other grid types
    };
    
    return `
        --grid-xsmall: ${config.xsmall};
        --grid-small: ${config.small};
        --grid-medium: ${config.medium};
        --grid-large: ${config.large};
        --grid-xlarge: ${config.xlarge};
        --grid-column-gap-xsmall: ${config.columnGap.xsmall}px;
        --grid-column-gap-small: ${config.columnGap.small}px;
        --grid-column-gap-medium: ${config.columnGap.medium}px;
    `;
};
```

---

### Responsive Grid Styles

```scss
@mixin shelf-grid-list-styles($viewport: null) {
    $grid-cols: var(--grid-#{$viewport});
    $grid-offset: calc(
        (#{$grid-cols} - 1) * var(--grid-column-gap-#{$viewport})
    );
    grid-auto-columns: var(
        --grid-max-content-#{$viewport},
        calc((100% - #{$grid-offset}) / #{$grid-cols})
    );
    grid-template-rows: repeat(var(--grid-rows), max-content);
    column-gap: var(--grid-column-gap-#{$viewport});
    row-gap: var(--grid-row-gap-#{$viewport});
}

.shelf-grid__list {
    display: grid;
    grid-auto-flow: column;
    overflow-x: auto;
    scroll-behavior: smooth;
    align-items: stretch;
    
    @include shelf-grid-list-styles(xsmall);
    
    @media (--range-small-only) {
        @include shelf-grid-list-styles(small);
    }
    
    @media (--range-medium-only) {
        @include shelf-grid-list-styles(medium);
    }
    
    @media (--range-large-only) {
        @include shelf-grid-list-styles(large);
    }
    
    @media (--range-xlarge-up) {
        @include shelf-grid-list-styles(xlarge);
    }
}
```

---

### Drawer Adjustment

When a drawer is open, reduce column count:

```scss
@include feature-detect(is-drawer-open) {
    @media (--range-medium-only) {
        &:not(.shelf-grid__list--grid-type-A) {
            // Subtract 1 column when drawer is open
            $grid-cols: calc(var(--grid-medium) - 1);
            $grid-offset: calc(
                (#{$grid-cols} - 1) * var(--grid-column-gap-medium)
            );
            grid-auto-columns: calc((100% - #{$grid-offset}) / #{$grid-cols});
        }
    }
}
```

---

## Intersection Observer Pattern

### Lazy Rendering System

**ShelfWindow Class**:

Tracks visible items in the shelf viewport:

```typescript
class ShelfWindow {
    private items = new Set<number>();
    
    enterValue(index: number) {
        this.items.add(index);
    }
    
    exitValue(index: number) {
        this.items.delete(index);
    }
    
    getViewport(): [number, number] | null {
        if (this.items.size === 0) return null;
        const sorted = Array.from(this.items).sort((a, b) => a - b);
        return [sorted[0], sorted[sorted.length - 1]];
    }
}
```

---

### Observer Callback

```typescript
const createObserver = (shelfBody: HTMLElement) => {
    const options = {
        root: shelfBody,
        rootMargin: '0px',
        threshold: 0.5,
    };
    
    const shelfWindow = new ShelfWindow();
    const callback = (entries: IntersectionObserverEntry[]) => {
        const LAST_ITEM = items.length - 1;
        
        entries.forEach((entry) => {
            const item = entry.target as HTMLUListElement;
            const currentIndex = parseInt(item.dataset.index, 10);
            const EXTRA_ITEMS = 2 * gridRows || 2;
            
            if (entry.isIntersecting) {
                shelfWindow.enterValue(currentIndex);
                
                // Load items ahead of viewport
                const nextIndex = currentIndex + 1;
                if (nextIndex >= $visibleStore.endIndex) {
                    const lastIndex = currentIndex + EXTRA_ITEMS;
                    visibleStore.updateEndIndex(lastIndex);
                }
                
                // Enable interactivity
                setShelfItemInteractivity(entry.target, true);
            } else {
                shelfWindow.exitValue(currentIndex);
                // Disable interactivity for offscreen items
                setShelfItemInteractivity(entry.target, false);
            }
            
            // Update navigation arrows
            const [isFirstItemAndInView, isLastItemAndInView] = 
                checkItemPositionInShelf(entry, LAST_ITEM);
            
            if (isFirstItemAndInView !== null) {
                hasPreviousPage = !isFirstItemAndInView;
            }
            
            if (isLastItemAndInView !== null) {
                hasNextPage = !isLastItemAndInView;
            }
        });
        
        viewport = shelfWindow.getViewport();
        
        if (viewport && onIntersectionUpdate) {
            onIntersectionUpdate(viewport);
        }
    };
    
    return new IntersectionObserver(callback, options);
};
```

---

### Item Interactivity Control

Disable tab navigation and buttons for offscreen items:

```typescript
function setShelfItemInteractivity(
    shelfItemElement: Element,
    isShelfItemVisible: boolean,
) {
    const interactiveContent: NodeListOf<HTMLAnchorElement | HTMLButtonElement> = 
        shelfItemElement.querySelectorAll('a, button');
    
    interactiveContent.forEach((interactiveElement) => {
        if (interactiveElement.nodeName === 'A') {
            if (isShelfItemVisible) {
                interactiveElement.removeAttribute('tabindex');
            } else {
                interactiveElement.setAttribute('tabindex', '-1');
            }
        } else {
            // <button> elements
            if (isShelfItemVisible) {
                interactiveElement.removeAttribute('disabled');
            } else {
                interactiveElement.setAttribute('disabled', 'true');
            }
        }
    });
}
```

---

## Navigation Controls

### Page Scrolling

```typescript
const GRID_COLUMN_GAP_DEFAULT = 20;
const STANDARD_LOCKUP_SHADOW_OFFSET = 15;

const pageScroll = (pageCount = 1) => {
    const containerWidth = scrollableContainer.getBoundingClientRect().width;
    const scrollAmount =
        (containerWidth +
            GRID_COLUMN_GAP_DEFAULT -
            STANDARD_LOCKUP_SHADOW_OFFSET * 2) *
        pageCount;
    scrollableContainer.scrollBy(scrollAmount, 0);
};

const THROTTLE_LIMIT = 300;
const pageMultiplier = isRTL ? -pageMultiplierNumber : pageMultiplierNumber;

$: handleNextPage = throttle(
    pageScroll.bind(null, pageMultiplier),
    THROTTLE_LIMIT,
);

$: handlePreviousPage = throttle(
    pageScroll.bind(null, -pageMultiplier),
    THROTTLE_LIMIT,
);
```

---

### Scroll to Specific Index

```typescript
export function scrollToIndex(index: number) {
    const shelfItems = scrollableContainer.getElementsByClassName(
        'shelf-grid__list-item',
    );
    if (!shelfItems) return;
    
    const firstItem = shelfItems[0] as HTMLDivElement;
    const itemWidth = firstItem.getBoundingClientRect().width;
    
    let scrollAmount: number;
    if (index === 0) {
        scrollAmount = 0;
    } else {
        scrollAmount =
            (itemWidth +
                GRID_COLUMN_GAP_DEFAULT -
                STANDARD_LOCKUP_SHADOW_OFFSET * 2) *
            index;
    }
    
    let offset = isRTL ? -scrollAmount : scrollAmount;
    scrollableContainer.scrollTo({ left: offset, behavior: 'instant' });
}
```

---

### Arrow Button Component

**File**: `shared/components/src/components/Shelf/Nav.svelte`

```svelte
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    
    export let hasNextPage: boolean;
    export let hasPreviousPage: boolean;
    export let headerHeight: number = 0;
    export let arrowOffset: ArrowOffset | null;
    export let isRTL: boolean;
    export let translateFn: (key: string) => string;
    
    const dispatch = createEventDispatcher();
</script>

<div class="shelf-nav">
    <slot name="shelf-content" />
    
    {#if hasPreviousPage}
        <button
            class="shelf-grid-nav__arrow shelf-grid-nav__arrow--previous"
            on:click={() => dispatch('previous')}
            aria-label={translateFn('Previous')}
            style:top={`calc(50% + ${headerHeight / 2}px)`}
        >
            <ChevronIcon direction={isRTL ? 'right' : 'left'} />
        </button>
    {/if}
    
    {#if hasNextPage}
        <button
            class="shelf-grid-nav__arrow shelf-grid-nav__arrow--next"
            on:click={() => dispatch('next')}
            aria-label={translateFn('Next')}
            style:top={`calc(50% + ${headerHeight / 2}px)`}
        >
            <ChevronIcon direction={isRTL ? 'left' : 'right'} />
        </button>
    {/if}
</div>
```

---

## Performance Optimizations

### 1. **Visible Store Pattern**

Only render items that are visible or near viewport:

```typescript
const visibleStore = createVisibleIndexStore();
const initalVisibleGridItems = getMaxVisibleItems(gridType) * (gridRows || 1);
visibleStore.updateEndIndex(initalVisibleGridItems);
```

**ShelfItem Component**:

```svelte
<ShelfItem {index} {visibleStore} let:isRendered>
    <li class:placeholder={!isRendered}>
        {#if isRendered}
            <slot {item} {index} />
        {/if}
    </li>
</ShelfItem>
```

---

### 2. **Scroll Restoration**

Maintain scroll position when items update:

```typescript
function restoreScroll(node: HTMLElement, items: T[]) {
    if (!isObjectWithId(items[0])) {
        return {};
    }
    firstKnownItem = items[0];
    return {
        update(items: T[]) {
            if (
                isObjectWithId(items[0]) &&
                items[0].id !== firstKnownItem.id &&
                initialScroll === 0 &&
                node.scrollLeft > 0
            ) {
                node.scrollLeft = 0;
            }
        },
    };
}
```

---

### 3. **ScrollBy Polyfill**

Support smooth scrolling in older browsers:

```typescript
import scrollByPolyfill from '@amp/web-app-components/src/utils/scrollByPolyfill';

onMount(() => {
    scrollByPolyfill();
});
```

---

### 4. **Will-Change Optimization**

```scss
.shelf-grid-nav__arrow {
    will-change: opacity;
    transition: opacity 0.3s ease;
}
```

---

## Accessibility Features

### 1. **ARIA Semantics**

```html
<ul
    class="shelf-grid__list"
    role="list"
    tabindex="-1"
    aria-label="Horizontal scrolling shelf"
>
    <li
        class="shelf-grid__list-item"
        aria-hidden={isItemInteractable ? 'false' : 'true'}
    >
        <!-- content -->
    </li>
</ul>
```

---

### 2. **Tab Order Management**

Firefox adds scrollable elements to tab order, so prevent that:

```html
<ul
    tabindex="-1"
    on:mousedown={(e) => e.preventDefault()}
>
```

---

### 3. **Keyboard Navigation**

Arrow buttons are keyboard accessible:

```svelte
<button
    class="shelf-grid-nav__arrow"
    on:click={handleNext}
    aria-label={translateFn('Next page')}
>
    <!-- icon -->
</button>
```

---

### 4. **Screen Reader Support**

```typescript
// Announce current position
const announcePosition = (viewport: [number, number]) => {
    const [start, end] = viewport;
    const total = items.length;
    return translateFn('Showing items {start} to {end} of {total}', {
        start: start + 1,
        end: end + 1,
        total
    });
};
```

---

## Advanced Features

### Aspect Ratio Override

```typescript
import { createShelfAspectRatioContext } from '@amp/web-app-components/src/utils/shelfAspectRatio';

let shelfAspectRatioStore: Readable<string> | null = null;

if (aspectRatioOverride !== null) {
    const { shelfAspectRatio } = 
        createShelfAspectRatioContext(aspectRatioOverride);
    shelfAspectRatioStore = shelfAspectRatio;
}

$: style = `
    ${getGridVars(gridType)}
    ${aspectRatioOverride !== null && $shelfAspectRatioStore !== null
        ? `--shelf-aspect-ratio: ${$shelfAspectRatioStore};`
        : ''}
`;
```

---

### Shelf Chevron Anchor

```scss
.shelf-grid__list {
    :first-child {
        :global(.artwork-component:not(.artwork-component--no-anchor)) {
            anchor-name: --shelf-first-artwork;
        }
    }
}

// Used by navigation arrows to align with first artwork
.shelf-grid-nav__arrow {
    position-anchor: --shelf-first-artwork;
}
```

---

*Extracted from Apple App Store production source code*
