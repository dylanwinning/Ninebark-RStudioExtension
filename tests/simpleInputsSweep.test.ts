// "Run even more tests. Work on simple stuff and try to find any bugs" —
// a second stress-test pass focused specifically on terse, low-effort,
// everyday inputs (the opposite of the textbook-exact phrasings earlier
// passes targeted), to catch collisions between the many recognizer files
// that now populate the resolution chain.
import { describe, it, expect } from 'vitest'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('"help FUNCTION" bare, no preposition (rWorkspace.ts)', () => {
  it('previously resolved WRONG — "help mean" was swallowed by the bare noun-noun stat pattern as mean(df$help, na.rm = TRUE) — before this fix', () => {
    expect(resolveToRStatement('help mean')).toBe('help(mean)')
  })

  it.each([
    ['help on mean', 'help(mean)'],
    ['help with mean', 'help(mean)'],
    ['get help on mean', 'help(mean)'],
    ['help plot', 'help(plot)'],
    ['help nrow', 'help(nrow)'],
  ])('the existing prepositional forms are unaffected by this fix: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('shorter forms of "unique values" and "levels" (rDataInspection.ts)', () => {
  it.each([
    ['unique gender', 'unique(df$gender)'],
    ['unique values of gender', 'unique(df$gender)'],
    ['the number of unique values of gender', 'length(unique(df$gender))'],
    ['the levels of gender', 'levels(factor(df$gender))'],
  ])('the full "unique values IN COLUMN X OF df" phrasing turned out to be the ONLY one supported — %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a truncated phrase ("unique of", "the levels of") never leaks a preposition through as a column name', () => {
    expect(() => resolveToRStatement('unique of')).toThrow()
    expect(() => resolveToRStatement('the levels of')).toThrow()
  })
})

describe('terser column removal — "drop X", "remove X column" (rDataCleaning.ts)', () => {
  it.each([
    ['drop income', 'df$income <- NULL'],
    ['remove income column', 'df$income <- NULL'],
    ['remove the income column', 'df$income <- NULL'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"drop duplicates"/"drop incomplete rows" are claimed by their own, more specific patterns first, never misread as removing a column literally named "duplicates"', () => {
    expect(resolveToRStatement('drop duplicates')).toBe('unique(df)')
    expect(resolveToRStatement('drop incomplete rows')).toBe('na.omit(df)')
  })

  it('a truncated phrase ("drop the", "drop of") never leaks a preposition through as a column name', () => {
    expect(() => resolveToRStatement('drop the')).toThrow()
    expect(() => resolveToRStatement('drop of')).toThrow()
  })
})

describe('"count rows"/"count columns" with no article (rDataInspection.ts)', () => {
  it.each([
    ['count rows', 'nrow(df)'],
    ['count columns', 'ncol(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('bare "histogram X"/"boxplot X" with no "of" (rPlotting.ts)', () => {
  it.each([
    ['histogram age', 'hist(age)'],
    ['boxplot score', 'boxplot(score)'],
  ])('%s -> %s (standalone-vector semantics, same as the existing "of" forms)', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a truncated phrase ("histogram the", "boxplot of") never leaks a preposition through', () => {
    expect(() => resolveToRStatement('histogram the')).toThrow()
    expect(() => resolveToRStatement('boxplot of')).toThrow()
  })
})

describe('bare "today"/"now" (rWorkspace.ts)', () => {
  it.each([
    ['today', 'Sys.Date()'],
    ['now', 'Sys.time()'],
    ["today's date", 'Sys.Date()'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('sanity: core pre-existing vocabulary across every tier is unaffected by this sweep', () => {
  it.each([
    ['2 + 2', '2+2'],
    ['x <- 5', 'x <- 5'],
    ['TRUE', 'TRUE'],
    ['NA', 'NA'],
    ['c(1,2,3)', 'c(1,2,3)'],
    ['mean of 1,2,3,4,5', 'mean(c(1, 2, 3, 4, 5))'],
    ['square root of 16', 'sqrt(16)'],
    ['let x be 5', 'x <- 5'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('empty/whitespace-only input fails loud with a specific message, not a crash', () => {
    expect(() => resolveToRStatement('')).toThrow()
    expect(() => resolveToRStatement('   ')).toThrow()
  })
})
