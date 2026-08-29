import path from 'node:path'

import legacy from '@vitejs/plugin-legacy'
import react from '@vitejs/plugin-react'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import svgr from 'vite-plugin-svgr'

const repoRoot = path.resolve(import.meta.dirname, '..')

export default defineConfig({
  root: path.join(repoRoot, 'src'),
  server: { port: 3000 },
  plugins: [
    svgr(),
    vue(),
    react(),
    legacy({
      modernTargets: ['edge>=109', 'safari>=14'],
      renderLegacyChunks: false,
      modernPolyfills: ['es.object.has-own', 'web.structured-clone'],
      additionalModernPolyfills: [
        path.join(repoRoot, 'src/polyfills/matchMedia.js'),
        path.join(repoRoot, 'src/polyfills/WeakRef.js'),
        path.join(repoRoot, 'src/polyfills/RegExp.js'),
      ],
    }),
  ],
  build: {
    outDir: path.join(repoRoot, 'dist'),
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
  },
  resolve: {
    alias: {
      '@': path.join(repoRoot, 'src'),
      '@root': repoRoot,
      'monaco-editor/esm/vs/editor/editor.worker.js':
        'monaco-editor/editor/editor.worker',
    },
  },
  define: {
    OS_PLATFORM: `"${process.platform}"`,
  },
})
