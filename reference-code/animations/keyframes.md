# Keyframe Animations Reference

Complete documentation of all `@keyframes` animations used in the Apple App Store.

---

## Table of Contents

1. [Loading Spinner](#loading-spinner)
2. [Background Shift](#background-shift)
3. [Collection Icons Gradient](#collection-icons-gradient)
4. [Fade Animations](#fade-animations)

---

## Loading Spinner

### Default Spinner Animation

**File**: `shared/components/src/components/LoadingSpinner/LoadingSpinner.svelte`

```scss
@keyframes spinner-line-fade-default {
    0%, 100% {
        opacity: 0.55; // maximum opacity
    }
    
    95% {
        opacity: 0.08; // minimum opacity
    }
    
    1% {
        opacity: 0.55; // maximum opacity
    }
}
```

**Usage**:
- 8 animated "nibs" rotating in a circle
- Each nib has a different delay to create cascading effect
- Duration: `0.8s`
- Timing: `linear`
- Iteration: `infinite`

**Animation Variables**:
```scss
$spinner-nibs: 8;
$spinner-duration: 0.8s;
$spinner-nib-minimum-opacity: 0.08;
$spinner-nib-maxiumum-opacity: 0.55;
```

**Nib Positioning**:
```scss
@for $i from 0 to $spinner-nibs {
    .pulse-spinner__nib--#{$i + 1} {
        $degrees: math.div(360, $spinner-nibs) * $i;
        $nib-delay: $spinner-duration - (math.div($spinner-duration, $spinner-nibs) * $i);
        transform: rotate(#{$degrees}deg) translateX($spinner-nib-distance);
        
        &::before {
            animation-delay: -$nib-delay;
        }
    }
}
```

---

### High Contrast Spinner

For increased accessibility:

```scss
@keyframes spinner-line-fade-increased-contrast {
    0%, 100% {
        opacity: 0.8; // maximum opacity (higher than default)
    }
    
    95% {
        opacity: 0.1; // minimum opacity
    }
    
    1% {
        opacity: 0.8; // maximum opacity
    }
}
```

**Activation**:
```scss
@media (prefers-contrast: more) {
    animation-name: spinner-line-fade-increased-contrast;
}
```

---

## Background Shift

### Ambient Background Animation

**File**: `src/components/AmbientBackgroundArtwork.svelte`

```css
@keyframes shift-background {
    0% {
        background-position: 0% 50%;
        background-size: 250%;
    }
    
    25% {
        background-position: 60% 20%;
        background-size: 300%;
    }
    
    50% {
        background-position: 100% 50%;
        background-size: 320%;
    }
    
    75% {
        background-position: 40% 100%;
        background-size: 220%;
    }
    
    100% {
        background-position: 20% 50%;
        background-size: 300%;
    }
}
```

**Usage**:
```css
.overlay {
    animation: shift-background 60s infinite linear alternate;
    animation-play-state: paused;
}

.active .overlay {
    animation-play-state: running;
}

.active.out-of-view .overlay,
.active.resizing .overlay {
    animation-play-state: paused;
    opacity: 0;
}
```

**Performance Features**:
- Paused when element is out of view (Intersection Observer)
- Paused during window resize to prevent jank
- Uses `will-change: opacity, background-position`

---

## Collection Icons Gradient

### Hero Collection Background Animation

**File**: `src/components/hero/Hero.svelte`

```scss
@keyframes collection-icons-background-gradient-shift {
    0% {
        --top-left-stop: 20%;
        --bottom-left-stop: 40%;
        --top-right-stop: 55%;
        --bottom-right-stop: 50%;
        background-size: 100% 100%;
    }
    
    50% {
        --top-left-stop: 25%;
        --bottom-left-stop: 15%;
        --top-right-stop: 70%;
        --bottom-right-stop: 30%;
        background-size: 130% 130%;
    }
    
    100% {
        --top-left-stop: 15%;
        --bottom-left-stop: 20%;
        --top-right-stop: 55%;
        --bottom-right-stop: 20%;
        background-size: 110% 110%;
    }
}
```

**CSS Custom Properties**:
```scss
@property --top-left-stop {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 20%;
}

@property --bottom-left-stop {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 40%;
}

@property --top-right-stop {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 55%;
}

@property --bottom-right-stop {
    syntax: '<percentage>';
    inherits: false;
    initial-value: 50%;
}
```

**Application**:
```css
.collection-icons-background-gradient {
    background: 
        radial-gradient(circle at 3% -50%, var(--top-left, #000) var(--top-left-stop), transparent 70%),
        radial-gradient(circle at -50% 120%, var(--bottom-left, #000) var(--bottom-left-stop), transparent 80%),
        radial-gradient(circle at 66% -175%, var(--top-right, #000) var(--top-right-stop), transparent 80%),
        radial-gradient(circle at 62% 100%, var(--bottom-right, #000) var(--bottom-right-stop), transparent 100%);
    
    animation: collection-icons-background-gradient-shift 16s infinite alternate-reverse;
    animation-play-state: paused;
    
    @media (--range-small-up) {
        animation-play-state: running;
    }
}
```

---

## Fade Animations

### Basic Fade In

**File**: `shared/components/src/components/LoadingSpinner/LoadingSpinner.svelte`

```scss
@keyframes fade-in {
    0% {
        opacity: 0;
    }
    
    100% {
        opacity: 1;
    }
}
```

**Usage**:
```scss
.loading-spinner {
    opacity: 0;
    animation: fade-in 100ms;
    animation-fill-mode: forwards;
    animation-delay: 0ms; // Can be customized
}
```

---

## Animation Best Practices

### 1. **Respect User Preferences**

Always check for reduced motion:

```scss
@media (prefers-reduced-motion: reduce) {
    .animated-element {
        &, [aria-expanded='true'] & {
            animation: none;
            transition: none;
        }
    }
}
```

### 2. **Performance Optimization**

Use `will-change` sparingly:

```css
.animated-element {
    will-change: opacity;
}

/* Remove after animation */
.animated-element.complete {
    will-change: auto;
}
```

### 3. **GPU Acceleration**

Prefer transform over position:

```css
/* Good */
transform: translateX(100px);

/* Avoid */
left: 100px;
```

### 4. **Animation Play State Control**

Pause animations when not needed:

```css
animation-play-state: paused;

.active & {
    animation-play-state: running;
}

.out-of-view &,
.resizing & {
    animation-play-state: paused;
}
```

---

## Timing Function Reference

### Standard Easings

```scss
// Apple Navigation Easing
$amp-nav-ease-blue: cubic-bezier(0.04, 0.04, 0.12, 0.96);
$amp-nav-ease-green: cubic-bezier(0.52, 0.16, 0.52, 0.84);

// Standard CSS
ease-in
ease-out
ease-in-out
linear
cubic-bezier(x1, y1, x2, y2)
```

### Animation Delays

```scss
$shared-transition-delay: 0.1008s;
$shared-transition-duration: 0.1806s;
```

---

## Browser Compatibility Notes

- CSS `@property` requires modern browsers (Chrome 85+, Safari 15.4+)
- Fallbacks provided for older browsers
- Use feature detection where needed
- Test with different color schemes and contrast settings

---

*Extracted from Apple App Store production source code*
