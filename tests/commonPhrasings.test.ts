// A broad audit pass, not a numbered category from the example set: "think
// about all the things users could type into this extension" and widen
// coverage for the MOST COMMON ways of asking for things this project
// already supports, rather than adding brand-new capability. Organized by
// theme rather than by source file, since this pass cuts across almost
// every existing recognizer file. Each describe block below names the
// file(s) it touches.
import { describe, it, expect } from 'vitest'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('sum/total of a column, "avg" abbreviation (rDescriptiveStats.ts)', () => {
  it.each([
    ['the sum of income', 'sum(df$income, na.rm = TRUE)'],
    ['total income', 'sum(df$income, na.rm = TRUE)'],
    ['sum of score', 'sum(df$score, na.rm = TRUE)'],
    ['what is the total of income', 'sum(df$income, na.rm = TRUE)'],
    ['the avg of income', 'mean(df$income, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('bare noun-noun stats — "mean score", "median income" (rDescriptiveStats.ts)', () => {
  it.each([
    ['median income', 'median(df$income, na.rm = TRUE)'],
    ['mean score', 'mean(df$score, na.rm = TRUE)'],
    ['income mean', 'mean(df$income, na.rm = TRUE)'],
    ['total sales', 'sum(df$sales, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a truncated phrase never leaks a stray preposition through as a column name', () => {
    expect(() => resolveToRStatement('the mean of')).toThrow()
    expect(() => resolveToRStatement('the sum of')).toThrow()
  })
})

describe('correlation matrix for all numeric variables (rDescriptiveStats.ts)', () => {
  it.each([
    ['the correlation matrix of df', 'cor(df[sapply(df, is.numeric)], use = "complete.obs")'],
    ['a correlation matrix for all numeric variables', 'cor(df[sapply(df, is.numeric)], use = "complete.obs")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('count by group — "count by treatment" (rDescriptiveStats.ts)', () => {
  it.each([
    ['count by treatment', 'table(df$treatment)'],
    ['how many observations are in each treatment group', 'table(df$treatment)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a truncated "count by the" never leaks "the" through as a column name', () => {
    expect(() => resolveToRStatement('count by the')).toThrow()
  })
})

describe('bare row/column counts and head/tail defaulting to df (rDataInspection.ts)', () => {
  it.each([
    ['top 5 rows', 'head(df, 5)'],
    ['the top 10 rows', 'head(df, 10)'],
    ['the last 10 rows', 'tail(df, 10)'],
    ['the first few rows', 'head(df)'],
    ['the last few rows', 'tail(df)'],
    ['the number of rows', 'nrow(df)'],
    ['the total number of rows', 'nrow(df)'],
    ['the count of rows', 'nrow(df)'],
    ['how many rows are there', 'nrow(df)'],
    ['the number of columns', 'ncol(df)'],
    ['how many columns are there', 'ncol(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"top 5 rows" previously resolved WRONG — to the bare literal 5 via the shared engine — before this fix', () => {
    expect(resolveToRStatement('top 5 rows')).not.toBe('5')
    expect(resolveToRStatement('top 5 rows')).toBe('head(df, 5)')
  })
})

describe('bare missing-value and duplicate checks defaulting to df (rDataInspection.ts)', () => {
  it.each([
    ['are there any missing values', 'anyNA(df)'],
    ['how many missing values are there', 'sum(is.na(df))'],
    ['are there any NAs', 'anyNA(df)'],
    ['how many NAs are there', 'sum(is.na(df))'],
    ['are there any duplicates', 'anyDuplicated(df) > 0'],
    ['how many duplicate rows are there', 'sum(duplicated(df))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('"describe"/"what\'s in my dataset" as a summary() synonym (rDataInspection.ts)', () => {
  it.each([
    ['describe df', 'summary(df)'],
    ['describe my dataset', 'summary(df)'],
    ["what's in my dataset", 'summary(df)'],
    ["what's in my data", 'summary(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('mode / most common value (rDataInspection.ts)', () => {
  it.each([
    ['the mode of education', 'names(sort(table(df$education), decreasing = TRUE))[1]'],
    ['the most common value of education', 'names(sort(table(df$education), decreasing = TRUE))[1]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a truncated "the mode of the" never leaks "the" through as a column name', () => {
    expect(() => resolveToRStatement('the mode of the')).toThrow()
  })
})

describe('"change X to Y" as a convert-type synonym (rDataCleaning.ts)', () => {
  it('change gender to a factor -> df$gender <- as.factor(df$gender)', () => {
    expect(resolveToRStatement('change gender to a factor')).toBe('df$gender <- as.factor(df$gender)')
  })
})

describe('rounding a column (rDataTransform.ts)', () => {
  it.each([
    ['round income to 2 decimal places', 'df$income <- round(df$income, 2)'],
    ['round income to 2 digits', 'df$income <- round(df$income, 2)'],
    ['round score', 'df$score <- round(df$score)'],
    ['round income to the nearest whole number', 'df$income <- round(df$income)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"round income to 2 decimal places" previously resolved WRONG — to round(2), dropping the column — before this fix', () => {
    expect(resolveToRStatement('round income to 2 decimal places')).not.toBe('round(2)')
  })
})

describe('Shapiro-Wilk normality test (rStatisticalTests.ts)', () => {
  it.each([
    ['test whether score is normally distributed', 'shapiro.test(df$score)'],
    ['a shapiro-wilk test for score', 'shapiro.test(df$score)'],
    ['check if income is normally distributed', 'shapiro.test(df$income)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('"clear everything" (rWorkspace.ts)', () => {
  it('clear everything -> rm(list = ls()), not rm(everything)', () => {
    expect(resolveToRStatement('clear everything')).toBe('rm(list = ls())')
  })

  it('a genuine workspace variable removal still works unaffected', () => {
    expect(resolveToRStatement('remove x')).toBe('rm(x)')
  })

  it('"clear everything" previously resolved WRONG — to rm(everything), treating the word as a variable name — before this fix', () => {
    expect(resolveToRStatement('clear everything')).not.toBe('rm(everything)')
  })
})

describe('bare "load PACKAGE" and "load the X package" word order (rWorkspace.ts)', () => {
  it.each([
    ['load tidyverse', 'library(tidyverse)'],
    ['load the tidyverse package', 'library(tidyverse)'],
    ['load the package dplyr', 'library(dplyr)'],
    ['use ggplot2', 'library(ggplot2)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('does not collide with loading a saved .RData workspace file', () => {
    expect(resolveToRStatement('load data.RData')).toBe('load("data.RData")')
    expect(resolveToRStatement('load file.rda')).toBe('load("file.rda")')
    expect(resolveToRStatement('load the data from file.RData')).toBe('load("file.RData")')
  })
})

describe('"what\'s in my environment" and "what variables do I have" (rWorkspace.ts)', () => {
  it.each([
    ["what's in my environment", 'ls()'],
    ['what variables do I have', 'ls()'],
    ["what's in the workspace", 'ls()'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe("today's date / current date (rWorkspace.ts)", () => {
  it.each([
    ["today's date", 'Sys.Date()'],
    ['the current date', 'Sys.Date()'],
    ["what is today's date", 'Sys.Date()'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
    'the mean of',
    'the sum of',
    'count by the',
    'the mode of the',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })
})
