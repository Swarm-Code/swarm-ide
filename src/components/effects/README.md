# Animation Effects Framework

A reusable, flexible animation framework for text-based effects in the welcome screen and other UI elements.

## Overview

The framework provides:
- **BaseEffect.svelte** - Abstract base component for all animation effects
- **Effect implementations** - Ready-to-use effect components (Typewriter, Matrix, Glitch, Ripple)
- **effectConfig.js** - Centralized configuration, easing functions, gradients, and utilities

## Architecture

### Core Components

#### BaseEffect.svelte
The abstract base component that all effects extend. Provides:

**Props:**
```javascript
asciiLines: string[]    // ASCII art lines to animate
gradient: string[]      // Color gradient for animation
duration: number        // Total animation duration (ms)
onComplete: function    // Callback when animation finishes
config: object          // Effect-specific configuration
```

**Reactive State:**
```javascript
characters: Character[] // 2D array of character states
timing: {
  frameCount: number    // Total frames rendered
  currentPhase: string  // 'initialization' | 'animation' | 'completion'
  elapsedTime: number   // Milliseconds elapsed
  progress: number      // 0-1 normalized progress
  delta: number         // Time since last frame
  timestamp: number     // requestAnimationFrame timestamp
}
```

**Character State:**
```javascript
{
  symbol: string        // Character to display
  color: string         // Hex color (#ffffff)
  position: {x, y}      // Grid coordinates
  opacity: number       // 0-1 transparency
  scale: number         // 1.0 = normal size
  rotation: number      // Degrees
  phase: number         // 0-1 effect-specific progress
  velocity: {x, y}      // For physics-based effects
  metadata: object      // Custom effect data
}
```

**Exported Methods:**
```javascript
start()                 // Begin animation
pause()                 // Pause animation
resume()                // Resume paused animation
stop()                  // Stop and reset
reset()                 // Reset to initial state
getCharacter(x, y)      // Get character at position
updateCharacter(x, y, updates) // Update character properties
```

### Helper Methods (Available in Effects)

```javascript
randomSymbol()          // Get random symbol from configured set
randomColorFromGradient() // Get random color from gradient
interpolatePosition(start, end, progress) // Linear interpolation
selectFromGradient(gradient, progress) // Select color from gradient
updateCharacter(x, y, updates) // Update a specific character
```

## Creating Custom Effects

### Step 1: Create a New Component

```svelte
<script>
  import BaseEffect from './BaseEffect.svelte';
  import { selectFromGradient } from '../../utils/effectConfig.js';

  let baseEffect = null;

  export let asciiLines = [];
  export let gradient = [];
  export let duration = 2000;
  export let onComplete = null;
  export let config = {};

  function updateCharacterCustom(frameIndex, timing) {
    // Your animation logic here
    asciiLines.forEach((line, y) => {
      line.split('').forEach((symbol, x) => {
        const progress = timing.progress;
        const color = selectFromGradient(gradient, progress);

        baseEffect.updateCharacter(x, y, {
          opacity: 1 - progress,
          color,
        });
      });
    });
  }

  function setupEffect() {
    if (baseEffect) {
      baseEffect.updateCharacters = updateCharacterCustom;
    }
  }
</script>

<BaseEffect
  bind:this={baseEffect}
  {asciiLines}
  {gradient}
  {duration}
  {onComplete}
  {config}
  on:mount={setupEffect}
/>
```

### Step 2: Override updateCharacters()

The `updateCharacters(frameIndex, timing)` method is called every frame. Override it to implement your effect:

```javascript
function updateCharacterCustom(frameIndex, timing) {
  // timing.progress: 0-1 overall progress
  // timing.elapsedTime: milliseconds elapsed
  // timing.delta: time since last frame
  
  asciiLines.forEach((line, y) => {
    line.split('').forEach((symbol, x) => {
      // Calculate effect-specific values
      const opacity = 1 - timing.progress;
      const scale = 1 + timing.progress * 0.5;
      
      // Update character
      baseEffect.updateCharacter(x, y, {
        opacity,
        scale,
      });
    });
  });
}
```

