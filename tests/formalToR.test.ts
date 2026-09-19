// formalStringToR: the shared "formal string" dialect → an R expression.
// Same dialect Ninebark-DesmosExtension renders to LaTeX,
// Ninebark-SheetsExtension renders to a spreadsheet formula, and
// Ninebark-MATLABExtension renders to a MATLAB expression.
import { describe, it, expect } from 'vitest'
import { formalStringToR, UnsupportedRFormalError } from '../src/formalToR'

describe('arithmetic & precedence — Ninebark\'s redundant parens fall out clean', () => {
  it.each([
    ['(2+2)', '2+2'],
    ['((x^2)-4)', 'x^2-4'],
    ['(((x^2)-1)/(x-1))', '(x^2-1)/(x-1)'],
    ['(2*(3+4))', '2*(3+4)'],
    ['((2+3)*4)', '(2+3)*4'],
    ['(-(3+4))', '-(3+4)'],
    ['(2^(3+4))', '2^(3+4)'],
    ['((a*b)^2)', '(a*b)^2'],
  ])('%s -> %s', (formal, expected) => {
    expect(formalStringToR(formal)).toBe(expected)
  })
})

describe('statistics vocabulary → base R + stats package', () => {
  it.each([
    ['mean({1,2,3,4,5})', 'mean(c(1, 2, 3, 4, 5))'],
    ['median({1,2,3})', 'median(c(1, 2, 3))'],
    ['stdDev({1,2,3})', 'sd(c(1, 2, 3))'],                    // sample sd, N-1
    ['popStdDev({1,2,3})', 'sqrt(sum((c(1, 2, 3)-mean(c(1, 2, 3)))^2)/length(c(1, 2, 3)))'],
    ['variance({1,2,3})', 'var(c(1, 2, 3))'],
    ['sum({1,2,3})', 'sum(c(1, 2, 3))'],
    ['count({1,2,3})', 'length(c(1, 2, 3))'],
    ['min({1,2,3})', 'min(c(1, 2, 3))'],
    ['max({1,2,3})', 'max(c(1, 2, 3))'],
    ['IQR({1,2,3,4})', 'IQR(c(1, 2, 3, 4))'],
    ['corrCoef({1,2,3},{2,4,6})', 'cor(c(1, 2, 3), c(2, 4, 6))'],   // R spells it "cor", not "corr"
    ['cov({1,2,3},{2,4,6})', 'cov(c(1, 2, 3), c(2, 4, 6))'],        // supported here — R's cov() is scalar for 2 vectors, unlike MATLAB's
    ['argmax({1,5,3})', 'which.max(c(1, 5, 3))'],                  // supported here — MATLAB rejects it
    ['argmin({1,5,3})', 'which.min(c(1, 5, 3))'],
    ['shuffle({1,2,3})', 'sample(c(1, 2, 3))'],                    // supported here — MATLAB rejects it
  ])('%s -> %s', (formal, expected) => {
    expect(formalStringToR(formal)).toBe(expected)
  })
})

describe('reciprocal trig — base R has no builtins, so each is its defining formula', () => {
  it.each([
    ['csc(x)', '(1/sin(x))'],
    ['sec(x)', '(1/cos(x))'],
    ['cot(x)', '(1/tan(x))'],
    ['acsc(x)', 'asin(1/x)'],
    ['asec(x)', 'acos(1/x)'],
    ['acot(x)', 'atan(1/x)'],
  ])('%s -> %s', (formal, expected) => {
    expect(formalStringToR(formal)).toBe(expected)
  })
})

describe('names R spells differently than the shared vocab', () => {
  it('ceil -> ceiling (not ceil)', () => {
    expect(formalStringToR('ceil(3.2)')).toBe('ceiling(3.2)')
  })
  it('ln -> log (natural log, one-arg log())', () => {
    expect(formalStringToR('ln(x)')).toBe('log(x)')
  })
  it('log -> log10 (Ninebark log = base 10)', () => {
    expect(formalStringToR('log(x)')).toBe('log10(x)')
  })
  it('logbase -> log(value, base = ...)', () => {
    expect(formalStringToR('logbase({8,2})')).toBe('log(8, base = 2)')
  })
  it('nCr -> choose()', () => {
    expect(formalStringToR('nCr(5,2)')).toBe('choose(5, 2)')
  })
})

