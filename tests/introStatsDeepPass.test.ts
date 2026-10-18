// "Specifically think about the student in their intro statistics class"
// — a deliberate repeat of the intro-stats persona focus, going deeper
// into curriculum topics the earlier passes hadn't reached yet: quartiles,
// relative frequency tables, confidence interval for a DIFFERENCE in
// proportions (the one "CI for X" combination still missing), regression
// residuals and prediction intervals, the z-score reverse lookup, pooled
// standard deviation, expected value, and the complement rule.
import { describe, it, expect } from 'vitest'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('quartiles — textbook terminology for the 25th/50th/75th percentile (rDescriptiveStats.ts)', () => {
  it.each([
    ['the first quartile of score', 'quantile(df$score, probs = 0.25, na.rm = TRUE)'],
    ['Q1 of score', 'quantile(df$score, probs = 0.25, na.rm = TRUE)'],
    ['the third quartile of income', 'quantile(df$income, probs = 0.75, na.rm = TRUE)'],
    ['Q3 of income', 'quantile(df$income, probs = 0.75, na.rm = TRUE)'],
    ['the second quartile of score', 'quantile(df$score, probs = 0.5, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('relative frequency table (rDescriptiveStats.ts)', () => {
  it.each([
    ['a relative frequency table for education', 'prop.table(table(df$education))'],
    ['the relative frequency of education', 'prop.table(table(df$education))'],
  ])('the same prop.table() as "percentage of observations in each category," reached via equally common textbook wording: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('confidence interval for a DIFFERENCE in proportions (rStatisticalTests.ts)', () => {
  it.each([
    [
      'calculate a 95% confidence interval for the difference in proportions between treatment and control',
      'prop.test(table(df$treatment, df$success_column))$conf.int  # replace "success_column" with your actual success/failure column',
    ],
    [
      'a 90% confidence interval for the difference in success rates between treatment and control',
      'prop.test(table(df$treatment, df$success_column), conf.level = 0.9)$conf.int  # replace "success_column" with your actual success/failure column',
    ],
  ])('rounds out the "CI for X" family (mean, difference in means, a single proportion) with the one combination that was still missing: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('fixed a real bug found while adding this: TREATMENT_CONTROL in this file still required a mandatory "groups" word, unlike its sibling copy in rResearchWorkflow.ts — "between treatment and control" (no "groups") now works for every phrasing in this file, not just the new one', () => {
    expect(resolveToRStatement('compare the mean score between the treatment and control groups using an independent-samples t-test'))
      .toBe('t.test(score ~ treatment, data = df, var.equal = TRUE)')
    expect(() => resolveToRStatement('compare success rates between treatment and control using a two-proportion test')).not.toThrow()
  })
})

describe('regression residuals and prediction intervals (rRegression.ts)', () => {
  it.each([
    ['the residuals of the regression model', 'residuals(model)'],
    ['the residuals of the model', 'residuals(model)'],
  ])('a distinct ask from predicted/fitted values — actual minus predicted, not the predictions themselves: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a prediction interval for a new observation — genuinely different from (and wider than) a confidence interval for the mean response', () => {
    expect(resolveToRStatement('a 95% prediction interval for score given study_hours is 5'))
      .toBe('predict(model, newdata = data.frame(study_hours = 5), interval = "prediction", level = 0.95)')
  })
})

describe('the z-score reverse lookup — raw value from a z-score (rIntroStats.ts)', () => {
  it.each([
    ['what raw score has a z-score of 2 with mean 70 and sd 10', '70 + 2 * 10'],
    ['the raw score for a z-score of 2 with mean 70 and sd 10', '70 + 2 * 10'],
  ])('%s -> %s (just as common an exercise as the forward z-score direction)', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('pooled standard deviation (rIntroStats.ts)', () => {
  it('the pooled standard deviation of score for treatment and control -> the two-independent-samples-t-test formula, computed directly', () => {
    expect(resolveToRStatement('the pooled standard deviation of score for treatment and control')).toBe(
      'n1 <- sum(df$treatment == "treatment"); n2 <- sum(df$treatment == "control"); s1 <- sd(df$score[df$treatment == "treatment"], na.rm = TRUE); s2 <- sd(df$score[df$treatment == "control"], na.rm = TRUE); sqrt(((n1 - 1) * s1^2 + (n2 - 1) * s2^2) / (n1 + n2 - 2))',
    )
  })
})

describe('expected value — binomial mean and a fair die\'s mean (rIntroStats.ts)', () => {
  it.each([
    ['the expected value of a binomial distribution with 10 trials and probability 0.5', '10 * 0.5'],
    ['the expected value of a fair six-sided die', '3.5'],
    ['the expected value of a fair 20-sided die', '10.5'],
  ])('closed-form formulas, not a generic (and much harder) "what\'s the expected value of X" parser: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('the complement rule (rIntroStats.ts)', () => {
  it('the complement of 0.3 -> 1 - 0.3', () => {
    expect(resolveToRStatement('the complement of 0.3')).toBe('1 - 0.3')
  })
})

describe('deliberately left unsupported: genuinely ambiguous probability word problems', () => {
  it('"the probability of A or B" with no stated independence/mutual-exclusivity is correctly declined, not guessed', () => {
    expect(() => resolveToRStatement('the probability of A or B if P(A) is 0.3 and P(B) is 0.4')).toThrow()
  })

  it('test power / sample-size-for-a-given-power needs an effect size this pipeline has no way to infer, and is correctly declined', () => {
    expect(() => resolveToRStatement('the power of the test')).toThrow()
    expect(() => resolveToRStatement('the sample size needed for a power of 0.8')).toThrow()
  })
})
