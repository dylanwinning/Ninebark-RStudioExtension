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
import { resolveToRCommandWithAiFallback, RNlFailure } from '../src/resolveRPhrase'
import * as aiRelayClient from '../src/vendor/ninebark-engine/aiRelayClient'

describe('resolveToRCommandWithAiFallback', () => {
  it('a deterministically-successful input returns immediately, never calling the relay', async () => {
    const spy = vi.spyOn(aiRelayClient, 'callAiRelay')
    const cmd = await resolveToRCommandWithAiFallback('mean of 1,2,3')
    expect(cmd.code).toContain('mean(')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('pure noise that the gate rejects rethrows the original failure, never calling the relay', async () => {
    const spy = vi.spyOn(aiRelayClient, 'callAiRelay')
    await expect(resolveToRCommandWithAiFallback('hiiiii')).rejects.toThrow(RNlFailure)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('an escalated input whose relay translation succeeds (formal tier) targets the console', async () => {
    const spy = vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'formal', result: '(1 + 1)' })
    const cmd = await resolveToRCommandWithAiFallback('mean of')
    expect(spy).toHaveBeenCalledWith('mean of', 'rstudio', 'formal', ['mean'])
    expect(cmd).toEqual({ target: 'console', code: '1+1' })
    spy.mockRestore()
  })

  it('a raw-code-tier escalation ALWAYS targets source (insert, never auto-run), regardless of what console/source the deterministic path would have used', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({
      ok: true, mode: 'raw-code', language: 'r', code: 'df <- data.frame(x=1)\nggplot2::ggplot(df)',
    })
    const cmd = await resolveToRCommandWithAiFallback(
      "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that",
    )
    expect(cmd.target).toBe('source')
    expect(cmd.code).toContain('ggplot2')
    vi.restoreAllMocks()
  })

  it('the model\'s literal "UNSUPPORTED" sentinel (formal tier) falls back to the original failure', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'formal', result: 'UNSUPPORTED' })
    await expect(resolveToRCommandWithAiFallback('mean of')).rejects.toThrow(/mean/)
    vi.restoreAllMocks()
  })

  it('the model\'s literal "UNSUPPORTED" sentinel (raw-code tier) falls back to the original failure', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'raw-code', language: 'r', code: 'UNSUPPORTED' })
    await expect(resolveToRCommandWithAiFallback(
      "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that",
    )).rejects.toThrow(RNlFailure)
    vi.restoreAllMocks()
  })

  it('a relay failure falls back to the ORIGINAL deterministic message', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: false, reason: 'budget-exceeded' })
    await expect(resolveToRCommandWithAiFallback('mean of')).rejects.toThrow(/mean/)
    vi.restoreAllMocks()
  })

  it('a malformed (non-sentinel) formal-tier translation surfaces the converter\'s OWN specific error, not the original', async () => {
    vi.spyOn(aiRelayClient, 'callAiRelay').mockResolvedValue({ ok: true, mode: 'formal', result: '2+' })
    await expect(resolveToRCommandWithAiFallback('mean of')).rejects.toThrow('Input not recognized.')
    vi.restoreAllMocks()
  })
})
