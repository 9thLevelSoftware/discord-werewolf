import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { copyDiceAssets } from './scripts/copyDiceAssets.mjs';

function syncDiceBoxAssetsPlugin(): Plugin {
  return {
    name: 'w20-copy-dice-box-assets',
    buildStart() {
      copyDiceAssets();
    },
  };
}

export default defineConfig({
  envDir: '../..',
  plugins: [react(), tailwindcss(), syncDiceBoxAssetsPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:8787',
        ws: true,
        changeOrigin: true,
      },
      '/r2-assets': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
