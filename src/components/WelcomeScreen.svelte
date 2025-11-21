<script>
  import { onMount } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { workspaceStore } from '../stores/workspaceStore.js';
  import { sshStore } from '../stores/sshStore.js';
  import SSHConnectionDialog from './SSHConnectionDialog.svelte';
  import '@fontsource/press-start-2p';

  let recentProjects = [];
  let lastSession = null;
  let showSSHDialog = false;
  let showSSHConnectionsMenu = false;
  let editingConnection = null;
  let isReloading = false;
  
  // Text animation state - 1:1 tte decrypt effect
  let logoChars = [];
  let suffixText = '';
  let showContent = false;

  function reloadAnimation() {
    isReloading = true;
    showContent = false;
    showRainBackground = false;
    glowRunning = false;
    rainDrops = [];
    characterLines = [];
    characterLineColors = [];
    logoChars = [];
    suffixText = '';
    
    // Set random color palette (rain uses its own)
    if (selectedAnimation === 'rain') {
      cipherColors = rainPalette.cipher;
      finalColor = rainPalette.final;
    } else {
      const palette = colorPalettes[Math.floor(Math.random() * colorPalettes.length)];
      cipherColors = palette.cipher;
      finalColor = palette.final;
    }
    
    setTimeout(() => {
      isReloading = false;
      
      // Trigger the appropriate animation
      switch (selectedAnimation) {
        case 'matrix':
          animateMatrixLogo();
          break;
        case 'waves':
          animateWavesLogo();
          break;
        case 'glitch':
          animateGlitchLogo();
          break;
        case 'slide':
          animateSlideLogo();
          break;
        case 'expand':
          animateExpandLogo();
          break;
        case 'rain':
          animateRainLogo();
          break;
        case 'smoke':
          animateSmokeLogo();
          break;
        case 'sweep':
          animateSweepLogo();
          break;
        default:
          animateLogo(); // decrypt
      }
    }, 300);
  }
  let characterLines = [];
  let characterLineColors = [];
  const targetText = 'SWARM';
  const targetSuffix = 'IDE';
  
  // Swarm character ASCII art - lines for animation
  const swarmCharacterLines = [
    '          ⣿⣿⣿⣿⣿⣿⣿            ⣿⣿⣿⣿⣿⣿⣿         ',
    '          ⣿⣿⣿⣿⣿⣿⣿            ⣿⣿⣿⣿⣿⣿⣿         ',
    '          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ',
    '          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ',
    '     ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '     ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '     ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '          ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿          ',
    '          ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿          ',
    '          ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿          ',
    '          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          ',
    '          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          ',
    '          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          ',
    '    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ',
    '    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ',
    '    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿      ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ',
    '              ⣿⣿⣿⣿⣿⣿      ⣿⣿⣿⣿⣿⣿              ',
    '              ⣿⣿⣿⣿⣿⣿      ⣿⣿⣿⣿⣿⣿              '
  ];

  // Fallback ASCII art using standard characters for better cross-system compatibility
  const swarmCharacterLinesFallback = [
    '         ##########            ##########         ',
    '         ##########            ##########         ',
    '         #################### ####################         ',
    '         #################### ####################         ',
    '    #################### #################### ####################         ',
    '    ####################   ##########   ####################     ',
    '    ####################    ##########   ####################     ',
    '         ##########    ##########   ####################     ',
    '         ##########    ##########          ',
    '         ##########    ##########          ',
    '         #################### ####################          ',
    '         #################### ####################          ',
    '     #################### #################### ####################     ',
    '    ####################    ####################    ####################     ',
    '    ####################    ####################    ####################     ',
    '    ####################    ##################               ',
    '              ##################               ',
    '              ##################               '
  ];

  // Swarm character ASCII art - large version
  const swarmCharacterLarge = `                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
          ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
                  ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                   
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          
                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                             
                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                             
                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                             
                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿                             
                            ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿        ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿`;
  
  // Use medium by default, can add responsive logic later
  // Note: swarmCharacter is now dynamically assigned based on Unicode support below
  
  // Encrypted symbols from tte decrypt effect
  const keyboard = Array.from({length: 94}, (_, i) => String.fromCharCode(33 + i));
  const blocks = ['█', '▉', '▊', '▋', '▌', '▍', '▎', '▏', '▐', '░', '▒', '▓'];
  const boxDrawing = ['─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '═', '║', '╔', '╗', '╚', '╝', '╠', '╣', '╦', '╩', '╬'];
  const braille = ['⠀', '⠁', '⠂', '⠃', '⠄', '⠅', '⠆', '⠇', '⠈', '⠉', '⠊', '⠋', '⠌', '⠍', '⠎', '⠏', '⠐', '⠑', '⠒', '⠓', '⠔', '⠕', '⠖', '⠗', '⠘', '⠙', '⠚', '⠛', '⠜', '⠝', '⠞', '⠟', '⠠', '⠡', '⠢', '⠣', '⠤', '⠥', '⠦', '⠧', '⠨', '⠩', '⠪', '⠫', '⠬', '⠭', '⠮', '⠯', '⠰', '⠱', '⠲', '⠳', '⠴', '⠵', '⠶', '⠷', '⠸', '⠹', '⠺', '⠻', '⠼', '⠽', '⠾', '⠿', '⡀', '⡁', '⡂', '⡃', '⡄', '⡅', '⡆', '⡇', '⡈', '⡉', '⡊', '⡋', '⡌', '⡍', '⡎', '⡏', '⡐', '⡑', '⡒', '⡓', '⡔', '⡕', '⡖', '⡗', '⡘', '⡙', '⡚', '⡛', '⡜', '⡝', '⡞', '⡟', '⡠', '⡡', '⡢', '⡣', '⡤', '⡥', '⡦', '⡧', '⡨', '⡩', '⡪', '⡫', '⡬', '⡭', '⡮', '⡯', '⡰', '⡱', '⡲', '⡳', '⡴', '⡵', '⡶', '⡷', '⡸', '⡹', '⡺', '⡻', '⡼', '⡽', '⡾', '⡿', '⢀', '⢁', '⢂', '⢃', '⢄', '⢅', '⢆', '⢇', '⢈', '⢉', '⢊', '⢋', '⢌', '⢍', '⢎', '⢏', '⢐', '⢑', '⢒', '⢓', '⢔', '⢕', '⢖', '⢗', '⢘', '⢙', '⢚', '⢛', '⢜', '⢝', '⢞', '⢟', '⢠', '⢡', '⢢', '⢣', '⢤', '⢥', '⢦', '⢧', '⢨', '⢩', '⢪', '⢫', '⢬', '⢭', '⢮', '⢯', '⢰', '⢱', '⢲', '⢳', '⢴', '⢵', '⢶', '⢷', '⢸', '⢹', '⢺', '⢻', '⢼', '⢽', '⢾', '⢿', '⣀', '⣁', '⣂', '⣃', '⣄', '⣅', '⣆', '⣇', '⣈', '⣉', '⣊', '⣋', '⣌', '⣍', '⣎', '⣏', '⣐', '⣑', '⣒', '⣓', '⣔', '⣕', '⣖', '⣗', '⣘', '⣙', '⣚', '⣛', '⣜', '⣝', '⣞', '⣟', '⣠', '⣡', '⣢', '⣣', '⣤', '⣥', '⣦', '⣧', '⣨', '⣩', '⣪', '⣫', '⣬', '⣭', '⣮', '⣯', '⣰', '⣱', '⣲', '⣳', '⣴', '⣵', '⣶', '⣷', '⣸', '⣹', '⣺', '⣻', '⣼', '⣽', '⣾', '⣿'];
  const encryptedSymbols = [...keyboard, ...blocks, ...boxDrawing, ...braille];
  
  // 12 vibrant colors for random selection
  const vibrantColors = [
    '#FF0000',  // Red
    '#FF7F00',  // Orange
    '#FFFF00',  // Yellow
    '#00FF00',  // Green
    '#00FFFF',  // Cyan
    '#0000FF',  // Blue
    '#8B00FF',  // Violet
    '#FF1493',  // Deep Pink
    '#00CED1',  // Dark Turquoise
    '#FF69B4',  // Hot Pink
    '#32CD32',  // Lime Green
    '#FF4500'   // Orange Red
  ];

  // Generate random palette from vibrant colors
  function getRandomPalette() {
    const shuffled = [...vibrantColors].sort(() => Math.random() - 0.5);
    return {
      cipher: [shuffled[0], shuffled[1], shuffled[2]],
      final: shuffled[3]
    };
  }
  
  // Rain-specific palette
  const rainPalette = {
    cipher: ['#00CED1', '#00FFFF', '#0000FF'],
    final: '#00FFFF'
  };

  // Rarely (15% chance) force rain animation
  const shouldForceRain = Math.random() < 0.15;

  let cipherColors = [];
  let finalColor = '';
  let selectedAnimation = 'decrypt';
  let rainDrops = [];
  let showRainBackground = false;

  // Function to check if Unicode characters render properly
  function testUnicodeSupport() {
    // Check if we're in a browser environment
    if (typeof document === 'undefined') {
      console.warn('Document not available, assuming Unicode support');
      return false; // Safer default for SSR or non-browser environments
    }

    try {
      const testDiv = document.createElement('div');
      testDiv.innerHTML = '⣿';
      testDiv.style.fontFamily = 'monospace';
      testDiv.style.fontSize = '14px';
      testDiv.style.position = 'absolute';
      testDiv.style.visibility = 'hidden';
      testDiv.style.display = 'block';
      document.body.appendChild(testDiv);

      const width = testDiv.offsetWidth;
      const height = testDiv.offsetHeight;

      document.body.removeChild(testDiv);

      // Return true if character has reasonable dimensions (rendered properly)
      return width > 0 && height > 0;
    } catch (error) {
      console.warn('Unicode support test failed:', error);
      return false; // Fallback to standard characters if test fails
    }
  }

  // Determine which ASCII art to use based on font support
  const useUnicodeFont = testUnicodeSupport();
  const swarmCharacter = useUnicodeFont ? swarmCharacterLines : swarmCharacterLinesFallback;

  function randomSymbol() {
    return encryptedSymbols[Math.floor(Math.random() * encryptedSymbols.length)];
  }
  
  function randomColor() {
    return cipherColors[Math.floor(Math.random() * cipherColors.length)];
  }

  // Easing functions (1:1 from TTE)
  function inOutSine(progressRatio) {
    return -(Math.cos(Math.PI * progressRatio) - 1) / 2;
  }

  function inQuad(progressRatio) {
    return progressRatio ** 2;
  }

  function outQuad(progressRatio) {
    return 1 - (1 - progressRatio) * (1 - progressRatio);
  }

  function inOutQuad(progressRatio) {
    if (progressRatio < 0.5) {
      return 2 * progressRatio ** 2;
    }
    return 1 - (-2 * progressRatio + 2) ** 2 / 2;
  }

  // Interpolate between two colors based on progress (0-1)
  function interpolateColor(startColor, endColor, progress) {
    const start = parseInt(startColor.slice(1), 16);
    const end = parseInt(endColor.slice(1), 16);

    const sr = (start >> 16) & 255;
    const sg = (start >> 8) & 255;
    const sb = start & 255;

    const er = (end >> 16) & 255;
    const eg = (end >> 8) & 255;
    const eb = end & 255;

    const r = Math.round(sr + (er - sr) * progress);
    const g = Math.round(sg + (eg - sg) * progress);
    const b = Math.round(sb + (eb - sb) * progress);

    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
  }

  // Build gradient steps between colors
  function buildGradient(colors, steps = 12) {
    const gradient = [];
    const stepsPerSegment = Math.floor(steps / (colors.length - 1));

    for (let i = 0; i < colors.length - 1; i++) {
      for (let j = 0; j < stepsPerSegment; j++) {
        const progress = j / stepsPerSegment;
        gradient.push(interpolateColor(colors[i], colors[i + 1], progress));
      }
    }

    // Add final color
    gradient.push(colors[colors.length - 1]);
    return gradient;
  }

  // Glowing wave effect state
  let glowRunning = false;

  // Start continuous glowing wave effect on ASCII character
  function startGlowEffect() {
    if (glowRunning) return;
    glowRunning = true;
    
    // Use final color as base, brighten for highlight
    const highlightColor = '#ffffff';
    
    const runGlow = async () => {
      let wavePosition = -5;
      const waveWidth = 5; // Wider, softer wave
      const totalLines = swarmCharacterLines.length;
      
      while (glowRunning) {
        // Create new color array each frame
        const newColors = [];
        
        for (let i = 0; i < totalLines; i++) {
          const distFromWave = Math.abs(i - wavePosition);
          
          if (distFromWave < waveWidth) {
            // Smooth cubic easing for organic feel
            const t = 1 - (distFromWave / waveWidth);
            const intensity = t * t * (3 - 2 * t); // smoothstep
            // Interpolate from final color to bright highlight
            newColors.push(interpolateColor(finalColor, highlightColor, intensity * 0.7));
          } else {
            // Keep final color as base (not dimmed)
            newColors.push(finalColor);
          }
        }
        
        characterLineColors = newColors;
        
        // Move wave down slowly
        wavePosition += 0.15;
        if (wavePosition > totalLines + waveWidth) {
          wavePosition = -waveWidth;
        }
        
        await new Promise(r => setTimeout(r, 50)); // Slower, smoother
      }
    };
    
    runGlow();
  }

  // Stop glow effect (call when leaving welcome screen)
  function stopGlowEffect() {
    glowRunning = false;
  }

  // SLIDE animation - characters slide in from sides
  // RAIN animation - full-screen falling rain effect with actual falling motion
  async function animateRainLogo() {
    try {
      const rainSymbols = ['o', '.', ',', '*', '|'];
      const rainColors = [
        '#00315C', '#004C8F', '#0075DB', '#3F91D9', 
        '#78B9F2', '#9AC8F5', '#B8D8F8', '#E3EFFC'
      ];
      const finalGradient = buildGradient([finalColor], 12);
      
      showRainBackground = true;
      characterLines = [];
      characterLineColors = [];

      // Persistent drops that actually fall
      let activeDrops = [];
      let dropIdCounter = 0;
      let rainRunning = true;

      // Initialize with drops across the screen at various heights
      for (let i = 0; i < 60; i++) {
        activeDrops.push({
          id: dropIdCounter++,
          x: Math.random() * 100,
          y: Math.random() * 100, // Start at random heights for initial fill
          speed: 0.8 + Math.random() * 1.2, // Speed between 0.8-2.0
          symbol: rainSymbols[Math.floor(Math.random() * rainSymbols.length)],
          color: rainColors[Math.floor(Math.random() * rainColors.length)]
        });
      }

      // Update drops - move them down, respawn at top when they exit
      const updateDrops = () => {
        activeDrops = activeDrops.map(drop => {
          let newY = drop.y + drop.speed;
          
          // If drop exits bottom, respawn at top with new properties
          if (newY > 105) {
            return {
              id: dropIdCounter++,
              x: Math.random() * 100,
              y: -5,
              speed: 0.8 + Math.random() * 1.2,
              symbol: rainSymbols[Math.floor(Math.random() * rainSymbols.length)],
              color: rainColors[Math.floor(Math.random() * rainColors.length)]
            };
          }
          
          return { ...drop, y: newY };
        });

        // Occasionally spawn extra drops for density
        if (Math.random() < 0.3) {
          activeDrops.push({
            id: dropIdCounter++,
            x: Math.random() * 100,
            y: -5,
            speed: 0.8 + Math.random() * 1.2,
            symbol: rainSymbols[Math.floor(Math.random() * rainSymbols.length)],
            color: rainColors[Math.floor(Math.random() * rainColors.length)]
          });
        }

        // Cap at 80 drops for performance
        if (activeDrops.length > 80) {
          activeDrops = activeDrops.slice(-80);
        }

        rainDrops = [...activeDrops];
      };

      // Run rain in background at constant 30fps
      const rainLoop = async () => {
        while (rainRunning) {
          updateDrops();
          await new Promise(r => setTimeout(r, 33));
        }
      };
      
      // Start rain loop (runs independently)
      rainLoop();

      // Initial rain-only phase
      await new Promise(r => setTimeout(r, 150));

      // ASCII art slides in while rain continues
      characterLines = [];
      characterLineColors = [];

      for (let i = 0; i < swarmCharacterLines.length; i++) {
        const targetLine = swarmCharacterLines[i];
        const slideFromLeft = i % 2 === 0;
        const steps = 25;

        for (let step = 0; step <= steps; step++) {
          const progress = outQuad(step / steps);
          let slideLine = '';
          
          const offset = slideFromLeft 
            ? Math.floor((progress - 1) * 50)
            : Math.floor((1 - progress) * 50);

          for (let j = 0; j < targetLine.length; j++) {
            const displayPos = j + offset;
            if (displayPos >= 0 && displayPos < 50) {
              slideLine += targetLine[j];
            } else {
              slideLine += ' ';
            }
          }

          characterLines = [...characterLines.slice(0, i), slideLine, ...characterLines.slice(i + 1)];
          
          const colorIdx = Math.floor(progress * (finalGradient.length - 1));
          if (characterLineColors[i] === undefined) {
            characterLineColors = [...characterLineColors, finalGradient[colorIdx]];
          } else {
            characterLineColors[i] = finalGradient[colorIdx];
            characterLineColors = [...characterLineColors];
          }

          await new Promise(r => setTimeout(r, 12));
        }

        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
      }

      await new Promise(r => setTimeout(r, 15));

      // Logo appears
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));

      for (let i = 0; i < logoChars.length; i++) {
        for (let step = 0; step <= 12; step++) {
          const progress = outQuad(step / 12);
          const colorIdx = Math.floor(progress * (finalGradient.length - 1));

          logoChars[i].symbol = logoChars[i].final;
          logoChars[i].color = finalGradient[colorIdx];
          logoChars[i].phase = 'resolved';
          logoChars = [...logoChars];
          
          await new Promise(r => setTimeout(r, 12));
        }
        await new Promise(r => setTimeout(r, 15));
      }

      await new Promise(r => setTimeout(r, 20));

      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 25));
      }

      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].color = finalColor;
      }
      logoChars = [...logoChars];

      // Rain continues until user leaves welcome screen
      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Rain animation failed:', error);
      showRainBackground = false;
      rainDrops = [];
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  // SLIDE animation - characters enter from left and right edges
  async function animateSlideLogo() {
    try {
      const finalGradient = buildGradient([finalColor], 12);
      const maxWidth = 50;
      
      characterLines = [];
      characterLineColors = [];

      for (let i = 0; i < swarmCharacterLines.length; i++) {
        const targetLine = swarmCharacterLines[i];
        const slideFromLeft = i % 2 === 0;
        const steps = 40;

        // Character slides in from edge
        for (let step = 0; step <= steps; step++) {
          const progress = outQuad(step / steps);
          let slideLine = '';

          if (slideFromLeft) {
            // Slide from LEFT edge: characters move left to right
            const offset = Math.floor(progress * maxWidth) - maxWidth;
            for (let j = 0; j < targetLine.length; j++) {
              const displayPos = j + offset;
              if (displayPos >= 0 && displayPos < maxWidth) {
                slideLine += targetLine[j];
              } else if (displayPos < 0) {
                slideLine += ' ';
              }
            }
          } else {
            // Slide from RIGHT edge: characters move right to left
            const offset = Math.floor((1 - progress) * maxWidth);
            for (let j = 0; j < targetLine.length; j++) {
              const displayPos = j - offset;
              if (displayPos >= 0 && displayPos < maxWidth) {
                slideLine += targetLine[j];
              } else if (displayPos >= maxWidth) {
                slideLine += ' ';
              }
            }
          }

          characterLines = [...characterLines.slice(0, i), slideLine, ...characterLines.slice(i + 1)];
          
          const colorIdx = Math.floor(progress * (finalGradient.length - 1));
          if (characterLineColors[i] === undefined) {
            characterLineColors = [...characterLineColors, finalGradient[colorIdx]];
          } else {
            characterLineColors[i] = finalGradient[colorIdx];
            characterLineColors = [...characterLineColors];
          }

          await new Promise(r => setTimeout(r, 8));
        }

        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
        
        await new Promise(r => setTimeout(r, 20));
      }

      await new Promise(r => setTimeout(r, 15));

      // Logo characters slide in from edges
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));

      for (let i = 0; i < logoChars.length; i++) {
        const slideFromLeft = i % 2 === 0;
        
        for (let step = 0; step <= 20; step++) {
          const progress = outQuad(step / 20);
          const colorIdx = Math.floor(progress * (finalGradient.length - 1));

          logoChars[i].symbol = logoChars[i].final;
          logoChars[i].color = finalGradient[colorIdx];
          logoChars[i].phase = 'resolved';
          logoChars = [...logoChars];
          
          await new Promise(r => setTimeout(r, 15));
        }

        await new Promise(r => setTimeout(r, 15));
      }

      await new Promise(r => setTimeout(r, 20));

      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 25));
      }

      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].color = finalColor;
      }
      logoChars = [...logoChars];

      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Slide animation failed:', error);
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  // EXPAND animation - characters expand from center
  async function animateExpandLogo() {
    try {
      const finalGradient = buildGradient([finalColor], 12);
      
      characterLines = [];
      characterLineColors = [];

      // Expand from center outward
      for (let i = 0; i < swarmCharacterLines.length; i++) {
        const targetLine = swarmCharacterLines[i];
        const centerIdx = Math.floor(targetLine.length / 2);
        const steps = 30;

        for (let step = 0; step <= steps; step++) {
          const progress = inOutQuad(step / steps);
          const revealDist = Math.floor(progress * centerIdx);
          let expandLine = '';

          for (let j = 0; j < targetLine.length; j++) {
            if (j >= centerIdx - revealDist && j < centerIdx + revealDist) {
              expandLine += targetLine[j];
            } else {
              expandLine += ' ';
            }
          }

          characterLines = [...characterLines.slice(0, i), expandLine, ...characterLines.slice(i + 1)];
          
          const colorIdx = Math.floor(progress * (finalGradient.length - 1));
          if (characterLineColors[i] === undefined) {
            characterLineColors = [...characterLineColors, finalGradient[colorIdx]];
          } else {
            characterLineColors[i] = finalGradient[colorIdx];
            characterLineColors = [...characterLineColors];
          }

          await new Promise(r => setTimeout(r, 8));
        }

        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
      }

      await new Promise(r => setTimeout(r, 15));

      // Logo expand
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));

      const centerChar = Math.floor(logoChars.length / 2);

      for (let i = 0; i < logoChars.length; i++) {
        const distFromCenter = Math.abs(i - centerChar);
        const delay = distFromCenter * 40;

        await new Promise(r => setTimeout(r, delay));

        for (let step = 0; step <= 15; step++) {
          const progress = outQuad(step / 15);
          const colorIdx = Math.floor(progress * (finalGradient.length - 1));

          logoChars[i].symbol = logoChars[i].final;
          logoChars[i].color = finalGradient[colorIdx];
          logoChars[i].phase = 'resolved';
          logoChars = [...logoChars];
          
          await new Promise(r => setTimeout(r, 12));
        }
      }

      await new Promise(r => setTimeout(r, 20));

      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 25));
      }

      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].color = finalColor;
      }
      logoChars = [...logoChars];

      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Expand animation failed:', error);
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }
  
  async function animateLogo() {
    try {
      // Phase 0: Animate character line by line with hacker effect
      characterLines = [];
      characterLineColors = [];
    
    for (let i = 0; i < swarmCharacterLines.length; i++) {
      // Add scrambled line first
      let scrambledLine = '';
      const targetLine = swarmCharacterLines[i];
      for (let j = 0; j < targetLine.length; j++) {
        if (targetLine[j] === ' ') {
          scrambledLine += ' ';
        } else {
          scrambledLine += encryptedSymbols[Math.floor(Math.random() * encryptedSymbols.length)];
        }
      }
      characterLines = [...characterLines, scrambledLine];
      characterLineColors = [...characterLineColors, randomColor()];
      await new Promise(r => setTimeout(r, 25));
      
      // Decrypt to final
      characterLines[i] = targetLine;
      characterLineColors[i] = randomColor();
      characterLines = [...characterLines];
      characterLineColors = [...characterLineColors];
    }
    
    // Flash all lines to final color
    await new Promise(r => setTimeout(r, 150));
    for (let i = 0; i < characterLineColors.length; i++) {
      characterLineColors[i] = finalColor;
    }
    characterLineColors = [...characterLineColors];
    
    await new Promise(r => setTimeout(r, 20));
    
    // Initialize character states
    logoChars = targetText.split('').map((char, i) => ({
      symbol: ' ',
      color: randomColor(),
      final: char,
      phase: 'hidden',
      index: i
    }));
    
    // Phase 1: Typing effect - characters appear with block animation
    for (let i = 0; i < logoChars.length; i++) {
      logoChars[i].phase = 'typing';
      
      // Block sequence like tte: ▉ ▓ ▒ ░ then random symbol
      const typingBlocks = ['▉', '▓', '▒', '░'];
      for (const block of typingBlocks) {
        logoChars[i].symbol = block;
        logoChars[i].color = randomColor();
        logoChars = [...logoChars];
        await new Promise(r => setTimeout(r, 25));
      }
      
      logoChars[i].symbol = randomSymbol();
      logoChars[i].color = randomColor();
      logoChars = [...logoChars];
      
      // Small delay between characters (75% chance)
      if (Math.random() < 0.75) {
        await new Promise(r => setTimeout(r, 15));
      }
    }
    
    await new Promise(r => setTimeout(r, 20));
    
    // Phase 2: Fast decrypt - all characters scramble rapidly
    const fastDecryptFrames = 25;
    for (let frame = 0; frame < fastDecryptFrames; frame++) {
      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].symbol = randomSymbol();
        logoChars[i].color = randomColor();
      }
      logoChars = [...logoChars];
      await new Promise(r => setTimeout(r, 20));
    }
    
    // Phase 3: Slow decrypt - characters resolve at different times
    const resolveDelays = logoChars.map(() => Math.floor(Math.random() * 15) + 1);
    const maxDelay = Math.max(...resolveDelays);
    
    for (let frame = 0; frame < maxDelay + 10; frame++) {
      for (let i = 0; i < logoChars.length; i++) {
        if (frame >= resolveDelays[i] && logoChars[i].phase !== 'resolved') {
          // Discovered - flash white then settle to final color
          if (logoChars[i].phase !== 'discovering') {
            logoChars[i].phase = 'discovering';
            logoChars[i].symbol = logoChars[i].final;
            logoChars[i].color = '#ffffff';
          } else {
            logoChars[i].phase = 'resolved';
            logoChars[i].color = finalColor;
          }
        } else if (logoChars[i].phase !== 'resolved' && logoChars[i].phase !== 'discovering') {
          // Still decrypting - random symbols with varying speed
          if (Math.random() < 0.7) {
            logoChars[i].symbol = randomSymbol();
            logoChars[i].color = randomColor();
          }
        }
      }
      logoChars = [...logoChars];
      await new Promise(r => setTimeout(r, 20));
    }
    
    // Ensure all resolved
    for (let i = 0; i < logoChars.length; i++) {
      logoChars[i].symbol = logoChars[i].final;
      logoChars[i].color = finalColor;
      logoChars[i].phase = 'resolved';
    }
    logoChars = [...logoChars];
    
    // Small pause then animate suffix
    await new Promise(r => setTimeout(r, 150));
    
    for (let i = 0; i <= targetSuffix.length; i++) {
      suffixText = targetSuffix.slice(0, i);
      await new Promise(r => setTimeout(r, 25));
    }
    
    await new Promise(r => setTimeout(r, 15));
    startGlowEffect();
      showContent = true;

    } catch (error) {
      console.error('ASCII art animation failed:', error);

      // Fallback to simple display if animation fails
      try {
        // Use fallback ASCII art if main one fails
        characterLines = swarmCharacterLinesFallback;
        characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];

        // Show simple logo text
        logoChars = targetText.split('').map((char, i) => ({
          symbol: char,
          color: finalColor,
          final: char,
          phase: 'resolved',
          index: i
        }));
        logoChars = [...logoChars];

        suffixText = targetSuffix;
        startGlowEffect();
      showContent = true;

        console.log('Fallback ASCII art displayed successfully');
      } catch (fallbackError) {
        console.error('Fallback display also failed:', fallbackError);

        // Ultimate fallback - show just text
        logoChars = targetText.split('').map((char, i) => ({
          symbol: char,
          color: finalColor,
          final: char,
          phase: 'resolved',
          index: i
        }));
        logoChars = [...logoChars];
        suffixText = targetSuffix;
        startGlowEffect();
      showContent = true;
      }
    }
  }

  async function animateGlitchLogo() {
    try {
      const glitchSymbols = ['█', '▓', '▒', '░', '▄', '▀', '▐', '▌', '■', '□', '●', '○'];
      const finalGradient = buildGradient([finalColor], 12);
      
      characterLines = [];
      characterLineColors = [];

      // ASCII art with heavy glitch effect
      for (let i = 0; i < swarmCharacterLines.length; i++) {
        const targetLine = swarmCharacterLines[i];
        
        // Intense glitch phase: rapid symbol cycling
        for (let glitchFrame = 0; glitchFrame < 8; glitchFrame++) {
          let glitchLine = '';
          for (let j = 0; j < targetLine.length; j++) {
            if (targetLine[j] === ' ') {
              glitchLine += ' ';
            } else {
              // Random chance to glitch or show real character
              if (Math.random() < 0.7) {
                glitchLine += glitchSymbols[Math.floor(Math.random() * glitchSymbols.length)];
              } else {
                glitchLine += targetLine[j];
              }
            }
          }
          
          characterLines = [...characterLines.slice(0, i), glitchLine, ...characterLines.slice(i + 1)];
          
          // Rapidly cycle through colors
          const colorIdx = Math.floor(Math.random() * cipherColors.length);
          if (characterLineColors[i] === undefined) {
            characterLineColors = [...characterLineColors, cipherColors[colorIdx]];
          } else {
            characterLineColors[i] = cipherColors[colorIdx];
            characterLineColors = [...characterLineColors];
          }
          
          await new Promise(r => setTimeout(r, 8));
        }

        // Stabilization phase: gradually reduce glitch
        for (let stabilize = 0; stabilize < 4; stabilize++) {
          let stableLine = '';
          const glitchChance = 0.7 - (stabilize / 4) * 0.7; // Fade from 70% to 0%
          
          for (let j = 0; j < targetLine.length; j++) {
            if (targetLine[j] === ' ') {
              stableLine += ' ';
            } else {
              if (Math.random() < glitchChance) {
                stableLine += glitchSymbols[Math.floor(Math.random() * glitchSymbols.length)];
              } else {
                stableLine += targetLine[j];
              }
            }
          }
          
          characterLines[i] = stableLine;
          const easedProgress = outQuad(stabilize / 4);
          const colorIdx = Math.floor(easedProgress * (finalGradient.length - 1));
          characterLineColors[i] = finalGradient[colorIdx];
          characterLines = [...characterLines];
          characterLineColors = [...characterLineColors];
          
          await new Promise(r => setTimeout(r, 15));
        }

        // Final reveal
        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
        
        await new Promise(r => setTimeout(r, 20));
      }

      await new Promise(r => setTimeout(r, 20));

      // Initialize logo characters
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));

      // Glitch animation for logo characters
      for (let i = 0; i < logoChars.length; i++) {
        // Heavy glitch phase
        for (let glitchFrame = 0; glitchFrame < 6; glitchFrame++) {
          logoChars[i].symbol = glitchSymbols[Math.floor(Math.random() * glitchSymbols.length)];
          logoChars[i].color = cipherColors[Math.floor(Math.random() * cipherColors.length)];
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 12));
        }

        // Stabilize to final character with gradient
        for (let step = 0; step < finalGradient.length; step++) {
          logoChars[i].symbol = logoChars[i].final;
          logoChars[i].color = finalGradient[step];
          logoChars[i].phase = 'resolved';
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 8));
        }

        await new Promise(r => setTimeout(r, 15));
      }

      await new Promise(r => setTimeout(r, 15));

      // Type suffix with minor glitches
      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        
        // Occasional glitch effect on suffix
        if (Math.random() < 0.15 && i > 0) {
          // Glitch the last character
          const glitchChar = glitchSymbols[Math.floor(Math.random() * glitchSymbols.length)];
          suffixText = targetSuffix.slice(0, i - 1) + glitchChar + targetSuffix.slice(i);
        }
        
        await new Promise(r => setTimeout(r, 15));
      }

      // Ensure final color
      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].color = finalColor;
      }
      logoChars = [...logoChars];

      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Glitch animation failed:', error);
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  async function animateTypewriterLogo() {
    try {
      characterLines = [];
      characterLineColors = [];
      const finalGradient = buildGradient([finalColor], 12);

      // Reveal ASCII art line by line with typewriter effect
      for (let i = 0; i < swarmCharacterLines.length; i++) {
        const targetLine = swarmCharacterLines[i];
        let currentLine = ' '.repeat(targetLine.length);

        // Reveal characters left to right with easing
        for (let j = 0; j < targetLine.length; j++) {
          const easedProgress = outQuad(j / targetLine.length);
          const colorIdx = Math.floor(easedProgress * (finalGradient.length - 1));

          // Build line up to current position
          currentLine = targetLine.slice(0, j + 1) + ' '.repeat(targetLine.length - j - 1);

          characterLines = [...characterLines.slice(0, i), currentLine, ...characterLines.slice(i + 1)];

          if (characterLineColors[i] === undefined) {
            characterLineColors = [...characterLineColors, finalGradient[colorIdx]];
          } else {
            characterLineColors[i] = finalGradient[colorIdx];
            characterLineColors = [...characterLineColors];
          }

          await new Promise(r => setTimeout(r, 15));
        }

        // Hold final line
        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];

        await new Promise(r => setTimeout(r, 15));
      }

      await new Promise(r => setTimeout(r, 20));

      // Initialize logo characters
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));

      // Typewriter reveal of logo characters
      for (let i = 0; i < logoChars.length; i++) {
        const easedProgress = outQuad(i / logoChars.length);
        const colorIdx = Math.floor(easedProgress * (finalGradient.length - 1));

        logoChars[i].symbol = logoChars[i].final;
        logoChars[i].color = finalGradient[colorIdx];
        logoChars[i].phase = 'resolved';
        logoChars = [...logoChars];

        await new Promise(r => setTimeout(r, 25));
      }

      await new Promise(r => setTimeout(r, 15));

      // Type suffix character by character
      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 15));
      }

      // Ensure final color on suffix
      for (let i = 0; i < logoChars.length; i++) {
        logoChars[i].color = finalColor;
      }
      logoChars = [...logoChars];

      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Typewriter animation failed:', error);
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  async function animateWavesLogo() {
    try {
      const waveSymbols = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂', '▁'];
      const waveGradient = buildGradient(cipherColors, 6);
      const finalGradient = buildGradient([finalColor], 12);
      const waveCount = 3;
      const waveLength = 1;
      const waveEasing = inOutSine;

      characterLines = [];
      characterLineColors = [];

      // Animate character lines with wave effect
      for (let i = 0; i < swarmCharacterLines.length; i++) {
        const targetLine = swarmCharacterLines[i];
        
        // Initialize line with spaces
        let waveLines = [];
        
        // Generate wave cycles for this line
        for (let waveIdx = 0; waveIdx < waveCount; waveIdx++) {
          let waveLine = '';
          for (let j = 0; j < targetLine.length; j++) {
            if (targetLine[j] === ' ') {
              waveLine += ' ';
            } else {
              // Cycle through wave symbols
              const symbolIdx = (j + waveIdx) % waveSymbols.length;
              waveLine += waveSymbols[symbolIdx];
            }
          }
          waveLines.push(waveLine);
        }

        // Animate through wave frames with easing
        for (let waveIdx = 0; waveIdx < waveLines.length; waveIdx++) {
          const easedProgress = waveEasing(waveIdx / (waveLines.length - 1));
          const colorIdx = Math.floor(easedProgress * (waveGradient.length - 1));
          
          characterLines = [...characterLines.slice(0, i), waveLines[waveIdx], ...characterLines.slice(i + 1)];
          
          if (characterLineColors[i] === undefined) {
            characterLineColors = [...characterLineColors, waveGradient[colorIdx]];
          } else {
            characterLineColors[i] = waveGradient[colorIdx];
            characterLineColors = [...characterLineColors];
          }
          
          await new Promise(r => setTimeout(r, waveLength * 30));
        }

        // Reveal to final
        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
        
        await new Promise(r => setTimeout(r, 20));
      }

      await new Promise(r => setTimeout(r, 20));

      // Initialize logo characters
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));

      // Wave animation for logo characters
      for (let i = 0; i < logoChars.length; i++) {
        // Apply wave effect
        for (let waveSymIdx = 0; waveSymIdx < waveSymbols.length; waveSymIdx++) {
          const easedProgress = waveEasing(waveSymIdx / (waveSymbols.length - 1));
          const colorIdx = Math.floor(easedProgress * (waveGradient.length - 1));
          
          logoChars[i].symbol = waveSymbols[waveSymIdx];
          logoChars[i].color = waveGradient[colorIdx];
          logoChars = [...logoChars];
          
          await new Promise(r => setTimeout(r, 20));
        }

        // Transition to final color with gradient steps
        for (let step = 0; step < finalGradient.length; step++) {
          logoChars[i].symbol = logoChars[i].final;
          logoChars[i].color = finalGradient[step];
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 10));
        }

        await new Promise(r => setTimeout(r, 20));
      }

      await new Promise(r => setTimeout(r, 15));

      // Type suffix with wave effect
      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 15));
      }

      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Waves animation failed:', error);
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  async function animateMatrixLogo() {
    try {
      const matrixSymbols = ['2', '5', '9', '8', 'Z', '*', ')', ':', '.', '"', '=', '+', '-'];
      
      characterLines = [];
      characterLineColors = [];
      
      // Animated reveal of character lines with matrix effect
      for (let i = 0; i < swarmCharacterLines.length; i++) {
        let matrixLine = '';
        const targetLine = swarmCharacterLines[i];
        
        // Start with random matrix symbols
        for (let j = 0; j < targetLine.length; j++) {
          if (targetLine[j] === ' ') {
            matrixLine += ' ';
          } else {
            matrixLine += matrixSymbols[Math.floor(Math.random() * matrixSymbols.length)];
          }
        }
        
        characterLines = [...characterLines, matrixLine];
        characterLineColors = [...characterLineColors, randomColor()];
        await new Promise(r => setTimeout(r, 20));
        
        // Fast symbol cycling phase
        for (let cycle = 0; cycle < 6; cycle++) {
          let cycleLine = '';
          for (let j = 0; j < targetLine.length; j++) {
            if (targetLine[j] === ' ') {
              cycleLine += ' ';
            } else {
              cycleLine += matrixSymbols[Math.floor(Math.random() * matrixSymbols.length)];
            }
          }
          characterLines[i] = cycleLine;
          characterLineColors[i] = randomColor();
          characterLines = [...characterLines];
          characterLineColors = [...characterLineColors];
          await new Promise(r => setTimeout(r, 15));
        }
        
        // Reveal to final
        characterLines[i] = targetLine;
        characterLineColors[i] = finalColor;
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
      }
      
      await new Promise(r => setTimeout(r, 20));
      
      // Initialize logo characters
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));
      
      // Matrix-style character reveal
      for (let i = 0; i < logoChars.length; i++) {
        // Cycle through matrix symbols
        for (let cycle = 0; cycle < 5; cycle++) {
          logoChars[i].symbol = matrixSymbols[Math.floor(Math.random() * matrixSymbols.length)];
          logoChars[i].color = randomColor();
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 25));
        }
        
        // Resolve to final character
        logoChars[i].symbol = logoChars[i].final;
        logoChars[i].color = finalColor;
        logoChars[i].phase = 'resolved';
        logoChars = [...logoChars];
        await new Promise(r => setTimeout(r, 25));
      }
      
      await new Promise(r => setTimeout(r, 15));
      
      // Type suffix
      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 15));
      }
      
      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Matrix animation failed:', error);
      // Fallback to static display
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  // SMOKE animation - smoke floods screen then reveals text
  async function animateSmokeLogo() {
    try {
      const smokeSymbols = ['░', '▒', '▓', '▒', '░'];
      const smokeColors = ['#242424', '#4a4a4a', '#7a7a7a', '#aaaaaa', '#ffffff'];
      const finalGradient = buildGradient([finalColor], 12);
      
      // Create full-screen smoke particles
      showRainBackground = true;
      let smokeParticles = [];
      let particleId = 0;
      
      // Initialize smoke particles spreading from center
      const centerX = 50;
      const centerY = 50;
      
      for (let i = 0; i < 100; i++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = Math.random() * 10;
        smokeParticles.push({
          id: particleId++,
          x: centerX + Math.cos(angle) * distance,
          y: centerY + Math.sin(angle) * distance,
          vx: Math.cos(angle) * (0.5 + Math.random() * 1.5),
          vy: Math.sin(angle) * (0.5 + Math.random() * 1.5),
          symbol: smokeSymbols[Math.floor(Math.random() * smokeSymbols.length)],
          color: smokeColors[Math.floor(Math.random() * smokeColors.length)]
        });
      }
      
      // Expand smoke outward
      for (let frame = 0; frame < 40; frame++) {
        smokeParticles = smokeParticles.map(p => ({
          ...p,
          x: p.x + p.vx,
          y: p.y + p.vy,
          symbol: smokeSymbols[Math.floor(Math.random() * smokeSymbols.length)],
          color: smokeColors[Math.min(Math.floor(frame / 8), smokeColors.length - 1)]
        }));
        
        // Add more particles
        if (frame < 20) {
          const angle = Math.random() * Math.PI * 2;
          smokeParticles.push({
            id: particleId++,
            x: centerX,
            y: centerY,
            vx: Math.cos(angle) * (0.5 + Math.random() * 1.5),
            vy: Math.sin(angle) * (0.5 + Math.random() * 1.5),
            symbol: smokeSymbols[0],
            color: smokeColors[0]
          });
        }
        
        rainDrops = smokeParticles.filter(p => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100);
        await new Promise(r => setTimeout(r, 20));
      }
      
      // Fade smoke while revealing ASCII
      characterLines = [];
      characterLineColors = [];
      
      for (let i = 0; i < swarmCharacterLines.length; i++) {
        characterLines = [...characterLines, swarmCharacterLines[i]];
        characterLineColors = [...characterLineColors, smokeColors[smokeColors.length - 1]];
        
        // Fade some smoke
        smokeParticles = smokeParticles.slice(0, Math.max(0, smokeParticles.length - 5));
        rainDrops = smokeParticles;
        
        await new Promise(r => setTimeout(r, 12));
      }
      
      // Transition to final colors
      for (let i = 0; i < characterLineColors.length; i++) {
        characterLineColors[i] = finalColor;
      }
      characterLineColors = [...characterLineColors];
      
      showRainBackground = false;
      rainDrops = [];
      
      await new Promise(r => setTimeout(r, 60));
      
      // Logo
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: randomColor(),
        final: char,
        phase: 'hidden',
        index: i
      }));
      
      for (let i = 0; i < logoChars.length; i++) {
        for (let s = 0; s < smokeSymbols.length; s++) {
          logoChars[i].symbol = smokeSymbols[s];
          logoChars[i].color = smokeColors[s];
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 8));
        }
        logoChars[i].symbol = logoChars[i].final;
        logoChars[i].color = finalColor;
        logoChars[i].phase = 'resolved';
        logoChars = [...logoChars];
        await new Promise(r => setTimeout(r, 15));
      }
      
      await new Promise(r => setTimeout(r, 30));
      
      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 20));
      }
      
      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Smoke animation failed:', error);
      showRainBackground = false;
      rainDrops = [];
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  // SWEEP animation - sweep across screen, then reveal ASCII in gray, then colorize
  async function animateSweepLogo() {
    try {
      const sweepSymbols = ['█', '▓', '▒', '░'];
      const grayShades = ['#a0a0a0', '#808080', '#404040', '#202020', '#101010'];
      const colorGradient = buildGradient([...cipherColors, finalColor], 8);
      
      const totalLines = swarmCharacterLines.length;
      
      // Eased stepping
      const inOutCirc = (t) => {
        return t < 0.5
          ? (1 - Math.sqrt(1 - Math.pow(2 * t, 2))) / 2
          : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2;
      };
      
      // Phase 1: First sweep RIGHT TO LEFT - just shows sweep shimmer (no ASCII yet)
      characterLines = swarmCharacterLines.map(() => '');
      characterLineColors = swarmCharacterLines.map(() => '#000000');
      
      for (let step = 0; step <= 100; step += 3) {
        const progress = inOutCirc(step / 100);
        const sweepLine = Math.floor(progress * totalLines);
        
        for (let i = 0; i < totalLines; i++) {
          if (i === sweepLine || i === sweepLine - 1 || i === sweepLine - 2) {
            // Sweep shimmer - thick 3-line sweep
            const shimmerIdx = (step + i) % sweepSymbols.length;
            characterLineColors[i] = grayShades[shimmerIdx % grayShades.length];
          } else if (i < sweepLine - 2) {
            // Behind sweep - dark
            characterLineColors[i] = '#101010';
          }
        }
        characterLineColors = [...characterLineColors];
        await new Promise(r => setTimeout(r, 8));
      }
      
      await new Promise(r => setTimeout(r, 40));
      
      // Phase 2: Reveal ASCII in gray with sweep LEFT TO RIGHT
      characterLines = swarmCharacterLines.map(() => '');
      
      for (let step = 0; step <= 100; step += 3) {
        const progress = inOutCirc(step / 100);
        const revealUpTo = Math.floor(progress * totalLines);
        
        for (let i = 0; i < totalLines; i++) {
          if (i < revealUpTo) {
            characterLines[i] = swarmCharacterLines[i];
            characterLineColors[i] = '#808080';
          } else if (i === revealUpTo || i === revealUpTo + 1 || i === revealUpTo + 2) {
            // Sweep shimmer
            characterLines[i] = swarmCharacterLines[i];
            const shimmerIdx = (step + i) % sweepSymbols.length;
            characterLineColors[i] = grayShades[shimmerIdx % grayShades.length];
          }
        }
        characterLines = [...characterLines];
        characterLineColors = [...characterLineColors];
        await new Promise(r => setTimeout(r, 8));
      }
      
      // Ensure all revealed in gray
      characterLines = [...swarmCharacterLines];
      characterLineColors = swarmCharacterLines.map(() => '#808080');
      
      await new Promise(r => setTimeout(r, 40));
      
      // Phase 3: Colorize sweep RIGHT TO LEFT
      for (let step = 0; step <= 100; step += 3) {
        const progress = inOutCirc(step / 100);
        const colorUpTo = Math.floor(progress * totalLines);
        
        for (let i = totalLines - 1; i >= 0; i--) {
          const reverseIdx = totalLines - 1 - i;
          if (reverseIdx < colorUpTo) {
            characterLineColors[i] = finalColor;
          } else if (reverseIdx === colorUpTo || reverseIdx === colorUpTo + 1 || reverseIdx === colorUpTo + 2) {
            // Sweep shimmer
            const shimmerIdx = (step + i) % colorGradient.length;
            characterLineColors[i] = colorGradient[shimmerIdx];
          }
        }
        characterLineColors = [...characterLineColors];
        await new Promise(r => setTimeout(r, 8));
      }
      
      characterLineColors = swarmCharacterLines.map(() => finalColor);
      
      await new Promise(r => setTimeout(r, 40));
      
      // Logo sweep
      logoChars = targetText.split('').map((char, i) => ({
        symbol: ' ',
        color: '#808080',
        final: char,
        phase: 'hidden',
        index: i
      }));
      
      // First pass - reveal in gray
      for (let i = 0; i < logoChars.length; i++) {
        for (let s = 0; s < sweepSymbols.length; s++) {
          logoChars[i].symbol = sweepSymbols[s];
          logoChars[i].color = grayShades[s % grayShades.length];
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 5));
        }
        logoChars[i].symbol = logoChars[i].final;
        logoChars[i].color = '#808080';
        logoChars = [...logoChars];
      }
      
      await new Promise(r => setTimeout(r, 20));
      
      // Second pass - colorize
      for (let i = logoChars.length - 1; i >= 0; i--) {
        for (let s = 0; s < sweepSymbols.length; s++) {
          logoChars[i].symbol = sweepSymbols[s];
          logoChars[i].color = colorGradient[s % colorGradient.length];
          logoChars = [...logoChars];
          await new Promise(r => setTimeout(r, 5));
        }
        logoChars[i].symbol = logoChars[i].final;
        logoChars[i].color = finalColor;
        logoChars[i].phase = 'resolved';
        logoChars = [...logoChars];
      }
      
      await new Promise(r => setTimeout(r, 20));
      
      for (let i = 0; i <= targetSuffix.length; i++) {
        suffixText = targetSuffix.slice(0, i);
        await new Promise(r => setTimeout(r, 15));
      }
      
      await new Promise(r => setTimeout(r, 15));
      startGlowEffect();
      showContent = true;
    } catch (error) {
      console.error('Sweep animation failed:', error);
      characterLines = swarmCharacterLinesFallback;
      characterLineColors = swarmCharacterLinesFallback.map(() => finalColor);
      logoChars = targetText.split('').map((char, i) => ({
        symbol: char,
        color: finalColor,
        final: char,
        phase: 'resolved',
        index: i
      }));
      suffixText = targetSuffix;
      startGlowEffect();
      showContent = true;
    }
  }

  onMount(async () => {
    // Select random color palette and animation for this startup
    let selectedPalette;
    let animationType;
    
    if (shouldForceRain) {
      // 15% chance to force rain animation
      selectedPalette = rainPalette;
      animationType = 'rain';
    } else {
      // Random animation (excluding rain)
      const animations = ['decrypt', 'matrix', 'glitch', 'waves', 'sweep'];
      animationType = animations[Math.floor(Math.random() * animations.length)];
      
      // Random color palette from vibrant colors
      selectedPalette = getRandomPalette();
    }
    
    cipherColors = selectedPalette.cipher;
    finalColor = selectedPalette.final;
    selectedAnimation = animationType;
    
    // Start appropriate logo animation based on selected animation
    switch (selectedAnimation) {
      case 'matrix':
        animateMatrixLogo();
        break;
      case 'waves':
        animateWavesLogo();
        break;
      case 'glitch':
        animateGlitchLogo();
        break;
      case 'slide':
        animateSlideLogo();
        break;
      case 'expand':
        animateExpandLogo();
        break;
      case 'rain':
        animateRainLogo();
        break;
      case 'smoke':
        animateSmokeLogo();
        break;
      case 'sweep':
        animateSweepLogo();
        break;
      default:
        animateLogo(); // decrypt
    }
    
    if (window.electronAPI) {
      recentProjects = await window.electronAPI.getRecentProjects();
      lastSession = await window.electronAPI.workspaceGetLastSession();
      
      const savedSSH = await window.electronAPI.sshGetConnections();
      if (savedSSH && savedSSH.length > 0) {
        sshStore.setConnections(savedSSH);
      }
    }
  });

  function formatRelativeTime(dateString) {
    const date = new Date(dateString);
    const now = Date.now();
    const diff = now - date.getTime();
    const minutes = Math.floor(diff / 1000 / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }

  async function handleOpenProject() {
    if (!window.electronAPI) return;
    const project = await window.electronAPI.openFolder();
    if (project) {
      appStore.setCurrentProject(project);
    }
  }

  function handleOpenRecent(project) {
    appStore.setCurrentProject(project);
  }

  async function handleRestoreSession() {
    if (!window.electronAPI) return;
    
    const restoredWorkspaces = await window.electronAPI.workspaceRestoreSession();
    if (restoredWorkspaces && restoredWorkspaces.length > 0) {
      workspaceStore.setWorkspaces(restoredWorkspaces);
      workspaceStore.setActiveWorkspace(restoredWorkspaces[0].id);
      
      const firstWorkspace = restoredWorkspaces[0];
      const folderName = firstWorkspace.path.split(/[\\/]/).pop();
      appStore.setCurrentProject({
        path: firstWorkspace.path,
        name: folderName,
        lastOpened: new Date().toISOString(),
      });
    }
  }

  async function handleQuickConnect(connection) {
    showSSHConnectionsMenu = false;
    
    let credentials = connection.credentials;
    
    if (!credentials || (!credentials.password && !credentials.privateKey)) {
      showSSHDialog = true;
      return;
    }
    
    try {
      const testResult = await window.electronAPI.sshTestConnection(connection, credentials);
      
      if (!testResult.success) {
        alert(`SSH connection failed: ${testResult.error}`);
        return;
      }
    } catch (err) {
      alert(`Failed to test SSH connection: ${err.message}`);
      return;
    }
    
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const sshPath = `ssh://${connection.username}@${connection.host}:${connection.port}`;
    
    let existingWorkspace = null;
    const unsubscribe = workspaceStore.subscribe(state => {
      existingWorkspace = state.workspaces.find(w => w.path === sshPath);
    });
    unsubscribe();
    
    if (existingWorkspace) {
      workspaceStore.updateWorkspace(existingWorkspace.id, {
        isSSH: true,
        sshConnection: connection,
        color: '#ff9500'
      });
      
      workspaceStore.setActiveWorkspace(existingWorkspace.id);
      
      if (credentials && window.electronAPI) {
        await window.electronAPI.sshSetTempCredentials({
          workspaceId: existingWorkspace.id,
          credentials
        });
      }
      return;
    }
    
    const workspace = {
      id: workspaceId,
      path: sshPath,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    appStore.setCurrentProject({
      path: workspace.path,
      name: connection.name,
      lastOpened: new Date().toISOString(),
      isSSH: true
    });
    
    if (credentials && window.electronAPI) {
      await window.electronAPI.sshSetTempCredentials({
        workspaceId,
        credentials
      });
    }
    
    const dummyTerminalId = `terminal-${Date.now()}`;
    try {
      const result = await window.electronAPI.sshCreateTerminal({
        terminalId: dummyTerminalId,
        connection: connection,
        credentials: credentials,
        workspaceId: workspaceId
      });
      
      if (result.success) {
        await window.electronAPI.sshKill({ terminalId: dummyTerminalId });
      }
    } catch (err) {
      console.error('[WelcomeScreen] Error establishing SSH connection:', err);
    }
  }

  function handleNewSSHConnection() {
    editingConnection = null;
    showSSHDialog = true;
  }

  function handleEditConnection(connection, event) {
    event.stopPropagation();
    showSSHConnectionsMenu = false;
    editingConnection = connection;
    showSSHDialog = true;
  }

  async function handleRemoveConnection(id, event) {
    event.stopPropagation();
    if (!confirm('Delete this SSH connection?')) return;
    
    if (window.electronAPI) {
      await window.electronAPI.sshRemoveConnection(id);
    }
    sshStore.removeConnection(id);
  }

  function handleDialogClose() {
    showSSHDialog = false;
    editingConnection = null;
  }

  async function handleSSHConnect(event) {
    const { connection, tempCredentials } = event.detail;
    
    const workspaceId = `ssh-${connection.id}-${Date.now()}`;
    const workspace = {
      id: workspaceId,
      path: `ssh://${connection.username}@${connection.host}:${connection.port}`,
      color: '#ff9500',
      isSSH: true,
      sshConnection: connection
    };
    
    workspaceStore.addWorkspace(workspace);
    workspaceStore.setActiveWorkspace(workspaceId);
    
    appStore.setCurrentProject({
      path: workspace.path,
      name: connection.name,
      lastOpened: new Date().toISOString(),
      isSSH: true
    });
    
    const credentialsToStore = tempCredentials || connection.credentials;
    if (credentialsToStore && window.electronAPI) {
      await window.electronAPI.sshSetTempCredentials({
        workspaceId,
        credentials: credentialsToStore
      });
    }
  }
</script>

{#if showRainBackground}
  <div class="rain-background">
    <div class="rain-container">
      {#each rainDrops as drop (drop.id)}
        <div 
          class="rain-drop" 
          style="left: {drop.x}%; top: {drop.y}%; color: {drop.color};"
        >
          {drop.symbol}
        </div>
      {/each}
    </div>
  </div>
{/if}

<div class="welcome-container" class:rain-active={showRainBackground}>
  <div class="welcome-content">
    <!-- Compact Header -->
    <header class="header">
      {#if characterLines.length > 0}
        <pre class="swarm-character">{#each characterLines as line, i}<span style="color: {characterLineColors[i]}">{line}</span>{'\n'}{/each}</pre>
      {/if}
      <div class="logo">
        <span class="logo-text">{#each logoChars as char}<span style="color: {char.color}">{char.symbol}</span>{/each}<span class="logo-suffix">{suffixText}</span></span>
      </div>
    </header>

    <!-- Start Section - Card Grid -->
    <section class="section" class:visible={showContent}>
      <h2 class="section-title">Start</h2>
      <div class="action-grid">
        <button class="action-card" on:click={handleOpenProject}>
          <div class="card-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
            </svg>
          </div>
          <div class="card-content">
            <span class="card-title">Open Folder</span>
            <span class="card-desc">Browse local projects</span>
          </div>
        </button>

        <button class="action-card" on:click={() => showSSHConnectionsMenu = true}>
          <div class="card-icon ssh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <div class="card-content">
            <span class="card-title">SSH Remote</span>
            <span class="card-desc">Connect to server</span>
          </div>
        </button>

        {#if lastSession && lastSession.workspaces && lastSession.workspaces.length > 0}
          <button class="action-card" on:click={handleRestoreSession}>
            <div class="card-icon restore">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            </div>
            <div class="card-content">
              <span class="card-title">Restore Session</span>
              <span class="card-desc">{lastSession.workspaces.length} workspace{lastSession.workspaces.length > 1 ? 's' : ''}</span>
            </div>
          </button>
        {/if}
      </div>
    </section>

    <!-- Recent Projects Section -->
    {#if recentProjects.length > 0}
      <section class="section" class:visible={showContent}>
        <h2 class="section-title">Recent</h2>
        <div class="recent-grid">
          {#each recentProjects.slice(0, 6) as project}
            <button class="recent-card" on:click={() => handleOpenRecent(project)}>
              <div class="recent-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
                </svg>
              </div>
              <div class="recent-info">
                <span class="recent-name">{project.name}</span>
                <span class="recent-time">{formatRelativeTime(project.lastOpened)}</span>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Footer -->
    <footer class="footer" class:visible={showContent}>
      <span class="shortcut"><kbd>⌘</kbd><kbd>O</kbd> Open</span>
      <span class="shortcut"><kbd>⌘</kbd><kbd>⇧</kbd><kbd>P</kbd> Commands</span>
    </footer>
  </div>
</div>

{#if showSSHConnectionsMenu}
  <div class="ssh-menu-overlay" on:click={() => showSSHConnectionsMenu = false}>
    <div class="ssh-menu-container" on:click|stopPropagation>
      <div class="ssh-menu-header">
        <h2>SSH Connections</h2>
        <button class="close-btn" on:click={() => showSSHConnectionsMenu = false}>×</button>
      </div>

      <div class="ssh-menu-content">
        {#if $sshStore.connections.length > 0}
          <div class="connections-section">
            <h3 class="section-label">Saved Connections</h3>
            <div class="connections-list">
              {#each $sshStore.connections as connection}
                <div class="connection-item">
                  <button class="connection-button" on:click={() => {
                    handleQuickConnect(connection);
                    showSSHConnectionsMenu = false;
                  }}>
                    <div class="connection-info">
                      <span class="connection-name">{connection.name}</span>
                      <span class="connection-meta">{connection.username}@{connection.host}:{connection.port}</span>
                    </div>
                    <span class="connection-arrow">→</span>
                  </button>
                  <div class="connection-actions">
                    <button class="icon-btn edit-btn" on:click={(e) => {
                      e.stopPropagation();
                      handleEditConnection(connection, e);
                      showSSHConnectionsMenu = false;
                    }} title="Edit">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                      </svg>
                    </button>
                    <button class="icon-btn delete-btn" on:click={(e) => {
                      e.stopPropagation();
                      handleRemoveConnection(connection.id, e);
                    }} title="Delete">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                      </svg>
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <div class="new-connection-section">
          <button class="new-connection-btn" on:click={() => {
            showSSHConnectionsMenu = false;
            handleNewSSHConnection();
          }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            <span>New Connection</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<SSHConnectionDialog 
  bind:show={showSSHDialog}
  editConnection={editingConnection}
  on:connect={handleSSHConnect}
  on:update={handleDialogClose}
  on:close={handleDialogClose}
/>

<style>
  /* Animations */
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

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  @keyframes scaleIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  .welcome-container {
    width: 100%;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-background);
    padding: var(--spacing-lg);
  }

  .welcome-content {
    max-width: 520px;
    width: 100%;
    animation: fadeIn 400ms ease-out;
  }

  /* Header */
  .header {
    text-align: center;
    margin-bottom: var(--spacing-xl);
    position: relative;
  }

  .swarm-character {
    font-family: var(--font-family-mono);
    font-size: 14px;
    line-height: 1.1;
    letter-spacing: 0;
    white-space: pre;
    margin: 0 0 var(--spacing-md) 0;
    animation: fadeInUp 400ms ease-out;
    transition: color 100ms ease;
    /* Improve Unicode character rendering */
    font-variant-ligatures: none;
    font-feature-settings: normal;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  .logo {
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
    transition: color 80ms ease;
  }

  .logo-suffix {
    color: var(--color-accent);
    font-weight: 400;
  }

  /* Sections */
  .section {
    margin-bottom: var(--spacing-lg);
    opacity: 0;
    transform: translateY(12px);
    transition: all 400ms ease-out;
  }

  .section.visible {
    opacity: 1;
    transform: translateY(0);
  }

  .section:nth-child(2) {
    transition-delay: 50ms;
  }

  .section:nth-child(3) {
    transition-delay: 100ms;
  }

  .section-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-tertiary);
    margin-bottom: var(--spacing-sm);
    padding-left: var(--spacing-xs);
  }

  /* Action Grid */
  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: var(--spacing-sm);
  }


  .action-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    width: 100%;
    padding: var(--spacing-md);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all 150ms ease;
    text-align: left;
  }

  .action-card:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .action-card:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .card-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-accent);
    border-radius: var(--radius-sm);
    color: white;
  }

  .card-icon.ssh {
    background: #ff9500;
  }

  .card-icon.restore {
    background: #30d158;
  }

  .card-icon svg {
    width: 18px;
    height: 18px;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .card-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-desc {
    font-size: 11px;
    color: var(--color-text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* SSH Menu */
  .ssh-menu-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    backdrop-filter: blur(4px);
  }

  .ssh-menu-container {
    background: var(--color-surface);
    border-radius: var(--radius-lg);
    width: 90%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: var(--shadow-lg);
    border: 1px solid var(--color-border);
    animation: scaleIn 200ms ease-out;
  }

  .ssh-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--color-border);
  }

  .ssh-menu-header h2 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
    margin: 0;
  }

  .ssh-menu-header .close-btn {
    background: none;
    border: none;
    color: var(--color-text-secondary);
    font-size: 32px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-sm);
    transition: all var(--transition-fast);
  }

  .ssh-menu-header .close-btn:hover {
    background: var(--color-surface-hover);
    color: var(--color-text-primary);
  }

  .ssh-menu-content {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
  }

  .connections-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
  }

  .section-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-tertiary);
    margin: 0 0 var(--spacing-sm) 0;
  }

  .connections-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
  }

  .connection-item {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: var(--color-background);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    transition: all 100ms ease;
  }

  .connection-item:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border-secondary);
  }

  .connection-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
  }

  .connection-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .connection-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .connection-meta {
    font-size: 11px;
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  .connection-arrow {
    color: var(--color-text-tertiary);
    transition: color 100ms ease;
  }

  .connection-button:hover .connection-arrow {
    color: var(--color-accent);
  }

  .connection-actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    padding: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 100ms ease;
  }

  .icon-btn svg {
    width: 14px;
    height: 14px;
  }

  .icon-btn.edit-btn:hover {
    background: rgba(0, 113, 227, 0.1);
    color: var(--color-accent);
  }

  .icon-btn.delete-btn:hover {
    background: rgba(255, 59, 48, 0.1);
    color: #ff3b30;
  }

  .new-connection-section {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm);
    padding-top: var(--spacing-sm);
    border-top: 1px solid var(--color-border);
  }

  .new-connection-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-md);
    background: var(--color-accent);
    border: none;
    border-radius: var(--radius-md);
    color: white;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .new-connection-btn:hover {
    background: var(--color-accent-hover);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 113, 227, 0.2);
  }

  .new-connection-btn svg {
    width: 16px;
    height: 16px;
  }

  /* Recent Grid */
  .recent-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-xs);
  }

  .recent-card {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm);
    padding: var(--spacing-sm);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all 100ms ease;
    text-align: left;
  }

  .recent-card:hover {
    background: var(--color-surface-hover);
    border-color: var(--color-border);
  }

  .recent-card:active {
    transform: scale(0.98);
  }

  .recent-icon {
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--color-text-tertiary);
  }

  .recent-icon svg {
    width: 16px;
    height: 16px;
  }

  .recent-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1;
  }

  .recent-name {
    font-size: 12px;
    font-weight: 500;
    color: var(--color-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .recent-time {
    font-size: 10px;
    color: var(--color-text-tertiary);
  }

  /* Footer */
  .footer {
    display: flex;
    justify-content: center;
    gap: var(--spacing-lg);
    padding-top: var(--spacing-lg);
    border-top: 1px solid var(--color-border);
    opacity: 0;
    transition: opacity 400ms ease-out;
    transition-delay: 150ms;
  }

  .footer.visible {
    opacity: 1;
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 3px;
    font-family: var(--font-family-mono);
    font-size: 10px;
  }

  /* Rain background effect */
  .rain-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 1;
  }

  .rain-container {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .rain-drop {
    position: absolute;
    font-family: var(--font-family-mono);
    font-size: 16px;
    font-weight: bold;
    opacity: 0.9;
    transition: none;
    text-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
    white-space: nowrap;
    will-change: top, left;
  }

  .welcome-container {
    position: relative;
    z-index: 10;
  }

  .welcome-container.rain-active {
    background: transparent;
  }

  .welcome-container.rain-active .welcome-content {
    background: transparent;
  }
</style>
