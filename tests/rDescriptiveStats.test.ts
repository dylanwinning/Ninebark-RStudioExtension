import { describe, it, expect } from 'vitest'
import { recognizeDescriptiveStats } from '../src/rDescriptiveStats'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('41. "Calculate the mean of income." — mean', () => {
  it.each([
    ['Calculate the mean of income.', 'mean(df$income, na.rm = TRUE)'],
    ['calculate the mean of income', 'mean(df$income, na.rm = TRUE)'],
    ['the mean of income', 'mean(df$income, na.rm = TRUE)'],
    ['find the mean of income', 'mean(df$income, na.rm = TRUE)'],
    ['what is the mean of income', 'mean(df$income, na.rm = TRUE)'],
    ['the average of income', 'mean(df$income, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('42. "Calculate the median of income." — median', () => {
  it.each([
    ['Calculate the median of income.', 'median(df$income, na.rm = TRUE)'],
    ['the median of income', 'median(df$income, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('43. "Calculate the standard deviation of score." — standard deviation', () => {
  it.each([
    ['Calculate the standard deviation of score.', 'sd(df$score, na.rm = TRUE)'],
    ['the standard deviation of score', 'sd(df$score, na.rm = TRUE)'],
    ['the std dev of score', 'sd(df$score, na.rm = TRUE)'],
    ['the stdev of score', 'sd(df$score, na.rm = TRUE)'],
    ['the sd of score', 'sd(df$score, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('44. "Calculate the variance of score." — variance', () => {
  it.each([
    ['Calculate the variance of score.', 'var(df$score, na.rm = TRUE)'],
    ['the variance of score', 'var(df$score, na.rm = TRUE)'],
    ['the var of score', 'var(df$score, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('45. "Show the minimum, maximum, and range of income." — min/max/range', () => {
  it.each([
    [
      'Show the minimum, maximum, and range of income.',
      'c(min = min(df$income, na.rm = TRUE), max = max(df$income, na.rm = TRUE), range = max(df$income, na.rm = TRUE) - min(df$income, na.rm = TRUE))',
    ],
    [
      'show the minimum, maximum, and range of income',
      'c(min = min(df$income, na.rm = TRUE), max = max(df$income, na.rm = TRUE), range = max(df$income, na.rm = TRUE) - min(df$income, na.rm = TRUE))',
    ],
    [
      'show the min, max, and range of income',
      'c(min = min(df$income, na.rm = TRUE), max = max(df$income, na.rm = TRUE), range = max(df$income, na.rm = TRUE) - min(df$income, na.rm = TRUE))',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it.each([
    ['the minimum of income', 'min(df$income, na.rm = TRUE)'],
    ['the maximum of income', 'max(df$income, na.rm = TRUE)'],
    ['the range of income', 'max(df$income, na.rm = TRUE) - min(df$income, na.rm = TRUE)'],
  ])('each statistic also works asked for on its own: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('46. "Calculate the interquartile range of income." — IQR', () => {
  it.each([
    ['Calculate the interquartile range of income.', 'IQR(df$income, na.rm = TRUE)'],
    ['the interquartile range of income', 'IQR(df$income, na.rm = TRUE)'],
    ['the IQR of income', 'IQR(df$income, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('47. "Calculate the 10th, 25th, 50th, 75th, and 90th percentiles of score." — percentiles', () => {
  it.each([
    [
      'Calculate the 10th, 25th, 50th, 75th, and 90th percentiles of score.',
      'quantile(df$score, probs = c(0.1, 0.25, 0.5, 0.75, 0.9), na.rm = TRUE)',
    ],
    [
      'the 10th, 25th, 50th, 75th, and 90th percentiles of score',
      'quantile(df$score, probs = c(0.1, 0.25, 0.5, 0.75, 0.9), na.rm = TRUE)',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a single percentile produces a scalar probs, not a one-item c()', () => {
    expect(resolveToRStatement('the 90th percentile of score')).toBe('quantile(df$score, probs = 0.9, na.rm = TRUE)')
  })
})

describe('48. "Create a frequency table for education." — frequency table', () => {
  it.each([
    ['Create a frequency table for education.', 'table(df$education)'],
    ['create a frequency table for education', 'table(df$education)'],
    ['a frequency table of education', 'table(df$education)'],
    ['the frequency of education', 'table(df$education)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('49. "Calculate the percentage of observations in each education category." — percentage by category', () => {
  it.each([
    ['Calculate the percentage of observations in each education category.', 'prop.table(table(df$education)) * 100'],
    ['the percentage of observations in each education category', 'prop.table(table(df$education)) * 100'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"proportion" stays 0-1 rather than multiplying by 100 — a genuinely different number, not just different code', () => {
    expect(resolveToRStatement('the proportion of observations in each education category')).toBe('prop.table(table(df$education))')
  })
})

describe('50. "Create a contingency table of gender by treatment." — contingency table', () => {
  it.each([
    ['Create a contingency table of gender by treatment.', 'table(df$gender, df$treatment)'],
    ['create a contingency table of gender by treatment', 'table(df$gender, df$treatment)'],
    ['a two-way table of gender and treatment', 'table(df$gender, df$treatment)'],
    ['cross-tabulate gender and treatment', 'table(df$gender, df$treatment)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('51. "Calculate the mean, median, and standard deviation of score for each treatment group." — grouped statistics', () => {
  it.each([
    [
      'Calculate the mean, median, and standard deviation of score for each treatment group.',
      'aggregate(score ~ treatment, data = df, FUN = function(x) c(mean = mean(x, na.rm = TRUE), median = median(x, na.rm = TRUE), standard_deviation = sd(x, na.rm = TRUE)))',
    ],
    [
      'the mean, median, and standard deviation of score for each treatment group',
      'aggregate(score ~ treatment, data = df, FUN = function(x) c(mean = mean(x, na.rm = TRUE), median = median(x, na.rm = TRUE), standard_deviation = sd(x, na.rm = TRUE)))',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('any subset/combination of this file\'s own stat words works, not just the literal three', () => {
    expect(resolveToRStatement('the mean and sd of score for each treatment group'))
      .toBe('aggregate(score ~ treatment, data = df, FUN = function(x) c(mean = mean(x, na.rm = TRUE), sd = sd(x, na.rm = TRUE)))')
  })
})

describe('52. "Calculate the correlation between study_hours and score." — correlation', () => {
  it.each([
    ['Calculate the correlation between study_hours and score.', 'cor(df$study_hours, df$score, use = "complete.obs")'],
    ['the correlation between study_hours and score', 'cor(df$study_hours, df$score, use = "complete.obs")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('does not disturb the existing shared literal-list statistics vocabulary', () => {
  it.each([
    ['the mean of 1,2,3,4,5', 'mean(c(1, 2, 3, 4, 5))'],
    ['standard deviation of 2,4,4,4,5,5,7,9', 'sd(c(2, 4, 4, 4, 5, 5, 7, 9))'],
    ['correlation between 1,2,3 and 2,4,6', 'cor(c(1, 2, 3), c(2, 4, 6))'],
  ])('a literal number list still falls through to the shared engine unaffected: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
    'the mean of',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeDescriptiveStats('remove rows with missing values in income')).toBeNull()
  })
})
