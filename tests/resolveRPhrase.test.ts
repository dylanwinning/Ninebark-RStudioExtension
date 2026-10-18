// The full resolution pipeline: plain English → an RCommand (target +
// R code). Integration-level — exercises raw pass-through, every native
// recognizer, the Console/Source routing split, the vendored tier-1
// vocabulary, tier-2 NL, and the fail-loud boundary.
import { describe, it, expect } from 'vitest'
import { resolveToRCommand, resolveToRStatement, RNlFailure } from '../src/resolveRPhrase'

describe('raw R pass-through', () => {
  it.each([
    ['x <- 5', 'x <- 5'],
    ['x = 5', 'x = 5'],
    ['A[1] <- 7', 'A[1] <- 7'],
    ['plot(t, y)', 'plot(t, y)'],
    ['print(x)', 'print(x)'],
    ['mean(c(1,2,3))', 'mean(c(1,2,3))'],
    ['c(1, 2, 3)', 'c(1, 2, 3)'],
    ['1:10', '1:10'],
    ['TRUE', 'TRUE'],
    ['NA', 'NA'],
  ])('%s passes through verbatim', (input, expected) => {
    expect(resolveToRStatement(input)).toBe(expected)
  })

  it('an expression the tier-2 NL engine would mangle ("sin(x)/x") is kept as-is', () => {
    expect(resolveToRStatement('sin(x)/x')).toBe('sin(x)/x')
  })

  it('"x == 5" (a comparison) is not silently rewritten as the assignment "x <- 5"', () => {
    expect(resolveToRStatement('x == 5')).not.toBe('x <- 5')
  })

  it('resolves to the Console target by default', () => {
    expect(resolveToRCommand('mean of 1,2,3').target).toBe('console')
  })
})

