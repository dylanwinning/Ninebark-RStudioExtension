// Direct unit tests for rDataInspection.ts. Examples 5-10 from the original
// request get their own describe block each; "my dataset"/"the data" style
// generic references (which don't name a real R object) are tested
// explicitly since normalizeDataRef()'s df-fallback convention is the one
// genuinely interesting design decision in this file, not just plumbing.
//
// The six "the literal example" cases go through resolveToRStatement (the
// FULL pipeline — resolveRPhrase.test.ts tests full sentences the same
// way), not recognizeDataInspection() directly: a trailing sentence period
// and a "Show me"-style lead are both normalized away by the shared
// engine's stripFiller() UPSTREAM of every native recognizer (the same
// reason rControlFlow.ts's resolveBodyValue comment and this repo's
// CLAUDE.md both call this out as a real gotcha), so recognizeDataInspection
// on its own never actually sees the sentence as the user typed it —
// testing it directly against the raw, unnormalized sentence would be
// testing an input shape production code never receives.
import { describe, it, expect } from 'vitest'
import { recognizeDataInspection } from '../src/rDataInspection'
import { resolveToRStatement } from '../src/resolveRPhrase'

describe('5. "Show me the first 10 rows of my dataset." — head', () => {
  it('the literal example (note: "my dataset" has no real R name, so it normalizes to df — a documented convention, not a guess)', () => {
    expect(resolveToRStatement('Show me the first 10 rows of my dataset.')).toBe('head(df, 10)')
  })

  it.each([
    ['Show me the first 10 rows of df', 'head(df, 10)'],
    ['Show the first 10 rows of df', 'head(df, 10)'],
    ['Display the first 10 rows of df', 'head(df, 10)'],
    ['What are the first 10 rows of df', 'head(df, 10)'],
    ['Give me the first 10 rows of df', 'head(df, 10)'],
    ['Let me see the first 10 rows of df', 'head(df, 10)'],
    ['Print the first 10 rows of df', 'head(df, 10)'],
    ['The top 10 rows of df', 'head(df, 10)'],
    ["df's first 10 rows", 'head(df, 10)'],
    ['The first 10 observations of df', 'head(df, 10)'],
    ['Head of df', 'head(df)'],
    ['The head of df', 'head(df)'],
    ['df head', 'head(df)'],
    ['The beginning of df', 'head(df)'],
    ['Preview df', 'head(df)'],
    ['Preview the first 10 rows of df', 'head(df, 10)'],
    ['Look at the first 10 rows of df', 'head(df, 10)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })

  it.each([
    'Show df', 'Show me df', 'View df',
  ])('a bare "%s" (no row count, no other qualifier), called directly, previews with head() rather than R\'s own print-everything default', (phrase) => {
    // Called directly (this function's OWN stripShowLead() sees the full,
    // un-stripped text), all three work. The full pipeline is different —
    // see the next test.
    expect(recognizeDataInspection(phrase)).toBe('head(df)')
  })

  it('through the FULL pipeline, "Show df"/"View df" still work, but "Show me df" alone is a known, accepted gap', () => {
    // Regression guard for a real bug: an earlier version of the bare
    // fallback above had no guard at all, reasoning that since
    // stripFiller() upstream (resolveRPhrase.ts) already strips "show me"
    // before this file ever sees the text, nothing was lost by also
    // matching a bare identifier unconditionally. That reasoning broke for
    // gibberish: a single nonsense word is ALSO just one bare identifier-
    // shaped token, so the ungated version silently turned
    // "asdkjhaskjdhaskjdh" into `head(asdkjhaskjdhaskjdh)` instead of
    // failing loud (caught by the canonical gibberish tests in
    // resolveRPhrase.test.ts and, worse, in the R package's own test
    // suite, where R CMD check is what actually caught this one). The
    // fix's trade-off, pinned here: "show me df" specifically (upstream
    // stripFiller erases the only evidence a lead verb was ever there) no
    // longer resolves -- but every other explicit phrasing keeps working,
    // and gibberish fails loud again either way.
    expect(resolveToRStatement('Show df')).toBe('head(df)')
    expect(resolveToRStatement('View df')).toBe('head(df)')
    expect(() => resolveToRStatement('Show me df')).toThrow()
  })

  it('a bare single nonsense word fails loud rather than becoming head(<gibberish>)', () => {
    expect(recognizeDataInspection('asdkjhaskjdhaskjdh')).toBeNull()
    expect(() => resolveToRStatement('asdkjhaskjdhaskjdh')).toThrow()
  })
})

describe('6. "Show me the last 10 rows of my dataset." — tail', () => {
  it('the literal example', () => {
    expect(resolveToRStatement('Show me the last 10 rows of my dataset.')).toBe('tail(df, 10)')
  })

  it.each([
    ['The last 10 rows of df', 'tail(df, 10)'],
    ['The bottom 10 rows of df', 'tail(df, 10)'],
    ['The tail of df', 'tail(df)'],
    ['Tail of df', 'tail(df)'],
    ["df's last 10 rows", 'tail(df, 10)'],
    ['The last 10 observations of df', 'tail(df, 10)'],
    ['The end of df', 'tail(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })
})

describe('7. "Show me all the column names." — colnames', () => {
  it('the literal example has NO data frame named at all — defaults to df', () => {
    expect(resolveToRStatement('Show me all the column names.')).toBe('colnames(df)')
  })

  it.each([
    ['The column names of df', 'colnames(df)'],
    ['Show the columns of df', 'colnames(df)'],
    ['What are the column names of df', 'colnames(df)'],
    ['List the columns in df', 'colnames(df)'],
    ['What columns does df have', 'colnames(df)'],
    ['The names of the columns in df', 'colnames(df)'],
    ['The variable names in df', 'colnames(df)'],
    ["df's column names", 'colnames(df)'],
    ['Show me the headers of df', 'colnames(df)'],
    ['What fields are in df', 'colnames(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })
})

describe('8. "Show me the number of rows and columns." — dim / nrow / ncol', () => {
  it('the literal example has NO data frame named at all — defaults to df', () => {
    expect(resolveToRStatement('Show me the number of rows and columns.')).toBe('dim(df)')
  })

  it.each([
    ['The dimensions of df', 'dim(df)'],
    ['How many rows and columns does df have', 'dim(df)'],
    ['The shape of df', 'dim(df)'],
    ["df's dimensions", 'dim(df)'],
    ['How big is df', 'dim(df)'],
    ['The size of df', 'dim(df)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })

  it.each([
    ['The number of rows in df', 'nrow(df)'],
    ['How many rows does df have', 'nrow(df)'],
    ['How many observations are in df', 'nrow(df)'],
    ['The number of columns in df', 'ncol(df)'],
    ['How many columns does df have', 'ncol(df)'],
    ['How many variables are in df', 'ncol(df)'],
  ])('separately: %s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })
})

describe('9. "Show me the data types of every column." — column types', () => {
  it('the literal example has NO data frame named at all — defaults to df', () => {
    expect(resolveToRStatement('Show me the data types of every column.')).toBe('sapply(df, class)')
  })

  it.each([
    ['The data types of each column in df', 'sapply(df, class)'],
    ['What type is each column in df', 'sapply(df, class)'],
    ['The column types of df', 'sapply(df, class)'],
    ['What data type is every column of df', 'sapply(df, class)'],
    ['Show the class of each column in df', 'sapply(df, class)'],
    ['The variable types in df', 'sapply(df, class)'],
    ['What kind of data is in each column of df', 'sapply(df, class)'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })

  it('"the structure of df" is a DIFFERENT, related command (str(), not sapply) — both are real, distinct asks', () => {
    expect(recognizeDataInspection('The structure of df')).toBe('str(df)')
  })

  it('"glimpse df" maps to the real tidyverse function, not an approximation with str()', () => {
    expect(recognizeDataInspection('Glimpse df')).toBe('dplyr::glimpse(df)')
  })
})

describe('10. "Count the missing values in each column." — per-column missing data', () => {
  it('the literal example has NO data frame named at all — defaults to df', () => {
    expect(resolveToRStatement('Count the missing values in each column.')).toBe('colSums(is.na(df))')
  })

  it.each([
    ['The number of missing values per column in df', 'colSums(is.na(df))'],
    ['How many NAs are in each column of df', 'colSums(is.na(df))'],
    ['Missing values by column in df', 'colSums(is.na(df))'],
    ['Count NAs per column in df', 'colSums(is.na(df))'],
    ['Show me the missing values in each column of df', 'colSums(is.na(df))'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })

  it('this is a genuinely NEW capability — the prior version of this file only had whole-data-frame totals', () => {
    // Regression guard: colSums (per column) must not collapse to the same
    // thing as sum (whole data frame) — they answer different questions.
    expect(recognizeDataInspection('Count the missing values in each column of df')).not.toBe(
      recognizeDataInspection('How many missing values does df have'),
    )
  })

  it.each([
    ['Which columns have missing values', 'colnames(df)[colSums(is.na(df)) > 0]'],
    ['Which columns have missing values in df', 'colnames(df)[colSums(is.na(df)) > 0]'],
    ['The percentage of missing values in each column of df', 'colMeans(is.na(df)) * 100'],
    ['Which rows have missing values in df', 'df[!complete.cases(df), ]'],
  ])('bonus column/row-level variants: %s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })

  it.each([
    ['How many missing values does df have', 'sum(is.na(df))'],
    ['Is there any missing data in df', 'anyNA(df)'],
  ])('whole-data-frame totals still work unchanged: %s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })
})

describe('other inspection commands worth covering ("anything missing")', () => {
  it.each([
    ['A summary of df', 'summary(df)'],
    ['Summarize df', 'summary(df)'],
    ['Duplicated rows in df', 'df[duplicated(df), ]'],
    ['The number of duplicate rows in df', 'sum(duplicated(df))'],
    ['The unique values in column age of df', 'unique(df$age)'],
    ['The number of unique values in column age of df', 'length(unique(df$age))'],
    ['The levels of column grade of df', 'levels(factor(df$grade))'],
    ['The class of df', 'class(df)'],
    ['Is df a data frame', 'is.data.frame(df)'],
    ['The row names of df', 'rownames(df)'],
    ['Is df empty', 'nrow(df) == 0'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataInspection(phrase)).toBe(expected)
  })
})

describe('the generic-dataset-reference convention (normalizeDataRef)', () => {
  it.each([
    'my dataset', 'the dataset', 'my data', 'the data', 'it',
  ])('"%s" normalizes to df, same as every example elsewhere in this project', (ref) => {
    expect(recognizeDataInspection(`the first 5 rows of ${ref}`)).toBe('head(df, 5)')
  })

  it('a REAL variable name is used as-is, never overridden to df', () => {
    expect(recognizeDataInspection('the first 5 rows of mtcars')).toBe('head(mtcars, 5)')
    expect(recognizeDataInspection('the first 5 rows of my_survey_data')).toBe('head(my_survey_data, 5)')
  })
})

describe('declines rather than guesses', () => {
  it('unrelated text returns null', () => {
    expect(recognizeDataInspection('mean of 1,2,3')).toBeNull()
  })
})
