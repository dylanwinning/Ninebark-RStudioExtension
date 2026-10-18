// "Make sure when they type things in more formal mathematics those are
// supported" — formal notation (absolute-value bars, Greek statistical
// letters, the degree symbol) that the vendored shared engine either
// doesn't know about at all or silently mishandles. Three fixes live in
// resolveRPhrase.ts itself (not a native recognizer file) since they're
// general preprocessing concerns, applied before tier-1/tier-2 ever see
// the text — the same spot the vendored normalizeUnicodeMath() already
// occupies, for symbols that normalizeUnicodeMath() doesn't cover.
import { describe, it, expect } from 'vitest'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('absolute-value bar notation — "|x|"', () => {
  it('previously resolved WRONG — the vendored tier-2 tokenizer silently drops "|" as unrecognized punctuation, so "|-5|" became the bare literal -5 instead of its absolute value, 5 — before this fix', () => {
    expect(resolveToRStatement('|-5|')).toBe('abs(-5)')
  })

  it.each([
    ['|x|', 'abs(x)'],
    ['|x - 5|', 'abs(x - 5)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('only fires when "|" wraps the WHOLE expression — never misreads R\'s own "|" (logical OR) used in the middle of a raw expression', () => {
    expect(resolveToRStatement('plot(x | y)')).toBe('plot(x | y)')
  })
})

describe('Greek statistical notation — σ (SD), μ (mean), ρ (correlation), χ² (chi-squared)', () => {
  it.each([
    ['σ of income', 'sd(df$income, na.rm = TRUE)'],
    ['μ of income', 'mean(df$income, na.rm = TRUE)'],
    ['the σ of score', 'sd(df$score, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it.each([
    ['calculate σ² of score', 'var(df$score, na.rm = TRUE)'],
    ['calculate σ^2 of score', 'var(df$score, na.rm = TRUE)'],
  ])('σ² means VARIANCE, not "standard deviation squared" as two separate words — checked before the bare σ substitution: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('ρ between study_hours and score -> cor(df$study_hours, df$score, use = "complete.obs")', () => {
    expect(resolveToRStatement('ρ between study_hours and score')).toBe('cor(df$study_hours, df$score, use = "complete.obs")')
  })

  it('χ² substitutes to "chi-squared", which the existing English phrasing already recognizes', () => {
    expect(resolveToRStatement('test whether gender and outcome are associated using a χ² test'))
      .toBe('chisq.test(table(df$gender, df$outcome))')
  })
})

describe('the degree SYMBOL (°), not just the spelled-out word "degrees"', () => {
  it('previously resolved WRONG — "°" was silently dropped as unrecognized punctuation, so "sin 90°" became sin(90) (RADIANS — R\'s own sin() takes radians, not degrees — giving a silently wrong numeric answer, ~0.894, not 1) — before this fix', () => {
    expect(resolveToRStatement('sin 90°')).toBe('sin(90*pi/180)')
  })

  it('matches the existing, already-correct spelled-out-word behavior exactly', () => {
    expect(resolveToRStatement('sin 90°')).toBe(resolveToRStatement('sin 90 degrees'))
  })

  it('the parenthesized, raw-R-call-shaped form ("sin(90°)") previously produced an unparseable literal "°" character passed straight through to R — now converts to valid arithmetic directly', () => {
    expect(resolveToRStatement('sin(90°)')).toBe('sin((90*pi/180))')
  })

  it('cos 180° -> cos(180*pi/180)', () => {
    expect(resolveToRStatement('cos 180°')).toBe('cos(180*pi/180)')
  })
})

describe('sanity: symbols already handled by the vendored engine still work', () => {
  it.each([
    ['5 × 3', '5*3'],
    ['10 ÷ 2', '10/2'],
    ['10 ≤ 20', '10<=20'],
    ['√16', 'sqrt(16)'],
    ['x²', 'x^2'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})