describe('shared math vocabulary reduces to an R expression', () => {
  it.each([
    ['mean of 1,2,3,4,5', 'mean(c(1, 2, 3, 4, 5))'],
    ['standard deviation of 2,4,4,4,5,5,7,9', 'sd(c(2, 4, 4, 4, 5, 5, 7, 9))'],
    ['the square root of 16', 'sqrt(16)'],
    ['5 choose 2', 'choose(5, 2)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"at <point>" evaluates the CDF there and returns a plain number — it does NOT plot (reported as broken by a real user; it is correct — the fix was adding a SEPARATE "plot a normal distribution ..." phrasing, see rPlotting.test.ts, not changing this one)', () => {
    expect(resolveToRStatement('cdf of a normal distribution with mean 0 and sd 1 at 1.96')).toBe('pnorm(1.96, 0, 1)')
  })

  it.each([
    // Regression test: "std dev"/"stdev" were reported as "not recognized" —
    // the vendored tier-2 lexicon had "standard deviation" and "stddev" (one
    // word, double d) but not the equally common "std dev" (two words) or
    // "stdev" (one word, single d); "population std dev" already worked,
    // which is what made the gap an asymmetry rather than a deliberate
    // omission. Fixed in vendor/ninebark-engine/ninebark-nl/nl/lexicon/
    // classes.ts (a local patch pending an upstream re-sync — see that
    // file's comment and src/vendor/ninebark-engine/README.md).
    ['std dev of 5, 6, 7', 'sd(c(5, 6, 7))'],
    ['stdev of 5, 6, 7', 'sd(c(5, 6, 7))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('assignment', () => {
  it.each([
    ['let x be 5', 'x <- 5'],
    ['set x to 5', 'x <- 5'],
    ['define x as 3*4', 'x <- 3*4'],
    ['let r be the mean of 1,2,3', 'r <- mean(c(1, 2, 3))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('function definition -> an R closure', () => {
    expect(resolveToRStatement('define f of x as x^2')).toBe('f <- function(x) x^2')
  })

  it('multi-param function definition', () => {
    expect(resolveToRStatement('let g of x and y be x + y')).toBe('g <- function(x, y) x+y')
  })
})

describe('workspace & packages', () => {
  it.each([
    ['clear the workspace', 'rm(list = ls())'],
    ['clear x', 'rm(x)'],
    ['clear x and y', 'rm(x, y)'],
    ['list the variables', 'ls()'],
    ['install the package ggplot2', 'install.packages("ggplot2")'],
    ['load the package dplyr', 'library(dplyr)'],
    ['what is the working directory', 'getwd()'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('vectors & data frames', () => {
  it.each([
    ['read the csv file data.csv into df', 'df <- read.csv("data.csv")'],
    ['the first 5 rows of df', 'head(df, 5)'],
    ['summary of df', 'summary(df)'],
    ['the dimensions of df', 'dim(df)'],
    ['sort df by age descending', 'df[order(-df$age), ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('filter with a comparison condition', () => {
    expect(resolveToRStatement('filter df where age is greater than 30')).toBe('df[df$age>30, ]')
  })

  it('select columns', () => {
    expect(resolveToRStatement('select the columns name and age from df')).toBe('df[, c("name", "age")]')
  })
})

describe('plotting', () => {
  it.each([
    ['scatter plot of x and y', 'plot(x, y)'],
    ['histogram of x', 'hist(x)'],
    ["add a title 'Results'", 'title("Results")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('control flow', () => {
  it('for loop', () => {
    expect(resolveToRStatement('for i in 1 to 10 print i')).toBe('for (i in 1:10) { print(i) }')
  })
  it('if/else', () => {
    expect(resolveToRStatement('if x is greater than 5 print big else print small'))
      .toBe('if (x>5) { print(big) } else { print(small) }')
  })
  it('if with no else', () => {
    expect(resolveToRStatement('if x is greater than 5 print x')).toBe('if (x>5) { print(x) }')
  })
  it('while with an increment chain', () => {
    expect(resolveToRStatement('while x is less than 10 print x and increment x'))
      .toBe('while (x<10) { print(x); x <- x + 1 }')
  })
})

describe('calculus', () => {
  it('symbolic differentiation', () => {
    expect(resolveToRStatement('differentiate x^2 with respect to x')).toBe('D(expression(x^2), "x")')
  })
  it('numeric definite integral', () => {
    expect(resolveToRStatement('integral of x^2 from 0 to 1')).toBe('integrate(function(x) x^2, lower = 0, upper = 1)')
  })
  it('a symbolic antiderivative is rejected — base R has no symbolic integrator', () => {
    expect(() => resolveToRStatement('the antiderivative of x^2')).toThrow(/no symbolic integrator/)
  })
})

describe('linear algebra', () => {
  it.each([
    ['the determinant of A', 'det(A)'],
    ['the inverse of A', 'solve(A)'],
    ['the transpose of A', 't(A)'],
    ['multiply A by B', 'A %*% B'],
    ['the eigenvalues of A', 'eigen(A)$values'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('string operations', () => {
  it.each([
    ['concatenate "a" and "b"', 'paste0("a", "b")'],
    ['the length of the string "hello"', 'nchar("hello")'],
    ['convert x to uppercase', 'toupper(x)'],
    ['trim whitespace from x', 'trimws(x)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('Console vs. Source-editor routing (EXECUTION.md §3)', () => {
  it('a bare command defaults to the Console', () => {
    expect(resolveToRCommand('let x be 5').target).toBe('console')
  })
  it('"in the script <phrase>" routes to the Source editor', () => {
    const r = resolveToRCommand('in the script let x be 5')
    expect(r.target).toBe('source')
    expect(r.code).toBe('x <- 5')
  })
  it('"insert <phrase> into the script" routes to the Source editor', () => {
    const r = resolveToRCommand('insert let x be 5 into the script')
    expect(r.target).toBe('source')
    expect(r.code).toBe('x <- 5')
  })
  it('"add <phrase> to the script" routes to the Source editor', () => {
    const r = resolveToRCommand('add for i in 1 to 10 print i to the script')
    expect(r.target).toBe('source')
    expect(r.code).toBe('for (i in 1:10) { print(i) }')
  })
})

describe('conversational lead-ins are stripped', () => {
  it.each([
    'compute the mean of 1,2,3',
    'what is the mean of 1,2,3',
    'run mean of 1,2,3',
  ])('%s -> mean(c(1, 2, 3))', (phrase) => {
    expect(resolveToRStatement(phrase)).toBe('mean(c(1, 2, 3))')
  })
})

describe('fail-loud boundary', () => {
  it('empty input throws RNlFailure', () => {
    expect(() => resolveToRStatement('')).toThrow(RNlFailure)
  })
  it('gibberish throws a specific message, not a silent guess', () => {
    expect(() => resolveToRStatement('asdkjasldkj alksjdlaksjd')).toThrow(RNlFailure)
  })
  it('an R-unsupported formal construct (solve) surfaces its specific reason', () => {
    expect(() => resolveToRStatement('solve x^2 = 4')).toThrow(/no symbolic algebra solver/)
  })
})

describe('silent wrong output from dropped-but-unreported words (regression)', () => {
  // nlToFormal() is deliberately lenient about words it can't place
  // (DECISION-37: "drop-and-surface, not reject") — it strips them from the
  // math-only stream and still returns ok:true on whatever's left, recording
  // what it dropped in `unrecognized`. Neither call site in
  // resolveRPhrase.ts (resolveToRStatement, and the resolveValue used by
  // the assignment recognizer) read that field, so e.g. "let x be blah
  // thirds" would silently assign x <- 1/3 with zero indication "blah" was
  // ignored. Same bug/fix as Ninebark-DesmosExtension's resolvePhrase.ts.
  it('"blah thirds" fails instead of silently resolving to a statement', () => {
    expect(() => resolveToRStatement('blah thirds')).toThrow(RNlFailure)
    expect(() => resolveToRStatement('blah thirds')).toThrow(/"blah"/)
  })

  it('"two and a halfth" fails instead of silently resolving to a wrong statement', () => {
    expect(() => resolveToRStatement('two and a halfth')).toThrow(/"halfth"/)
  })

  it('the same bug via the resolveValue path (assignment RHS)', () => {
    expect(() => resolveToRStatement('let x be blah thirds')).toThrow(/"blah"/)
  })

  it('legitimate filler words still drop silently', () => {
    expect(resolveToRStatement('please calculate 2 plus 2')).toBe('2+2')
  })
})
