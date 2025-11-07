<script>
  import { onMount } from 'svelte';
  import { appStore } from './stores/appStore.js';
  import WelcomeScreen from './components/WelcomeScreen.svelte';
  import IDEWindow from './components/IDEWindow.svelte';

  let currentProject = null;

  appStore.subscribe((state) => {
    currentProject = state.currentProject;
  });
</script>

<main>
  {#if currentProject}
    <IDEWindow />
  {:else}
    <WelcomeScreen />
  {/if}
</main>

<style>
  main {
    width: 100%;
    height: 100vh;
    overflow: hidden;
  }
</style>