describe('distributions → d/p/q stats-package functions', () => {
  it.each([
    ['normaldist(0,1).pdf(1.96)', 'dnorm(1.96, 0, 1)'],
    ['normaldist(0,1).cdf(1.96)', 'pnorm(1.96, 0, 1)'],
    ['normaldist(0,1).inversecdf(0.5)', 'qnorm(0.5, 0, 1)'],
    ['binomialdist(10,0.5).pdf(3)', 'dbinom(3, 10, 0.5)'],
    ['poissondist(4).cdf(2)', 'ppois(2, 4)'],
  ])('%s -> %s', (formal, expected) => {
    expect(formalStringToR(formal)).toBe(expected)
  })

  it('a bare distribution with no accessor is rejected', () => {
    expect(() => formalStringToR('normaldist(0,1)')).toThrow(UnsupportedRFormalError)
  })
})

describe('regression → lm()/poly()', () => {
  it('linear regression -> coef(lm(y ~ x))', () => {
    expect(formalStringToR('linReg({1,2,3},{2,4,6})')).toBe('coef(lm(c(2, 4, 6) ~ c(1, 2, 3)))')
  })
  it('quadratic regression -> coef(lm(y ~ poly(x, 2, raw = TRUE)))', () => {
    expect(formalStringToR('quadReg({1,2,3},{1,4,9})')).toBe('coef(lm(c(1, 4, 9) ~ poly(c(1, 2, 3), 2, raw = TRUE)))')
  })
  it('nonlinear regression is rejected with a specific reason', () => {
    expect(() => formalStringToR('expReg({1,2,3},{2,4,8})')).toThrow(/nls/)
  })
})

describe('vectors, ranges, and indexing', () => {
  it('a list literal -> c(...)', () => {
    expect(formalStringToR('{1,2,3}')).toBe('c(1, 2, 3)')
  })
  it('a range -> R colon range', () => {
    expect(formalStringToR('mean({1...9})')).toBe('mean((1:9))')
  })
  it('a stepped range -> seq(from, to, by=)', () => {
    expect(formalStringToR('{1,3...13}')).toBe('seq(1, 13, by = 2)')
  })
  it('indexing a computed list works (unlike MATLAB, which rejects this)', () => {
    expect(formalStringToR('{1,2,3}[2]')).toBe('c(1, 2, 3)[2]')
  })
})

describe('percent-of and misc wrappers', () => {
  it('percentof -> plain arithmetic', () => {
    expect(formalStringToR('percentof(20,50)')).toBe('20/100*50')
  })
  it('hypot -> sqrt(a^2+b^2) (no base R hypot())', () => {
    expect(formalStringToR('hypot(3,4)')).toBe('sqrt(3^2+4^2)')
    expect(formalStringToR('hypot(a+b,4)')).toBe('sqrt((a+b)^2+4^2)') // a looser-precedence arg DOES get wrapped
  })
  it('erf -> the normal-CDF identity (no base R erf())', () => {
    expect(formalStringToR('erf(1)')).toBe('(2*pnorm(1*sqrt(2))-1)')
    expect(formalStringToR('erf(a+b)')).toBe('(2*pnorm((a+b)*sqrt(2))-1)')
  })
})

describe('rejected with a specific, honest reason — never guessed', () => {
  it('solve() — base R has no symbolic solver', () => {
    expect(() => formalStringToR('solve(x^2=4)')).toThrow(/no symbolic algebra solver/)
  })
  it('mode() — R\'s mode() means something else entirely', () => {
    expect(() => formalStringToR('mode({1,2,2,3})')).toThrow(/different builtin/)
  })
  it('range() — R\'s range() returns c(min,max), not the spread', () => {
    expect(() => formalStringToR('range({1,2,3})')).toThrow(/not the spread/)
  })
  it('gcd/lcm — no base-R builtin', () => {
    expect(() => formalStringToR('gcd(12,18)')).toThrow(UnsupportedRFormalError)
    expect(() => formalStringToR('lcm(12,18)')).toThrow(UnsupportedRFormalError)
  })
  it('a slider — interactive, no R equivalent', () => {
    expect(() => formalStringToR('slider(a,0,10,1)')).toThrow(/interactive/)
  })
  it('an unrecognized function name fails loud, not silently', () => {
    expect(() => formalStringToR('totallyMadeUpFn(1,2)')).toThrow(UnsupportedRFormalError)
  })
})

describe('R\'s console model runs plot statements directly (unlike MATLAB\'s single-expression rejection)', () => {
  it.each([
    ['histogram({1,2,3})', 'hist(c(1, 2, 3))'],
    ['boxplot({1,2,3})', 'boxplot(c(1, 2, 3))'],
  ])('%s -> %s', (formal, expected) => {
    expect(formalStringToR(formal)).toBe(expected)
  })
})
