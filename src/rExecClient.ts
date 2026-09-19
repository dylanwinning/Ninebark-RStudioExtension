// ── RStudio execution client ────────────────────────────────────────────
// The RStudio analogue of Ninebark-SheetsExtension's sheetsApiClient.ts and
// Ninebark-MATLABExtension's matlabExecClient.ts: the one module that
// actually talks to the live session. Implements the write path documented
// in EXECUTION.md — a same-origin JSON-RPC POST to the RStudio web client's
// own `rpc/console_input` endpoint for the Console target, and a real Ace
// editor API call (`.env.editor.insert(...)`) for the Source-editor target
// and as the Console's DOM-level fallback.
//
// ┌─ PROVENANCE ───────────────────────────────────────────────────────────┐
// │ The RPC envelope shape, the CSRF header/cookie pair, and the           │
// │ client_init hold-until-ready behaviour are taken from RStudio's own    │
// │ open-source GWT client (RemoteServer.java, RpcRequest.java) and        │
// │ Posit's published Header and Cookie Dictionary. See EXECUTION.md §2.   │
// └────────────────────────────────────────────────────────────────────────┘
//
// ┌─ NOT YET VERIFIED ON THE REAL PAGE (EXECUTION.md §6) ───────────────────┐
// │ • whether a self-issued client_init disturbs the visible tab   (§6.3)  │
// │ • the exact shape get_events returns console output in         (§6.4)  │
// │ • whether .ace_editor elements carry .env.editor here           (§6.5) │
// │ Everything below is written against the documented contract and is     │
// │ deliberately defensive about the response shape. Run EXECUTION.md §6,  │
// │ then tighten `parseGetEventsResponse` / the Ace lookup to match.       │
// └────────────────────────────────────────────────────────────────────────┘

export class RExecError extends Error {
  constructor(message: string, public status?: number) {
    super(message)
  }
}

// ── CSRF token ──────────────────────────────────────────────────────────
// Posit's Header and Cookie Dictionary documents the double-submit pair
// `rs-csrf-token` cookie ↔ `X-RS-CSRF-Token` header (current deployments),
// with a legacy `csrf-token` ↔ `X-CSRF-Token` pair for pre-2022.09 servers.
// Try both; a deployment with neither is presumably not requiring the
// header at all (older still), so an empty value is passed through rather
// than treated as an error — the server will 403 if it actually needed one,
// which surfaces as a clear message from postRpc below.
export function readCsrfToken(cookieString: string = typeof document !== 'undefined' ? document.cookie : ''): { header: string; value: string } {
  const rs = /(?:^|;\s*)rs-csrf-token=([^;]+)/.exec(cookieString)
  if (rs) return { header: 'X-RS-CSRF-Token', value: decodeURIComponent(rs[1]) }
  const legacy = /(?:^|;\s*)csrf-token=([^;]+)/.exec(cookieString)
  if (legacy) return { header: 'X-CSRF-Token', value: decodeURIComponent(legacy[1]) }
  return { header: 'X-RS-CSRF-Token', value: '' }
}

// ── RPC transport ──────────────────────────────────────────────────────
// EXECUTION.md §2.2: POST <origin>/rpc/<method>, a JSON-RPC-ish envelope,
// result under "result" or an "error" object.

export interface RpcOptions {
  origin?: string // defaults to location.origin — same-origin, per EXECUTION.md §5
  fetchImpl?: typeof fetch
  timeoutMs?: number
  cookieString?: string
}

const DEFAULT_TIMEOUT_MS = 15_000

async function postRpc(method: string, params: unknown[], clientId: string | null, opts: RpcOptions): Promise<unknown> {
  const fetchImpl = opts.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined)
  if (!fetchImpl) throw new RExecError('No fetch implementation available.')
  const origin = opts.origin ?? (typeof location !== 'undefined' ? location.origin : '')
  const csrf = readCsrfToken(opts.cookieString)

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : undefined
  const timer = controller ? setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS) : undefined

  let res: Response
  try {
    res = await fetchImpl(`${origin}/rpc/${method}`, {
      method: 'POST',
      credentials: 'include', // same-origin request: carries the RStudio session cookies (EXECUTION.md §5)
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(csrf.value ? { [csrf.header]: csrf.value } : {}),
      },
      body: JSON.stringify({
        method,
        params,
        kwparams: {},
        ...(clientId ? { clientId } : {}),
      }),
      signal: controller?.signal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new RExecError('RStudio did not respond in time — the session may be starting up or disconnected.')
    }
    throw new RExecError(`Couldn't reach RStudio: ${(err as Error).message}`)
  } finally {
    if (timer) clearTimeout(timer)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new RExecError('RStudio rejected the request — sign back in, or the CSRF token may be stale (EXECUTION.md §2.2/§6.2).', res.status)
    }
    if (res.status === 404) {
      throw new RExecError('The RStudio RPC endpoint was not found at the expected path (EXECUTION.md §2.1/§6.1).', res.status)
    }
    throw new RExecError(`RStudio RPC request failed (HTTP ${res.status}).`, res.status)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new RExecError('The RStudio RPC response was not JSON — the endpoint or protocol may differ from what was expected (EXECUTION.md §6.1).')
  }
  const env = body as { error?: { message?: string; code?: unknown }; result?: unknown }
  if (env && typeof env === 'object' && env.error) {
    if (String(env.error.code) === 'INVALID_CLIENT_ID' || /invalid.?client/i.test(env.error.message ?? '')) {
      throw new RExecError('RStudio rejected the request for an invalid/expired client id — re-run client_init (EXECUTION.md §2.3).')
    }
    throw new RExecError(env.error.message ?? 'RStudio reported an RPC error.')
  }
  return body
}

