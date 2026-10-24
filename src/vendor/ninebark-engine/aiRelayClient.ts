// ── Client-side wrapper for the AI-fallback relay ───────────────────────────
// See the design plan: /Users/dylanwinning/.claude/plans/structured-inventing-codd.md §4.
//
// Deliberately NOT modeled on inputLogger.ts's fire-and-forget pattern
// (unawaited fetch, `mode:'no-cors'`, every error swallowed) — that pattern
// exists there specifically because the logging response is never read.
// This call's entire point is reading the AI's answer back, so it needs a
// real `await fetch`, real CORS (the relay sets Access-Control-Allow-Origin
// itself), an explicit Content-Type, and a timeout so a slow/hung relay
// can't leave the UI waiting forever.
//
// Shared/vendored: author here, copy into every other interface repo's
// src/vendor/ninebark-engine/, exactly like desmosNlVocab.ts is today.
import type { EscalationTier } from './escalationGate'

export type InterfaceId = 'desmos' | 'sheets' | 'overleaf' | 'matlab' | 'excel' | 'rstudio'

export type RelayResponse =
  | { ok: true; mode: 'formal'; result: string }
  | { ok: true; mode: 'raw-code'; language: string; code: string }
  | { ok: false; reason: 'budget-exceeded' | 'rate-limited' | 'provider-error' | 'rejected-gate' | 'bad-request' | 'forbidden-origin' | 'network-error' | 'timeout' }

const TIMEOUT_MS = 15_000

// Mirrors inputLogger.ts's VITE_*-env-var-for-URL pattern — the relay's URL
// is not a secret (only its API key, held server-side, is), so baking it
// into the build is fine. Unset -> AI fallback is simply disabled, same
// opt-out-by-default posture as logging.
const RELAY_URL = import.meta.env?.VITE_AI_RELAY_URL as string | undefined

export async function callAiRelay(
  input: string,
  interfaceId: InterfaceId,
  tier: EscalationTier,
  diagnosticHint?: string[],
): Promise<RelayResponse> {
  if (!RELAY_URL) return { ok: false, reason: 'network-error' }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(`${RELAY_URL}/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interfaceId, input, tier, diagnosticHint }),
      signal: controller.signal,
    })
    if (!res.ok) return { ok: false, reason: 'network-error' }
    const body = await res.json() as RelayResponse
    return body
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return { ok: false, reason: 'timeout' }
    return { ok: false, reason: 'network-error' }
  } finally {
    clearTimeout(timeoutId)
  }
}
