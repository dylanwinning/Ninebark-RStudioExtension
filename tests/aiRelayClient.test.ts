// Unlike inputLogger.ts's fire-and-forget no-cors pattern, this call reads
// its response back — so it needs real CORS, an explicit Content-Type, and
// a real await. These tests pin exactly that, per the design plan's
// correction (/Users/dylanwinning/.claude/plans/structured-inventing-codd.md §4):
// this must NOT be modeled on inputLogger.ts's `mode:'no-cors'`/unawaited shape.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

async function freshClient() {
  vi.resetModules()
  const mod = await import('../src/vendor/ninebark-engine/aiRelayClient')
  return mod.callAiRelay
}

describe('callAiRelay', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('does nothing (network-error, no fetch) when VITE_AI_RELAY_URL is unset', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', '')
    const callAiRelay = await freshClient()
    const result = await callAiRelay('mean of', 'desmos', 'formal')
    expect(result).toEqual({ ok: false, reason: 'network-error' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('POSTs the expected shape — real Content-Type, no no-cors, a real body', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://ninebark-ai-relay.example.workers.dev')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, mode: 'formal', result: 'mean({1,2,3})' })))
    const callAiRelay = await freshClient()
    await callAiRelay('mean of 1 2 3', 'desmos', 'formal', ['mean'])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ninebark-ai-relay.example.workers.dev/interpret')
    expect(opts.method).toBe('POST')
    expect(opts.mode).not.toBe('no-cors')
    expect(opts.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(opts.body)).toEqual({
      interfaceId: 'desmos', input: 'mean of 1 2 3', tier: 'formal', diagnosticHint: ['mean'],
    })
  })

  it('returns a successful formal-tier result unchanged', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://relay.example')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, mode: 'formal', result: '(1 + 1)' })))
    const callAiRelay = await freshClient()
    const result = await callAiRelay('two plus two basically', 'desmos', 'formal')
    expect(result).toEqual({ ok: true, mode: 'formal', result: '(1 + 1)' })
  })

  it('returns a successful raw-code-tier result unchanged', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://relay.example')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, mode: 'raw-code', language: 'r', code: 'mean(c(1,2,3))' })))
    const callAiRelay = await freshClient()
    const result = await callAiRelay('what should the R code be for the average', 'rstudio', 'raw-code')
    expect(result).toEqual({ ok: true, mode: 'raw-code', language: 'r', code: 'mean(c(1,2,3))' })
  })

  it('passes through an application-level failure reason from the relay', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://relay.example')
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false, reason: 'budget-exceeded' })))
    const callAiRelay = await freshClient()
    const result = await callAiRelay('mean of', 'desmos', 'formal')
    expect(result).toEqual({ ok: false, reason: 'budget-exceeded' })
  })

  it('maps a non-OK HTTP response to network-error', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://relay.example')
    fetchMock.mockResolvedValue(new Response('', { status: 500 }))
    const callAiRelay = await freshClient()
    const result = await callAiRelay('mean of', 'desmos', 'formal')
    expect(result).toEqual({ ok: false, reason: 'network-error' })
  })

  it('maps a rejected fetch (offline) to network-error, never throws', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://relay.example')
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const callAiRelay = await freshClient()
    await expect(callAiRelay('mean of', 'desmos', 'formal')).resolves.toEqual({ ok: false, reason: 'network-error' })
  })

  it('maps an aborted (timed-out) request to timeout, not network-error', async () => {
    vi.stubEnv('VITE_AI_RELAY_URL', 'https://relay.example')
    fetchMock.mockRejectedValue(new DOMException('aborted', 'AbortError'))
    const callAiRelay = await freshClient()
    await expect(callAiRelay('mean of', 'desmos', 'formal')).resolves.toEqual({ ok: false, reason: 'timeout' })
  })
})
