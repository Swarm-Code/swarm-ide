<script>
  import { onMount } from 'svelte';
  
  const SolidColors = { GOLD: '#ffd700', CYAN: '#00ffff', PURPLE: '#aa00ff', BLUE: '#0080ff', GREEN: '#00ff00', WHITE: '#ffffff', MAGENTA: '#ff00ff' };
  
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
  export let solidColor = SolidColors.GREEN;
  export let onAnimationComplete = null;

  let characters = [];
  let isAnimating = false;

  async function animate() {
    if (isAnimating) return;
    isAnimating = true;

    try {
      characters = [];
      for (let y = 0; y < asciiLines.length; y++) {
        for (let x = 0; x < asciiLines[y].length; x++) {
          const char = asciiLines[y][x];
          if (char !== ' ') {
            characters.push({
              x, y, char,
              symbol: '',
              color: solidColor,
              fontWeight: 400,
              textShadow: 'none'
            });
          }
        }
      }
      characters = [...characters];

      for (let frame = 0; frame < 30; frame++) {
        const revealCount = Math.min(Math.floor((frame / 30) * characters.length * 1.1), characters.length);
        for (let i = 0; i < characters.length; i++) {
          if (i < revealCount) {
            const progress = Math.min(1, (revealCount - i) / 3);
            characters[i].symbol = characters[i].char;
            characters[i].fontWeight = 400 + progress * 250;
            characters[i].textShadow = progress > 0.5 ? `0 0 ${6 * progress}px ${solidColor}` : 'none';
          }
        }
        characters = [...characters];
        await new Promise(r => setTimeout(r, 20));
      }

      const shineFrames = 20;
      for (let frame = 0; frame < shineFrames; frame++) {
        const progress = frame / shineFrames;
        for (let i = 0; i < characters.length; i++) {
          const shiningChar = createShiningCharacter(characters[i].char, progress, i, characters.length, solidColor);
          characters[i].fontWeight = shiningChar.fontWeight;
          characters[i].textShadow = shiningChar.textShadow;
        }
        characters = [...characters];
        await new Promise(r => setTimeout(r, 30));
      }

      isAnimating = false;
      if (onAnimationComplete) onAnimationComplete();
    } catch (error) {
      console.error('Typewriter animation failed:', error);
      isAnimating = false;
    }
  }

  onMount(() => {
    if (asciiLines.length > 0) animate();
  });
</script>

<div class="effect-grid">
  {#each asciiLines as line, y}
    <div class="line">
      {#each line.split('') as _, x}
        {@const char = characters.find(c => c.x === x && c.y === y)}
        {#if char}
          <span style="color: {char.color}; font-weight: {char.fontWeight}; text-shadow: {char.textShadow}; opacity: {char.symbol ? 1 : 0};">{char.symbol || ' '}</span>
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
  .line { display: block; }
</style>
