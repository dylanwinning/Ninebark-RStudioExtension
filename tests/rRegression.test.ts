import { describe, it, expect } from 'vitest'
import { recognizeRegression } from '../src/rRegression'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('80. "Regress score on study_hours using linear regression." — simple linear regression', () => {
  it.each([
    ['Regress score on study_hours using linear regression.', 'model <- lm(score ~ study_hours, data = df)'],
    ['regress score on study_hours using linear regression', 'model <- lm(score ~ study_hours, data = df)'],
    ['regress score on study_hours', 'model <- lm(score ~ study_hours, data = df)'],
    ['fit a linear regression of score on study_hours', 'model <- lm(score ~ study_hours, data = df)'],
    ['a linear regression predicting score from study_hours', 'model <- lm(score ~ study_hours, data = df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('81. "Predict income using education, age, and experience in a multiple linear regression." — multiple linear regression', () => {
  it.each([
    [
      'Predict income using education, age, and experience in a multiple linear regression.',
      'model <- lm(income ~ education + age + experience, data = df)',
    ],
    [
      'predict income using education, age, and experience in a multiple linear regression',
      'model <- lm(income ~ education + age + experience, data = df)',
    ],
    ['predict income using education, age, and experience', 'model <- lm(income ~ education + age + experience, data = df)'],
    ['regress income on education, age, and experience', 'model <- lm(income ~ education + age + experience, data = df)'],
    [
      'fit a multiple regression of income on education, age, and experience',
      'model <- lm(income ~ education + age + experience, data = df)',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('a single-predictor "regress Y on X" never gets swallowed by the multi-predictor pattern', () => {
    expect(resolveToRStatement('regress score on study_hours')).toBe('model <- lm(score ~ study_hours, data = df)')
  })
})

describe('82. "Add age as an additional predictor to the existing regression model." — adding a predictor', () => {
  it.each([
    ['Add age as an additional predictor to the existing regression model.', 'model <- update(model, . ~ . + age)'],
    ['add age as an additional predictor to the existing regression model', 'model <- update(model, . ~ . + age)'],
    ['add age as a predictor to the regression model', 'model <- update(model, . ~ . + age)'],
    ['add age to the regression model', 'model <- update(model, . ~ . + age)'],
    ['include age in the regression model', 'model <- update(model, . ~ . + age)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('83. "Add an interaction between treatment and age to the regression model." — adding an interaction', () => {
  it.each([
    ['Add an interaction between treatment and age to the regression model.', 'model <- update(model, . ~ . + treatment*age)'],
    ['add an interaction between treatment and age to the regression model', 'model <- update(model, . ~ . + treatment*age)'],
    ['add an interaction term between treatment and age to the model', 'model <- update(model, . ~ . + treatment*age)'],
    ['include an interaction between treatment and age in the regression model', 'model <- update(model, . ~ . + treatment*age)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('84. "Calculate 95% confidence intervals for all regression coefficients." — CI for the coefficients', () => {
  it.each([
    ['Calculate 95% confidence intervals for all regression coefficients.', 'confint(model)'],
    ['calculate 95% confidence intervals for all regression coefficients', 'confint(model)'],
    ['the confidence intervals for the regression coefficients', 'confint(model)'],
    ['confidence intervals for the model coefficients', 'confint(model)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('85. "Generate predicted score values for observations in my dataset." — predicted/fitted values', () => {
  it.each([
    ['Generate predicted score values for observations in my dataset.', 'predict(model)'],
    ['generate predicted score values for observations in my dataset', 'predict(model)'],
    ['generate predicted values for observations in my dataset', 'predict(model)'],
    ['the predicted values from the regression model', 'predict(model)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"fitted values" is a distinct, real ask — the dedicated fitted() function, not predict()', () => {
    expect(resolveToRStatement('the fitted values of the model')).toBe('fitted(model)')
  })
})

describe('86. "Create residual-versus-fitted and Q-Q plots for the regression model." — diagnostic plots', () => {
  it.each([
    ['Create residual-versus-fitted and Q-Q plots for the regression model.', 'plot(model, which = 1); plot(model, which = 2)'],
    ['create residual-versus-fitted and Q-Q plots for the regression model', 'plot(model, which = 1); plot(model, which = 2)'],
    ['create residuals vs fitted and qq plots for the regression model', 'plot(model, which = 1); plot(model, which = 2)'],
    ['diagnostic plots for the regression model', 'plot(model, which = 1); plot(model, which = 2)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('87. "Fit a logistic regression predicting outcome from age, income, and treatment." — logistic regression', () => {
  it.each([
    [
      'Fit a logistic regression predicting outcome from age, income, and treatment.',
      'logit_model <- glm(outcome ~ age + income + treatment, data = df, family = binomial)',
    ],
    [
      'fit a logistic regression predicting outcome from age, income, and treatment',
      'logit_model <- glm(outcome ~ age + income + treatment, data = df, family = binomial)',
    ],
    [
      'a logistic regression of outcome on age, income, and treatment',
      'logit_model <- glm(outcome ~ age + income + treatment, data = df, family = binomial)',
    ],
    [
      'logistic regression of outcome on age, income, and treatment',
      'logit_model <- glm(outcome ~ age + income + treatment, data = df, family = binomial)',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('88. "Convert the logistic regression coefficients into odds ratios." — odds ratios', () => {
  it.each([
    ['Convert the logistic regression coefficients into odds ratios.', 'exp(coef(logit_model))'],
    ['convert the logistic regression coefficients into odds ratios', 'exp(coef(logit_model))'],
    ['convert the logistic regression coefficients to odds ratios', 'exp(coef(logit_model))'],
    ['the odds ratios for the logistic regression model', 'exp(coef(logit_model))'],
    ['calculate odds ratios from the logistic regression', 'exp(coef(logit_model))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('89. "Calculate predicted probabilities for each observation using the logistic regression model." — predicted probabilities', () => {
  it.each([
    [
      'Calculate predicted probabilities for each observation using the logistic regression model.',
      'predict(logit_model, type = "response")',
    ],
    [
      'calculate predicted probabilities for each observation using the logistic regression model',
      'predict(logit_model, type = "response")',
    ],
    ['the predicted probabilities from the logistic regression model', 'predict(logit_model, type = "response")'],
    ['the predicted probability for the logistic model', 'predict(logit_model, type = "response")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('the leading "calculate" is stripped by the shared filler-stripper before this recognizer sees the text — the bare form must also work directly', () => {
    expect(recognizeRegression('predicted probabilities for each observation using the logistic regression model'))
      .toBe('predict(logit_model, type = "response")')
  })
})

describe('90. "Calculate variance inflation factors for the predictors in my regression model." — VIF', () => {
  it.each([
    ['Calculate variance inflation factors for the predictors in my regression model.', 'car::vif(model)'],
    ['calculate variance inflation factors for the predictors in my regression model', 'car::vif(model)'],
    ['the variance inflation factors for the model', 'car::vif(model)'],
    ['the VIF for the regression model', 'car::vif(model)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('the leading "calculate" is stripped by the shared filler-stripper before this recognizer sees the text — the bare form must also work directly', () => {
    expect(recognizeRegression('variance inflation factors for the predictors in my regression model')).toBe('car::vif(model)')
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeRegression('the mean of income')).toBeNull()
  })
})
