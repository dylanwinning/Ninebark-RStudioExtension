import { describe, it, expect } from 'vitest'
import { recognizeResearchWorkflow } from '../src/rResearchWorkflow'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('91. "Set the random seed to 123." — reproducibility', () => {
  it.each([
    ['Set the random seed to 123.', 'set.seed(123)'],
    ['set the random seed to 123', 'set.seed(123)'],
    ['set the seed to 123', 'set.seed(123)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('92. "Draw a random sample of 100 rows from the dataset." — random row sampling', () => {
  it.each([
    ['Draw a random sample of 100 rows from the dataset.', 'df[sample(nrow(df), 100), ]'],
    ['draw a random sample of 100 rows from the dataset', 'df[sample(nrow(df), 100), ]'],
    ['sample 100 rows from the dataset', 'df[sample(nrow(df), 100), ]'],
    ['a random sample of 100 rows of df', 'df[sample(nrow(df), 100), ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('93. "Split the dataset into 80% training data and 20% testing data." — train/test split', () => {
  it.each([
    [
      'Split the dataset into 80% training data and 20% testing data.',
      'train_idx <- sample(nrow(df), 0.8 * nrow(df)); train_data <- df[train_idx, ]; test_data <- df[-train_idx, ]',
    ],
    [
      'split the dataset into 80% training data and 20% testing data',
      'train_idx <- sample(nrow(df), 0.8 * nrow(df)); train_data <- df[train_idx, ]; test_data <- df[-train_idx, ]',
    ],
    [
      'split the dataset into 70% training set and 30% test set',
      'train_idx <- sample(nrow(df), 0.7 * nrow(df)); train_data <- df[train_idx, ]; test_data <- df[-train_idx, ]',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('94. "Bootstrap the median of income 1,000 times." — bootstrap resampling', () => {
  it.each([
    [
      'Bootstrap the median of income 1,000 times.',
      'boot_medians <- replicate(1000, median(sample(df$income, replace = TRUE), na.rm = TRUE))',
    ],
    [
      'bootstrap the median of income 1,000 times',
      'boot_medians <- replicate(1000, median(sample(df$income, replace = TRUE), na.rm = TRUE))',
    ],
    [
      'bootstrap the median of income 1000 times',
      'boot_medians <- replicate(1000, median(sample(df$income, replace = TRUE), na.rm = TRUE))',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('also generalizes to the mean, not just the median — a real, parallel ask', () => {
    expect(resolveToRStatement('bootstrap the mean of income 500 times'))
      .toBe('boot_means <- replicate(500, mean(sample(df$income, replace = TRUE), na.rm = TRUE))')
  })
})

describe('95. "Calculate a bootstrap 95% confidence interval for the median of income." — bootstrap CI', () => {
  it.each([
    [
      'Calculate a bootstrap 95% confidence interval for the median of income.',
      'quantile(replicate(1000, median(sample(df$income, replace = TRUE), na.rm = TRUE)), c(0.025, 0.975))',
    ],
    [
      'calculate a bootstrap 95% confidence interval for the median of income',
      'quantile(replicate(1000, median(sample(df$income, replace = TRUE), na.rm = TRUE)), c(0.025, 0.975))',
    ],
    [
      'a bootstrap 95% confidence interval for the mean of income',
      'quantile(replicate(1000, mean(sample(df$income, replace = TRUE), na.rm = TRUE)), c(0.025, 0.975))',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('is fully self-contained — never depends on item 94\'s boot_medians having been run first', () => {
    expect(recognizeResearchWorkflow('a bootstrap 95% confidence interval for the median of income')).not.toContain('boot_medians')
  })
})

describe("96. \"Calculate Cohen's d for the difference in score between treatment and control.\" — effect size", () => {
  it.each([
    [
      "Calculate Cohen's d for the difference in score between treatment and control.",
      'effsize::cohen.d(df$score[df$treatment == "treatment"], df$score[df$treatment == "control"])',
    ],
    [
      "calculate Cohen's d for the difference in score between treatment and control",
      'effsize::cohen.d(df$score[df$treatment == "treatment"], df$score[df$treatment == "control"])',
    ],
    [
      "Cohen's d for the difference in score between treatment and control",
      'effsize::cohen.d(df$score[df$treatment == "treatment"], df$score[df$treatment == "control"])',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe("97. \"Calculate Cronbach's alpha for questionnaire items q1 through q10.\" — reliability", () => {
  it.each([
    ["Calculate Cronbach's alpha for questionnaire items q1 through q10.", 'psych::alpha(df[, paste0("q", 1:10)])'],
    ["calculate Cronbach's alpha for questionnaire items q1 through q10", 'psych::alpha(df[, paste0("q", 1:10)])'],
    ["Cronbach's alpha for items q1 to q10", 'psych::alpha(df[, paste0("q", 1:10)])'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('98. "Run principal component analysis on all numeric variables after standardizing them." — PCA', () => {
  it.each([
    [
      'Run principal component analysis on all numeric variables after standardizing them.',
      'prcomp(df[sapply(df, is.numeric)], scale. = TRUE)',
    ],
    [
      'run principal component analysis on all numeric variables after standardizing them',
      'prcomp(df[sapply(df, is.numeric)], scale. = TRUE)',
    ],
    ['run principal component analysis on all numeric variables', 'prcomp(df[sapply(df, is.numeric)], scale. = TRUE)'],
    ['run PCA on all numeric variables', 'prcomp(df[sapply(df, is.numeric)], scale. = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('the leading "run" is stripped by resolveRPhrase.ts\'s stripRLeadVerb() before this recognizer sees the text — the bare form must also work directly', () => {
    expect(recognizeResearchWorkflow('principal component analysis on all numeric variables'))
      .toBe('prcomp(df[sapply(df, is.numeric)], scale. = TRUE)')
  })
})

describe('99. "Save the cleaned dataset as cleaned_data.csv." — saving the cleaned dataset', () => {
  it.each([
    ['Save the cleaned dataset as cleaned_data.csv.', 'write.csv(df, "cleaned_data.csv", row.names = FALSE)'],
    ['save the cleaned dataset as cleaned_data.csv', 'write.csv(df, "cleaned_data.csv", row.names = FALSE)'],
    ['save the dataset as cleaned_data.csv', 'write.csv(df, "cleaned_data.csv", row.names = FALSE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('an .rds destination uses saveRDS(), not write.csv()', () => {
    expect(resolveToRStatement('save my dataset as output.rds')).toBe('saveRDS(df, "output.rds")')
  })

  it('does not collide with rDataImport.ts\'s "write df to output.csv" (a bare variable name, not a generic dataset reference)', () => {
    expect(resolveToRStatement('write df to output.csv')).toBe('write.csv(df, "output.csv", row.names = FALSE)')
  })
})

describe('100. "Save all the analysis steps performed so far in an R script called analysis.R." — saving session history', () => {
  it.each([
    [
      'Save all the analysis steps performed so far in an R script called analysis.R.',
      'savehistory("analysis.R")',
    ],
    [
      'save all the analysis steps performed so far in an R script called analysis.R',
      'savehistory("analysis.R")',
    ],
    ['save the analysis steps so far as an R script called analysis.R', 'savehistory("analysis.R")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeResearchWorkflow('the mean of income')).toBeNull()
  })
})
