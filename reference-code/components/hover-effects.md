# Hover Effects & Interactive States Reference

Complete documentation of hover effects, interactive states, and visual feedback patterns used in the Apple App Store.

---

## Table of Contents

1. [Hover Wrapper Component](#hover-wrapper-component)
2. [Button Hover States](#button-hover-states)
3. [Shelf Navigation Arrows](#shelf-navigation-arrows)
4. [Card Hover Effects](#card-hover-effects)
5. [Link Hover States](#link-hover-states)

---

## Hover Wrapper Component

### Universal Hover Container

**File**: `src/components/HoverWrapper.svelte`

A reusable wrapper component that adds consistent hover effects to lockups and cards.

**Component Structure**:

```svelte
<script lang="ts">
    export let element: keyof HTMLElementTagNameMap = 'article';
    export let hasChin: boolean = false;
</script>

<svelte:element this={element} class="hover-wrapper" class:has-chin={hasChin}>
    <slot />
</svelte:element>
```

**Styling**:

```scss
@use '@amp/web-shared-styles/app/core/mixins/scrim-opacity-controller' as *;
@use 'amp/stylekit/core/mixins/hover-style' as *;

.hover-wrapper {
    position: relative;
    display: var(--display, flex);
    overflow: hidden;
    align-items: center;
    cursor: pointer;
    border-radius: var(--global-border-radius-large);
    box-shadow: var(--shadow-small);
    
    @include scrim-opacity-controller;
}

/* Pseudo-element for hover overlay */
.hover-wrapper::after {
    mix-blend-mode: soft-light;
    
    @include content-container-hover-style;
    
    // Override default styles
    border-radius: var(--global-border-radius-large);
    transition: opacity 210ms ease-out;
}

.hover-wrapper:hover::after {
    @include scrim-opacity;
}
```

**Special Case: Cards with Chins**:

```scss
.hover-wrapper.has-chin,
.hover-wrapper.has-chin::after {
    // Chrome bug workaround for unequal border-radius with mask-image
    // https://issues.chromium.org/issues/40778541
    border-radius: unset;
    clip-path: inset(
        0 0 0 0 round 
        var(--global-border-radius-large) 
        var(--global-border-radius-large) 
        0 0
    );
}
```

**Usage Example**:

```svelte
<HoverWrapper element="article">
    <img src="artwork.jpg" alt="App Icon" />
    <h3>App Name</h3>
    <p>Description</p>
</HoverWrapper>

<HoverWrapper element="div" hasChin={true}>
    <img src="screenshot.jpg" alt="Screenshot" />
    <div class="chin">Additional info</div>
</HoverWrapper>
```

---

## Button Hover States

### Primary Button States

**File**: `shared/components/src/components/buttons/Button.svelte`

```scss
.button.primary button {
    color: var(--buttonTextColor, white);
    background-color: var(
        --buttonBackgroundColor,
        var(--keyColorBG, var(--systemBlue))
    );
    
    &:hover {
        opacity: 0.9;
    }
    
    &:active {
        opacity: 0.8;
    }
    
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}
```

---

### Secondary Button States

```scss
.button.secondary button {
    --buttonBackgroundColor: transparent;
    color: var(--buttonTextColor, var(--keyColor));
    border: 1px solid var(--buttonBorderColor, var(--keyColor));
    
    &:hover {
        background-color: rgba(var(--keyColor-rgb), 0.06);
    }
    
    &:active {
        background-color: rgba(var(--keyColor-rgb), 0.12);
    }
}
```

---

### Tertiary Button with Transition

```scss
.button.tertiary button {
    transition: all 100ms ease-in-out;
    
    &:hover,
    &:focus,
    &:focus-within {
        --buttonBackgroundColor: var(
            --buttonBackgroundColorHover,
            var(--keyColorBG)
        );
        transform: scale(1.02);
    }
    
    &:active {
        transform: scale(0.98);
    }
}
```

---

### Icon Button Hover

```scss
.button__icon {
    fill: var(--buttonIconFill, currentColor);
    transition: fill 150ms ease;
    
    @media (hover: hover) {
        button:hover & {
            fill: var(
                --buttonIconFillHover,
                var(--buttonIconFill, currentColor)
            );
        }
    }
    
    @supports selector(:has(:focus-visible)) {
        button:focus-visible & {
            fill: var(
                --buttonIconFillFocus,
                var(--buttonIconFill, currentColor)
            );
        }
    }
    
    button:active & {
        fill: var(
            --buttonIconFillActive,
            var(--buttonIconFill, currentColor)
        );
    }
}
```

---

## Shelf Navigation Arrows

### Arrow Fade-In Pattern

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

**Arrow Button Styles**:

```scss
.shelf-grid-nav__arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 10;
    
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(0, 0, 0, 0.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    
    backdrop-filter: blur(20px);
    
    &:hover {
        background: rgba(255, 255, 255, 1);
        transform: translateY(-50%) scale(1.1);
    }
    
    &:active {
        transform: translateY(-50%) scale(0.95);
    }
    
    &[disabled] {
        opacity: 0.3;
        cursor: not-allowed;
    }
    
    @media (prefers-color-scheme: dark) {
        background: rgba(50, 50, 50, 0.9);
        border-color: rgba(255, 255, 255, 0.1);
    }
}
```

---

## Card Hover Effects

### Artwork Component Hover

**File**: `shared/components/src/components/Artwork/Artwork.svelte`

```scss
.artwork-component {
    position: relative;
    overflow: hidden;
    border-radius: var(--artworkBorderRadius, 8px);
    transition: transform 200ms ease, box-shadow 200ms ease;
    
    &:hover {
        transform: scale(1.02);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
    }
    
    img {
        transition: transform 300ms ease;
    }
    
    &:hover img {
        transform: scale(1.05);
    }
}
```

---

### Card Overlay on Hover

```scss
.card {
    position: relative;
    
    &::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(
            180deg,
            transparent 0%,
            rgba(0, 0, 0, 0.6) 100%
        );
        opacity: 0;
        transition: opacity 300ms ease;
        pointer-events: none;
    }
    
    &:hover::before {
        opacity: 1;
    }
    
    .card-content {
        position: relative;
        z-index: 1;
        transform: translateY(20px);
        opacity: 0;
        transition: 
            transform 300ms ease,
            opacity 300ms ease;
    }
    
    &:hover .card-content {
        transform: translateY(0);
        opacity: 1;
    }
}
```

---

## Link Hover States

### Navigation Links

**File**: `shared/components/src/components/Navigation/Item.svelte`

```scss
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
    
    &:active {
        background-color: var(--systemQuinary);
    }
    
    &:focus-visible {
        outline: 2px solid var(--keyColor);
        outline-offset: -2px;
    }
    
    &[aria-pressed="true"] {
        background-color: var(--systemQuinary);
        font-weight: 600;
    }
}
```

---

### Text Links

```scss
.link {
    color: var(--keyColor);
    text-decoration: none;
    position: relative;
    
    &::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        width: 100%;
        height: 1px;
        background: currentColor;
        transform: scaleX(0);
        transform-origin: right;
        transition: transform 250ms ease;
    }
    
    &:hover::after {
        transform: scaleX(1);
        transform-origin: left;
    }
}
```

---

## Scrim Opacity Controller

### Dynamic Hover Scrim

**Mixin**: `@amp/web-shared-styles/app/core/mixins/scrim-opacity-controller`

This pattern allows dynamic scrim opacity based on artwork brightness.

```scss
@mixin scrim-opacity-controller {
    --scrim-opacity: 0;
    
    &[data-scrim-opacity="0"] {
        --scrim-opacity: 0;
    }
    
    &[data-scrim-opacity="1"] {
        --scrim-opacity: 0.03;
    }
    
    &[data-scrim-opacity="2"] {
        --scrim-opacity: 0.06;
    }
    
    &[data-scrim-opacity="3"] {
        --scrim-opacity: 0.09;
    }
}

@mixin scrim-opacity {
    opacity: var(--scrim-opacity);
}
```

**Usage**:

```svelte
<script>
    // Calculate scrim opacity based on image brightness
    $: scrimLevel = calculateScrimLevel(artwork);
</script>

<div class="hover-wrapper" data-scrim-opacity={scrimLevel}>
    <!-- content -->
</div>
```

---

## Interactive State Patterns

### Triple-State Button

```scss
.interactive-button {
    // Default state
    background: var(--systemQuaternary);
    transform: scale(1);
    transition: all 150ms ease;
    
    // Hover state
    @media (hover: hover) {
        &:hover:not(:disabled) {
            background: var(--systemQuinary);
            transform: scale(1.05);
        }
    }
    
    // Active/pressed state
    &:active:not(:disabled) {
        background: var(--systemQuinary);
        transform: scale(0.95);
        transition: all 50ms ease;
    }
    
    // Disabled state
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: scale(1);
    }
}
```

---

### Focus-Visible Pattern

Modern focus handling that only shows outline for keyboard users:

```scss
.focusable {
    // Remove default focus ring
    &:focus {
        outline: none;
    }
    
    // Show custom focus ring only for keyboard
    &:focus-visible {
        outline: 2px solid var(--keyColor);
        outline-offset: 2px;
        border-radius: var(--global-border-radius-small);
    }
    
    // Alternative: focus ring inside element
    &.focus-inside:focus-visible {
        box-shadow: 
            inset 0 0 0 2px var(--keyColor),
            0 0 0 4px rgba(var(--keyColor-rgb), 0.2);
    }
}
```

---

## Best Practices

### 1. **Respect Hover Capability**

```scss
// Only apply hover effects on devices that support it
@media (hover: hover) {
    .element:hover {
        background-color: var(--hoverBg);
    }
}

// Touch devices - use :active instead
@media (hover: none) {
    .element:active {
        background-color: var(--activeBg);
    }
}
```

### 2. **Transition Performance**

```scss
// Good - GPU accelerated
.element {
    transform: scale(1);
    opacity: 1;
    transition: transform 200ms, opacity 200ms;
}

.element:hover {
    transform: scale(1.05);
}

// Avoid - causes reflow
.element {
    width: 100px;
    transition: width 200ms;
}

.element:hover {
    width: 120px;
}
```

### 3. **Accessible Interactive States**

```scss
.interactive {
    // Visual states
    &:hover { /* hover style */ }
    &:focus { /* focus style */ }
    &:active { /* active style */ }
    
    // Accessible focus
    &:focus-visible {
        outline: 2px solid var(--keyColor);
        outline-offset: 2px;
    }
    
    // High contrast mode
    @media (prefers-contrast: more) {
        &:hover {
            border: 2px solid currentColor;
        }
    }
}
```

### 4. **Will-Change Usage**

```scss
.hover-wrapper {
    // Don't set will-change by default
    
    &:hover {
        will-change: transform, opacity;
    }
}

// Or use on interaction start
.button {
    &:active {
        will-change: transform;
        transform: scale(0.95);
    }
}
```

---

*Extracted from Apple App Store production source code*