## Built-in Effects

### TypewriterEffect
Characters appear sequentially from left to right, top to bottom.

```svelte
<TypewriterEffect
  asciiLines={lines}
  gradient={colorGradient}
  duration={2000}
  onComplete={() => console.log('done')}
/>
```

**Config Options:**
```javascript
{
  symbolSet: 'default',  // Symbol set to use
  // All baseEffectConfig options
}
```

### MatrixEffect
Characters cascade downward with digital distortion.

```svelte
<MatrixEffect
  asciiLines={lines}
  gradient={colorGradient}
  duration={4000}
  config={{
    symbolSet: 'blocks',
    randomness: 0.3,
  }}
/>
```

**Config Options:**
```javascript
{
  symbolSet: 'blocks',
  randomness: 0.3,     // 0-1 distortion amount
}
```

### GlitchEffect
Characters flicker with position and color corruption.

```svelte
<GlitchEffect
  asciiLines={lines}
  gradient={colorGradient}
  duration={1500}
  config={{
    glitchIntensity: 0.7,
  }}
/>
```

**Config Options:**
```javascript
{
  symbolSet: 'geometric',
  randomness: 0.5,
  glitchIntensity: 0.7, // 0-1 corruption amount
}
```

### RippleEffect
Characters animate in expanding concentric rings.

```svelte
<RippleEffect
  asciiLines={lines}
  gradient={colorGradient}
  duration={2500}
  config={{
    centerX: 0.5,        // 0-1 horizontal center
    centerY: 0.5,        // 0-1 vertical center
  }}
/>
```

**Config Options:**
```javascript
{
  symbolSet: 'ripple',
  randomness: 0.2,
  centerX: 0.5,
  centerY: 0.5,
}
```

## Configuration Utilities

### effectConfig.js

#### Symbol Sets
```javascript
import { symbolSets, getSymbolSet } from '../utils/effectConfig.js';

symbolSets.blocks      // ['█', '▓', '▒', '░', ' ']
symbolSets.braille     // ['⠿', '⠾', '⠽', '⠼', '⠻', ...]
symbolSets.geometric   // ['●', '◆', '■', '▲', ...]
symbolSets.technical   // ['▛', '▜', '▟', '▙', ...]
symbolSets.ripple      // ['◯', '○', '∘', '·', ' ']
symbolSets.wave        // ['∿', '≈', '~', '˜', ' ']
symbolSets.spark       // ['✦', '✧', '★', '✩', '✨', ' ']
```

#### Gradients
```javascript
import { gradientPresets, getGradient } from '../utils/effectConfig.js';

gradientPresets.rainbow     // Red to purple spectrum
gradientPresets.cyberpunk   // Pink, purple, blue, cyan
gradientPresets.sunset      // Red-orange to gold
gradientPresets.ocean       // Dark blue to cyan
gradientPresets.forest      // Dark green to light green
gradientPresets.monochrome  // Black to white
gradientPresets.neon        // Bright cyberpunk colors
```

#### Easing Functions
```javascript
import { easingFunctions, getEasingFunction } from '../utils/effectConfig.js';

// Quad, Cubic, Quart, Quint, Sine, Expo, Circ, Elastic, Bounce
// In, Out, InOut variants
easingFunctions.easeInOutQuad
easingFunctions.easeOutSine
easingFunctions.easeInElastic
// ... and many more
```

#### Helper Functions
```javascript
import {
  createEffectConfig,      // Create config with defaults
  interpolateValue,        // Interpolate between numbers
  interpolateColor,        // Interpolate between colors
  selectFromGradient,      // Pick color from gradient
  randomValue,             // Random number in range
  randomColor,             // Random hex color
  createCharacterState,    // Create character state object
  createTimingState,       // Create timing state object
} from '../utils/effectConfig.js';

// Example usage
const config = createEffectConfig('typewriter', {
  duration: 3000,
  gradient: myGradient,
});

const color = selectFromGradient(gradientPresets.rainbow, 0.5);
const value = interpolateValue(0, 100, 0.75, easingFunctions.easeOutQuad);
```

