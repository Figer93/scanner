/**
 * Vite config for single-file HTML export.
 * Run: npm run build:single (from ui/) or npm run export:html (from root)
 * Output: one self-contained index.html with all JS/CSS inlined.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'export',
    emptyOutDir: true,
  },
})
