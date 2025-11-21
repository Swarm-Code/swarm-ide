<script>
  import { onMount } from 'svelte';
  import { generateLineGradient } from '../utils/colorGradient.js';
  import { AnimationTimings } from '../utils/animationTiming.js';
  import { 
    SolidColors, 
    calculateFontWeight,
    calculateShiningShadow,
    createShiningCharacter 
  } from '../utils/shiningEffects.js';

  let characterLines = [];
  let characterLineColors = [];
  let logoChars = [];
  let suffixText = '';
  let isAnimating = false;
  let animationProgress = 0;

  export let targetText = 'SWARM';
  export let targetSuffix = 'IDE';
  export let asciiLines = [];
  export let solidColor = SolidColors.GOLD;
  export let slowFactor = 1;
  export let onAnimationComplete = null;

  const encryptedSymbols = [
    ...Array.from({length: 94}, (_, i) => String.fromCharCode(33 + i)),
    '█', '▉', '▊', '▋', '▌', '▍', '▎', '▏', '▐', '░', '▒', '▓',
    '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬',
    ...Array.from({length: 256}, (_, i) => String.fromCharCode(0x2800 + i))
  ];

  const cipherColors = ['#008000', '#00cb00', '#00ff00'];

  function randomSymbol() {
    return encryptedSymbols[Math.floor(Math.random() * encryptedSymbols.length)];
  }

  function randomColor() {
    return cipherColors[Math.floor(Math.random() * cipherColors.length)];
  }

  async function animateCharacterLines() {
    characterLines = [];
    characterLineColors = [];

    for (let i = 0; i < asciiLines.length; i++) {
      let scrambledLine = '';
      const targetLine = asciiLines[i];

      for (let j = 0; j < targetLine.length; j++) {
        scrambledLine += targetLine[j] === ' ' ? ' ' : randomSymbol();
      }

      characterLines = [...characterLines, scrambledLine];
      characterLineColors = [...characterLineColors, randomColor()];
      await new Promise(r => setTimeout(r, 25 * slowFactor));

      characterLines[i] = targetLine;
      characterLineColors[i] = solidColor;
      characterLines = [...characterLines];
      characterLineColors = [...characterLineColors];
    }

    await new Promise(r => setTimeout(r, AnimationTimings.PHASE_PAUSE * slowFactor));
  }

  async function animateLogoText() {
    logoChars = targetText.split('').map((char, i) => ({
      symbol: ' ',
      color: solidColor,
      fontWeight: 400,
      textShadow: 'none',
      final: char,
      phase: 'hidden',
      index: i
    }));

    // Phase 1: Typing with blocks and shining wave
    for (let i = 0; i < logoChars.length; i++) {
      logoChars[i].phase = 'typing';
      const typingBlocks = ['▉', '▓', '▒', '░'];

      for (const block of typingBlocks) {
        logoChars[i].symbol = block;
        logoChars[i].color = randomColor();
        logoChars = [...logoChars];
        await new Promise(r => setTimeout(r, 25 * slowFactor));
      }

      logoChars[i].symbol = randomSymbol();
      logoChars[i].color = randomColor();
      logoChars = [...logoChars];

      if (Math.random() < 0.75) {
        await new Promise(r => setTimeout(r, 15 * slowFactor));
      }
    }

    await new Promise(r => setTimeout(r, AnimationTimings.PHASE_PAUSE * slowFactor));

    // Phase 2: Fast decrypt
    const fastDecryptFrames = 25;
    for (let frame = 0; frame < fastDecryptFrames; frame++) {
      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].symbol = randomSymbol();
        logoChars[i].color = randomColor();
      }
      logoChars = [...logoChars];
      await new Promise(r => setTimeout(r, 20 * slowFactor));
    }

    // Phase 3: Slow decrypt with staggered resolution
    const resolveDelays = logoChars.map(() => Math.floor(Math.random() * 15) + 1);
    const maxDelay = Math.max(...resolveDelays);

    for (let frame = 0; frame < maxDelay + 10; frame++) {
      for (let i = 0; i < logoChars.length; i++) {
        if (frame >= resolveDelays[i] && logoChars[i].phase !== 'resolved') {
          if (logoChars[i].phase !== 'discovering') {
            logoChars[i].phase = 'discovering';
            logoChars[i].symbol = logoChars[i].final;
            logoChars[i].color = '#ffffff';
          } else {
            logoChars[i].phase = 'resolved';
            logoChars[i].symbol = logoChars[i].final;
            logoChars[i].color = solidColor;
          }
        } else if (logoChars[i].phase !== 'resolved' && logoChars[i].phase !== 'discovering') {
          if (Math.random() < 0.7) {
            logoChars[i].symbol = randomSymbol();
            logoChars[i].color = randomColor();
          }
        }
      }
      logoChars = [...logoChars];
      await new Promise(r => setTimeout(r, 40 * slowFactor));
    }

    // Phase 4: Shining wave across resolved text
    const shineFrames = 40;
    for (let frame = 0; frame < shineFrames; frame++) {
      const progress = frame / shineFrames;
      animationProgress = progress;

      for (let i = 0; i < logoChars.length; i++) {
        const shiningChar = createShiningCharacter(
          logoChars[i].final,
          progress,
          i,
          logoChars.length,
          solidColor
        );
        logoChars[i].fontWeight = shiningChar.fontWeight;
        logoChars[i].textShadow = shiningChar.textShadow;
        logoChars[i].color = solidColor;
        logoChars[i].symbol = logoChars[i].final;
      }
      logoChars = [...logoChars];
      await new Promise(r => setTimeout(r, 30 * slowFactor));
    }

    // Finalize
    for (let i = 0; i < logoChars.length; i++) {
      logoChars[i].symbol = logoChars[i].final;
      logoChars[i].color = solidColor;
      logoChars[i].fontWeight = 400;
      logoChars[i].textShadow = 'none';
      logoChars[i].phase = 'resolved';
    }
    logoChars = [...logoChars];

    await new Promise(r => setTimeout(r, AnimationTimings.PHASE_PAUSE * slowFactor));

    // Type suffix
    for (let i = 0; i <= targetSuffix.length; i++) {
      suffixText = targetSuffix.slice(0, i);
      await new Promise(r => setTimeout(r, 60 * slowFactor));
    }

    await new Promise(r => setTimeout(r, AnimationTimings.TRANSITION_DELAY * slowFactor));
  }

  async function animate() {
    if (isAnimating) return;
    isAnimating = true;

    try {
      await animateCharacterLines();
      await animateLogoText();
    } catch (error) {
      console.error('Logo animation failed:', error);
    } finally {
      isAnimating = false;
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    }
  }

  onMount(() => {
    if (asciiLines.length > 0) {
      animate();
    }
  });
