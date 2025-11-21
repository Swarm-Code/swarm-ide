<script>
  import { onMount } from 'svelte';
  import { PerformanceLogger } from '../../utils/performanceLogger.js';
  
  const SolidColors = { GOLD: '#ffd700' };
  
  function calculateFontWeight(progress, index, total) {
    const waveIndex = (index / total - progress) * Math.PI * 2;
    return 400 + Math.sin(waveIndex) * 150;
  }
  
  function calculateShiningShadow(progress, index, total, color) {
    const waveIndex = (index / total - progress) * Math.PI * 2;
    const wave = Math.sin(waveIndex);
    const glowSize = Math.max(0, wave * 8);
    return `0 0 ${glowSize}px ${color}`;
  }
  
  function createShiningCharacter(char, progress, index, total, color) {
    return {
      fontWeight: calculateFontWeight(progress, index, total),
      textShadow: calculateShiningShadow(progress, index, total, color)
    };
  }

  export let asciiLines = [];
  export let solidColor = SolidColors.GOLD;
  export let onAnimationComplete = null;

  let characters = [];
  let isAnimating = false;

  const encryptedSymbols = ['!', '@', '#', '$', '%', '^', '&', '*', '█', '▉', '▊', '░', '▒', '▓', '~', '=', '+', '-', '|', '/', '\\', '?', '*', '◆', '◇', '■', '□', '●', '○'];

  function randomSymbol() {
    return encryptedSymbols[Math.floor(Math.random() * encryptedSymbols.length)];
  }

  async function animate() {
    if (isAnimating) return;
    isAnimating = true;

    const log = new PerformanceLogger('DecryptEffect');

    try {
      // Initialize characters
      log.phase('Init start');
      const initStart = performance.now();
      characters = [];
      for (let y = 0; y < asciiLines.length; y++) {
        for (let x = 0; x < asciiLines[y].length; x++) {
          const char = asciiLines[y][x];
          if (char !== ' ') {
            characters.push({
              x, y, char,
              symbol: randomSymbol(),
              color: '#00ff00',
              fontWeight: 400,
              textShadow: 'none'
            });
          }
        }
      }
      const spreadStart = performance.now();
      characters = [...characters];
      const spreadTime = performance.now() - spreadStart;
      const initTime = performance.now() - initStart;
      log.spread('init', characters.length, spreadTime);
      log.phase(`Init done: ${initTime.toFixed(2)}ms`);

      // Phase 1: Fast scramble
      log.phase('Phase 1: Scramble');
      let frameCount = 0;
      for (let i = 0; i < 15; i++) {
        const frameStart = performance.now();
        
        for (let j = 0; j < characters.length; j++) {
          characters[j].symbol = randomSymbol();
        }
        
        const spreadStart2 = performance.now();
        characters = [...characters];
        const spreadTime2 = performance.now() - spreadStart2;
        
        const frameTime = performance.now() - frameStart;
        log.frame(1, i, characters.length, frameTime);
        if (i === 0) {
          log.spread('phase1', characters.length, spreadTime2);
        }
        
        frameCount++;
        await new Promise(r => setTimeout(r, 20));
      }
      log.phase(`Phase 1 done: ${frameCount} frames`);

      // Phase 2: Decrypt with reveal
      log.phase('Phase 2: Reveal');
      frameCount = 0;
      for (let frame = 0; frame < 20; frame++) {
        const frameStart = performance.now();
        const progress = frame / 20;
        
        for (let i = 0; i < characters.length; i++) {
          if (progress < 0.5) {
            characters[i].symbol = randomSymbol();
          } else {
            characters[i].symbol = characters[i].char;
            characters[i].color = solidColor;
            characters[i].fontWeight = calculateFontWeight(progress, i, characters.length);
          }
        }
        
        const spreadStart3 = performance.now();
        characters = [...characters];
        const spreadTime3 = performance.now() - spreadStart3;
        
        const frameTime = performance.now() - frameStart;
        log.frame(2, frame, characters.length, frameTime);
        if (frame === 0) {
          log.spread('phase2', characters.length, spreadTime3);
        }
        
        frameCount++;
        await new Promise(r => setTimeout(r, 25));
      }
      log.phase(`Phase 2 done: ${frameCount} frames`);

      // Phase 3: Shining wave
      log.phase('Phase 3: Shining');
      frameCount = 0;
      for (let frame = 0; frame < 25; frame++) {
        const frameStart = performance.now();
        const progress = frame / 25;
        
        for (let i = 0; i < characters.length; i++) {
          const shiningChar = createShiningCharacter(
            characters[i].char,
            progress,
            i,
            characters.length,
            solidColor
          );
          characters[i].fontWeight = shiningChar.fontWeight;
          characters[i].textShadow = shiningChar.textShadow;
          characters[i].color = solidColor;
        }
        
        const spreadStart4 = performance.now();
        characters = [...characters];
        const spreadTime4 = performance.now() - spreadStart4;
        
        const frameTime = performance.now() - frameStart;
        log.frame(3, frame, characters.length, frameTime);
        if (frame === 0) {
          log.spread('phase3', characters.length, spreadTime4);
        }
        
        frameCount++;
        await new Promise(r => setTimeout(r, 30));
      }
      log.phase(`Phase 3 done: ${frameCount} frames`);

      log.summary(performance.now() - log.startTime);
      
      isAnimating = false;
      if (onAnimationComplete) {
        onAnimationComplete();
      }
    } catch (error) {
      log.error(error.message);
      isAnimating = false;
    }
  }

  onMount(() => {
    if (asciiLines.length > 0) {
      animate();
    }
  });
</script>

<div class="effect-grid">
  {#each asciiLines as line, y}
    <div class="line">
      {#each line.split('') as _, x}
        {@const char = characters.find(c => c.x === x && c.y === y)}
        {#if char}
          <span style="color: {char.color}; font-weight: {char.fontWeight}; text-shadow: {char.textShadow};">
            {char.symbol}
          </span>
        {:else}
          <span>{_}</span>
        {/if}
      {/each}
    </div>
  {/each}
</div>

<style>
  .effect-grid {
    font-family: var(--font-family-mono);
    font-size: 14px;
    white-space: pre;
    line-height: 1.1;
  }
  .line {
    display: block;
  }
</style>
