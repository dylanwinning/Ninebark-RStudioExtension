// Built against RStudio's documented GWT-client RPC contract (RemoteServer.java,
// RpcRequest.java) and Posit's published Header and Cookie Dictionary — see
// EXECUTION.md §2. The get_events response SHAPE still needs a live check
// (EXECUTION.md §6.4b), so parseGetEventsResponse is deliberately tolerant;
// these tests pin the parts that are settled.
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  readCsrfToken, clientInit, submitConsoleInput, runInConsole,
  parseGetEventsResponse, insertViaAce, dispatchRCommand, RExecError, resetClientCache,
} from '../src/rExecClient'

// Each test performs its own client_init handshake — without this, a later
// test would silently reuse an earlier test's cached clientId and never call
// fetch a second time, since ensureClientId() caches across calls by design
// (so a real session doesn't re-handshake before every command).
beforeEach(() => resetClientCache())

describe('readCsrfToken', () => {
  it('reads the current rs-csrf-token / X-RS-CSRF-Token pair', () => {
    expect(readCsrfToken('rs-csrf-token=abc123; other=1')).toEqual({ header: 'X-RS-CSRF-Token', value: 'abc123' })
  })
  it('falls back to the legacy csrf-token / X-CSRF-Token pair (pre-2022.09 deployments)', () => {
    expect(readCsrfToken('csrf-token=legacy9')).toEqual({ header: 'X-CSRF-Token', value: 'legacy9' })
  })
  it('URL-decodes the cookie value', () => {
    expect(readCsrfToken('rs-csrf-token=a%2Fb').value).toBe('a/b')
  })
  it('no cookie present -> empty value (server may not require the header at all)', () => {
    expect(readCsrfToken('unrelated=1').value).toBe('')
  })
})

describe('clientInit (mocked fetch)', () => {
  it('POSTs to rpc/client_init with no clientId (exempt from the hold, EXECUTION.md §2.3) and caches the result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ result: { clientId: 'C1', clientVersion: '1' } }),
    })
    const info = await clientInit({ origin: 'https://posit.cloud', fetchImpl, cookieString: 'rs-csrf-token=t1' })
    expect(info.clientId).toBe('C1')
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe('https://posit.cloud/rpc/client_init')
    expect(init.method).toBe('POST')
    expect(init.credentials).toBe('include')
    expect(init.headers['X-RS-CSRF-Token']).toBe('t1')
    expect(JSON.parse(init.body).clientId).toBeUndefined() // client_init itself carries no clientId
  })

  it('a missing clientId in the response is a clear protocol-mismatch error', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: {} }) })
    await expect(clientInit({ origin: 'https://x', fetchImpl })).rejects.toThrow(/did not return a clientId/)
  })
})

describe('submitConsoleInput (mocked fetch)', () => {
  it('sends [code, consoleId, flags] as params, defaulting consoleId to "" and flags to 0', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { clientId: 'C1' } }) }) // client_init
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: null }) })                // console_input ack
    await submitConsoleInput('1+1', { origin: 'https://x', fetchImpl })
    const [url, init] = fetchImpl.mock.calls[1]
    expect(url).toBe('https://x/rpc/console_input')
    const body = JSON.parse(init.body)
    expect(body.params).toEqual(['1+1', '', 0])
    expect(body.clientId).toBe('C1')
  })

  it('an RPC-level error object is thrown with its message', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { clientId: 'C1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ error: { message: 'boom' } }) })
    await expect(submitConsoleInput('1+1', { origin: 'https://x', fetchImpl })).rejects.toThrow('boom')
  })

  it('a 403 points at signing back in / a stale CSRF token', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { clientId: 'C1' } }) })
      .mockResolvedValueOnce({ ok: false, status: 403 })
    await expect(submitConsoleInput('1+1', { origin: 'https://x', fetchImpl })).rejects.toThrow(/sign back in|CSRF/i)
  })
})

