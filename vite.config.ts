import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
export default defineConfig({
  base: './',
  plugins: [react()],
  optimizeDeps: {
    include: [
      'pdf-lib',
      '@pdf-lib/fontkit',
      'docx',
      'exceljs',
      'fflate',
      '@xmldom/xmldom',
      'tesseract.js',
      'idb',
      'lucide-react',
    ],
  },
  build: {
    target: 'chrome131',
    sourcemap: false,
    rollupOptions: {
      input: {
        editor: resolve('editor.html'),
        popup: resolve('popup.html'),
        permissions: resolve('permissions.html'),
        background: resolve('src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
} as Parameters<typeof defineConfig>[0]);
