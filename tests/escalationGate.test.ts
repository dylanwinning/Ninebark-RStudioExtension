// Audited against real phrases in three labeled buckets (temp script, now
// deleted, per the project's established "audit -> fix -> permanent tests"
// convention) before these thresholds were frozen. See the design plan:
// /Users/dylanwinning/.claude/plans/structured-inventing-codd.md §2/§6.
import { describe, it, expect } from 'vitest'
import { decideEscalation, looksLikeDeliberateRequest } from '../src/vendor/ninebark-engine/escalationGate'
import { nlToFormal } from '../src/vendor/ninebark-engine/ninebark-nl/nl/index'
import type { NlDiagnostic } from '../src/vendor/ninebark-engine/ninebark-nl/types/diagnostic'

function diagnosticFor(phrase: string): NlDiagnostic | undefined {
  const r = nlToFormal(phrase)
  return r.ok ? undefined : r.diagnostic
}

describe('decideEscalation: must reject (pure noise, no cost)', () => {
  it.each(['hiiiii', 'asdf', 'lol', 'test', 'xyz', 'ok thanks', 'random words here no math'])(
    '%s -> escalate:false', (phrase) => {
      expect(decideEscalation(diagnosticFor(phrase), phrase).escalate).toBe(false)
    },
  )
})

describe('decideEscalation: must escalate to the cheap "formal" tier', () => {
  it.each([
    'difference of 1, 2, 3',    // signal A: recognized but wrong arity
    'mean of',                   // signal A: recognized but missing operand
    'standard deviation of',     // signal A: recognized but missing operand
    'create a boxplot of my data with the main as xyz', // signal B: short near-miss, nothing in the lexicon recognizes "boxplot" at all
  ])('%s -> escalate:true, tier:formal', (phrase) => {
    const d = decideEscalation(diagnosticFor(phrase), phrase)
    expect(d.escalate).toBe(true)
    expect(d.tier).toBe('formal')
  })
})

describe('decideEscalation: must escalate to the pricier "raw-code" tier', () => {
  it.each([
    "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that",
    'I have three test scores, 85, 90, and 78. Can you write the R code to find the average? Also tell me the standard deviation.',
    'what should the R code be for a linear regression model predicting price from square footage and number of bedrooms in my housing dataset',
  ])('escalates long multi-sentence requests to raw-code', (phrase) => {
    const d = decideEscalation(diagnosticFor(phrase), phrase)
    expect(d.escalate).toBe(true)
    expect(d.tier).toBe('raw-code')
  })
})

describe('decideEscalation: tier-1 vocab failures are NOT escalation candidates', () => {
  // recognizeDesmosPhrase() throws its own specific UnsupportedFormalError
  // ("dot product needs two vectors as points.") before nlToFormal/the
  // diagnostic path is ever reached — there's no diagnostic for the gate to
  // see at all in that case, and no need for one: the deterministic message
  // is already precise. This test just documents that decideEscalation on
  // an undefined diagnostic falls through to signal B alone.
  it('with no diagnostic at all, a short phrase still correctly rejects', () => {
    expect(decideEscalation(undefined, 'dot product of (1,2)').escalate).toBe(false)
  })
})

describe('looksLikeDeliberateRequest: the three sub-signals are independently sufficient', () => {
  it('word count alone (>= 10) is enough', () => {
    expect(looksLikeDeliberateRequest('one two three four five six seven eight nine ten')).toBe(true)
  })
  it('sentence count alone (>= 2) is enough, even if short', () => {
    expect(looksLikeDeliberateRequest('Help. Please.')).toBe(true)
  })
  it('a request-phrase prefix alone is enough, even if short', () => {
    expect(looksLikeDeliberateRequest('can you help')).toBe(true)
  })
  it('none of the three -> false', () => {
    expect(looksLikeDeliberateRequest('short phrase here')).toBe(false)
  })
})