describe('parseGetEventsResponse', () => {
  it('extracts output text from a plausible event shape', () => {
    const body = { result: { events: [{ type: 'console_output', data: { text: '42\n' } }] } }
    expect(parseGetEventsResponse(body)).toEqual([{ kind: 'output', text: '42\n' }])
  })
  it('classifies an error-ish event type as kind "error"', () => {
    const body = { result: { events: [{ type: 'console_write_error', data: { text: 'oops' } }] } }
    expect(parseGetEventsResponse(body)[0].kind).toBe('error')
  })
  it('an unrecognized shape returns an empty array rather than throwing', () => {
    expect(parseGetEventsResponse({})).toEqual([])
    expect(parseGetEventsResponse({ result: {} })).toEqual([])
  })
})

describe('runInConsole (mocked fetch)', () => {
  it('submits then polls once, collecting output text and stopping at a prompt event', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { clientId: 'C1' } }) }) // client_init
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: null }) })                // console_input
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: { events: [
          { type: 'console_output', data: { text: '[1] 2\n' } },
          { type: 'console_prompt', data: {} },
        ] } }),
      })
    const result = await runInConsole('1+1', { origin: 'https://x', fetchImpl, pollMs: 500 })
    expect(result.ok).toBe(true)
    expect(result.output).toContain('2')
  })

  it('a poll failure after a successful submit is still reported ok (the code ran; only the echo is missing)', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: { clientId: 'C1' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ result: null }) })
      .mockResolvedValue({ ok: false, status: 500 })
    const result = await runInConsole('1+1', { origin: 'https://x', fetchImpl, pollMs: 50 })
    expect(result.ok).toBe(true)
    expect(result.output).toBe('')
  })
})

describe('insertViaAce — DOM fallback (EXECUTION.md §2.5/§3)', () => {
  const inserted: string[] = []
  function fakeEditorEl(id: string): unknown {
    return {
      id,
      className: '',
      env: { editor: { insert: (t: string) => inserted.push(`${id}:${t}`) } },
      closest: () => null,
      contains: () => false,
    }
  }

  beforeEach(() => { inserted.length = 0 })
  afterEach(() => vi.unstubAllGlobals())

  it('returns false with no .ace_editor elements present (no document, or none found)', () => {
    vi.stubGlobal('document', { querySelectorAll: () => [] })
    expect(insertViaAce('source', 'x <- 1')).toBe(false)
  })

  it('inserts into the only Ace instance present when classification is ambiguous', () => {
    const el = fakeEditorEl('rstudio_source_1')
    vi.stubGlobal('document', { querySelectorAll: () => [el], activeElement: null })
    expect(insertViaAce('source', 'x <- 1')).toBe(true)
    expect(inserted).toEqual(['rstudio_source_1:x <- 1'])
  })

  it('a missing .env.editor on the only match returns false rather than throwing', () => {
    const el = { id: 'x', className: '', env: {}, closest: () => null, contains: () => false }
    vi.stubGlobal('document', { querySelectorAll: () => [el], activeElement: null })
    expect(insertViaAce('console', 'x')).toBe(false)
  })
})

describe('dispatchRCommand', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('a Source-target command with no reachable editor reports a specific, actionable error', async () => {
    vi.stubGlobal('document', { querySelectorAll: () => [] })
    const result = await dispatchRCommand('source', 'x <- 1')
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Source editor/)
  })

  it('a Console-target command falls back to Ace insertion when the RPC path throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'))
    const el = {
      id: 'console', className: '', env: { editor: { insert: () => {} } }, closest: () => null, contains: () => false,
    }
    vi.stubGlobal('document', { querySelectorAll: () => [el], activeElement: null })
    const result = await dispatchRCommand('console', '1+1', { origin: 'https://x', fetchImpl })
    expect(result.ok).toBe(false)
    expect(result.inserted).toBe(true)
    expect(result.error).toMatch(/press Enter/)
  })
})

describe('RExecError', () => {
  it('carries an optional HTTP status', () => {
    const e = new RExecError('nope', 404)
    expect(e.status).toBe(404)
    expect(e.message).toBe('nope')
  })
})
