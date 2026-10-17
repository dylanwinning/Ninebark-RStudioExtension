import { describe, it, expect } from 'vitest'
import { recognizeDataVisualization } from '../src/rDataVisualization'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('53. "Create a histogram of income." — histogram', () => {
  it.each([
    ['Create a histogram of income.', 'hist(df$income)'],
    ['create a histogram of income', 'hist(df$income)'],
    ['make a histogram of income', 'hist(df$income)'],
    ['plot a histogram of income', 'hist(df$income)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('54. "Create a density plot of income." — density plot', () => {
  it.each([
    ['Create a density plot of income.', 'plot(density(df$income, na.rm = TRUE))'],
    ['make a density plot of income', 'plot(density(df$income, na.rm = TRUE))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('55/56. "Create a boxplot of score." / "...for each treatment group." — boxplot', () => {
  it.each([
    ['Create a boxplot of score.', 'boxplot(df$score)'],
    ['Create a boxplot of score for each treatment group.', 'boxplot(df$score ~ df$treatment)'],
    ['create a boxplot of score for each treatment group', 'boxplot(df$score ~ df$treatment)'],
    ['create a boxplot of score by treatment', 'boxplot(df$score ~ df$treatment)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('57/58. "Create a scatterplot of study_hours against score." + regression line', () => {
  it.each([
    ['Create a scatterplot of study_hours against score.', 'plot(df$score, df$study_hours)'],
    ['create a scatterplot of study_hours against score', 'plot(df$score, df$study_hours)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it.each([
    ['Add a linear regression line to the scatterplot of study_hours against score.', 'abline(lm(df$study_hours ~ df$score))'],
    ['add a linear regression line to the scatterplot of study_hours against score', 'abline(lm(df$study_hours ~ df$score))'],
    ['add a regression line to the scatterplot of study_hours against score', 'abline(lm(df$study_hours ~ df$score))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"A against B" is y=A, x=B — the same convention already pinned for rPlotting.ts\'s own "plot y against x"', () => {
    expect(resolveToRStatement('create a scatterplot of study_hours against score')).toBe('plot(df$score, df$study_hours)')
    expect(resolveToRStatement('plot y against x')).toBe('plot(x, y)')
  })
})

describe('59. "Create a bar chart showing the number of observations in each major." — bar chart of counts', () => {
  it.each([
    ['Create a bar chart showing the number of observations in each major.', 'barplot(table(df$major))'],
    ['create a bar chart showing the number of observations in each major', 'barplot(table(df$major))'],
    ['create a bar chart of the number of observations in each major', 'barplot(table(df$major))'],
    ['create a bar chart of the count of observations in each major', 'barplot(table(df$major))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('60. "Create a stacked bar chart of treatment by outcome." — stacked bar chart', () => {
  it.each([
    ['Create a stacked bar chart of treatment by outcome.', 'barplot(table(df$treatment, df$outcome), legend = TRUE)'],
    ['create a stacked bar chart of treatment by outcome', 'barplot(table(df$treatment, df$outcome), legend = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('61. "Create a line chart of sales over time, using date on the x-axis." — line chart over time', () => {
  it.each([
    [
      'Create a line chart of sales over time, using date on the x-axis.',
      'plot(df$date, df$sales, type = "l", xlab = "date", ylab = "sales")',
    ],
    [
      'create a line chart of sales over time, using date on the x-axis',
      'plot(df$date, df$sales, type = "l", xlab = "date", ylab = "sales")',
    ],
    ['create a line chart of sales over date', 'plot(df$date, df$sales, type = "l", xlab = "date", ylab = "sales")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('62. "Create a Q-Q plot of score." — Q-Q plot', () => {
  it.each([
    ['Create a Q-Q plot of score.', 'qqnorm(df$score); qqline(df$score)'],
    ['create a Q-Q plot of score', 'qqnorm(df$score); qqline(df$score)'],
    ['create a qq plot of score', 'qqnorm(df$score); qqline(df$score)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('63. "Create a correlation matrix heatmap for all numeric variables." — correlation heatmap', () => {
  it('Create a correlation matrix heatmap for all numeric variables. -> heatmap(cor(df[sapply(df, is.numeric)], use = "complete.obs"))', () => {
    expect(resolveToRStatement('Create a correlation matrix heatmap for all numeric variables.'))
      .toBe('heatmap(cor(df[sapply(df, is.numeric)], use = "complete.obs"))')
  })
})

describe('64. "Plot the mean score for each treatment group with 95% confidence intervals." — group means with CI', () => {
  it.each([
    [
      'Plot the mean score for each treatment group with 95% confidence intervals.',
      'gplots::plotmeans(score ~ treatment, data = df)  # 95% CI is plotmeans()\'s own default',
    ],
    [
      'plot the mean score for each treatment group with 95% confidence intervals',
      'gplots::plotmeans(score ~ treatment, data = df)  # 95% CI is plotmeans()\'s own default',
    ],
    [
      'plot the mean score for each treatment group with 95 percent confidence intervals',
      'gplots::plotmeans(score ~ treatment, data = df)  # 95% CI is plotmeans()\'s own default',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('65. "Save the current plot as a high-resolution PNG file." — high-resolution save', () => {
  it.each([
    [
      'Save the current plot as a high-resolution PNG file.',
      'png("plot.png", width = 2400, height = 1800, res = 300); # re-run your plot command here, then: dev.off()',
    ],
    [
      'save the current plot as a high-resolution PNG file',
      'png("plot.png", width = 2400, height = 1800, res = 300); # re-run your plot command here, then: dev.off()',
    ],
    [
      'save the plot as a high-res png',
      'png("plot.png", width = 2400, height = 1800, res = 300); # re-run your plot command here, then: dev.off()',
    ],
    [
      'export the current plot as a high-resolution png file',
      'png("plot.png", width = 2400, height = 1800, res = 300); # re-run your plot command here, then: dev.off()',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('does not disturb rPlotting.ts\'s existing standalone-vector plotting vocabulary', () => {
  it.each([
    ['histogram of x', 'hist(x)'],
    ['a boxplot of x', 'boxplot(x)'],
    ['boxplot of x by group', 'boxplot(x ~ group)'],
    ['scatter plot of x and y', 'plot(x, y)'],
    ['plot y against x', 'plot(x, y)'],
    ['bar chart of counts', 'barplot(counts)'],
    ['line chart of y vs x', 'plot(x, y, type = "l")'],
  ])('the bare, no-lead-verb form still means a standalone vector, unchanged: %s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
    'create a histogram of',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeDataVisualization('the mean of income')).toBeNull()
  })
})
