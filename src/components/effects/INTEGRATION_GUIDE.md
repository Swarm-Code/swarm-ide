# SlideEffect Integration Guide

## Quick Start

### 1. Import the Component

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
</script>
```

### 2. Basic Example

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  
  const asciiArt = [
    '███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗',
    '██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║',
    '███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║'
  ];

  const colors = ['#FF0000', '#00FF00', '#0000FF'];
</script>

<SlideEffect 
  asciiLines={asciiArt}
  gradient={colors}
/>
```

## Integration Scenarios

### Scenario 1: Welcome Screen Animation

Perfect for displaying branding on app startup.

```svelte
<!-- WelcomeScreen.svelte -->
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  import { rainbowGradient } from '../utils/colorGradient.js';

  let animationComplete = false;

  function handleAnimationDone() {
    animationComplete = true;
    // Trigger next screen or show UI elements
  }
</script>

<div class="welcome">
  <SlideEffect 
    asciiLines={swarmLogo}
    gradient={rainbowGradient}
    slideFrom="left"
    staggerDelay={25}
    easing="easeOutQuart"
    onComplete={handleAnimationDone}
  />
  
  {#if animationComplete}
    <div class="welcome-content fade-in">
      <!-- Additional UI -->
    </div>
  {/if}
</div>

<style>
  .fade-in {
    animation: fadeIn 300ms ease-out;
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
</style>
```

### Scenario 2: Project Showcase

Display ASCII art of different projects with animations.

```svelte
<!-- ProjectShowcase.svelte -->
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  import { cyanMagentaGradient, purpleBlueGradient } from '../utils/colorGradient.js';

  const projects = [
    {
      name: 'Project Alpha',
      art: [...],
      gradient: cyanMagentaGradient,
      slideFrom: 'left'
    },
    {
      name: 'Project Beta',
      art: [...],
      gradient: purpleBlueGradient,
      slideFrom: 'right'
    }
  ];

  let currentProject = 0;

  function nextProject() {
    currentProject = (currentProject + 1) % projects.length;
  }
</script>

{#key currentProject}
  <SlideEffect 
    asciiLines={projects[currentProject].art}
    gradient={projects[currentProject].gradient}
    slideFrom={projects[currentProject].slideFrom}
    onComplete={nextProject}
  />
{/key}
```

### Scenario 3: Terminal Output Animation

Simulate command execution with sliding output.

```svelte
<!-- TerminalOutput.svelte -->
<script>
  import SlideEffect from './effects/SlideEffect.svelte';

  export let command = '';
  export let output = [];
  
  let outputLines = [];
  let isExecuting = false;

  async function executeCommand() {
    isExecuting = true;
    // Simulate command execution
    await new Promise(r => setTimeout(r, 1000));
    outputLines = output;
  }

  onMount(() => {
    executeCommand();
  });
</script>

<div class="terminal">
  <div class="command-line">
    <span class="prompt">$ </span>
    <span class="cmd">{command}</span>
  </div>

  {#if outputLines.length > 0}
    <SlideEffect 
      asciiLines={outputLines}
      slideFrom="top"
      slideDistance={150}
      staggerDelay={10}
      trailSymbols={true}
    />
  {/if}
</div>
```

### Scenario 4: Data Visualization

Animate data representations with sliding patterns.

```svelte
<!-- DataViz.svelte -->
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  import { generateLineGradient } from '../utils/colorGradient.js';

  export let data = [];
  
  let asciiVisualization = [];
  let gradient = [];

  function generateVisualization(data) {
    // Convert data to ASCII bars
    asciiVisualization = data.map(value => 
      '█'.repeat(Math.floor(value / 10))
    );
    
    gradient = generateLineGradient(asciiVisualization.length, 
      ['#00FF00', '#FFD700', '#FF0000']
    );
  }

  $: if (data.length > 0) generateVisualization(data);
</script>

{#if asciiVisualization.length > 0}
  <SlideEffect 
    asciiLines={asciiVisualization}
    gradient={gradient}
    slideFrom="bottom"
    staggerDelay={50}
    easing="easeInOutCubic"
  />
{/if}
```

### Scenario 5: Multi-phase Animation Sequence

Chain multiple animations together.

```svelte
<!-- AnimationSequence.svelte -->
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  import { rainbowGradient } from '../utils/colorGradient.js';

  let phase = 'title';
  
  const phases = {
    title: {
      art: [...],
      gradient: rainbowGradient,
      slideFrom: 'left'
    },
    subtitle: {
      art: [...],
      gradient: purpleBlueGradient,
      slideFrom: 'bottom'
    },
    content: {
      art: [...],
      gradient: cyanMagentaGradient,
      slideFrom: 'right'
    }
  };

  const phaseOrder = ['title', 'subtitle', 'content'];
  let currentPhaseIndex = 0;

  function nextPhase() {
    currentPhaseIndex++;
    if (currentPhaseIndex < phaseOrder.length) {
      phase = phaseOrder[currentPhaseIndex];
    }
  }
</script>

<div class="animation-sequence">
  {#key phase}
    <SlideEffect 
      asciiLines={phases[phase].art}
      gradient={phases[phase].gradient}
      slideFrom={phases[phase].slideFrom}
      staggerDelay={20}
      onComplete={nextPhase}
    />
  {/key}
</div>

<style>
  .animation-sequence {
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
```

## Configuration Presets

Common configurations ready to use:

### Fast & Snappy
```javascript
slideDistance={150}
staggerDelay={10}
easing={(t) => t * (2 - t)} // easeOutQuad
```

### Slow & Dramatic
```javascript
slideDistance={300}
staggerDelay={50}
easing="easeInOutCubic"
```

