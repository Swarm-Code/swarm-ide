<script>
  import { onMount } from 'svelte';
  import { appStore } from '../stores/appStore.js';
  import { outputStore } from '../stores/outputStore.js';
  import { getIconPath, getFolderIconPath, getDefaultIconPath } from '../utils/iconTheme.js';

  export let name = '';
  export let isFolder = false;
  export let size = '16px';
  export let title = '';

  let currentTheme = 'material';
  let iconPath = '';

  appStore.subscribe((state) => {
    currentTheme = state.iconTheme;
    outputStore.addLog(`Theme changed to: ${currentTheme}`, 'log', 'icon-debug');
    updateIconPath();
  });

  function updateIconPath() {
    if (isFolder) {
      iconPath = getFolderIconPath(currentTheme, name);
    } else {
      iconPath = getIconPath(currentTheme, name);
    }
    outputStore.addLog(`📍 "${name}" (isFolder=${isFolder}) → Path: ${iconPath}`, 'log', 'icon-debug');
  }

  $: if (name || isFolder) {
    updateIconPath();
  }

  onMount(() => {
    outputStore.addLog(`🚀 IconRenderer mounted: name="${name}", isFolder=${isFolder}, size=${size}`, 'log', 'icon-debug');
  });
</script>

{#if iconPath}
  <img
    src={iconPath}
    alt={title || name}
    class="icon-renderer"
    style="width: {size}; height: {size};"
    on:load={() => {
      outputStore.addLog(`✅ Icon loaded: ${iconPath}`, 'log', 'icon-debug');
    }}
    on:error={(e) => {
      outputStore.addLog(`❌ Failed to load: ${iconPath}`, 'error', 'icon-debug');
      const fallbackPath = getDefaultIconPath(currentTheme, isFolder);
      outputStore.addLog(`🔄 Using fallback: ${fallbackPath}`, 'warn', 'icon-debug');
      iconPath = fallbackPath;
    }}
  />
{:else}
  <div class="icon-placeholder" style="width: {size}; height: {size};">
    <span style="font-size: 10px; color: red;">?</span>
  </div>
{/if}

<style>
  .icon-renderer {
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
    flex-shrink: 0;
  }

  .icon-placeholder {
    display: inline-block;
    background: var(--color-surface-hover);
    border-radius: 2px;
    flex-shrink: 0;
  }
</style>