// ── client_init ─────────────────────────────────────────────────────────
// EXECUTION.md §2.3: exempt from the clientId hold — this is how one is
// minted. Cached per page load; a fresh call is only made once unless the
// server later rejects a call as INVALID_CLIENT_ID.
export interface ClientInfo { clientId: string; clientVersion?: string }

let cachedClientInfo: ClientInfo | null = null

// Exported for tests (each test needs its own fresh handshake rather than
// reusing whatever a prior test's clientInit cached) and for production use
// after an INVALID_CLIENT_ID error — the caller can call this then retry.
export function resetClientCache(): void {
  cachedClientInfo = null
}

export async function clientInit(opts: RpcOptions = {}): Promise<ClientInfo> {
  const body = await postRpc('client_init', [], null, opts) as { result?: { clientId?: string; clientVersion?: string } }
  const clientId = body?.result?.clientId
  if (!clientId) {
    throw new RExecError('RStudio\'s client_init did not return a clientId — the response shape may differ from what was expected (EXECUTION.md §6.3).')
  }
  cachedClientInfo = { clientId, clientVersion: body.result?.clientVersion }
  return cachedClientInfo
}

async function ensureClientId(opts: RpcOptions): Promise<string> {
  if (cachedClientInfo) return cachedClientInfo.clientId
  return (await clientInit(opts)).clientId
}

// ── console_input ──────────────────────────────────────────────────────
// EXECUTION.md §2.4: the response is just an ack — the real output arrives
// later via get_events. consoleId "" targets the main R console (⚠️ LIVE
// §6.4 — unconfirmed default); flags 0 is the documented safe default.
export async function submitConsoleInput(code: string, opts: RpcOptions & { consoleId?: string; flags?: number } = {}): Promise<void> {
  const clientId = await ensureClientId(opts)
  await postRpc('console_input', [code, opts.consoleId ?? '', opts.flags ?? 0], clientId, opts)
}

// ── get_events ──────────────────────────────────────────────────────────
// EXECUTION.md §2.4/§6.4b: a long-poll; used here as a single short poll
// (not a persistent loop) purely to try to recover output text for the
// widget's own log — the visible Console pane renders the real output
// regardless (via the page's OWN get_events loop, which this call does not
// replace or interfere with, since it uses our own self-issued clientId,
// not the page's).
export interface RConsoleEvent { kind: 'output' | 'error' | 'prompt' | 'other'; text: string }

function walkForText(node: unknown, into: string[]): void {
  if (typeof node === 'string') { if (node) into.push(node); return }
  if (Array.isArray(node)) { for (const x of node) walkForText(x, into); return }
  if (node && typeof node === 'object') {
    for (const key of ['text', 'data', 'output', 'value', 'result']) {
      if (key in (node as Record<string, unknown>)) walkForText((node as Record<string, unknown>)[key], into)
    }
  }
}

// ⚠️ EXECUTION.md §6.4b — the exact event-type field name/values RStudio
// uses (kConsoleWriteOutput etc. are the SERVER-side constant names; what
// the wire JSON actually calls them is unconfirmed) are walked defensively
// by a small set of likely key names rather than hard-coded to one shape.
export function parseGetEventsResponse(body: unknown): RConsoleEvent[] {
  const env = body as { result?: { events?: unknown[] } }
  const events = env?.result?.events
  if (!Array.isArray(events)) return []
  const out: RConsoleEvent[] = []
  for (const ev of events) {
    const e = ev as Record<string, unknown>
    const typeStr = String(e?.type ?? e?.eventName ?? e?.name ?? '').toLowerCase()
    const kind: RConsoleEvent['kind'] =
      /error/.test(typeStr) ? 'error' : /output|write/.test(typeStr) ? 'output' : /prompt/.test(typeStr) ? 'prompt' : 'other'
    const parts: string[] = []
    walkForText(e?.data ?? e, parts)
    if (parts.length > 0) out.push({ kind, text: parts.join('') })
  }
  return out
}

export async function pollEventsOnce(lastEventId: number, opts: RpcOptions = {}): Promise<RConsoleEvent[]> {
  const clientId = await ensureClientId(opts)
  const body = await postRpc('get_events', [lastEventId], clientId, opts)
  return parseGetEventsResponse(body)
}

