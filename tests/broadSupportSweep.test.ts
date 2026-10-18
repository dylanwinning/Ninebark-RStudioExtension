// "Come up with a bunch of example inputs and make sure they are supported
// (and supported correctly)" — a fresh, broad stress test across the
// whole vocabulary (not a numbered category), deliberately including
// phrasing variations not already locked down elsewhere, to catch
// anything that slipped through or regressed from the cumulative changes.
// Organized by theme, naming the file each fix actually lives in.
import { describe, it, expect } from 'vitest'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('import filename-swallowing bug, found in a "from" word order not covered before (rDataImport.ts)', () => {
  it.each([
    ['import the dataset from data.tsv', 'read.delim("data.tsv")'],
    ['load the dataset from data.rds', 'readRDS("data.rds")'],
    ['import the dataset from data.json', 'jsonlite::fromJSON("data.json")'],
    ['import the dataset from data.sav', 'haven::read_sav("data.sav")'],
    ['import the dataset from data.dta', 'haven::read_dta("data.dta")'],
    ['import the dataset from data.xlsx', 'readxl::read_excel("data.xlsx")'],
    ['import the dataset from data.csv', 'read.csv("data.csv")'],
  ])('"the dataset from FILE" previously got swallowed whole as the literal filename — %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"my data from FILE" (the originally-shipped fix) still works for every format, not just the one it shipped with', () => {
    expect(resolveToRStatement('import my data from data.csv')).toBe('read.csv("data.csv")')
    expect(resolveToRStatement('import my dataset from data.xlsx')).toBe('readxl::read_excel("data.xlsx")')
  })
})

describe('one-sample t-test "is N" as a synonym for "differs from N" (rStatisticalTests.ts)', () => {
  it('previously resolved WRONG — fell through to the shared engine as mean(c(30)) — before this fix', () => {
    expect(resolveToRStatement('test whether the mean age is 30')).toBe('t.test(df$age, mu = 30)')
  })

  it('the directional forms are unaffected by this addition', () => {
    expect(resolveToRStatement('test whether the mean age is greater than 30')).toBe('t.test(df$age, mu = 30, alternative = "greater")')
  })
})

describe('a single named column\'s missing-value count (rDataInspection.ts)', () => {
  it('the number of missing values in income -> sum(is.na(df$income))', () => {
    expect(resolveToRStatement('the number of missing values in income')).toBe('sum(is.na(df$income))')
  })

  it('does not change the EXISTING, intentional "assume X is your data frame\'s name" behavior for "does X have"/"are in X"', () => {
    expect(resolveToRStatement('how many missing values does mydataframe have')).toBe('sum(is.na(mydataframe))')
    expect(resolveToRStatement('how many missing values are in mydataframe')).toBe('sum(is.na(mydataframe))')
  })
})

describe('bare "sort by X" with no data frame named (rDataCleaning.ts)', () => {
  it.each([
    ['sort by score ascending', 'df[order(df$score), ]'],
    ['sort by score descending', 'df[order(-df$score), ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('"rename the X column to Y" — the reverse word order (rDataCleaning.ts)', () => {
  it('rename the educ column to education -> names(df)[names(df) == "educ"] <- "education"', () => {
    expect(resolveToRStatement('rename the educ column to education')).toBe('names(df)[names(df) == "educ"] <- "education"')
  })
})

describe('grouped stats without the word "group" (rDescriptiveStats.ts)', () => {
  it('calculate the mean of score for each gender -> aggregate(...), same as "...for each gender group"', () => {
    expect(resolveToRStatement('calculate the mean of score for each gender'))
      .toBe('aggregate(score ~ gender, data = df, FUN = function(x) c(mean = mean(x, na.rm = TRUE)))')
  })
})

describe('"fit a model predicting Y from X" with no "linear regression" qualifier (rRegression.ts)', () => {
  it('fit a model predicting score from study_hours -> model <- lm(score ~ study_hours, data = df)', () => {
    expect(resolveToRStatement('fit a model predicting score from study_hours')).toBe('model <- lm(score ~ study_hours, data = df)')
  })
})

describe('"take a random sample of N rows" (rResearchWorkflow.ts)', () => {
  it('take a random sample of 50 rows -> df[sample(nrow(df), 50), ]', () => {
    expect(resolveToRStatement('take a random sample of 50 rows')).toBe('df[sample(nrow(df), 50), ]')
  })
})

describe('binomial "fewer than k successes" — the other tail (rIntroStats.ts)', () => {
  it('the probability of getting fewer than 3 successes in 10 trials with probability 0.5 -> pbinom(2, 10, 0.5)', () => {
    expect(resolveToRStatement('the probability of getting fewer than 3 successes in 10 trials with probability 0.5'))
      .toBe('pbinom(2, 10, 0.5)')
  })

  it('the existing "more than" form is unaffected by this addition', () => {
    expect(resolveToRStatement('the probability of getting more than 3 successes in 10 trials with probability 0.5'))
      .toBe('1 - pbinom(3, 10, 0.5)')
  })
})

describe('sanity: core pre-existing vocabulary across every tier is unaffected by this sweep', () => {
  it.each([
    ['mean of 1,2,3,4,5', 'mean(c(1, 2, 3, 4, 5))'],
    ['x <- 5', 'x <- 5'],
    ['for i in 1 to 10 print i', 'for (i in 1:10) { print(i) }'],
    ['let x be 5', 'x <- 5'],
    ['plot(x, y)', 'plot(x, y)'],
    ['5 choose 2', 'choose(5, 2)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})
