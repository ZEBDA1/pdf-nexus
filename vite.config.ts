import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { pdfJsForChrome } from './scripts/vendor-policy.mjs';

function readableVendors() {
  return {
    name: 'readable-vendors-for-chrome',
    enforce: 'pre' as const,
    transform(source: string, id: string) {
      const path = id.replace(/\\/g, '/').split('?')[0];
      if (path.endsWith('/pdfjs-dist/legacy/build/pdf.mjs'))
        return { code: pdfJsForChrome(source), map: null };
    },
  };
}

function tesseractMv3() {
  return {
    name: 'tesseract-mv3-local-worker',
    enforce: 'pre' as const,
    transform(_: string, id: string) {
      const path = id.replace(/\\/g, '/').split('?')[0];
      if (path.endsWith('/tesseract.js/src/worker/browser/defaultOptions.js'))
        return {
          code: `module.exports = {
            logger: () => {},
            workerPath: new URL('vendor/ocr/worker.min.js', globalThis.location.href).href,
          };`,
          map: null,
        };
      if (path.endsWith('/tesseract.js/src/worker/browser/spawnWorker.js'))
        return {
          code: `module.exports = ({ workerPath }) => {
            const url = new URL(workerPath, globalThis.location.href);
            if (url.origin !== globalThis.location.origin)
              throw new Error('Le Worker OCR doit provenir du paquet PDF Nexus.');
            return new Worker(url.href);
          };`,
          map: null,
        };
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [readableVendors(), tesseractMv3(), react()],
  resolve: {
    // The default browser entry includes old core-js polyfills. The official
    // unminified bare bundle uses native browser APIs and retains XLSX support.
    alias: [
      { find: /^exceljs$/, replacement: resolve('node_modules/exceljs/dist/exceljs.bare.js') },
    ],
  },
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
    minify: false,
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
