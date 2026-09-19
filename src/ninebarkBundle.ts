// ── Ninebark R-package bundle entry point ──────────────────────────────────
// A self-contained global (`globalThis.Ninebark.resolve(text)`) exposing
// the SAME resolution pipeline the Chrome extension uses
// (resolveRPhrase.ts), for embedding inside R via the `V8` package instead
// of running in a browser tab. This is the write path for RStudio Desktop
// (and Server/Workbench/Cloud too, uniformly) via an RStudio Addin — see
// ninebark-r/README.md and the root README's "Two ways to use this" section
// for why an Addin exists alongside the Chrome extension rather than
// replacing it.
//
// Deliberately a SEPARATE build target (vite.r.config.ts, not
// vite.config.ts), not reused from the extension bundle: the extension
// entry point (extension/src/rstudio.ts) pulls in DOM-dependent code
// (rExecClient.ts, the widget) that has no meaning inside a V8 isolate with
// no `window`/`document`/`fetch` — this entry point imports ONLY the pure
// resolution pipeline, so nothing DOM-shaped is ever bundled in here.
import { resolveToRCommand, RNlFailure } from './resolveRPhrase'

export interface NinebarkResolution {
  ok: boolean
  target?: 'console' | 'source'
  code?: string
  error?: string
}

// Never throws — R's V8 call site (R/resolve.R) always gets a plain object
// back and branches on `ok`, the same fail-loud-not-silent contract every
// other Ninebark interface's resolver keeps, just carried across the R/JS
// boundary as data instead of as a thrown error (V8's exception marshalling
// to R is more awkward to consume from R than a returned object is).
function resolve(rawInput: string): NinebarkResolution {
  try {
    const cmd = resolveToRCommand(rawInput)
    return { ok: true, target: cmd.target, code: cmd.code }
  } catch (err) {
    const message = err instanceof RNlFailure || err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

;(globalThis as unknown as { Ninebark: { resolve: typeof resolve } }).Ninebark = { resolve }
