import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  base: './',
  envDir: path.resolve(__dirname, '../../'), // Load .env from root
  plugins: [
    react(),
    mkcert(),
    /*
    VitePWA({
      registerType: 'autoUpdate',
      ...
    })
    */
  ],
  server: {
    https: {},
    host: '0.0.0.0',
    port: 3001,
    hmr: {
      protocol: 'wss',
      clientPort: 3001,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 3001,
  },
});
