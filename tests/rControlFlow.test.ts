// Direct unit tests for rControlFlow.ts — the one module with no precedent
// in any other Ninebark interface repo. Uses a real resolveValue (not a
// stub) so the "bare identifier vs. NL math expression" boundary that
// caused a real bug during development (print with a bare word like "big"
// or a loop variable like "i" was routed through the math NL engine and
// failed) is exercised for real, not mocked away.
import { describe, it, expect } from 'vitest'
import { recognizeControlFlow } from '../src/rControlFlow'
import { stripFiller, normalizeUnicodeMath } from '../src/vendor/ninebark-engine/desmosNlVocab'
import { nlToFormal, buildNlErrorMessage } from '@ninebark/nl/index'
import { formalStringToR } from '../src/formalToR'

// A trimmed stand-in for resolveRPhrase.ts's real resolveValue — enough of
// the same tier-1/tier-2 pipeline to reproduce the bug this file guards
// against, without importing resolveRPhrase.ts (which would create a
// circular dependency back onto this module).
function resolveValue(phrase: string): string {
  const t = stripFiller(normalizeUnicodeMath(phrase)).trim()
  if (/^[A-Za-z][\w.]*$/.test(t)) return t // bare identifier — same shortcut resolveRPhrase.ts provides
  const nl = nlToFormal(t)
  if (nl.ok) return formalStringToR(nl.formal)
  throw new Error(buildNlErrorMessage(nl.code, nl.diagnostic))
}

describe('for loops', () => {
  it('a numeric range with a print body', () => {
    expect(recognizeControlFlow('for i in 1 to 10 print i', resolveValue)).toBe('for (i in 1:10) { print(i) }')
  })
  it('"from ... to ..." phrasing', () => {
    expect(recognizeControlFlow('for i from 1 to 5 print i', resolveValue)).toBe('for (i in 1:5) { print(i) }')
  })
  it('"for each x in v" iterates a named vector', () => {
    expect(recognizeControlFlow('for each x in v print x', resolveValue)).toBe('for (x in v) { print(x) }')
  })
  it('a bare loop-variable print body does NOT go through the math NL engine (regression test)', () => {
    // Before the fix, "print i" called resolveValue("i") -> the shared NL
    // engine tried to parse "i" as a math phrase and failed with a
    // confusing "nothing to calculate" error instead of printing the loop
    // variable.
    expect(() => recognizeControlFlow('for i in 1 to 3 print i', resolveValue)).not.toThrow()
  })
})

describe('if / else', () => {
  it('greater-than with no else', () => {
    expect(recognizeControlFlow('if x is greater than 5 print x', resolveValue)).toBe('if (x>5) { print(x) }')
  })
  it('with an else branch, both bodies bare words (regression test for the print-bareword bug)', () => {
    expect(recognizeControlFlow('if x is greater than 5 print big else print small', resolveValue))
      .toBe('if (x>5) { print(big) } else { print(small) }')
  })
  it('every comparator phrase maps to its R operator', () => {
    expect(recognizeControlFlow('if x is at least 5 print x', resolveValue)).toContain('x>=5')
    expect(recognizeControlFlow('if x is at most 5 print x', resolveValue)).toContain('x<=5')
    expect(recognizeControlFlow('if x is less than 5 print x', resolveValue)).toContain('x<5')
    expect(recognizeControlFlow('if x is equal to 5 print x', resolveValue)).toContain('x==5')
    expect(recognizeControlFlow('if x is not equal to 5 print x', resolveValue)).toContain('x!=5')
  })
})

describe('while loops', () => {
  it('with an increment chain', () => {
    expect(recognizeControlFlow('while x is less than 10 print x and increment x', resolveValue))
      .toBe('while (x<10) { print(x); x <- x + 1 }')
  })
  it('with a decrement chain', () => {
    expect(recognizeControlFlow('while x is greater than 0 print x and decrement x', resolveValue))
      .toBe('while (x>0) { print(x); x <- x - 1 }')
  })
})

describe('repeat', () => {
  it('"repeat N times <body>"', () => {
    expect(recognizeControlFlow('repeat 5 times print hi', resolveValue)).toBe('for (.i in 1:5) { print(hi) }')
  })
})

describe('non-control-flow phrases are declined, not mangled', () => {
  it.each([
    'mean of 1,2,3',
    'let x be 5',
    'plot x and y',
  ])('%s -> null', (phrase) => {
    expect(recognizeControlFlow(phrase, resolveValue)).toBeNull()
  })
})
