import { defineConfig } from 'vite'
import path from 'node:path'

// Builds the Chrome extension's content script as a self-contained IIFE
// bundle at extension/dist/rstudio.js — the file manifest.json's
// content_scripts entry points at. No HTML entry point: a content script
// isn't a page, it's injected into one (see manifest.json).
//
// ONE build, same reasoning as Ninebark-MATLABExtension's vite.config.ts
// (not the two-`--mode` shape Ninebark-SheetsExtension uses for its OAuth
// background worker): this extension has no background worker — the
// content script runs on the RStudio host itself (Posit Cloud / RStudio
// Server / Posit Workbench), so a same-origin request to that host's own
// `rpc/` endpoints already carries the logged-in session (see
// EXECUTION.md §5). If the live checks in EXECUTION.md §6 turn up a need
// for a MAIN-world bridge (to read the page's own clientId), add it here
// as a second `--mode` entry the same way Sheets does for `background` —
// until then, one isolated-world bundle is all this is.
//
// assetsInlineLimit is forced high so the Ninebark logo (imported as a
// plain asset by rstudio.ts) gets inlined as a base64 data URI directly
// into rstudio.js, rather than emitted as a separate asset file — a Chrome
// extension has no server to serve a separate hashed asset from.
export default defineConfig({
  resolve: {
    alias: {
      '@ninebark': path.resolve(__dirname, 'src/vendor/ninebark-engine/ninebark-nl'),
    },
  },
  publicDir: false,
  build: {
    outDir: 'extension/dist',
    assetsInlineLimit: 100_000_000,
    lib: {
      entry: path.resolve(__dirname, 'extension/src/rstudio.ts'),
      formats: ['iife'],
      name: 'NinebarkRStudio',
      fileName: () => 'rstudio.js',
    },
  },
})
