<script>
  import SlideEffect from './SlideEffect.svelte';
  import { rainbowGradient, cyanMagentaGradient, purpleBlueGradient } from '../../utils/colorGradient.js';
  import { easeOutQuart, easeInOutCubic, createEase } from '../../utils/animationTiming.js';

  // Sample ASCII art for demonstrations
  const swarmLogo = [
    '  ███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗',
    '  ██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║',
    '  ███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║',
    '  ╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║',
    '  ███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║',
    '  ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝'
  ];

  const pyramidArt = [
    '        ▲',
    '       ▲ ▲',
    '      ▲   ▲',
    '     ▲     ▲',
    '    ▲       ▲',
    '   ▲████████████▲'
  ];

  const matrixArt = [
    '█ ▄▄▄ █   █ █████ █   █',
    '█ ▀█▀ █   █   █   █   █',
    '█   █ ▀▄▄▄█   █   ▀▄▄▄█'
  ];

  let selectedExample = 'slideLeft';
  let animationLog = [];

  function logAnimation(message) {
    const timestamp = new Date().toLocaleTimeString();
    animationLog = [...animationLog, `[${timestamp}] ${message}`];
    if (animationLog.length > 10) {
      animationLog = animationLog.slice(-10);
    }
  }

  function handleComplete(example) {
    logAnimation(`✓ ${example} animation completed`);
  }

  function resetLog() {
    animationLog = [];
  }
</script>

