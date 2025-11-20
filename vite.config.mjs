import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: './',
  server: {
    port: 5173
  },
  optimizeDeps: {
    exclude: ['monaco-editor']
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    emptyOutDir: true,
    copyPublicDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          monaco: ['monaco-editor'],
          'mermaid': ['mermaid'],
          'tiptap': ['@tiptap/core', '@tiptap/starter-kit'],
        }
      }
    }
  }
});
