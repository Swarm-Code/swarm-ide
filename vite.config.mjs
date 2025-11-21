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
        manualChunks: (id) => {
          // Vendor chunks for better caching
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
          if (id.includes('node_modules/mermaid')) return 'mermaid';
          if (id.includes('node_modules/@tiptap')) return 'tiptap';
        }
      }
    }
  }
});
