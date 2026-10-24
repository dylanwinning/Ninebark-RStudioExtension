// These two exports are the only surface R ever calls into via V8
// (R/resolve.R does `ctx$call("Ninebark.resolve", ...)` /
// `ctx$call("Ninebark.convertFormal", ...)`) — see ninebarkBundle.ts's own
// header for why the AI-relay network call can't live inside this V8
// isolate at all and has to happen in R instead, consuming the diagnostic
// data `resolve()` exposes here.
import { describe, it, expect } from 'vitest'
import '../src/ninebarkBundle' // registers globalThis.Ninebark as a side effect

const Ninebark = (globalThis as unknown as {
  Ninebark: {
    resolve: (text: string) => { ok: boolean; target?: string; code?: string; error?: string; diagnosticCategory?: string; recognizedFeatures?: string[] }
    convertFormal: (formal: string) => { ok: boolean; code?: string; error?: string }
  }
}).Ninebark

describe('Ninebark.resolve: diagnostic exposure for the AI-fallback gate', () => {
  it('a deterministic success carries no diagnostic fields', () => {
    const r = Ninebark.resolve('mean of 1,2,3')
    expect(r.ok).toBe(true)
    expect(r.diagnosticCategory).toBeUndefined()
  })

  it('an out-of-coverage failure exposes category + recognized features', () => {
    const r = Ninebark.resolve('mean of')
    expect(r.ok).toBe(false)
    expect(r.diagnosticCategory).toBe('out-of-coverage')
    expect(r.recognizedFeatures).toEqual(['mean'])
  })

  it('pure noise exposes no recognized features (nothing for R\'s escalation gate to see)', () => {
    const r = Ninebark.resolve('hiiiii')
    expect(r.ok).toBe(false)
    expect(r.recognizedFeatures ?? []).toEqual([])
  })
})

describe('Ninebark.convertFormal: the formal-tier entry point for R\'s AI-fallback code', () => {
  it('converts a valid formal string to R code', () => {
    expect(Ninebark.convertFormal('(1 + 1)')).toEqual({ ok: true, code: '1+1' })
  })

  it('reports a specific error for a malformed formal string, never throws', () => {
    const r = Ninebark.convertFormal('2+')
    expect(r.ok).toBe(false)
    expect(r.error).toBeTruthy()
  })

  it("rejects the model's literal UNSUPPORTED sentinel (R's own known-name guard)", () => {
    const r = Ninebark.convertFormal('UNSUPPORTED')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/UNSUPPORTED/)
  })
})
