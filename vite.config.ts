import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv, type Plugin} from 'vite';
import {execSync} from 'child_process';

/**
 * Build identity for "new version available" notices. Each build writes /version.json and embeds the
 * same id in the bundle; open pages poll the file and offer a reload when the deployed id changes.
 * On Vercel the id is the deployed commit and the summary its pull-request title.
 */
function buildInfo() {
  const git = (cmd: string) => {
    try {
      return execSync(cmd, {stdio: ['ignore', 'pipe', 'ignore']}).toString().trim();
    } catch {
      return '';
    }
  };
  const builtAt = new Date().toISOString();
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || git('git rev-parse HEAD');
  const message = process.env.VERCEL_GIT_COMMIT_MESSAGE || git('git log -1 --format=%B');
  // "Merge pull request #12 from owner/branch" + blank line + PR title -> the PR title
  const lines = message.split(/\r?\n/).map((l) => l.trim());
  const summary = (/^Merge pull request/i.test(lines[0] || '') ? lines.slice(1).find(Boolean) : lines[0]) || '';
  return {version: sha ? `${sha.slice(0, 12)}-${builtAt}` : builtAt, builtAt, summary: summary.slice(0, 160)};
}

function versionFile(info: ReturnType<typeof buildInfo>): Plugin {
  const body = JSON.stringify(info);
  return {
    name: 'eph-version-file',
    // Dev server: answer with the running build so development never shows an update notice
    configureServer(server) {
      server.middlewares.use('/version.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(body);
      });
    },
    generateBundle() {
      this.emitFile({type: 'asset', fileName: 'version.json', source: body});
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const info = buildInfo();
  return {
    plugins: [react(), tailwindcss(), versionFile(info)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ""),
      __APP_BUILD__: JSON.stringify(info),
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
