import { defineConfig } from 'vite'
import path from 'node:path'

// Builds src/ninebarkBundle.ts into a single self-contained script the R
// package embeds and runs inside a V8 isolate (ninebark-r/R/resolve.R does
// `V8::v8()$source(...)` on the output). Separate from vite.config.ts (the
// Chrome extension build) because the OUTPUT DIRECTORY and entry point
// differ — ninebark-r/inst/js/ is inside the R package, not
// extension/dist/ — not because the bundling approach itself differs.
//
// `npm run build:r` (defined in package.json) runs this; `npm run build`
// (plain vite build, using vite.config.ts) remains the Chrome extension
// build and is unaffected by this file.
export default defineConfig({
  resolve: {
    alias: {
      '@ninebark': path.resolve(__dirname, 'src/vendor/ninebark-engine/ninebark-nl'),
    },
  },
  publicDir: false,
  build: {
    outDir: 'ninebark-r/inst/js',
    emptyOutDir: false, // ninebark-r/inst/js has no other generated files, but this dir isn't exclusively vite's to own the way extension/dist is
    lib: {
      entry: path.resolve(__dirname, 'src/ninebarkBundle.ts'),
      formats: ['iife'],
      name: 'NinebarkBundle',
      fileName: () => 'ninebark.js',
    },
  },
})
