<script>
  import { onMount, onDestroy } from 'svelte';
  import { Terminal } from 'xterm';
  import { FitAddon } from '@xterm/addon-fit';
  import 'xterm/css/xterm.css';

  export let terminalId;
  export let cwd;
  export let isSSH = false;
  export let sshConnection = null;
  export let sshCredentials = null;
  export let workspaceId = null;

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

  function handleContextMenu(event) {
    event.preventDefault();
    
    const selection = terminal.getSelection();
    
    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'terminal-context-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;
    menu.style.zIndex = '10000';
    
    // Copy option (only if text is selected)
    if (selection) {
      const copyItem = document.createElement('button');
      copyItem.className = 'context-menu-item';
      copyItem.textContent = 'Copy';
      copyItem.onclick = () => {
        navigator.clipboard.writeText(selection);
        document.body.removeChild(menu);
      };
      menu.appendChild(copyItem);
    }
    
    // Paste option
    const pasteItem = document.createElement('button');
    pasteItem.className = 'context-menu-item';
    pasteItem.textContent = 'Paste';
    pasteItem.onclick = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (window.electronAPI) {
          if (isSSH) {
            window.electronAPI.sshWrite({ terminalId, data: text });
          } else {
            window.electronAPI.terminalWrite({ terminalId, data: text });
          }
        }
      } catch (err) {
        console.error('Failed to paste:', err);
      }
      document.body.removeChild(menu);
    };
    menu.appendChild(pasteItem);
    
    // Clear option
    const clearItem = document.createElement('button');
    clearItem.className = 'context-menu-item';
    clearItem.textContent = 'Clear';
    clearItem.onclick = () => {
      clearHistory();
      document.body.removeChild(menu);
    };
    menu.appendChild(clearItem);
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking outside
    const removeMenu = (e) => {
      if (!menu.contains(e.target)) {
        if (document.body.contains(menu)) {
          document.body.removeChild(menu);
        }
        document.removeEventListener('click', removeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', removeMenu), 0);
  }

  function handleKeydown(event) {
    // Ctrl+Shift+C or Cmd+Shift+C for copy
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'C') {
      event.preventDefault();
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
      }
    }
    
    // Ctrl+Shift+V or Cmd+Shift+V for paste
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'V') {
      event.preventDefault();
      navigator.clipboard.readText().then(text => {
        if (window.electronAPI) {
          if (isSSH) {
            window.electronAPI.sshWrite({ terminalId, data: text });
          } else {
            window.electronAPI.terminalWrite({ terminalId, data: text });
          }
        }
      }).catch(err => {
        console.error('Failed to paste:', err);
      });
    }
  }

  onMount(async () => {
    console.log(`[Terminal ${terminalId}] MOUNTED (SSH: ${isSSH})`);
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
      rightClickSelectsWord: true,
      allowProposedApi: true,
    });

    // Add fit addon
    fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    // Open terminal in DOM
    terminal.open(terminalElement);
    
    // Enable right-click context menu for copy/paste
    terminalElement.addEventListener('contextmenu', handleContextMenu);
    
    // Handle Ctrl+Shift+C and Ctrl+Shift+V for copy/paste
    terminalElement.addEventListener('keydown', handleKeydown);
    
    // Initial fit with requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      if (fitAddon && terminal) {
        fitAddon.fit();
      }
    });

    // Listen for user input and send to PTY or SSH
    terminal.onData((data) => {
      if (window.electronAPI) {
        if (isSSH) {
          window.electronAPI.sshWrite({ terminalId, data });
        } else {
          window.electronAPI.terminalWrite({ terminalId, data });
        }
      }
    });

    // Create PTY process or SSH connection
    if (window.electronAPI) {
      let result;
      
      if (isSSH) {
        console.log(`[Terminal ${terminalId}] 🔌 SSH terminal - connecting to ${sshConnection.username}@${sshConnection.host}:${sshConnection.port}`);
        console.log(`[Terminal ${terminalId}] SSH Connection:`, sshConnection);
        console.log(`[Terminal ${terminalId}] Has credentials?`, !!sshCredentials);
        console.log(`[Terminal ${terminalId}] WorkspaceId:`, workspaceId);
        
        terminal.write(`Connecting to ${sshConnection.username}@${sshConnection.host}:${sshConnection.port}...\r\n`);
        
        result = await window.electronAPI.sshCreateTerminal({ 
          terminalId, 
          connection: sshConnection,
          credentials: sshCredentials,
          workspaceId
        });
        
        console.log(`[Terminal ${terminalId}] SSH terminal creation result:`, result);
      } else {
        console.log(`[Terminal ${terminalId}] 💻 Local terminal - cwd: ${cwd}`);
        result = await window.electronAPI.terminalCreate({ 
          terminalId, 
          cwd 
        });
      }
      
      if (!result.success) {
        terminal.write(`\r\nError creating terminal: ${result.error}\r\n`);
      } else if (isSSH) {
        terminal.write(`Connected to ${sshConnection.name}\r\n`);
      }

      // Listen for data from PTY/SSH
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
            // Send new dimensions to PTY or SSH
            if (window.electronAPI) {
              const cols = terminal.cols;
              const rows = terminal.rows;
              console.log(`[Terminal ${terminalId}] Resized to ${cols}×${rows}`);
              if (isSSH) {
                window.electronAPI.sshResize({ terminalId, cols, rows });
              } else {
                window.electronAPI.terminalResize({ terminalId, cols, rows });
              }
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
      if (terminalElement) {
        terminalElement.removeEventListener('contextmenu', handleContextMenu);
        terminalElement.removeEventListener('keydown', handleKeydown);
      }
    };
  });

  onDestroy(() => {
    console.log(`[Terminal ${terminalId}] DESTROYED - KILLING ${isSSH ? 'SSH' : 'PTY'}`);
    
    // Clean up event listeners
    if (terminalElement) {
      terminalElement.removeEventListener('contextmenu', handleContextMenu);
      terminalElement.removeEventListener('keydown', handleKeydown);
    }
    
    // Kill PTY process or SSH connection
    if (window.electronAPI) {
      if (isSSH) {
        window.electronAPI.sshKill({ terminalId });
      } else {
        window.electronAPI.terminalKill({ terminalId });
      }
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
