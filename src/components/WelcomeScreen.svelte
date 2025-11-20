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
  
  // Text animation state - 1:1 tte decrypt effect
  let logoChars = [];
  let suffixText = '';
  let showContent = false;
  let characterLines = [];
  let characterLineColors = [];
  const targetText = 'SWARM';
  const targetSuffix = 'IDE';
  
  // Swarm character ASCII art - lines for animation
  const swarmCharacterLines = [
    '         ⣿⣿⣿⣿⣿⣿⣿            ⣿⣿⣿⣿⣿⣿⣿         ',
    '         ⣿⣿⣿⣿⣿⣿⣿            ⣿⣿⣿⣿⣿⣿⣿         ',
    '         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ',
    '         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ',
    '    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿         ',
    '    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿   ⣿⣿⣿⣿⣿⣿⣿   ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿   ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '         ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿   ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '         ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿   ⣿⣿⣿⣿⣿⣿          ',
    '         ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿   ⣿⣿⣿⣿⣿⣿          ',
    '         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          ',
    '         ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿          ',
    '     ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿     ',
    '    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿     ',
    '    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿     ',
    '    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿               ',
    '              ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿               ',
    '              ⣿⣿⣿⣿⣿⣿    ⣿⣿⣿⣿⣿               '
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
  
  // Ciphertext colors (green shades like tte)
  const cipherColors = ['#008000', '#00cb00', '#00ff00'];
  // Final color (orange/gold like tte default)
  const finalColor = '#eda000';

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
    
    await new Promise(r => setTimeout(r, 300));
    
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
    
    await new Promise(r => setTimeout(r, 100));
    
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
      await new Promise(r => setTimeout(r, 40));
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
      await new Promise(r => setTimeout(r, 60));
    }
    
    await new Promise(r => setTimeout(r, 200));
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
        showContent = true;
      }
    }
  }

  onMount(async () => {
    // Start logo animation
    animateLogo();
    
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

<div class="welcome-container">
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
</style>
