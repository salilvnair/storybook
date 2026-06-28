import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..');
const DUI_ROOT = resolve(ROOT, '../dui/src/lib');
const DUI_SRC = resolve(ROOT, '../dui/src');
const DUI_DIST = resolve(ROOT, '../dui/dist');

export default defineConfig({
  base: './',
  root: resolve(__dirname),

  resolve: {
    alias: {
      '@salilvnair/dui/monaco-setup': resolve(DUI_SRC, 'monaco-setup.ts'),
      '@salilvnair/dui/style.css': resolve(DUI_DIST, 'style.css'),
      '@salilvnair/dui/theme/core': resolve(DUI_ROOT, 'theme/core.ts'),
      '@salilvnair/dui/theme/utils': resolve(DUI_ROOT, 'theme/utils.ts'),
      '@salilvnair/dui/theme/editor': resolve(DUI_ROOT, 'theme/editor.tsx'),
      '@salilvnair/dui': resolve(DUI_ROOT, 'index.ts'),
    },
    dedupe: ['react', 'react-dom', '@monaco-editor/react', 'monaco-editor'],
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },

  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 8192,
    rollupOptions: {
      input: { index: resolve(__dirname, 'index.html') },
    },
  },

  plugins: [react(), tailwindcss()],
});
