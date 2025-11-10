# Custom Transitions Reference

Complete documentation of custom transition functions and patterns used in the Apple App Store.

---

## Table of Contents

1. [Fly and Blur Transition](#fly-and-blur-transition)
2. [Navigation Transitions](#navigation-transitions)
3. [Modal Transitions](#modal-transitions)
4. [Hover Transitions](#hover-transitions)

---

## Fly and Blur Transition

### Custom Svelte Transition

**File**: `src/utils/transition.ts`

A custom Svelte transition that combines movement (fly) with blur effect.

```typescript
import { cubicOut } from 'svelte/easing';
import type { EasingFunction, TransitionConfig } from 'svelte/transition';

interface FlyAndBlurParams {
    // Time (ms) before the animation starts.
    delay?: number;
    // Total animation time (ms).
    duration?: number;
    // Easing function (defaults to cubicOut).
    easing?: EasingFunction;
    // Horizontal offset in pixels at start (like `fly`).
    x?: number;
    // Vertical offset in pixels at start (like `fly`).
    y?: number;
    // Initial blur radius in pixels.
    blur?: number;
}

export function flyAndBlur(
    node: Element,
    {
        delay = 0,
        duration = 420,
        easing = cubicOut,
        x = 0,
        y = 0,
        blur = 3,
    }: FlyAndBlurParams = {},
): TransitionConfig {
    const style = getComputedStyle(node);
    const initialOpacity = +style.opacity;

    return {
        delay,
        duration,
        easing,
        css: (t: number, u: number) => {
            return `
                transform: translate(${x * u}px, ${y * u}px);
                opacity: ${initialOpacity * t};
                filter: blur(${blur * u}px);
            `;
        },
    };
}
```

**Usage Example**:

```svelte
<script>
    import { flyAndBlur } from '~/utils/transition';
</script>

<div transition:flyAndBlur={{ y: -20, blur: 5, duration: 300 }}>
    Content
</div>
```

**Parameters**:
- `delay`: 0ms (default)
- `duration`: 420ms (default)
- `easing`: cubicOut (default)
- `x`: Horizontal movement in pixels
- `y`: Vertical movement in pixels
- `blur`: Maximum blur radius in pixels

**How it works**:
- `t`: Progress from 0 to 1 (forward)
- `u`: Progress from 1 to 0 (inverse of t)
- Element starts at offset position with full blur
- Transitions to original position with no blur
- Opacity fades in from 0 to initial opacity

---

## Navigation Transitions

### Menu Icon Animation

**File**: `shared/components/src/components/Navigation/MenuIcon.svelte`

```scss
$shared-transition-delay: 0.1008s;
$shared-transition-duration: 0.1806s;
$amp-nav-ease-blue: cubic-bezier(0.04, 0.04, 0.12, 0.96);
$amp-nav-ease-green: cubic-bezier(0.52, 0.16, 0.52, 0.84);

.menuicon-bread {
    transition: transform $shared-transition-duration $amp-nav-ease-blue;
    
    [aria-expanded='true'] & {
        transition: transform 0.3192s $amp-nav-ease-blue $shared-transition-delay;
    }
}

.menuicon-bread-crust {
    transition: transform 0.1596s $amp-nav-ease-green $shared-transition-delay;
    
    [aria-expanded='true'] & {
        transform: translateY(0);
        transition: transform $shared-transition-duration $amp-nav-ease-blue;
    }
}

[aria-expanded='true'] {
    .menuicon-bread-top {
        transform: rotate(-45deg);
    }
    
    .menuicon-bread-bottom {
        transform: rotate(45deg);
    }
}
```

**Animation Sequence**:

**Opening** (Hamburger → X):
1. Crusts translate to center (0.1596s, green easing, 0.1008s delay)
2. Bread rotates to form X (0.3192s, blue easing, 0.1008s delay)

**Closing** (X → Hamburger):
1. Bread rotates back (0.1806s, blue easing)
2. Crusts translate back to offset (0.1596s, green easing, 0.1008s delay)

---

### Navigation Expansion

**File**: `shared/components/src/components/Navigation/Navigation.svelte`

```scss
$amp-nav-element-transition: height 0.56s cubic-bezier(0.52, 0.16, 0.24, 1);

.navigation {
    @media (--range-sidebar-hidden-down) {
        height: $global-header-mobile-contracted-height;
        overflow: hidden;
        
        &.is-expanded {
            height: 100%;
        }
        
        // Only apply transition during active state changes
        &.is-transitioning {
            transition: $amp-nav-element-transition;
        }
    }
    
    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
}
```

**State Management**:
```typescript
// Transition only applies during expansion/contraction
menuIsTransitioning.set(true);

// Released after animation completes
on:transitionend|self={() => ($menuIsTransitioning = false)}
```

---

### Folder Arrow Indicator

**File**: `shared/components/src/components/Navigation/Folder.svelte`

```scss
$menuicon-folder-transition: 0.3s transform ease;

.folder-arrow-indicator::before {
    transform: rotate(0deg);
    transition: $menuicon-folder-transition;
    
    .folder-open & {
        transform: rotate(90deg);
        
        @include rtl {
            transform: rotate(-90deg);
        }
    }
    
    @media (prefers-reduced-motion: reduce) {
        transition: none;
    }
}
```

---

## Modal Transitions

### Dialog Backdrop Fade

**File**: `shared/components/src/components/Modal/Modal.svelte`

```scss
dialog {
    &::backdrop,
    & + :global(.backdrop) {
        background-color: var(--modalScrimColor, rgba(0, 0, 0, 0.45));
    }
    
    &.no-scrim::backdrop,
    &.no-scrim + :global(.backdrop) {
        --modalScrimColor: transparent;
    }
}
```

**Commented Out Error Modal Animation**:
```scss
// Disabled but preserved for reference
// $error-modal-duration: 0.275s;
// dialog.error {
//     animation-name: modalZoomIn;
//     animation-duration: $error-modal-duration;
//     animation-timing-function: cubic-bezier(0.27, 1.01, 0.43, 1.19);
// }
// 
// @keyframes modalZoomIn {
//     from {
//         opacity: 0;
//         transform: scale3d(0, 0, 0);
//     }
// }
```

---

## Hover Transitions

### Button Hover Effects

**File**: `shared/components/src/components/buttons/Button.svelte`

```scss
.tertiary button {
    transition: all 100ms ease-in-out;
    
    &:hover,
    &:focus,
    &:focus-within {
        --buttonBackgroundColor: var(
            --buttonBackgroundColorHover,
            var(--keyColorBG, var(--systemBlue))
        );
    }
}
```

---

### Hover Wrapper

**File**: `src/components/HoverWrapper.svelte`

```scss
.hover-wrapper::after {
    mix-blend-mode: soft-light;
    border-radius: var(--global-border-radius-large);
    transition: opacity 210ms ease-out;
}

.hover-wrapper:hover::after {
    @include scrim-opacity;
}
```

---

### Shelf Navigation Arrows

**File**: `shared/components/src/components/Shelf/Shelf.svelte`

```scss
$shelf-grid-nav-transition: opacity 0.3s ease;

.shelf-grid--onhover {
    :global(.shelf-grid-nav__arrow) {
        opacity: 0;
        will-change: opacity;
        transition: $shelf-grid-nav-transition;
        
        &:focus {
            opacity: 1;
        }
    }
    
    &:hover,
    &:focus-within {
        :global(.shelf-grid-nav__arrow:not([disabled])) {
            opacity: 1;
        }
    }
}
```

---

## Ambient Background Transitions

**File**: `src/components/AmbientBackgroundArtwork.svelte`

```css
.container {
    --speed: 0.66s;
    opacity: 0;
    transition: 
        opacity calc(var(--speed) * 2) ease-out,
        background-size var(--speed) ease-in;
}

.container.active {
    opacity: 1;
    transition: opacity calc(var(--speed) / 2) ease-in;
    background-size: 100%;
}

.overlay {
    opacity: 0;
    transition: opacity var(--speed) ease-in;
}

.active .overlay {
    opacity: 0.3;
    transition: 
        opacity calc(var(--speed) * 2) ease-in 
        calc(var(--speed) * 2);
}

.active.out-of-view .overlay,
.active.resizing .overlay {
    opacity: 0;
}
```

**Transition Sequence**:
1. Container fades in slowly (1.32s ease-out)
2. Background size animates (0.66s ease-in)
3. Overlay fades in after delay (1.32s delay, 1.32s duration)

---

## Transition Best Practices

### 1. **Layer Transitions**

Stagger multiple properties for sophisticated effects:

```css
transition:
    opacity 300ms ease-out,
    transform 200ms ease-in 100ms,
    background-color 150ms linear;
```

### 2. **Performance**

Animate only compositor properties:
- `transform`
- `opacity`
- `filter`

Avoid:
- `width`, `height`
- `top`, `left`
- `margin`, `padding`

### 3. **Reduced Motion**

Always provide fallback:

```scss
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}
```

### 4. **State Management**

Use flags to control transition application:

```typescript
// Only transition during active state changes
if (!$prefersReducedMotion) {
    menuIsTransitioning.set(true);
}
```

---

## Timing Reference

### Common Durations

```scss
// Very fast
100ms - 150ms  // Instant feedback (hover states)

// Fast
150ms - 250ms  // Quick transitions

// Medium
250ms - 400ms  // Standard transitions

// Slow
400ms - 600ms  // Elaborate transitions

// Very slow
600ms+         // Special effects, ambient animations
```

### Common Delays

```scss
0ms           // Immediate
100ms - 150ms // Slight delay
200ms - 300ms // Noticeable delay
```

---

*Extracted from Apple App Store production source code*