// ── High-level: run R code in the live Console ──────────────────────────
// Submits via console_input (so the VISIBLE Console pane shows it, via the
// page's own event loop — EXECUTION.md §2.4), then makes a best-effort short
// poll of our own get_events to try to also surface the output text in the
// widget log. A poll timeout is not treated as failure — the code still ran;
// it's only this extension's own echo that's missing.
export interface RunResult { ok: boolean; output: string; error?: string }

export async function runInConsole(code: string, opts: RpcOptions & { consoleId?: string; pollMs?: number } = {}): Promise<RunResult> {
  await submitConsoleInput(code, opts)
  const deadline = Date.now() + (opts.pollMs ?? 2000)
  let lastId = -1
  const collected: string[] = []
  let sawError: string | undefined
  while (Date.now() < deadline) {
    let events: RConsoleEvent[]
    try {
      events = await pollEventsOnce(lastId, opts)
    } catch {
      break // best-effort — the code already ran regardless of whether we can echo it
    }
    for (const ev of events) {
      if (ev.kind === 'error') sawError = ev.text
      else if (ev.kind === 'output') collected.push(ev.text)
    }
    lastId += events.length > 0 ? events.length : 1
    if (events.some(e => e.kind === 'prompt')) break
  }
  if (sawError) return { ok: false, output: collected.join(''), error: sawError }
  return { ok: true, output: collected.join('') }
}

// ── DOM fallback: real Ace editor API, not synthetic keystrokes ──────────
// EXECUTION.md §2.5/§3: RStudio's Console input line AND every open Source
// file are genuine Ace editor instances. ace.edit(el) stashes the live
// Editor on el.env.editor — the standard, stable Ace convention, confirmed
// only up to "RStudio consumes the real ace.js" (RStudio's own wiki);
// whether RStudio's specific bundling preserves the .env stash is ⚠️ LIVE
// (§6.5). Calling the real editor.insert() (not a synthetic keydown) fires
// the same 'change' event a keystroke would, so RStudio's own GWT listener
// on that Ace instance sees it as a real edit — the same reason
// Ninebark-OverleafExtension dispatches a real CM6 transaction instead of
// simulating typing.

export interface AceLikeEditor { insert(text: string): void }
interface AceEnvElement extends Element { env?: { editor?: AceLikeEditor } }

export function findAceEditors(): AceEnvElement[] {
  if (typeof document === 'undefined') return []
  return Array.from(document.querySelectorAll<AceEnvElement>('.ace_editor'))
}

// Heuristic split between "the Console's input line" and "an open Source
// file" — RStudio's DOM structure for this is unconfirmed (§6.5), so this
// tries a couple of plausible id/class markers and otherwise falls back to
// "the last focused Ace instance" (whichever the user actually clicked into
// most recently is the least-surprising target for either case).
function classifyAceElement(el: AceEnvElement): 'console' | 'source' | 'unknown' {
  const id = el.id || ''
  const cls = el.className || ''
  if (/console/i.test(id) || el.closest('#rstudio_console_input, .consoleInput, [class*="consoleInput" i]')) return 'console'
  if (/editor/i.test(id) || el.closest('.rstudio-themes-flat, .ace_editor')?.closest('[class*="source" i]')) return 'source'
  void cls
  return 'unknown'
}

export function insertViaAce(target: 'console' | 'source', text: string): boolean {
  const editors = findAceEditors()
  if (editors.length === 0) return false
  let el = editors.find(e => classifyAceElement(e) === target)
  if (!el) {
    // Fall back to whichever Ace instance currently has focus, then to the
    // only one present, rather than giving up — the classification above is
    // a best guess pending EXECUTION.md §6.5.
    el = editors.find(e => e.contains(document.activeElement)) ?? (editors.length === 1 ? editors[0] : undefined)
  }
  const editor = el?.env?.editor
  if (!editor || typeof editor.insert !== 'function') return false
  editor.insert(text)
  return true
}

// ── Top-level dispatch used by the content script ─────────────────────────
// Console target: try the RPC path first (returns real output); on ANY
// failure, fall back to inserting the code into the Console's Ace input line
// so at least it's typed and ready — same fail-loud-but-never-lose-the-work
// posture as every other Ninebark interface's fallback row. Source target:
// always the Ace insert (EXECUTION.md never proposes an RPC path for the
// Source editor — it's a document, not something to execute).
export async function dispatchRCommand(
  target: 'console' | 'source',
  code: string,
  opts: RpcOptions & { consoleId?: string; pollMs?: number } = {},
): Promise<RunResult & { inserted?: boolean }> {
  if (target === 'source') {
    const inserted = insertViaAce('source', code)
    return inserted
      ? { ok: true, output: 'Inserted into the Source editor.', inserted: true }
      : { ok: false, output: '', error: 'Couldn\'t find an open Source editor to insert into (EXECUTION.md §6.5) — open a .R file first, or paste it in by hand.', inserted: false }
  }
  try {
    const result = await runInConsole(code, opts)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const inserted = insertViaAce('console', code)
    return inserted
      ? { ok: false, output: '', error: `${message} — typed into the Console instead; press Enter to run it.`, inserted: true }
      : { ok: false, output: '', error: message, inserted: false }
  }
}
