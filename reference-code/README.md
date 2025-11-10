# Apple App Store - Styling & Animation Reference Guide

Complete reference documentation for all styling patterns, animations, transitions, and component guidelines extracted from the Apple App Store web frontend source code.

## Table of Contents

1. [Animations](#animations)
2. [Transitions](#transitions)
3. [Tabs & Navigation](#tabs--navigation)
4. [Styling Guidelines](#styling-guidelines)
5. [Component Patterns](#component-patterns)

---

## Overview

This reference contains comprehensive documentation of Apple's design system implementation for the App Store web frontend, including:

- **Custom animations** and keyframe definitions
- **Transition patterns** and timing functions
- **Tab navigation** implementations
- **Styling conventions** and CSS architecture
- **Reusable component patterns**

All code examples are from Apple's production source code extracted via sourcemaps.

---

## Quick Reference

### Easing Functions

Apple uses several custom cubic-bezier easing functions:

```scss
$amp-nav-ease-blue: cubic-bezier(0.04, 0.04, 0.12, 0.96);
$amp-nav-ease-green: cubic-bezier(0.52, 0.16, 0.52, 0.84);
```

### Standard Durations

```scss
$shared-transition-delay: 0.1008s;
$shared-transition-duration: 0.1806s;
$spinner-duration: 0.8s;
```

### Common Transitions

```scss
transition: opacity 210ms ease-out;
transition: transform 0.56s cubic-bezier(0.52, 0.16, 0.24, 1);
```

---

## Directory Structure

```
reference-code/
├── README.md (this file)
├── animations/
│   ├── keyframes.md
│   ├── loading-spinner.md
│   ├── hero-animations.md
│   └── background-animations.md
├── transitions/
│   ├── custom-transitions.md
│   ├── modal-transitions.md
│   └── navigation-transitions.md
├── tabs/
│   ├── tab-navigation.md
│   └── category-tabs.md
├── styling/
│   ├── color-system.md
│   ├── typography.md
│   ├── spacing.md
│   └── css-architecture.md
└── components/
    ├── hover-effects.md
    ├── shelf-component.md
    ├── modal-patterns.md
    └── button-styles.md
```

---

## Key Design Principles

### 1. **Reduced Motion Support**
All animations respect `prefers-reduced-motion`:

```scss
@media (prefers-reduced-motion: reduce) {
    transition: none;
    animation: none;
}
```

### 2. **Container Queries**
Modern responsive design using CSS container queries:

```scss
container-name: hero-container;
container-type: size;

@container hero-container (height < 420px) {
    /* responsive styles */
}
```

### 3. **CSS Custom Properties**
Extensive use of CSS variables for theming:

```scss
--hero-primary-color: var(--systemPrimary-onLight);
--buttonBackgroundColor: var(--keyColorBG);
```

### 4. **RTL Support**
Full right-to-left language support:

```scss
@include rtl {
    transform: translateX(-50%);
}
```

### 5. **Dark Mode**
Automatic dark mode switching:

```scss
@media (prefers-color-scheme: dark) {
    --veil: rgba(0, 0, 0, 0.5);
}
```

---

## Performance Optimizations

### 1. **Will-Change**
Strategic use of `will-change` for animations:

```css
will-change: opacity, background-position;
```

### 2. **Transform-Based Animations**
Prefer `transform` over layout properties:

```css
transform: scale(var(--scale));
transition: transform var(--speed) ease-in;
```

### 3. **Lazy Loading**
Intersection Observer API for conditional rendering

### 4. **Animation Play States**
Pause animations when off-screen:

```css
animation-play-state: paused;

.active & {
    animation-play-state: running;
}
```

---

## Usage Examples

See individual files in subdirectories for detailed examples and implementation guidelines.

---

## Notes

- All measurements use relative units (rem, em, %) where possible
- Color values use CSS custom properties for easy theming
- Animations are conditional based on user preferences
- Components are built with accessibility in mind
- Full TypeScript integration in Svelte components

---

*Extracted from Apple App Store production source code via sourcemaps*
*For educational reference only - All code © Apple Inc.*
