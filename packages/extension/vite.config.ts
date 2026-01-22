import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import webExtension from 'vite-plugin-web-extension';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    react(),
    webExtension({
      manifest: 'manifest.json',
      watchFilePaths: ['manifest.json'],
      browser: 'chromium',
      webExtConfig: {
        chromiumBinary: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@mcp/types': resolve(__dirname, '../../mcp-server/src/api-types.ts'),
    },
  },
  base: '',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