### Cinematic
```javascript
slideDistance={250}
staggerDelay={35}
easing="easeOutQuart"
trailSymbols={true}
```

### Minimal
```javascript
slideFrom="left"
slideDistance={100}
staggerDelay={15}
trailSymbols={false}
```

## Advanced Techniques

### Dynamic ASCII Generation

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';

  function generateBars(values) {
    const maxValue = Math.max(...values);
    return values.map(v => {
      const barLength = Math.round((v / maxValue) * 20);
      return '[' + '█'.repeat(barLength) + ']';
    });
  }

  const chartData = [10, 25, 15, 30, 20];
  $: asciiChart = generateBars(chartData);
</script>

<SlideEffect asciiLines={asciiChart} />
```

### Responsive Easing

```svelte
<script>
  import { createEase } from '../utils/animationTiming.js';

  export let intensity = 'normal'; // 'fast' | 'normal' | 'slow'

  const easingMap = {
    fast: (t) => t * (2 - t),
    normal: createEase('easeOutQuart'),
    slow: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1
  };

  $: selectedEasing = easingMap[intensity];
</script>

<SlideEffect easing={selectedEasing} />
```

### Performance Optimization

For large ASCII art, reduce rendering overhead:

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';

  export let largeAsciiArt = [];

  // Only animate if not too large
  $: shouldAnimate = largeAsciiArt.length < 2000;
  
  // Reduce stagger for large content
  $: stagger = largeAsciiArt.length > 500 ? 10 : 30;
</script>

{#if shouldAnimate}
  <SlideEffect 
    asciiLines={largeAsciiArt}
    staggerDelay={stagger}
  />
{:else}
  <pre>{largeAsciiArt.join('\n')}</pre>
{/if}
```

## Styling & Theming

### Custom Styling

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
</script>

<div class="custom-slide-effect">
  <SlideEffect asciiLines={art} />
</div>

<style>
  :global(.custom-slide-effect .sliding-char) {
    font-weight: 700;
    letter-spacing: 2px;
    text-shadow: 0 0 10px currentColor;
  }

  :global(.custom-slide-effect .character-art) {
    background: linear-gradient(45deg, #000, #1a1a1a);
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
  }
</style>
```

### Theme Integration

```svelte
<script>
  import SlideEffect from './effects/SlideEffect.svelte';
  import { appStore } from '../stores/appStore.js';

  let isDarkMode = false;

  appStore.subscribe(state => {
    isDarkMode = state.theme === 'dark';
  });

  $: gradient = isDarkMode 
    ? ['#0a84ff', '#409cff', '#0077ed']
    : ['#0071e3', '#0077ed', '#006edb'];
</script>

<SlideEffect gradient={gradient} />
```

## Testing SlideEffect

### Unit Test Example (Vitest)

```javascript
import { render } from '@testing-library/svelte';
import SlideEffect from './SlideEffect.svelte';

describe('SlideEffect', () => {
  it('should render ASCII lines', () => {
    const asciiLines = ['test', 'art'];
    const { container } = render(SlideEffect, {
      props: { asciiLines }
    });
    expect(container).toBeInTheDocument();
  });

  it('should call onComplete callback', async () => {
    const onComplete = vi.fn();
    render(SlideEffect, {
      props: { 
        asciiLines: ['test'],
        onComplete 
      }
    });
    
    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalled();
    }, { timeout: 2000 });
  });

  it('should support custom easing', () => {
    const customEase = (t) => t;
    const { component } = render(SlideEffect, {
      props: { easing: customEase }
    });
    expect(component).toBeInTheDocument();
  });
});
```

## Troubleshooting

### Animation Not Playing

**Issue**: Component mounts but animation doesn't start

**Solution**: 
- Ensure `asciiLines` prop has content
- Check browser console for errors
- Verify `onMount` is triggered

```svelte
<script>
  import { onMount } from 'svelte';
  import SlideEffect from './effects/SlideEffect.svelte';

  let isReady = false;

  onMount(() => {
    isReady = true;
  });
</script>

{#if isReady && asciiLines.length > 0}
  <SlideEffect asciiLines={asciiLines} />
{/if}
```

### Performance Issues

**Issue**: Animation is choppy or laggy

**Solution**:
- Increase `staggerDelay` (reduce simultaneous animations)
- Use `trailSymbols={false}` (less DOM updates)
- Reduce ASCII art size
- Check browser performance tab

```svelte
<!-- Optimized -->
<SlideEffect 
  staggerDelay={50}
  trailSymbols={false}
/>
```

### Callback Not Firing

**Issue**: `onComplete` callback doesn't execute

**Solution**:
- Verify callback function is passed
- Check for errors in callback function
- Ensure animation completes (watch console)

```svelte
<SlideEffect 
  onComplete={() => {
    console.log('Animation complete!');
    // Your logic here
  }}
/>
```

## Performance Tips

1. **Stagger Delay**: Use 30-50ms for smooth wave effect
2. **Trail Symbols**: Disable for large ASCII art (>1000 chars)
3. **Easing**: Linear easing is fastest, use for performance
4. **Component Count**: Limit concurrent SlideEffect instances
5. **ASCII Size**: Keep under 5000 characters for optimal performance

## Resources

- [Svelte Documentation](https://svelte.dev)
- [Animation Timing Utils](./../../utils/animationTiming.js)
- [Color Gradient Utils](./../../utils/colorGradient.js)
- [Main README](./README.md)
- [Example Component](./SlideEffect.example.svelte)

## Support & Contributing

For issues, feature requests, or contributions:
1. Check existing examples in `SlideEffect.example.svelte`
2. Review integration patterns above
3. Test with minimal reproduction case
4. File issue with code snippet

---

**Last Updated**: November 2025
**Component Version**: 1.0.0
**Status**: Production Ready ✅
