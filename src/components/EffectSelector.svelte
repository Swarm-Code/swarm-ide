<script>
  import { onMount } from 'svelte';
  import DecryptEffect from './effects/DecryptEffect.svelte';
  import MatrixEffect from './effects/MatrixEffect.svelte';
  import RainEffect from './effects/RainEffect.svelte';
  import WipeEffect from './effects/WipeEffect.svelte';
  import SlideEffect from './effects/SlideEffect.svelte';
  import WavesEffect from './effects/WavesEffect.svelte';
  import TypewriterEffect from './effects/TypewriterEffect.svelte';
  import GlitchEffect from './effects/GlitchEffect.svelte';
  import RippleEffect from './effects/RippleEffect.svelte';
  import { SolidColors } from '../utils/shiningEffects.js';

  export let asciiLines = [];
  export let onAnimationComplete = null;

  let selectedEffect = null;
  let effectProps = {};

  const effects = [
    { component: DecryptEffect, color: SolidColors.GOLD },
    { component: MatrixEffect, color: SolidColors.CYAN },
    { component: RainEffect, color: SolidColors.CYAN },
    { component: WipeEffect, color: SolidColors.GOLD },
    { component: SlideEffect, color: SolidColors.PURPLE },
    { component: WavesEffect, color: SolidColors.BLUE },
    { component: TypewriterEffect, color: SolidColors.GREEN },
    { component: GlitchEffect, color: SolidColors.MAGENTA },
    { component: RippleEffect, color: SolidColors.WHITE }
  ];

  onMount(() => {
    console.log('[EffectSelector] Mounting with', asciiLines.length, 'ASCII lines');
    const randomIdx = Math.floor(Math.random() * effects.length);
    const effect = effects[randomIdx];
    const effectNames = ['Decrypt', 'Matrix', 'Rain', 'Wipe', 'Slide', 'Waves', 'Typewriter', 'Glitch', 'Ripple'];
    
    console.log('[EffectSelector] Selected effect:', effectNames[randomIdx], 'at index', randomIdx);
    
    selectedEffect = effect.component;
    effectProps = {
      asciiLines,
      solidColor: effect.color,
      onAnimationComplete: () => {
        console.log('[EffectSelector] Animation complete');
        onAnimationComplete?.();
      }
    };
  });
</script>

{#if selectedEffect}
  <svelte:component this={selectedEffect} {...effectProps} />
{:else}
  <div style="text-align: center; color: var(--color-text-secondary);">Loading...</div>
{/if}
