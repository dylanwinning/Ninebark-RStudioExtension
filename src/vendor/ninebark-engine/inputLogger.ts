// ── Anonymous input logging ─────────────────────────────────────────────────
// Fire-and-forget collection of the raw text students type, tagged with
// WHICH INTERFACE it was typed into — not who typed it, not a session id,
// nothing else. Used to find real coverage gaps (see desmosNlVocab.ts's
// audit-driven fix history) from actual usage instead of only from guessed
// test phrasings, and — via the interface tag — to see which interface's
// vocabulary needs attention without every input landing in one undivided
// pile once more than one interface shares an endpoint.
//
// Deliberately silent about failures: if the endpoint is unset, unreachable,
// or blocked (ad blocker, offline, CORS-adjacent quirks), the app must behave
// exactly as if this file didn't exist. Never awaited, never throws, never
// shows the student anything.
//
// The endpoint URL is a deploy-time secret (like VITE_DESMOS_API_KEY) so a
// clone of this repo without one configured just silently skips logging.
const LOG_URL = import.meta.env.VITE_INPUT_LOG_URL as string | undefined

// Defensive cap — a pasted essay isn't a "natural language math command" and
// isn't worth transmitting or storing.
const MAX_LOGGED_LENGTH = 2000

// `interfaceId` is the caller's own INTERFACES registry id
// (extension/src/shared/interfaces.ts — "desmos", "sheets", "overleaf",
// "rstudio", …), passed explicitly by each content script rather than
// hardcoded here: this file is vendored unchanged across every interface
// repo and has no way to know its own identity otherwise, the same reason
// every content script already hardcodes its own id elsewhere (e.g.
// `INTERFACES.find(i => i.id === 'rstudio')`). The receiving endpoint
// (google-apps-script/Code.gs, this repo) reads it to route each row to a
// sheet tab per interface instead of one shared list.
export function logRawInput(text: string, interfaceId: string): void {
  if (!LOG_URL) return
  const trimmed = text.trim()
  if (!trimmed) return
  try {
    // mode: 'no-cors' + a plain-text body sidesteps a CORS preflight
    // entirely (the request is genuinely fire-and-forget — the response,
    // opaque under no-cors, is never read). Content-Type is deliberately
    // omitted: setting one explicitly can turn this into a "not a simple
    // request" and trigger the very preflight this is avoiding.
    void fetch(LOG_URL, {
      method: 'POST',
      mode: 'no-cors',
      body: JSON.stringify({ text: trimmed.slice(0, MAX_LOGGED_LENGTH), interface: interfaceId }),
    }).catch(() => {})
  } catch {
    // Synchronous throw from fetch() itself (rare, but e.g. some content-
    // blocker configurations do this) — swallow for the same reason as above.
  }
}
