import { describe, it, expect } from 'vitest'
import { recognizeDataTransform } from '../src/rDataTransform'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('26. "Create a column called total_score by adding math_score and reading_score." — derived column via arithmetic', () => {
  it.each([
    ['Create a column called total_score by adding math_score and reading_score.', 'df$total_score <- df$math_score + df$reading_score'],
    ['create a column called total_score by adding math_score and reading_score', 'df$total_score <- df$math_score + df$reading_score'],
    ['create a new column called diff by subtracting b from a', 'df$diff <- df$a - df$b'],
    ['create a column called product by multiplying a and b', 'df$product <- df$a * df$b'],
    ['create a column called ratio by dividing a by b', 'df$ratio <- df$a / df$b'],
    ['create a column called total that is x plus y', 'df$total <- df$x + df$y'],
    ['create a column called diff that is x minus y', 'df$diff <- df$x - df$y'],
    ['create a column called product that is x times y', 'df$product <- df$x * df$y'],
    ['create a column called product that is x multiplied by y', 'df$product <- df$x * df$y'],
    ['create a column called ratio that is x divided by y', 'df$ratio <- df$x / df$y'],
    ['add x and y and call it total', 'df$total <- df$x + df$y'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('27. "Create a binary variable called passed that is 1 when score is at least 60 and 0 otherwise." — indicator variables', () => {
  it.each([
    ['Create a binary variable called passed that is 1 when score is at least 60 and 0 otherwise.', 'df$passed <- ifelse(df$score>=60, 1, 0)'],
    ['create a binary variable called passed that is 1 when score is at least 60 and 0 otherwise', 'df$passed <- ifelse(df$score>=60, 1, 0)'],
    ['create a binary variable called passed that is 1 if score is at least 60, 0 otherwise', 'df$passed <- ifelse(df$score>=60, 1, 0)'],
    ['create a binary column called adult that is 1 when age is at least 18 and 0 otherwise', 'df$adult <- ifelse(df$age>=18, 1, 0)'],
    ['create an indicator variable called senior for age is at least 65', 'df$senior <- ifelse(df$age>=65, 1, 0)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('28. "Recode M to Male and F to Female in gender." — recoding values', () => {
  it.each([
    ['Recode M to Male and F to Female in gender.', 'df$gender <- ifelse(df$gender == "M", "Male", ifelse(df$gender == "F", "Female", df$gender))'],
    ['recode M to Male and F to Female in gender', 'df$gender <- ifelse(df$gender == "M", "Male", ifelse(df$gender == "F", "Female", df$gender))'],
    ['recode Y to Yes in response', 'df$response <- ifelse(df$response == "Y", "Yes", df$response)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('29. "Divide age into groups: under 18, 18–29, 30–49, and 50 or older." — binning into named groups', () => {
  it.each([
    [
      'Divide age into groups: under 18, 18–29, 30–49, and 50 or older.',
      'df$age_group <- cut(df$age, breaks = c(-Inf, 18, 30, 50, Inf), labels = c("under 18", "18-29", "30-49", "50 or older"), right = FALSE)',
    ],
    [
      'divide age into groups: under 18, 18-29, 30-49, and 50 or older',
      'df$age_group <- cut(df$age, breaks = c(-Inf, 18, 30, 50, Inf), labels = c("under 18", "18-29", "30-49", "50 or older"), right = FALSE)',
    ],
    [
      'divide age into groups: under 18, 18 to 29, 30 to 49, and 50 or more',
      'df$age_group <- cut(df$age, breaks = c(-Inf, 18, 30, 50, Inf), labels = c("under 18", "18 to 29", "30 to 49", "50 or more"), right = FALSE)',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('30. "Standardize income to have a mean of zero and standard deviation of one." — standardization', () => {
  it.each([
    ['Standardize income to have a mean of zero and standard deviation of one.', 'df$income <- as.numeric(scale(df$income))'],
    ['standardize income', 'df$income <- as.numeric(scale(df$income))'],
    ['z-score income', 'df$income <- as.numeric(scale(df$income))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('31. "Create a natural-log transformation of income." — log transform', () => {
  it.each([
    ['Create a natural-log transformation of income.', 'df$log_income <- log(df$income)'],
    ['create a natural-log transformation of income', 'df$log_income <- log(df$income)'],
    ['create a log transformation of income', 'df$log_income <- log(df$income)'],
    ['take the natural log of income', 'df$log_income <- log(df$income)'],
    ['log-transform income', 'df$log_income <- log(df$income)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('32. "Square the values in score and save them in a new column called score_squared." — squaring', () => {
  it.each([
    ['Square the values in score and save them in a new column called score_squared.', 'df$score_squared <- df$score^2'],
    ['square score and call it score_squared', 'df$score_squared <- df$score^2'],
    ['square score', 'df$score_squared <- df$score^2'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('33. "Calculate the number of days between start_date and end_date." — date differences', () => {
  it.each([
    ['Calculate the number of days between start_date and end_date.', 'as.numeric(df$end_date - df$start_date)'],
    ['calculate the number of days between start_date and end_date', 'as.numeric(df$end_date - df$start_date)'],
    ['the number of days between start_date and end_date', 'as.numeric(df$end_date - df$start_date)'],
    ['how many days are between start_date and end_date', 'as.numeric(df$end_date - df$start_date)'],
    ['days between start_date and end_date', 'as.numeric(df$end_date - df$start_date)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('an explicit column name stores it instead of just computing it', () => {
    expect(resolveToRStatement('create a column called tenure_days with the number of days between start_date and end_date'))
      .toBe('df$tenure_days <- as.numeric(df$end_date - df$start_date)')
  })
})

describe('34. "Extract the year and month from date into separate columns." — date part extraction', () => {
  it.each([
    [
      'Extract the year and month from date into separate columns.',
      'df$year <- as.numeric(format(df$date, "%Y")); df$month <- as.numeric(format(df$date, "%m"))',
    ],
    [
      'extract the year and month from date into separate columns',
      'df$year <- as.numeric(format(df$date, "%Y")); df$month <- as.numeric(format(df$date, "%m"))',
    ],
    [
      'extract year and month from date',
      'df$year <- as.numeric(format(df$date, "%Y")); df$month <- as.numeric(format(df$date, "%m"))',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('35. "Calculate the percentage change in sales between consecutive observations." — percentage change', () => {
  it.each([
    [
      'Calculate the percentage change in sales between consecutive observations.',
      'df$sales_pct_change <- c(NA, diff(df$sales) / df$sales[-length(df$sales)] * 100)',
    ],
    [
      'calculate the percentage change in sales between consecutive observations',
      'df$sales_pct_change <- c(NA, diff(df$sales) / df$sales[-length(df$sales)] * 100)',
    ],
    ['calculate the percent change in sales', 'df$sales_pct_change <- c(NA, diff(df$sales) / df$sales[-length(df$sales)] * 100)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"calculate the" is stripped by the shared filler-stripper before this recognizer sees the text — the bare form must also work directly', () => {
    expect(recognizeDataTransform('percentage change in sales between consecutive observations'))
      .toBe('df$sales_pct_change <- c(NA, diff(df$sales) / df$sales[-length(df$sales)] * 100)')
  })
})

describe('36. "Merge the datasets students and grades using student_id." — merging', () => {
  it.each([
    ['Merge the datasets students and grades using student_id.', 'merge(students, grades, by = "student_id")'],
    ['merge the datasets students and grades using student_id', 'merge(students, grades, by = "student_id")'],
    ['merge students and grades on student_id', 'merge(students, grades, by = "student_id")'],
    ['merge students with grades by student_id', 'merge(students, grades, by = "student_id")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('37. "Append the rows of new_data to data." — appending rows', () => {
  it.each([
    ['Append the rows of new_data to data.', 'rbind(data, new_data)'],
    ['append the rows of new_data to data', 'rbind(data, new_data)'],
    ['append new_data to data', 'rbind(data, new_data)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('38/39. Reshaping wide <-> long', () => {
  it.each([
    [
      'Convert the dataset from wide format to long format using pivot_longer().',
      'tidyr::pivot_longer(df, cols = everything(), names_to = "name", values_to = "value")  # adjust cols/names_to/values_to for your data',
    ],
    [
      'convert the dataset from wide format to long format using pivot_longer()',
      'tidyr::pivot_longer(df, cols = everything(), names_to = "name", values_to = "value")  # adjust cols/names_to/values_to for your data',
    ],
    [
      'Convert the dataset from long format to wide format using pivot_wider().',
      'tidyr::pivot_wider(df, names_from = "name", values_from = "value")  # adjust names_from/values_from for your data',
    ],
    [
      'convert the dataset from long format to wide format using pivot_wider()',
      'tidyr::pivot_wider(df, names_from = "name", values_from = "value")  # adjust names_from/values_from for your data',
    ],
    [
      'convert df from wide to long using pivot_longer()',
      'tidyr::pivot_longer(df, cols = everything(), names_to = "name", values_to = "value")  # adjust cols/names_to/values_to for your data',
    ],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('40. "Rank participants by score within each treatment group." — ranking within a group', () => {
  it.each([
    ['Rank participants by score within each treatment group.', 'df$score_rank <- ave(df$score, df$treatment, FUN = rank)'],
    ['rank participants by score within each treatment group', 'df$score_rank <- ave(df$score, df$treatment, FUN = rank)'],
    ['rank by score within each treatment group', 'df$score_rank <- ave(df$score, df$treatment, FUN = rank)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
    'create a column called',
    'recode in gender',
    'merge students and grades',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeDataTransform('the mean of 1,2,3')).toBeNull()
  })
})
