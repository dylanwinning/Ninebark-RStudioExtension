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
import { formalStringToR, UnsupportedRFormalError } from './formalToR'

export interface NinebarkResolution {
  ok: boolean
  target?: 'console' | 'source'
  code?: string
  error?: string
  // Present only when ok is false and the failure was an RNlFailure with a
  // diagnostic attached — just the two fields R's own escalationGate.R
  // needs to decide whether the AI-fallback tier is worth trying (see
  // /Users/dylanwinning/.claude/plans/structured-inventing-codd.md §2),
  // kept flat rather than nesting the full NlDiagnostic shape, since V8's
  // R marshalling is simplest to consume from R as a shallow list.
  diagnosticCategory?: string
  recognizedFeatures?: string[]
}

// Never throws — R's V8 call site (R/resolve.R) always gets a plain object
// back and branches on `ok`, the same fail-loud-not-silent contract every
// other Ninebark interface's resolver keeps, just carried across the R/JS
// boundary as data instead of as a thrown error (V8's exception marshalling
// to R is more awkward to consume from R than a returned object is).
//
// Deliberately does NOT call the AI-fallback tier itself — V8's R binding
// (ctx$call() in R/resolve.R) is synchronous with no event loop to resolve
// a Promise against, so an async network call can never happen inside this
// V8 isolate at all. The actual relay call lives in R
// (R/aiRelayClient.R), called from R/resolve.R only after THIS function
// has already returned ok:FALSE — see that file for the escalation logic
// this diagnostic data feeds.
function resolve(rawInput: string): NinebarkResolution {
  try {
    const cmd = resolveToRCommand(rawInput)
    return { ok: true, target: cmd.target, code: cmd.code }
  } catch (err) {
    const message = err instanceof RNlFailure || err instanceof Error ? err.message : String(err)
    if (err instanceof RNlFailure && err.diagnostic) {
      return {
        ok: false,
        error: message,
        diagnosticCategory: err.diagnostic.category,
        recognizedFeatures: err.diagnostic.recognized?.features,
      }
    }
    return { ok: false, error: message }
  }
}

export interface NinebarkFormalConversion {
  ok: boolean
  code?: string
  error?: string
}

// A second, narrower entry point for the AI-fallback tier's 'formal' case
// (see R/aiRelayClient.R and R/resolve.R): the relay already returns a
// formal-string translation, not natural language, so there's no NL
// pipeline left to run — just the deterministic formalStringToR()
// conversion every other tier already uses, exposed on its own so R can
// call it AFTER the (necessarily R-side, not V8-side) network round-trip
// completes. Same never-throws/ok-flag contract as resolve() above.
function convertFormal(formal: string): NinebarkFormalConversion {
  try {
    return { ok: true, code: formalStringToR(formal) }
  } catch (err) {
    const message = err instanceof UnsupportedRFormalError || err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}

;(globalThis as unknown as { Ninebark: { resolve: typeof resolve; convertFormal: typeof convertFormal } }).Ninebark =
  { resolve, convertFormal }
