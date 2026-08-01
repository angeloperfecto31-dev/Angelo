import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ""),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      minify: 'esbuild',
      cssMinify: true,
      sourcemap: false,
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        external: [
          'three',
          'three/examples/jsm/controls/OrbitControls.js'
        ],
        maxParallelFileOps: 2,
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              const parts = id.toString().split('node_modules/');
              if (parts.length > 1) {
                const pkg = parts[1].split('/')[0];
                if (['firebase', 'docx', 'jspdf', 'xlsx', 'xlsx-js-style', 'recharts', 'lucide-react', 'pako', 'axios', 'motion'].includes(pkg)) {
                  return `vendor-${pkg}`;
                }
                return 'vendor-others';
              }
            }
          }
        }
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
