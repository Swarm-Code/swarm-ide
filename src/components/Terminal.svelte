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
    fitAddon.fit();

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
      if (fitAddon && terminal) {
        fitAddon.fit();
        // Send new dimensions to PTY
        if (window.electronAPI) {
          const cols = terminal.cols;
          const rows = terminal.rows;
          window.electronAPI.terminalResize({ terminalId, cols, rows });
        }
      }
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
    padding: 8px;
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
