import { describe, it, expect } from 'vitest'
import { recognizeStatisticalTests } from '../src/rStatisticalTests'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('66. "Test whether the mean score differs from 50 using a one-sample t-test." — one-sample t-test', () => {
  it.each([
    ['Test whether the mean score differs from 50 using a one-sample t-test.', 't.test(df$score, mu = 50)'],
    ['test whether the mean score differs from 50 using a one-sample t-test', 't.test(df$score, mu = 50)'],
    ['test if the mean score differs from 50 using a one-sample t-test', 't.test(df$score, mu = 50)'],
    ['a one-sample t-test for score against 50', 't.test(df$score, mu = 50)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('67. "Compare the mean score between the treatment and control groups using an independent-samples t-test." — Student\'s independent-samples t-test', () => {
  it.each([
    ['Compare the mean score between the treatment and control groups using an independent-samples t-test.', 't.test(score ~ treatment, data = df, var.equal = TRUE)'],
    ['compare the mean score between the treatment and control groups using an independent-samples t-test', 't.test(score ~ treatment, data = df, var.equal = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('with no real grouping column named, emits the right shape with an obvious placeholder', () => {
    expect(resolveToRStatement('compare the mean score between two independent groups using an independent-samples t-test'))
      .toBe('t.test(score ~ group_column, data = df, var.equal = TRUE)  # replace "group_column" with your actual grouping column')
  })
})

describe('68. "Compare the mean score between two independent groups using Welch\'s t-test." — Welch\'s t-test', () => {
  it('with no real grouping column named, emits the right shape with an obvious placeholder', () => {
    expect(resolveToRStatement("Compare the mean score between two independent groups using Welch's t-test."))
      .toBe('t.test(score ~ group_column, data = df, var.equal = FALSE)  # replace "group_column" with your actual grouping column')
  })

  it('naming the real treatment/control grouping resolves fully, no placeholder', () => {
    expect(resolveToRStatement("compare the mean score between the treatment and control groups using Welch's t-test"))
      .toBe('t.test(score ~ treatment, data = df, var.equal = FALSE)')
  })

  it("Student's and Welch's differ only in var.equal, as intended — not the same statement", () => {
    const student = resolveToRStatement('compare the mean score between the treatment and control groups using an independent-samples t-test')
    const welch = resolveToRStatement("compare the mean score between the treatment and control groups using Welch's t-test")
    expect(student).toContain('var.equal = TRUE')
    expect(welch).toContain('var.equal = FALSE')
  })
})

describe('69. "Compare before_score and after_score using a paired t-test." — paired t-test', () => {
  it.each([
    ['Compare before_score and after_score using a paired t-test.', 't.test(df$before_score, df$after_score, paired = TRUE)'],
    ['compare before_score and after_score using a paired t-test', 't.test(df$before_score, df$after_score, paired = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('70. "Compare score between two independent groups using a Wilcoxon rank-sum test." — Wilcoxon rank-sum / Mann-Whitney', () => {
  it.each([
    [
      'Compare score between two independent groups using a Wilcoxon rank-sum test.',
      'wilcox.test(score ~ group_column, data = df)  # replace "group_column" with your actual grouping column',
    ],
    [
      'compare score between two independent groups using a Wilcoxon rank-sum test',
      'wilcox.test(score ~ group_column, data = df)  # replace "group_column" with your actual grouping column',
    ],
    [
      'compare score between two independent groups using a Mann-Whitney test',
      'wilcox.test(score ~ group_column, data = df)  # replace "group_column" with your actual grouping column',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('naming the real treatment/control grouping resolves fully, no placeholder', () => {
    expect(resolveToRStatement('compare score between the treatment and control groups using a Wilcoxon rank-sum test'))
      .toBe('wilcox.test(score ~ treatment, data = df)')
  })
})

describe('71. "Calculate a 95% confidence interval for the mean income." — CI for a mean', () => {
  it.each([
    ['Calculate a 95% confidence interval for the mean income.', 't.test(df$income)$conf.int'],
    ['calculate a 95% confidence interval for the mean income', 't.test(df$income)$conf.int'],
    ['a 95% confidence interval for the mean income', 't.test(df$income)$conf.int'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('72. "Calculate a 95% confidence interval for the difference in mean score between treatment and control." — CI for a difference in means', () => {
  it.each([
    [
      'Calculate a 95% confidence interval for the difference in mean score between treatment and control.',
      't.test(score ~ treatment, data = df)$conf.int',
    ],
    [
      'calculate a 95% confidence interval for the difference in mean score between treatment and control',
      't.test(score ~ treatment, data = df)$conf.int',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('73. "Test whether the proportion of successes differs from 0.5." — one-sample proportion test', () => {
  it.each([
    [
      'Test whether the proportion of successes differs from 0.5.',
      'prop.test(sum(df$success_column), nrow(df), p = 0.5)  # replace "success_column" with your actual success/failure column',
    ],
    [
      'test whether the proportion of successes differs from 0.5',
      'prop.test(sum(df$success_column), nrow(df), p = 0.5)  # replace "success_column" with your actual success/failure column',
    ],
    [
      'test if the proportion of success equals 0.5',
      'prop.test(sum(df$success_column), nrow(df), p = 0.5)  # replace "success_column" with your actual success/failure column',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('74. "Compare success rates between the treatment and control groups using a two-proportion test." — two-proportion test', () => {
  it.each([
    [
      'Compare success rates between the treatment and control groups using a two-proportion test.',
      'prop.test(table(df$treatment, df$success_column))  # replace "success_column" with your actual success/failure column',
    ],
    [
      'compare success rates between the treatment and control groups using a two-proportion test',
      'prop.test(table(df$treatment, df$success_column))  # replace "success_column" with your actual success/failure column',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('75. "Test whether treatment and outcome are associated using a chi-squared test." — chi-squared test', () => {
  it.each([
    ['Test whether treatment and outcome are associated using a chi-squared test.', 'chisq.test(table(df$treatment, df$outcome))'],
    ['test whether treatment and outcome are associated using a chi-squared test', 'chisq.test(table(df$treatment, df$outcome))'],
    ['test if treatment and outcome are associated using a chi squared test', 'chisq.test(table(df$treatment, df$outcome))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe("76. \"Test whether treatment and outcome are associated using Fisher's exact test.\" — Fisher's exact test", () => {
  it.each([
    ["Test whether treatment and outcome are associated using Fisher's exact test.", 'fisher.test(table(df$treatment, df$outcome))'],
    ["test whether treatment and outcome are associated using Fisher's exact test", 'fisher.test(table(df$treatment, df$outcome))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('77. "Test whether mean score differs across treatment groups using a one-way ANOVA." — one-way ANOVA', () => {
  it.each([
    ['Test whether mean score differs across treatment groups using a one-way ANOVA.', 'summary(aov(score ~ treatment, data = df))'],
    ['test whether mean score differs across treatment groups using a one-way ANOVA', 'summary(aov(score ~ treatment, data = df))'],
    ['a one-way ANOVA of score by treatment', 'summary(aov(score ~ treatment, data = df))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe("78. \"Perform Tukey's HSD post-hoc test to compare the group means following the ANOVA.\" — Tukey's HSD", () => {
  it('with no columns named, emits the right shape with obvious placeholders for both the outcome and grouping column', () => {
    expect(resolveToRStatement("Perform Tukey's HSD post-hoc test to compare the group means following the ANOVA."))
      .toBe('TukeyHSD(aov(y_column ~ group_column, data = df))  # replace "y_column" and "group_column" with the outcome/grouping columns from your ANOVA')
  })

  it.each([
    ["Tukey's HSD test for score by treatment", 'TukeyHSD(aov(score ~ treatment, data = df))'],
    ["Tukey's HSD post-hoc test of score across treatment groups", 'TukeyHSD(aov(score ~ treatment, data = df))'],
  ])('naming real columns resolves fully: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('79. "Compare score across treatment groups using the Kruskal–Wallis test." — Kruskal-Wallis test', () => {
  it.each([
    ['Compare score across treatment groups using the Kruskal–Wallis test.', 'kruskal.test(score ~ treatment, data = df)'],
    ['compare score across treatment groups using the Kruskal-Wallis test', 'kruskal.test(score ~ treatment, data = df)'],
    ['a Kruskal-Wallis test of score by treatment', 'kruskal.test(score ~ treatment, data = df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

// A later, persona-based audit pass: "think about what [an intro stats
// student] may struggle with most and how they might ask" — one-tailed
// (directional) tests are the classic "which tail?" confusion, every CI
// function defaulting to 95% is a trap for anyone whose problem actually
// asks for 90%/99%, and homework is rarely phrased as cleanly as this
// file's own patterns.
describe('one-tailed (directional) one-sample t-tests — the classic "which tail?" struggle', () => {
  it.each([
    ['test whether the mean score is greater than 50', 't.test(df$score, mu = 50, alternative = "greater")'],
    ['test whether the mean score is less than 50', 't.test(df$score, mu = 50, alternative = "less")'],
    ['is the mean score greater than 50', 't.test(df$score, mu = 50, alternative = "greater")'],
    ['test whether the mean score is greater than 50 using a one-sample t-test', 't.test(df$score, mu = 50, alternative = "greater")'],
    ['test the claim that the mean score is greater than 70', 't.test(df$score, mu = 70, alternative = "greater")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('the two-sided ("differs from") form also works with no "using a one-sample t-test" suffix', () => {
    expect(resolveToRStatement('test whether the mean score differs from 50')).toBe('t.test(df$score, mu = 50)')
  })
})

describe('confidence levels other than 95% — everyone assumes 95% is the only option', () => {
  it.each([
    ['calculate a 90% confidence interval for the mean income', 't.test(df$income, conf.level = 0.9)$conf.int'],
    ['calculate a 99% confidence interval for the mean income', 't.test(df$income, conf.level = 0.99)$conf.int'],
    ['a 90% confidence interval for income', 't.test(df$income, conf.level = 0.9)$conf.int'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('95% itself omits the redundant conf.level argument — t.test()\'s own default', () => {
    expect(resolveToRStatement('calculate a 95% confidence interval for the mean income')).toBe('t.test(df$income)$conf.int')
  })

  it('the difference-in-means CI also generalizes past 95%', () => {
    expect(resolveToRStatement('calculate a 90% confidence interval for the difference in mean score between treatment and control'))
      .toBe('t.test(score ~ treatment, data = df, conf.level = 0.9)$conf.int')
  })
})

describe('confidence interval for a proportion (not a test — just the interval)', () => {
  it.each([
    [
      'calculate a 95% confidence interval for the proportion of successes',
      'prop.test(sum(df$success_column), nrow(df))$conf.int  # replace "success_column" with your actual success/failure column',
    ],
    ['a 95% confidence interval for a proportion of 0.4 from a sample of 50', 'prop.test(round(0.4 * 50), 50)$conf.int'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('textbook-exact wordy phrasing — homework is rarely phrased as cleanly as this file\'s own patterns', () => {
  it.each([
    [
      'at the 0.05 significance level, is there sufficient evidence to conclude that the mean score differs from 50',
      't.test(df$score, mu = 50)',
    ],
    ['is there enough evidence to conclude that the mean score differs from 50 at the 5% level', 't.test(df$score, mu = 50)'],
    ['conduct a hypothesis test to determine whether the mean score differs from 50', 't.test(df$score, mu = 50)'],
  ])('the significance-level clause is discarded (it\'s not a t.test() argument, just the threshold a student compares the p-value to by hand): %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('"before_X"/"after_X" naming implies a paired test, without the word "paired" ever appearing', () => {
  it.each([
    ['test whether before_score and after_score are different', 't.test(df$before_score, df$after_score, paired = TRUE)'],
    ['is there a difference between before_score and after_score', 't.test(df$before_score, df$after_score, paired = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('only fires when both identifiers share the exact same suffix — never a generic "are X and Y different" guess', () => {
    expect(() => resolveToRStatement('test whether before_score and after_income are different')).toThrow()
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeStatisticalTests('the mean of income')).toBeNull()
  })
})
