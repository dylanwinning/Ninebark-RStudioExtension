import { describe, it, expect } from 'vitest'
import { recognizeDataCleaning } from '../src/rDataCleaning'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('11. "Remove all rows with missing values in income." — missing values in one column', () => {
  it.each([
    ['Remove all rows with missing values in income.', 'df[!is.na(df$income), ]'],
    ['remove rows with missing values in income', 'df[!is.na(df$income), ]'],
    ['remove rows where income is missing', 'df[!is.na(df$income), ]'],
    ['drop rows where income is missing', 'df[!is.na(df$income), ]'],
    ['remove rows with missing income', 'df[!is.na(df$income), ]'],
    ['drop rows with missing values in income', 'df[!is.na(df$income), ]'],
    ['exclude rows where income is missing', 'df[!is.na(df$income), ]'],
    ['remove observations with missing income', 'df[!is.na(df$income), ]'],
    ['remove observations where income is missing', 'df[!is.na(df$income), ]'],
    ['remove missing income values', 'df[!is.na(df$income), ]'],
    ['delete rows with an NA in income', 'df[!is.na(df$income), ]'],
    ['remove rows with a missing income', 'df[!is.na(df$income), ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('12. "Remove all rows that contain any missing values." — whole-row, any column', () => {
  it.each([
    ['Remove all rows that contain any missing values.', 'na.omit(df)'],
    ['remove rows with any missing values', 'na.omit(df)'],
    ['drop rows that have any missing data', 'na.omit(df)'],
    ['remove all missing values', 'na.omit(df)'],
    ['drop incomplete rows', 'na.omit(df)'],
    ['keep only complete cases', 'na.omit(df)'],
    ['the complete cases', 'na.omit(df)'],
    ['remove incomplete observations', 'na.omit(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('supports naming an explicit data frame: "remove missing values from mydata" -> na.omit(mydata)', () => {
    expect(resolveToRStatement('remove missing values from mydata')).toBe('na.omit(mydata)')
  })

  it('"the complete cases of df" is the EXPLICIT-dataframe form, and keeps its own distinct code shape (not na.omit)', () => {
    expect(resolveToRStatement('the complete cases of df')).toBe('df[complete.cases(df), ]')
  })
})

describe('13. "Remove duplicate rows from the dataset." — duplicate rows', () => {
  it.each([
    ['Remove duplicate rows from the dataset.', 'unique(df)'],
    ['remove duplicate rows', 'unique(df)'],
    ['remove duplicates', 'unique(df)'],
    ['drop duplicates', 'unique(df)'],
    ['drop repeated rows', 'unique(df)'],
    ['deduplicate the dataset', 'unique(df)'],
    ['deduplicate', 'unique(df)'],
    ['remove duplicate rows from df', 'unique(df)'],
    ['drop rows that are duplicates', 'unique(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('does not collide with rWorkspace\'s "remove <variable>" — "remove duplicates" must mean dedup, not rm(duplicates)', () => {
    expect(resolveToRStatement('remove duplicates')).toBe('unique(df)')
  })

  it('a genuine workspace variable removal still works unaffected: "remove x" -> rm(x)', () => {
    expect(resolveToRStatement('remove x')).toBe('rm(x)')
  })
})

describe('14. "Keep only observations where age is greater than 18." — single-condition row filter', () => {
  it.each([
    ['Keep only observations where age is greater than 18.', 'df[age>18, ]'],
    ['keep observations where age is greater than 18', 'df[age>18, ]'],
    ['keep only rows where age is greater than 18', 'df[age>18, ]'],
    ['keep rows where age is above 18', 'df[age>18, ]'],
    ['keep only records where age is at least 18', 'df[age>=18, ]'],
    ['filter df where age is greater than 30', 'df[age>30, ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('15. "Keep observations where age is between 18 and 30 and income is above 30000." — between & compound conditions', () => {
  it.each([
    [
      'Keep observations where age is between 18 and 30 and income is above 30000.',
      'df[(age >= 18 & age <= 30) & income>30000, ]',
    ],
    ['keep only observations where age is between 18 and 30', 'df[(age >= 18 & age <= 30), ]'],
    ['keep rows where age is over 18 and income is below 50000', 'df[age>18 & income<50000, ]'],
    ['keep observations where age is under 10 or age is over 60', 'df[age<10 | age>60, ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })

  it('"between" never gets mis-split on its own internal "and" when combined with a further AND clause', () => {
    expect(resolveToRStatement('keep rows where age is between 18 and 30 and income is between 30000 and 60000'))
      .toBe('df[(age >= 18 & age <= 30) & (income >= 30000 & income <= 60000), ]')
  })
})

describe('16. "Keep only the columns age, income, and education." — column selection', () => {
  it.each([
    ['Keep only the columns age, income, and education.', 'df[, c("age", "income", "education")]'],
    ['keep only the columns age and income', 'df[, c("age", "income")]'],
    ['keep only columns age, income, and education', 'df[, c("age", "income", "education")]'],
    ['select the columns age, income, and education', 'df[, c("age", "income", "education")]'],
    ['select columns age and income', 'df[, c("age", "income")]'],
    ['select the columns name and age from df', 'df[, c("name", "age")]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('17. "Remove the column participant_id." — column removal', () => {
  it.each([
    ['Remove the column participant_id.', 'df$participant_id <- NULL'],
    ['remove the column participant_id', 'df$participant_id <- NULL'],
    ['drop column participant_id', 'df$participant_id <- NULL'],
    ['delete the column participant_id', 'df$participant_id <- NULL'],
    ['remove the column participant_id from df', 'df$participant_id <- NULL'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('18. "Sort the dataset by income from highest to lowest." — sorting', () => {
  it.each([
    ['Sort the dataset by income from highest to lowest.', 'df[order(-df$income), ]'],
    ['sort the dataset by income from highest to lowest', 'df[order(-df$income), ]'],
    ['sort df by income descending', 'df[order(-df$income), ]'],
    ['sort the data by income from lowest to highest', 'df[order(df$income), ]'],
    ['order df by age ascending', 'df[order(df$age), ]'],
    ['sort df by age', 'df[order(df$age), ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('19. "Rename educ to education." — column renaming', () => {
  it.each([
    ['Rename educ to education.', 'names(df)[names(df) == "educ"] <- "education"'],
    ['rename educ to education', 'names(df)[names(df) == "educ"] <- "education"'],
    ['rename column educ to education', 'names(df)[names(df) == "educ"] <- "education"'],
    ['rename column educ to education in df', 'names(df)[names(df) == "educ"] <- "education"'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('20. "Convert gender into a categorical variable." — convert to factor', () => {
  it.each([
    ['Convert gender into a categorical variable.', 'df$gender <- as.factor(df$gender)'],
    ['convert gender into a categorical variable', 'df$gender <- as.factor(df$gender)'],
    ['convert gender to a factor', 'df$gender <- as.factor(df$gender)'],
    ['make gender a factor', 'df$gender <- as.factor(df$gender)'],
    ['turn gender into a factor', 'df$gender <- as.factor(df$gender)'],
    ['gender should be a factor', 'df$gender <- as.factor(df$gender)'],
    ['treat gender as categorical', 'df$gender <- as.factor(df$gender)'],
    ['convert the gender column to categorical', 'df$gender <- as.factor(df$gender)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('21. "Convert income from text to numeric." — convert to numeric', () => {
  it.each([
    ['Convert income from text to numeric.', 'df$income <- as.numeric(df$income)'],
    ['convert income to numeric', 'df$income <- as.numeric(df$income)'],
    ['make income numeric', 'df$income <- as.numeric(df$income)'],
    ['turn income into a number', 'df$income <- as.numeric(df$income)'],
    ['income should be numeric', 'df$income <- as.numeric(df$income)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('22. "Convert date into a date variable." — convert to Date', () => {
  it.each([
    ['Convert date into a date variable.', 'df$date <- as.Date(df$date)'],
    ['convert date to a date', 'df$date <- as.Date(df$date)'],
    ['make date a date', 'df$date <- as.Date(df$date)'],
    ['turn date into a date', 'df$date <- as.Date(df$date)'],
    ['parse date as a date', 'df$date <- as.Date(df$date)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('23. "Rename all column names to lowercase with underscores instead of spaces." — bulk column-name cleanup', () => {
  it.each([
    [
      'Rename all column names to lowercase with underscores instead of spaces.',
      'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))',
    ],
    ['lowercase the column names and replace spaces with underscores', 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'],
    ['make column names snake case', 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'],
    ['clean up the column names', 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'],
    ['lowercase all column names', 'colnames(df) <- tolower(colnames(df))'],
    ['make all column names lowercase', 'colnames(df) <- tolower(colnames(df))'],
    ['replace spaces in column names with underscores', 'colnames(df) <- gsub(" ", "_", colnames(df))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('24. "Replace missing values in income with the median income." — missing-value imputation', () => {
  it.each([
    [
      'Replace missing values in income with the median income.',
      'df$income[is.na(df$income)] <- median(df$income, na.rm = TRUE)',
    ],
    ['replace missing values in income with the median', 'df$income[is.na(df$income)] <- median(df$income, na.rm = TRUE)'],
    ['impute missing income with the mean', 'df$income[is.na(df$income)] <- mean(df$income, na.rm = TRUE)'],
    ['fill missing income values with the median', 'df$income[is.na(df$income)] <- median(df$income, na.rm = TRUE)'],
    ['replace NAs in income with the mean', 'df$income[is.na(df$income)] <- mean(df$income, na.rm = TRUE)'],
    ['impute income using the median', 'df$income[is.na(df$income)] <- median(df$income, na.rm = TRUE)'],
    ['fill in missing income with the mean', 'df$income[is.na(df$income)] <- mean(df$income, na.rm = TRUE)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('25. "Remove observations with income more than three standard deviations above or below its mean." — outlier removal', () => {
  it.each([
    [
      'Remove observations with income more than three standard deviations above or below its mean.',
      'df[abs(df$income - mean(df$income, na.rm = TRUE)) <= 3 * sd(df$income, na.rm = TRUE), ]',
    ],
    [
      'remove observations with income more than 3 standard deviations above or below its mean',
      'df[abs(df$income - mean(df$income, na.rm = TRUE)) <= 3 * sd(df$income, na.rm = TRUE), ]',
    ],
    [
      'remove rows where income is more than 2 standard deviations from the mean',
      'df[abs(df$income - mean(df$income, na.rm = TRUE)) <= 2 * sd(df$income, na.rm = TRUE), ]',
    ],
    ['remove outliers in income', 'df[abs(df$income - mean(df$income, na.rm = TRUE)) <= 3 * sd(df$income, na.rm = TRUE), ]'],
    ['remove income outliers', 'df[abs(df$income - mean(df$income, na.rm = TRUE)) <= 3 * sd(df$income, na.rm = TRUE), ]'],
  ])('%s -> %s', (phrase, expected) => {
    expect(resolveToRStatement(phrase)).toBe(expected)
  })
})

describe('safety: declines rather than guesses', () => {
  it.each([
    'asdkjhaskjdhaskjdh',
    'remove the column',
    'rename to',
    'keep only the columns',
    'convert gender into',
  ])('"%s" fails loud rather than resolving to something wrong', (phrase) => {
    expect(() => resolveToRStatement(phrase)).toThrow()
  })

  it('direct recognizer call returns null (not a throw) for unrelated text', () => {
    expect(recognizeDataCleaning('the mean of 1,2,3')).toBeNull()
  })
})
