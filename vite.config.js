import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  build: {
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/three/')) return 'vendor-three';
          if (id.includes('livekit-client')) return 'vendor-livekit';
          if (id.includes('@elevenlabs')) return 'vendor-elevenlabs';
          if (id.includes('lucide')) return 'vendor-icons';
          if (id.includes('/svelte/')) return 'vendor-svelte';
          return 'vendor-misc';
        }
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true
      }
    }
  }
});