## Advanced Usage

### External Animation Control

```svelte
<script>
  import TypewriterEffect from './effects/TypewriterEffect.svelte';

  let effectComponent;

  function handleStart() {
    effectComponent.start();
  }

  function handlePause() {
    effectComponent.pause();
  }

  function handleResume() {
    effectComponent.resume();
  }
</script>

<TypewriterEffect bind:this={effectComponent} {asciiLines} {gradient} />

<button on:click={handleStart}>Start</button>
<button on:click={handlePause}>Pause</button>
<button on:click={handleResume}>Resume</button>
```

### Physics-Based Effects

For effects with velocity and momentum, update velocity in each frame:

```javascript
function updateCharacterPhysics(frameIndex, timing) {
  asciiLines.forEach((line, y) => {
    line.split('').forEach((symbol, x) => {
      const char = baseEffect.getCharacter(x, y);
      
      // Apply physics
      char.velocity.y += 0.5; // Gravity
      const newY = char.position.y + char.velocity.y;
      
      // Update position
      baseEffect.updateCharacter(x, y, {
        position: { x, y: newY },
        velocity: char.velocity,
      });
    });
  });
}
```

### Chained Effects

Combine multiple effects sequentially:

```svelte
<script>
  let effectPhase = 0;
  
  function handleFirstEffectComplete() {
    effectPhase = 1;
  }
  
  function handleSecondEffectComplete() {
    effectPhase = 2;
  }
</script>

{#if effectPhase === 0}
  <TypewriterEffect 
    {asciiLines} 
    {gradient}
    onComplete={handleFirstEffectComplete}
  />
{:else if effectPhase === 1}
  <MatrixEffect 
    {asciiLines}
    {gradient}
    onComplete={handleSecondEffectComplete}
  />
{:else}
  <div>Animation complete!</div>
{/if}
```

## Performance Considerations

1. **Frame Rate**: Default 60 FPS. Adjust via `frameRate` in config.
2. **DOM Updates**: Characters rendered to DOM every frame. Avoid excessive line counts (>100).
3. **Memory**: Character states stored in memory. Cleanup on unmount is automatic.
4. **requestAnimationFrame**: Uses native RAF for smooth 60 FPS animations.

## Browser Compatibility

- Modern browsers with requestAnimationFrame support
- Chrome, Firefox, Safari, Edge (all recent versions)
- Requires Unicode support for special characters

## Examples

### Basic Usage in WelcomeScreen
```svelte
<script>
  import TypewriterEffect from './effects/TypewriterEffect.svelte';
  import { gradientPresets } from '../utils/effectConfig.js';

  const lines = ['Hello', 'World'];
</script>

<TypewriterEffect
  asciiLines={lines}
  gradient={gradientPresets.rainbow}
  duration={2000}
  onComplete={() => console.log('Animation complete')}
/>
```

### Custom Effect Configuration
```svelte
<GlitchEffect
  asciiLines={asciiArt}
  gradient={[
    '#ff006e', '#fb5607', '#ffbe0b', '#8338ec',
    '#3a86ff', '#06ffa5'
  ]}
  duration={2000}
  config={{
    glitchIntensity: 0.8,
    randomness: 0.6,
    symbolSet: 'geometric',
  }}
/>
```

## Troubleshooting

### Animation Not Running
- Ensure `config.autoStart` is not `false`
- Call `start()` method manually
- Check browser console for errors

### Characters Not Visible
- Verify `gradient` array is not empty
- Check `opacity` values in character state
- Ensure container has proper sizing

### Performance Issues
- Reduce ASCII line count
- Lower `frameRate` in config
- Use simpler effects (fewer transformations)
- Profile with browser DevTools

## Future Enhancements

- [ ] Canvas rendering option for better performance
- [ ] WebGL acceleration for large animations
- [ ] Audio synchronization
- [ ] SVG path animations
- [ ] Particle effects
- [ ] 3D transformations