<div class="effects-demo">
  <h1>SlideEffect Component Demo</h1>

  <div class="demo-controls">
    <div class="button-group">
      <button 
        class:active={selectedExample === 'slideLeft'}
        on:click={() => selectedExample = 'slideLeft'}
      >
        Slide from Left
      </button>
      <button 
        class:active={selectedExample === 'slideRight'}
        on:click={() => selectedExample = 'slideRight'}
      >
        Slide from Right
      </button>
      <button 
        class:active={selectedExample === 'slideTop'}
        on:click={() => selectedExample = 'slideTop'}
      >
        Slide from Top
      </button>
      <button 
        class:active={selectedExample === 'slideBottom'}
        on:click={() => selectedExample = 'slideBottom'}
      >
        Slide from Bottom
      </button>
      <button 
        class:active={selectedExample === 'slideCorners'}
        on:click={() => selectedExample = 'slideCorners'}
      >
        Slide from Corners
      </button>
      <button 
        class:active={selectedExample === 'fastSlide'}
        on:click={() => selectedExample = 'fastSlide'}
      >
        Fast Slide
      </button>
      <button 
        class:active={selectedExample === 'customGradient'}
        on:click={() => selectedExample = 'customGradient'}
      >
        Custom Gradient
      </button>
      <button 
        class:active={selectedExample === 'noTrail'}
        on:click={() => selectedExample = 'noTrail'}
      >
        No Trail
      </button>
    </div>
    <button class="reset-btn" on:click={resetLog}>Clear Log</button>
  </div>

  <div class="demo-container">
    {#key selectedExample}
      <!-- Slide from Left -->
      {#if selectedExample === 'slideLeft'}
        <div class="demo-section">
          <h2>Slide from Left</h2>
          <p class="description">Characters slide in from the left with default easing</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={swarmLogo}
              gradient={rainbowGradient}
              slideFrom="left"
              slideDistance={200}
              staggerDelay={30}
              easing="easeOutQuart"
              trailSymbols={true}
              onComplete={() => handleComplete('Slide Left')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  asciiLines={swarmLogo}\n  gradient={rainbowGradient}\n  slideFrom="left"\n  slideDistance={200}\n  staggerDelay={30}\n  easing="easeOutQuart"\n  trailSymbols={true}\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- Slide from Right -->
      {#if selectedExample === 'slideRight'}
        <div class="demo-section">
          <h2>Slide from Right</h2>
          <p class="description">Characters slide in from the right side</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={pyramidArt}
              gradient={cyanMagentaGradient}
              slideFrom="right"
              slideDistance={250}
              staggerDelay={25}
              easing="easeInOutCubic"
              trailSymbols={true}
              onComplete={() => handleComplete('Slide Right')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  asciiLines={pyramidArt}\n  gradient={cyanMagentaGradient}\n  slideFrom="right"\n  slideDistance={250}\n  easing="easeInOutCubic"\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- Slide from Top -->
      {#if selectedExample === 'slideTop'}
        <div class="demo-section">
          <h2>Slide from Top</h2>
          <p class="description">Characters slide down from the top of the screen</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={matrixArt}
              gradient={purpleBlueGradient}
              slideFrom="top"
              slideDistance={300}
              staggerDelay={20}
              easing="easeOutQuart"
              trailSymbols={true}
              onComplete={() => handleComplete('Slide Top')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  asciiLines={matrixArt}\n  gradient={purpleBlueGradient}\n  slideFrom="top"\n  slideDistance={300}\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- Slide from Bottom -->
      {#if selectedExample === 'slideBottom'}
        <div class="demo-section">
          <h2>Slide from Bottom</h2>
          <p class="description">Characters slide up from the bottom</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={swarmLogo}
              gradient={rainbowGradient}
              slideFrom="bottom"
              slideDistance={250}
              staggerDelay={30}
              easing="easeInOutCubic"
              trailSymbols={true}
              onComplete={() => handleComplete('Slide Bottom')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  asciiLines={swarmLogo}\n  slideFrom="bottom"\n  slideDistance={250}\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- Slide from Corners -->
      {#if selectedExample === 'slideCorners'}
        <div class="demo-section">
          <h2>Slide from Corners</h2>
          <p class="description">Characters slide from random corners for dramatic effect</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={pyramidArt}
              gradient={purpleBlueGradient}
              slideFrom="corners"
              slideDistance={350}
              staggerDelay={40}
              easing="easeOutQuart"
              trailSymbols={true}
              onComplete={() => handleComplete('Slide Corners')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  asciiLines={pyramidArt}\n  slideFrom="corners"\n  slideDistance={350}\n  staggerDelay={40}\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- Fast Slide -->
      {#if selectedExample === 'fastSlide'}
        <div class="demo-section">
          <h2>Fast Slide</h2>
          <p class="description">Rapid animation with minimal stagger for snappy feel</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={matrixArt}
              gradient={cyanMagentaGradient}
              slideFrom="left"
              slideDistance={150}
              staggerDelay={8}
              easing={(t) => t * (2 - t)}
              trailSymbols={true}
              onComplete={() => handleComplete('Fast Slide')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  asciiLines={matrixArt}\n  slideDistance={150}\n  staggerDelay={8}\n  easing={(t) => t * (2 - t)}\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- Custom Gradient -->
      {#if selectedExample === 'customGradient'}
        <div class="demo-section">
          <h2>Custom Gradient</h2>
          <p class="description">Custom color gradient for unique visual style</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={swarmLogo}
              gradient={['#FF1493', '#FFD700', '#00FF7F', '#00CED1', '#FF1493']}
              slideFrom="left"
              slideDistance={200}
              staggerDelay={25}
              easing="easeInOutCubic"
              trailSymbols={true}
              onComplete={() => handleComplete('Custom Gradient')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  gradient={[\n    "#FF1493", "#FFD700", \n    "#00FF7F", "#00CED1", \n    "#FF1493"\n  ]}\n/>'}</pre>
          </div>
        </div>
      {/if}

      <!-- No Trail -->
      {#if selectedExample === 'noTrail'}
        <div class="demo-section">
          <h2>No Trail Effect</h2>
          <p class="description">Characters slide without the encrypted symbol trail</p>
          <div class="animation-area">
            <SlideEffect 
              asciiLines={pyramidArt}
              gradient={rainbowGradient}
              slideFrom="left"
              slideDistance={200}
              staggerDelay={35}
              easing="easeOutQuart"
              trailSymbols={false}
              onComplete={() => handleComplete('No Trail')}
            />
          </div>
          <div class="code-block">
            <pre>{'<SlideEffect\n  trailSymbols={false}\n/>'}</pre>
          </div>
        </div>
      {/if}
    {/key}
  </div>

  <div class="animation-log">
    <h3>Animation Log</h3>
    <div class="log-content">
      {#if animationLog.length === 0}
        <p class="log-empty">Animation events will appear here...</p>
      {:else}
        {#each animationLog as entry}
          <div class="log-entry">{entry}</div>
        {/each}
      {/if}
    </div>
  </div>
</div>

<style>
  .effects-demo {
    padding: 40px;
    max-width: 1200px;
    margin: 0 auto;
    background: var(--color-background);
    color: var(--color-text-primary);
  }

  h1 {
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 30px;
    color: var(--color-accent);
  }

  .demo-controls {
    display: flex;
    gap: 12px;
    margin-bottom: 30px;
    flex-wrap: wrap;
    align-items: center;
  }

  .button-group {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  button {
    padding: 8px 16px;
    background: var(--color-surface-secondary);
    border: 1px solid var(--color-border);
    border-radius: 6px;
    color: var(--color-text-primary);
    cursor: pointer;
    font-family: var(--font-family-base);
    font-size: 14px;
    transition: all 150ms ease;
  }

  button:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-accent);
  }

  button.active {
    background: var(--color-accent);
    color: white;
    border-color: var(--color-accent);
  }

  .reset-btn {
    margin-left: auto;
  }

  .demo-container {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 30px;
    margin-bottom: 30px;
  }

  .demo-section h2 {
    font-size: 24px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--color-accent);
  }

  .description {
    color: var(--color-text-secondary);
    margin-bottom: 20px;
    font-size: 14px;
  }

  .animation-area {
    background: var(--color-background);
    border: 1px dashed var(--color-border);
    border-radius: 8px;
    padding: 30px;
    margin-bottom: 20px;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .code-block {
    background: var(--color-background-tertiary);
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
  }

  .code-block pre {
    margin: 0;
    font-family: var(--font-family-mono);
    font-size: 12px;
    color: var(--color-text-secondary);
    line-height: 1.4;
  }

  .animation-log {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    padding: 20px;
  }

  .animation-log h3 {
    font-size: 16px;
    font-weight: 600;
    margin-bottom: 12px;
    color: var(--color-text-primary);
  }

  .log-content {
    background: var(--color-background);
    border: 1px solid var(--color-border-secondary);
    border-radius: 6px;
    padding: 12px;
    font-family: var(--font-family-mono);
    font-size: 12px;
    max-height: 200px;
    overflow-y: auto;
  }

  .log-empty {
    color: var(--color-text-tertiary);
    margin: 0;
    font-style: italic;
  }

  .log-entry {
    color: var(--color-text-secondary);
    margin: 4px 0;
    padding: 4px;
    border-left: 2px solid var(--color-accent);
    padding-left: 8px;
  }

  @media (max-width: 768px) {
    .effects-demo {
      padding: 20px;
    }

    .button-group {
      flex-direction: column;
      width: 100%;
    }

    button {
      width: 100%;
    }

    .reset-btn {
      margin-left: 0;
      width: 100%;
    }

    .demo-container {
      padding: 20px;
    }
  }
</style>
