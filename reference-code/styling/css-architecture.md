# CSS Architecture & Styling Guidelines

Complete documentation of CSS patterns, architecture, and styling conventions used in the Apple App Store.

---

## Table of Contents

1. [CSS Custom Properties System](#css-custom-properties-system)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Border Radius](#border-radius)
6. [Shadows](#shadows)
7. [Z-Index Scale](#z-index-scale)
8. [Responsive Design](#responsive-design)

---

## CSS Custom Properties System

### Global Variables Pattern

Apple uses extensive CSS custom properties for theming and customization.

**Naming Convention**:
```css
--{component}-{property}-{variant}
--buttonBackgroundColor
--buttonBackgroundColorHover
--buttonBackgroundColorDark
```

**Component-Level Variables**:

```scss
.hero {
    --hero-primary-color: var(--systemPrimary-onLight);
    --hero-secondary-color: var(--systemSecondary-onLight);
    --hero-text-blend-mode: normal;
    --hero-divider-color: var(--systemQuaternary-onLight);
}

.hero.with-dark-media {
    --hero-primary-color: var(--systemPrimary-onDark);
    --hero-secondary-color: var(--systemSecondary-onDark);
    --hero-divider-color: var(--systemQuaternary-onDark);
    --hero-text-blend-mode: plus-lighter;
}
```

---

## Color System

### Semantic Color Tokens

**System Colors** (Light/Dark mode adaptive):

```scss
// Primary text and UI elements
--systemPrimary
--systemSecondary
--systemTertiary
--systemQuaternary
--systemQuinary

// On specific backgrounds
--systemPrimary-onLight
--systemPrimary-onDark
--systemSecondary-onLight
--systemSecondary-onDark

// Dividers and separators
--labelDivider

// Backgrounds
--pageBg
--navSidebarBG
--mobileNavigationBG

// Accent colors
--keyColor
--keyColorBG
--keyColor-rgb  // RGB values for alpha manipulation
--selectionColor
--systemBlue
```

**Usage Pattern**:

```scss
.component {
    color: var(--systemPrimary);
    background: var(--pageBg);
    
    @media (prefers-color-scheme: dark) {
        // Variables automatically switch
        // No manual dark mode overrides needed
    }
}
```

---

### Dynamic Color Manipulation

**RGB Alpha Channels**:

```scss
.element {
    background-color: rgba(var(--keyColor-rgb), 0.06);
}
```

**Relative Colors** (Modern CSS):

```scss
background: linear-gradient(
    var(--rotation),
    rgb(from var(--color) r g b / 0.25) 0%,
    transparent 50%
);
```

---

## Typography

### Font Variables

Apple uses a token-based typography system:

```scss
// Display sizes
--header-emphasized
--large-title-emphasized
--title-1-emphasized
--title-2

// Body text
--body
--body-emphasized
--body-tall
--body-semibold-tall
--body-reduced-semibold

// UI text
--callout-emphasized-tall
```

**Usage**:

```scss
h1 {
    font: var(--header-emphasized);
    
    @media (--range-xsmall-down) {
        font: var(--title-1-emphasized);
    }
}

p {
    font: var(--body-tall);
}

button {
    font: var(--body-emphasized);
}
```

---

### Text Utilities

**Line Clamping**:

```scss
@use 'amp/stylekit/core/mixins/line-clamp' as *;

.truncated {
    @include line-clamp(3); // Limit to 3 lines
}
```

**Text Wrapping**:

```css
.title {
    text-wrap: balance;  /* Balanced line breaks */
}

.description {
    text-wrap: pretty;   /* Avoid orphans */
}
```

---

## Spacing & Layout

### Spacer System

**File**: References `$spacerC` and similar from stylekit

```scss
// Typical spacer values
$spacerA: 8px;
$spacerB: 16px;
$spacerC: 24px;
$spacerD: 32px;
$spacerE: 48px;
```

**Body Gutter**:

```scss
.container {
    padding-inline-start: var(--bodyGutter);
    padding-inline-end: var(--bodyGutter);
}
```

---

### Grid System

**Shelf Grid Configuration**:

```scss
// Grid columns per viewport
--grid-xsmall: 2;
--grid-small: 3;
--grid-medium: 4;
--grid-large: 5;
--grid-xlarge: 6;

// Grid gaps
--grid-column-gap-xsmall: 16px;
--grid-column-gap-small: 20px;
--grid-column-gap-medium: 24px;
--grid-row-gap-xsmall: 16px;
--grid-row-gap-small: 20px;

// Calculated column width
grid-auto-columns: calc((100% - ((var(--grid-medium) - 1) * var(--grid-column-gap-medium))) / var(--grid-medium));
```

**Grid Layout**:

```scss
.shelf-grid__list {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(var(--grid-rows), max-content);
    column-gap: var(--grid-column-gap-medium);
    row-gap: var(--grid-row-gap-medium);
    overflow-x: auto;
    scroll-behavior: smooth;
}
```

---

## Border Radius

### Radius Scale

```scss
// Global border radius values
$global-border-radius-xsmall: 8px;
$global-border-radius-small: 10px;
$global-border-radius-medium: 12px;
$global-border-radius-large: 18px;

// CSS Variables
--global-border-radius-xsmall
--global-border-radius-small  
--global-border-radius-medium
--global-border-radius-large

// Modal specific
--modalBorderRadius: $modal-border-radius; // 12px
```

**Usage Pattern**:

```scss
.card {
    border-radius: var(--global-border-radius-large);
}

.button {
    border-radius: var(--buttonRadius, var(--global-border-radius-xsmall));
}

.pill {
    border-radius: 16px; // Fully rounded
}
```

---

## Shadows

### Shadow System

```scss
// Elevation shadows
--shadow-small: 0 1px 2px rgba(0, 0, 0, 0.1);
--shadow-medium: 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-large: 0 4px 16px rgba(0, 0, 0, 0.15);

// Lockup shadow offset
--standard-lockup-shadow-offset: 15px;
```

**Box Shadow Usage**:

```scss
.elevated-card {
    box-shadow: var(--shadow-small);
    
    &:hover {
        box-shadow: var(--shadow-medium);
    }
}
```

---

## Z-Index Scale

### Layering System

```scss
// Z-index hierarchy
--z-default: 1;
--z-web-chrome: 1000;  // Navigation header
--z-modal: 2000;        // Modal overlays
```

**Usage**:

```scss
.navigation {
    z-index: var(--z-web-chrome);
}

dialog {
    z-index: var(--z-modal);
}

.tooltip {
    z-index: calc(var(--z-default) + 10);
}
```

---

## Responsive Design

### Media Queries

**Viewport Ranges**:

```scss
// Custom media queries (PostCSS)
@media (--range-xsmall-down)   // < 735px
@media (--range-small-only)    // 735px - 1068px
@media (--range-small-up)      // >= 735px
@media (--range-medium-only)   // 1068px - 1440px
@media (--range-medium-up)     // >= 1068px
@media (--range-large-only)    // 1440px - 1920px
@media (--range-large-up)      // >= 1440px
@media (--range-xlarge-up)     // >= 1920px

// Sidebar visibility
@media (--sidebar-visible)     // Desktop sidebar shown
@media (--range-sidebar-hidden-down)  // Mobile, no sidebar
```

**Container Queries**:

```scss
.hero {
    container-name: hero-container;
    container-type: size;
}

@container hero-container (height < 420px) {
    h2 {
        font: var(--large-title-emphasized);
    }
}

@container hero-container (aspect-ratio >= 279/100) {
    img {
        width: 100%;
        height: auto;
    }
}
```

---

### Responsive Patterns

**Mobile-First**:

```scss
.component {
    // Mobile styles (base)
    padding: 16px;
    font: var(--body);
    
    @media (--range-small-up) {
        // Tablet
        padding: 24px;
    }
    
    @media (--range-medium-up) {
        // Desktop
        padding: 32px;
        font: var(--body-tall);
    }
}
```

**Viewport-Specific Grids**:

```scss
.grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    
    @media (--range-small-only) {
        grid-template-columns: repeat(3, 1fr);
        gap: 20px;
    }
    
    @media (--range-medium-only) {
        grid-template-columns: repeat(4, 1fr);
        gap: 24px;
    }
    
    @media (--range-large-up) {
        grid-template-columns: repeat(5, 1fr);
        gap: 24px;
    }
}
```

---

## Layout Patterns

### Flexbox Patterns

```scss
// Center content
.center {
    display: flex;
    align-items: center;
    justify-content: center;
}

// Space between
.space-between {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

// Vertical stack
.stack {
    display: flex;
    flex-direction: column;
    gap: var(--stack-gap, 16px);
}
```

---

### Grid Patterns

```scss
// Auto-fit grid
.auto-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 24px;
}

// Fixed aspect ratio
.aspect-ratio-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    
    > * {
        aspect-ratio: 1 / 1;
    }
}
```

---

## Logical Properties

### RTL Support

Apple uses logical properties throughout for RTL language support:

```scss
// Instead of left/right
margin-inline-start: 12px;  // left in LTR, right in RTL
margin-inline-end: 12px;    // right in LTR, left in RTL

padding-inline-start: 16px;
padding-inline-end: 16px;

// Instead of top/bottom
margin-block-start: 8px;    // top
margin-block-end: 8px;      // bottom

// Directional
inset-inline-start: 0;      // left in LTR
inset-inline-end: 0;        // right in LTR

// Border
border-inline-start: 1px solid var(--labelDivider);
```

**RTL Mixin**:

```scss
@include rtl {
    // Styles applied only in RTL mode
    transform: scaleX(-1);
}
```

---

## Overflow & Scrolling

### Scroll Patterns

```scss
.scrollable {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-behavior: smooth;
    
    // Hide scrollbar
    scrollbar-width: none;
    -ms-overflow-style: none;
    
    &::-webkit-scrollbar {
        display: none;
    }
    
    // Scroll snap
    scroll-snap-type: x mandatory;
    
    > * {
        scroll-snap-align: start;
    }
}
```

---

## Accessibility

### Focus Styles

```scss
// Remove default outline, add custom
button:focus {
    outline: none;
}

button:focus-visible {
    outline: 2px solid var(--keyColor);
    outline-offset: 2px;
}

// Alternative focus style
.custom-focus:focus-visible {
    box-shadow: 0 0 0 3px var(--keyColor);
}
```

### High Contrast Mode

```scss
@media (prefers-contrast: more) {
    .element {
        border: 2px solid currentColor;
    }
}
```

---

## Performance Best Practices

### 1. **CSS Containment**

```scss
.card {
    contain: layout style paint;
}

.list-item {
    content-visibility: auto;
}
```

### 2. **Will-Change**

```scss
.animated {
    will-change: transform, opacity;
}

.animated.complete {
    will-change: auto;  // Remove after animation
}
```

### 3. **Transform Over Position**

```scss
// Good
.slide-in {
    transform: translateX(100%);
}

// Avoid
.slide-in {
    left: 100%;
}
```

---

*Extracted from Apple App Store production source code*