</script>

<div class="logo-animator">
  {#if characterLines.length > 0}
    <pre class="character-art">{#each characterLines as line, i}<span style="color: {characterLineColors[i]}">{line}</span>{'\n'}{/each}</pre>
  {/if}

  <div class="logo-text-container">
    <span class="logo-text">
      {#each logoChars as char}
        <span 
          style="
            color: {char.color};
            font-weight: {char.fontWeight};
            text-shadow: {char.textShadow};
            filter: drop-shadow(0 0 3px {char.color}40);
          "
        >
          {char.symbol}
        </span>
      {/each}
      <span class="logo-suffix">{suffixText}</span>
    </span>
  </div>
</div>

<style>
  .logo-animator {
    text-align: center;
  }

  .character-art {
    font-family: var(--font-family-mono);
    font-size: 14px;
    line-height: 1.1;
    letter-spacing: 0;
    white-space: pre;
    margin: 0 0 var(--spacing-md) 0;
    animation: fadeInUp 400ms ease-out;
    transition: color 100ms ease;
    font-variant-ligatures: none;
    font-feature-settings: normal;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .logo-text-container {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .logo-text {
    font-family: var(--font-family-mono);
    font-size: 48px;
    font-weight: 700;
    letter-spacing: 0.15em;
    min-width: 280px;
    display: inline-block;
    text-align: center;
  }

  .logo-text span {
    transition: font-weight 60ms ease, text-shadow 60ms ease, filter 60ms ease;
    display: inline-block;
  }

  .logo-suffix {
    color: var(--color-accent);
    font-weight: 400;
    margin-left: 0.1em;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(12px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
