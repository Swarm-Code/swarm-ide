<script>
  /**
   * BaseEffect Component
   * 
   * Abstract/base component for all text animation effects.
   * Provides core animation lifecycle, character state management, and rendering framework.
   * 
   * Props:
   *   - asciiLines: string[] - ASCII art lines to animate
   *   - gradient: string[] - Color gradient for animation
   *   - duration: number - Total animation duration in ms
   *   - onComplete: function - Callback when animation completes
   *   - config: object - Effect-specific configuration
   * 
   * Subclasses should:
   *   1. Define their own implementation of updateCharacters()
   *   2. Optionally override lifecycle hooks (onMount, animate, onComplete)
   *   3. Set up effect-specific state in onMount
   */

  import { onMount, tick } from 'svelte';
  import {
    createEffectConfig,
    getEasingFunction,
    getSymbolSet,
    selectFromGradient,
    interpolateValue,
    randomValue,
    randomColor,
    createCharacterState,
    createTimingState,
    animationPhases,
  } from '../../utils/effectConfig.js';

  // Props
  export let asciiLines = [];
  export let gradient = [];
  export let duration = 3000;
  export let onComplete = null;
  export let config = {};

  // Component state
  let container = null;
  let animationFrameId = null;
  let isRunning = false;
  let isPaused = false;

  // Animation state
  let characters = [];
  let timing = createTimingState();
  let lastFrameTime = 0;

  // Configuration
  let effectConfig = createEffectConfig('default', config);
  let easingFn = getEasingFunction(effectConfig.easing);
  let symbolSet = getSymbolSet(config.symbolSet || 'default');
  let effectGradient = gradient.length > 0 ? gradient : [];

  /**
   * Initialize character grid from ASCII lines
   * Creates a 2D array of character states
   */
  function initializeCharacters() {
    characters = asciiLines.map((line, y) => {
      return line.split('').map((symbol, x) => {
        return createCharacterState({
          symbol,
          position: { x, y },
          opacity: 0,
          color: '#ffffff',
        });
      });
    });
  }

  /**
   * Get character at specific position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {object} Character state or null
   */
  function getCharacter(x, y) {
    if (!characters[y] || !characters[y][x]) {
      return null;
    }
    return characters[y][x];
  }

  /**
   * Update specific character with new properties
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {object} updates - Properties to update
   */
  function updateCharacter(x, y, updates) {
    const char = getCharacter(x, y);
    if (char) {
      Object.assign(char, updates);
    }
  }

  /**
   * Get random symbol from configured symbol set
   * @returns {string} Random symbol
   */
  function randomSymbol() {
    if (!symbolSet || symbolSet.length === 0) {
      return ' ';
    }
    const index = Math.floor(Math.random() * symbolSet.length);
    return symbolSet[index];
  }

  /**
   * Get random color from gradient or generate random
   * @returns {string} Hex color string
   */
  function randomColorFromGradient() {
    if (effectGradient.length > 0) {
      const progress = Math.random();
      return selectFromGradient(effectGradient, progress);
    }
    return randomColor();
  }

  /**
   * Interpolate position between two points with easing
   * @param {object} start - Start position {x, y}
   * @param {object} end - End position {x, y}
   * @param {number} progress - Animation progress 0-1
   * @returns {object} Interpolated position {x, y}
   */
  function interpolatePosition(start, end, progress) {
    return {
      x: interpolateValue(start.x, end.x, progress, easingFn),
      y: interpolateValue(start.y, end.y, progress, easingFn),
    };
  }

  /**
   * Update character animation state
   * OVERRIDE THIS in subclasses to implement specific effects
   * 
   * @param {number} frameIndex - Current frame number
   * @param {object} timing - Timing information
   */
  function updateCharacters(frameIndex, timing) {
    // Default implementation: fade in all characters sequentially
    characters.forEach((row, y) => {
      row.forEach((char, x) => {
        const charIndex = y * asciiLines[0].length + x;
        const charDelay = (charIndex / (asciiLines.length * asciiLines[0].length)) * duration;
        const charProgress = Math.max(0, timing.elapsedTime - charDelay) / duration;

        const opacity = Math.min(1, charProgress * 2); // Fade in quickly
        const colorProgress = charProgress;
        const color = selectFromGradient(effectGradient, colorProgress);

        updateCharacter(x, y, {
          opacity,
          color,
          phase: charProgress,
        });
      });
    });
  }

  /**
   * Render current frame to DOM
   * Should be called after updateCharacters()
   */
  function renderFrame() {
    if (!container) return;

    // Clear container
    container.innerHTML = '';

    // Create line elements
    characters.forEach((row, y) => {
      const lineDiv = document.createElement('div');
      lineDiv.className = 'effect-line';
      lineDiv.style.position = 'relative';
      lineDiv.style.height = '1.2em';
      lineDiv.style.whiteSpace = 'nowrap';
      lineDiv.style.fontFamily = 'monospace';

      row.forEach((char, x) => {
        const span = document.createElement('span');
        span.textContent = char.symbol;
        span.style.color = char.color;
        span.style.opacity = char.opacity;
        span.style.display = 'inline-block';
        span.style.width = '0.6em';
        span.style.textAlign = 'center';
        span.style.transition = 'none'; // Let JS handle all timing

        // Apply transformations if any
        if (char.scale !== 1 || char.rotation !== 0) {
          const transforms = [];
          if (char.scale !== 1) {
            transforms.push(`scale(${char.scale})`);
          }
          if (char.rotation !== 0) {
            transforms.push(`rotate(${char.rotation}deg)`);
          }
          span.style.transform = transforms.join(' ');
          span.style.transformOrigin = 'center';
        }

        lineDiv.appendChild(span);
      });

      container.appendChild(lineDiv);
    });
  }

  /**
   * Main animation loop
   */
  function animate(now) {
    if (!isRunning || isPaused) {
      animationFrameId = requestAnimationFrame(animate);
      return;
    }

    // Initialize timing on first frame
    if (lastFrameTime === 0) {
      lastFrameTime = now;
    }

    const delta = now - lastFrameTime;
    lastFrameTime = now;

    // Update timing
    timing.elapsedTime += delta;
    timing.delta = delta;
    timing.frameCount += 1;
    timing.progress = Math.min(1, timing.elapsedTime / duration);
    timing.timestamp = now;

    // Determine phase
    if (timing.progress < 0.1) {
      timing.currentPhase = animationPhases.INITIALIZATION;
    } else if (timing.progress < 1) {
      timing.currentPhase = animationPhases.ANIMATION;
    } else {
      timing.currentPhase = animationPhases.COMPLETION;
    }

    // Update animation state
    updateCharacters(timing.frameCount, timing);

    // Render frame
    renderFrame();

    // Check if animation is complete
    if (timing.progress >= 1) {
      isRunning = false;
      if (onComplete) {
        onComplete();
      }
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Start animation
   */
  function start() {
    if (isRunning) return;

    isRunning = true;
    isPaused = false;
    lastFrameTime = 0;
    timing = createTimingState();

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(animate);
  }

  /**
   * Pause animation
   */
  function pause() {
    isPaused = true;
  }

  /**
   * Resume animation
   */
  function resume() {
    if (isRunning) {
      isPaused = false;
    }
  }

  /**
   * Stop and reset animation
   */
  function stop() {
    isRunning = false;
    isPaused = false;

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    lastFrameTime = 0;
    timing = createTimingState();

    renderFrame();
  }

  /**
   * Reset to initial state
   */
  function reset() {
    stop();
    initializeCharacters();
    renderFrame();
  }

  /**
   * Lifecycle: Component mounted
   */
  onMount(async () => {
    // Ensure DOM has rendered
    await tick();

    // Initialize
    initializeCharacters();
    renderFrame();

    // Start animation if autoStart is enabled
    if (effectConfig.autoStart) {
      start();
    }

    // Cleanup on unmount
    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  });

  // Export functions for external control
  export { start, pause, resume, stop, reset, getCharacter, updateCharacter };
</script>

<div
  bind:this={container}
  class="base-effect"
  role="img"
  aria-label="Text animation effect"
>
  <!-- ASCII art renders here -->
</div>

<style>
  .base-effect {
    font-family: 'Courier New', monospace;
    white-space: pre;
    line-height: 1.2;
    letter-spacing: 0.1em;
    user-select: none;
    pointer-events: none;
  }

  :global(.effect-line) {
    margin: 0;
    padding: 0;
  }
</style>
