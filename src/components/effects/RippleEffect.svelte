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
  export let solidColor = SolidColors.WHITE;
  export let onAnimationComplete = null;

  let characters = [];
  let isAnimating = false;

  const symbols = ['█', '▊', '░', '▒', '*', 'o', '+', '#', '~', '.'];

  function randomSymbol() {
    return symbols[Math.floor(Math.random() * symbols.length)];
  }

  async function animate() {
    if (isAnimating) return;
    isAnimating = true;

    try {
      const centerX = Math.max(...asciiLines.map(l => l.length)) / 2;
      const centerY = asciiLines.length / 2;

      characters = [];
      for (let y = 0; y < asciiLines.length; y++) {
        for (let x = 0; x < asciiLines[y].length; x++) {
          const char = asciiLines[y][x];
          if (char !== ' ') {
            const dx = x - centerX;
            const dy = y - centerY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            characters.push({
              x, y, char,
              symbol: randomSymbol(),
              color: '#00ffff',
              fontWeight: 400,
              textShadow: 'none',
              distance,
              scale: 1
            });
          }
        }
      }
      characters = [...characters];

      for (let frame = 0; frame < 10; frame++) {
        for (let i = 0; i < characters.length; i++) {
          characters[i].symbol = randomSymbol();
        }
        characters = [...characters];
        await new Promise(r => setTimeout(r, 15));
      }

      for (let frame = 0; frame < 25; frame++) {
        const progress = frame / 25;
        const maxDist = 45;
        const ripplePos = progress * maxDist;
        const rippleWidth = 8;

        for (let i = 0; i < characters.length; i++) {
          const char = characters[i];
          const distFromRipple = Math.abs(char.distance - ripplePos);

          if (distFromRipple < rippleWidth) {
            const rippleProgress = 1 - (distFromRipple / rippleWidth);
            char.scale = 0.8 + rippleProgress * 0.3;

            if (rippleProgress > 0.4) {
              char.symbol = char.char;
              char.color = solidColor;
              char.fontWeight = calculateFontWeight(progress, i, characters.length);
            } else {
              char.symbol = randomSymbol();
            }
          } else if (char.distance < ripplePos) {
            char.symbol = char.char;
            char.color = solidColor;
            char.scale = 1;
            char.fontWeight = calculateFontWeight(progress, i, characters.length);
          } else {
            char.symbol = randomSymbol();
            char.scale = 1;
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
          characters[i].color = solidColor;
          characters[i].scale = 1;
        }
        characters = [...characters];
        await new Promise(r => setTimeout(r, 30));
      }

      isAnimating = false;
      if (onAnimationComplete) onAnimationComplete();
    } catch (error) {
      console.error('Ripple animation failed:', error);
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
          <span style="color: {char.color}; font-weight: {char.fontWeight}; text-shadow: {char.textShadow}; transform: scale({char.scale});">{char.symbol}</span>
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
