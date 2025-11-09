<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from 'xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import 'xterm/css/xterm.css';

  export let terminalId;
  export let cwd;

  let terminalElement;
  let terminal;
  let fitAddon;
  let dataListener;
  let exitListener;
  
  // Export method to refresh terminal (for when it becomes visible)
  export function refresh() {
    if (!fitAddon || !terminal || !terminalElement) return;
    
    const rect = terminalElement.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      requestAnimationFrame(() => {
        try {
          fitAddon.fit();
          if (window.electronAPI) {
            window.electronAPI.terminalResize({ 
              terminalId, 
              cols: terminal.cols, 
              rows: terminal.rows 
            });
          }
          console.log(`[Terminal ${terminalId}] Refreshed and fit to ${terminal.cols}×${terminal.rows}`);
        } catch (error) {
          console.error(`[Terminal ${terminalId}] Error during refresh:`, error);
        }
      });
    }
  }
  
  // Export method to blur terminal (release keyboard focus)
  export function blur() {
    if (!terminal) return;
    
    try {
      terminal.blur();
      console.log(`[Terminal ${terminalId}] Blurred - keyboard focus released`);
    } catch (error) {
      console.error(`[Terminal ${terminalId}] Error blurring:`, error);
    }
  }
  
  // Export method to focus terminal (gain keyboard focus)
  export function focus() {
    if (!terminal) return;
    
    try {
      terminal.focus();
      console.log(`[Terminal ${terminalId}] Focused - keyboard focus gained`);
    } catch (error) {
      console.error(`[Terminal ${terminalId}] Error focusing:`, error);
    }
  }
  
  // Export method to clear terminal history
  export function clearHistory() {
    if (!terminal) return;
    
    try {
      // Clear the screen and scrollback buffer
      terminal.clear();
      terminal.reset();
      console.log(`[Terminal ${terminalId}] Cleared history and reset`);
    } catch (error) {
      console.error(`[Terminal ${terminalId}] Error clearing history:`, error);
    }
  }

  onMount(async () => {
    console.log(`[Terminal ${terminalId}] MOUNTED`);
    // Create xterm instance
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Courier New', monospace",
      theme: {
        background: window.matchMedia('(prefers-color-scheme: dark)').matches 
          ? '#1c1c1e' 
          : '#ffffff',
        foreground: window.matchMedia('(prefers-color-scheme: dark)').matches 
          ? '#f5f5f7' 
          : '#1d1d1f',
      },
      scrollback: 10000,
    });

    // Add fit addon
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM
    terminal.open(terminalElement);
    
    // Initial fit with requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (fitAddon && terminal) {
        fitAddon.fit();
      }
    });

    // Listen for user input and send to PTY
    terminal.onData((data) => {
      if (window.electronAPI) {
        window.electronAPI.terminalWrite({ terminalId, data });
      }
    });

    // Create PTY process
    if (window.electronAPI) {
      const result = await window.electronAPI.terminalCreate({ 
        terminalId, 
        cwd 
      });
      
      if (!result.success) {
        terminal.write(`\r\nError creating terminal: ${result.error}\r\n`);
      }

      // Listen for data from PTY
      dataListener = window.electronAPI.onTerminalData(({ terminalId: id, data }) => {
        if (id === terminalId && terminal) {
          terminal.write(data);
        }
      });

      // Listen for terminal exit
      exitListener = window.electronAPI.onTerminalExit(({ terminalId: id, exitCode }) => {
        if (id === terminalId && terminal) {
          terminal.write(`\r\n[Process exited with code ${exitCode}]\r\n`);
        }
      });
    }

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      if (!fitAddon || !terminal || !terminalElement) return;
      
      // Check if terminal is actually visible and has valid dimensions
      const rect = terminalElement.getBoundingClientRect();
      const isVisible = terminalElement.offsetParent !== null && 
                       rect.width > 0 && 
                       rect.height > 0;
      
      if (!isVisible) {
        console.log(`[Terminal ${terminalId}] Skipping fit - terminal not visible or has invalid dimensions`);
        return;
      }
      
      // Use requestAnimationFrame to ensure layout is complete
      requestAnimationFrame(() => {
        if (fitAddon && terminal) {
          try {
            fitAddon.fit();
            // Send new dimensions to PTY
            if (window.electronAPI) {
              const cols = terminal.cols;
              const rows = terminal.rows;
              console.log(`[Terminal ${terminalId}] Resized to ${cols}×${rows}`);
              window.electronAPI.terminalResize({ terminalId, cols, rows });
            }
          } catch (error) {
            console.error(`[Terminal ${terminalId}] Error during fit:`, error);
          }
        }
      });
    });
    resizeObserver.observe(terminalElement);

    return () => {
      resizeObserver.disconnect();
    };
  });

  onDestroy(() => {
    console.log(`[Terminal ${terminalId}] DESTROYED - KILLING PTY`);
    // Kill PTY process
    if (window.electronAPI) {
      window.electronAPI.terminalKill({ terminalId });
    }
    
    if (terminal) {
      terminal.dispose();
    }
  });
</script>

<div class="terminal-wrapper" bind:this={terminalElement}></div>

<style>
  .terminal-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .terminal-wrapper :global(.xterm) {
    padding: 4px;
  }

  .terminal-wrapper :global(.xterm-viewport) {
    scrollbar-width: thin;
    scrollbar-color: var(--color-text-tertiary) transparent;
  }

  .terminal-wrapper :global(.xterm-viewport::-webkit-scrollbar) {
    width: 8px;
  }

  .terminal-wrapper :global(.xterm-viewport::-webkit-scrollbar-thumb) {
    background-color: var(--color-text-tertiary);
    border-radius: 4px;
  }

  .terminal-wrapper :global(.xterm-viewport::-webkit-scrollbar-track) {
    background-color: transparent;
  }
</style>
