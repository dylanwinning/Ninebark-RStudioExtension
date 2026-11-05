// Mirrors Ninebark-DesmosExtension's resolveToOutputWithAiFallback.test.ts
// for the RStudio browser-extension target — see that file's header for the
// full reasoning. This is the ONLY interface with both tiers wired on the
// browser-extension side (RStudio + MATLAB are the two scoped for raw-code
// per the design plan §3, but MATLAB's client wiring deliberately stayed
// formal-only pending a review UI — see resolveMatlabPhrase.ts's own
// comment. This side is safe for raw-code because it can route it to
// target:'source' — insert into the Ace editor, unexecuted — rather than
// 'console', which auto-runs via RPC.)
import { describe, it, expect, vi } from 'vitest'
import { resolveToRCommandWithAiFallback, wasEscalationAttempted, RNlFailure } from '../src/resolveRPhrase'
import * as aiRelayClient from '../src/vendor/ninebark-engine/aiRelayClient'

describe('resolveToRCommandWithAiFallback', () => {
  it('a deterministically-successful input returns immediately, never calling the relay, with escalated: false', async () => {
    const spy = vi.spyOn(aiRelayClient, 'callAiRelay')
    const cmd = await resolveToRCommandWithAiFallback('mean of 1,2,3')
    expect(cmd.code).toContain('mean(')
    expect(cmd.escalated).toBe(false)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('pure noise that the gate rejects rethrows the original failure, never calling the relay, not tagged as an escalation attempt', async () => {
    const spy = vi.spyOn(aiRelayClient, 'callAiRelay')
    try {
      await resolveToRCommandWithAiFallback('hiiiii')
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RNlFailure)
      expect(wasEscalationAttempted(err)).toBe(false)
    }
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('an escalated input whose relay translation succeeds (formal tier) targets the console, with escalated: true', async () => {
    const spy = vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'formal', result: '(1 + 1)' })
    const cmd = await resolveToRCommandWithAiFallback('mean of')
    expect(spy).toHaveBeenCalledWith('mean of', 'rstudio', 'formal', ['mean'])
    expect(cmd).toEqual({ target: 'console', code: '1+1', escalated: true })
    spy.mockRestore()
  })

  it('a raw-code-tier escalation ALWAYS targets source (insert, never auto-run), regardless of what console/source the deterministic path would have used, with escalated: true', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({
      ok: true, mode: 'raw-code', language: 'r', code: 'df <- data.frame(x=1)\nggplot2::ggplot(df)',
    })
    const cmd = await resolveToRCommandWithAiFallback(
      "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that",
    )
    expect(cmd.target).toBe('source')
    expect(cmd.code).toContain('ggplot2')
    expect(cmd.escalated).toBe(true)
    vi.restoreAllMocks()
  })

  it('the model\'s literal "UNSUPPORTED" sentinel (formal tier) falls back to the original failure, tagged as an escalation attempt', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'formal', result: 'UNSUPPORTED' })
    try {
      await resolveToRCommandWithAiFallback('mean of')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as Error).message).toMatch(/mean/)
      expect(wasEscalationAttempted(err)).toBe(true)
    }
    vi.restoreAllMocks()
  })

  it('the model\'s literal "UNSUPPORTED" sentinel (raw-code tier) falls back to the original failure, tagged as an escalation attempt', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'raw-code', language: 'r', code: 'UNSUPPORTED' })
    try {
      await resolveToRCommandWithAiFallback(
        "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that",
      )
      throw new Error('expected a throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RNlFailure)
      expect(wasEscalationAttempted(err)).toBe(true)
    }
    vi.restoreAllMocks()
  })

  it('a relay failure falls back to the ORIGINAL deterministic message, tagged as an escalation attempt', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: false, reason: 'budget-exceeded' })
    try {
      await resolveToRCommandWithAiFallback('mean of')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as Error).message).toMatch(/mean/)
      expect(wasEscalationAttempted(err)).toBe(true)
    }
    vi.restoreAllMocks()
  })

  it('a malformed (non-sentinel) formal-tier translation surfaces the converter\'s OWN specific error, not the original, tagged as an escalation attempt', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'formal', result: '2+' })
    try {
      await resolveToRCommandWithAiFallback('mean of')
      throw new Error('expected a throw')
    } catch (err) {
      expect((err as Error).message).toBe('Input not recognized.')
      expect(wasEscalationAttempted(err)).toBe(true)
    }
    vi.restoreAllMocks()
  })
})
