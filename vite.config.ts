import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'EduShortVideo',
      fileName: (format) => {
        if (format === 'es') return 'index.esm.js';
        if (format === 'umd') return 'index.umd.js';
        return 'index.js';
      },
      formats: ['es', 'umd', 'iife']
    },
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      external: [],
      output: {
        globals: {}
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
