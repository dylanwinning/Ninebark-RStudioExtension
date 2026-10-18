// A persona-based audit pass, not a numbered category: "think specifically
// about a student in an introductory statistics class" — textbook-exact
// terms that don't come up again once you're past that course (nobody
// doing real analysis asks for "the empirical rule"), and often typed
// against a literal list of numbers rather than a data frame column
// (problem sets hand you "85, 90, 78, 92, 88" directly).
import { describe, it, expect } from 'vitest'
import { recognizeIntroStats } from '../src/rIntroStats'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('z-scores', () => {
  it.each([
    ['the z-score of 85 with mean 70 and standard deviation 10', '(85 - 70) / 10'],
    ['z score for 85 in a distribution with mean 70 and sd 10', '(85 - 70) / 10'],
    ['standardize 85 given mean 70 and sd 10', '(85 - 70) / 10'],
  ])('a single value with explicit parameters: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it.each([
    ['the z-score of score', '(df$score - mean(df$score, na.rm = TRUE)) / sd(df$score, na.rm = TRUE)'],
    ['convert score to z-scores', '(df$score - mean(df$score, na.rm = TRUE)) / sd(df$score, na.rm = TRUE)'],
  ])('a whole column, computed from its own mean/sd: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a literal numeric value never collides with rDataTransform.ts\'s column-mutating "standardize X"', () => {
    expect(resolveToRStatement('standardize income')).toBe('df$income <- as.numeric(scale(df$income))')
    expect(resolveToRStatement('standardize 85 given mean 70 and sd 10')).toBe('(85 - 70) / 10')
  })
})

describe('five-number summary', () => {
  it.each([
    ['the five number summary of 1,2,3,4,5,6,7,8,9', 'fivenum(c(1, 2, 3, 4, 5, 6, 7, 8, 9))'],
    ['the five-number summary of score', 'fivenum(df$score)'],
    ['fivenum of 1,2,3,4,5', 'fivenum(c(1, 2, 3, 4, 5))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('standard error of the mean (distinct from standard deviation)', () => {
  it.each([
    ['the standard error of the mean of 1,2,3,4,5', 'sd(c(1, 2, 3, 4, 5), na.rm = TRUE) / sqrt(sum(!is.na(c(1, 2, 3, 4, 5))))'],
    ['standard error of income', 'sd(df$income, na.rm = TRUE) / sqrt(sum(!is.na(df$income)))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a too-generic ask with no actual subject correctly declines rather than guessing', () => {
    expect(() => resolveToRStatement('the standard error of the sample mean')).toThrow()
  })
})

describe('outliers via the IQR (Tukey/boxplot) rule', () => {
  it.each([
    ['are there any outliers in score', 'boxplot.stats(na.omit(df$score))$out'],
    ['find outliers in income using the IQR rule', 'boxplot.stats(na.omit(df$income))$out'],
    ['identify outliers in score', 'boxplot.stats(na.omit(df$score))$out'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('the empirical rule (68-95-99.7)', () => {
  it.each([
    ['apply the empirical rule to score', 'mean(df$score, na.rm = TRUE) + (-3:3) * sd(df$score, na.rm = TRUE)'],
    ['the 68-95-99.7 rule for score', 'mean(df$score, na.rm = TRUE) + (-3:3) * sd(df$score, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"the 68-95-99.7 rule for score" previously resolved WRONG — to the literal arithmetic 68-95-99.7 — before this fix', () => {
    expect(resolveToRStatement('the 68-95-99.7 rule for score')).not.toBe('68-95-99.7')
  })
})

describe('simple linear regression: the line, slope, intercept, R-squared', () => {
  it.each([
    ['the slope and intercept of the regression line', 'coef(model)'],
    ['r-squared for the regression model', 'summary(model)$r.squared'],
    ['the coefficient of determination', 'summary(model)$r.squared'],
  ])('bare forms reuse rRegression.ts\'s own `model` convention: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it.each([
    ['the equation of the regression line for score and study_hours', 'coef(lm(score ~ study_hours, data = df))'],
    ['the line of best fit for score and study_hours', 'coef(lm(score ~ study_hours, data = df))'],
    ['the slope of the regression line for score on study_hours', 'coef(lm(score ~ study_hours, data = df))[2]'],
  ])('naming two real columns builds a fresh lm() instead: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('critical values (z or t) for a confidence level', () => {
  it.each([
    ['the critical t value for a 95% confidence level with 10 degrees of freedom', 'qt(0.975, df = 10)'],
    ['the critical value for a 95% confidence interval', 'qnorm(0.975)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('margin of error', () => {
  it.each([
    [
      'the margin of error for a 95% confidence interval for the mean income',
      'qt(0.975, df = sum(!is.na(df$income)) - 1) * sd(df$income, na.rm = TRUE) / sqrt(sum(!is.na(df$income)))',
    ],
    [
      'margin of error for income',
      'qt(0.975, df = sum(!is.na(df$income)) - 1) * sd(df$income, na.rm = TRUE) / sqrt(sum(!is.na(df$income)))',
    ],
  ])('%s -> %s (defaults to 95% when no level is named)', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('coefficient of variation', () => {
  it('the coefficient of variation of income -> sd/mean', () => {
    expect(resolveToRStatement('the coefficient of variation of income')).toBe('sd(df$income, na.rm = TRUE) / mean(df$income, na.rm = TRUE)')
  })
})

describe('skewness', () => {
  it.each([
    ['the skewness of score', 'e1071::skewness(df$score, na.rm = TRUE)'],
    ['is score skewed', 'e1071::skewness(df$score, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('binomial "more than k successes" (the complement of the shared engine\'s CDF)', () => {
  it('the probability of getting more than 3 successes in 10 trials with probability 0.5 -> 1 - pbinom(...)', () => {
    expect(resolveToRStatement('the probability of getting more than 3 successes in 10 trials with probability 0.5'))
      .toBe('1 - pbinom(3, 10, 0.5)')
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
    'the degrees of freedom for the t-test',
    'is this result statistically significant',
    'should I reject the null hypothesis',
  ])('"%s" fails loud rather than resolving to something wrong (no stored test result or sample size to reason from)', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeIntroStats('the mean of income')).toBeNull()
  })
})
