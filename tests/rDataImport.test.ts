// Direct unit tests for rDataImport.ts. The four "importing data" examples
// from the original request are each their own describe block so the
// mapping back to what was asked for stays obvious; each block also covers
// the phrasing variants found during the empirical audit (167 phrasings
// tried by hand before this file was written — see the file's own header
// comment for the methodology), not just the one literal example sentence.
import { describe, it, expect } from 'vitest'
import { recognizeDataImport } from '../src/rDataImport'

describe('1. "Load data.csv into R." — CSV import', () => {
  it.each([
    ['Load data.csv into R.', 'read.csv("data.csv")'],
    ['Load data.csv into R', 'read.csv("data.csv")'],
    ['Load data.csv', 'read.csv("data.csv")'],
    ['Import data.csv', 'read.csv("data.csv")'],
    ['Read data.csv', 'read.csv("data.csv")'],
    ['Open data.csv', 'read.csv("data.csv")'],
    ['Read in data.csv', 'read.csv("data.csv")'],
    ['Bring in data.csv', 'read.csv("data.csv")'],
    ['Pull in data.csv', 'read.csv("data.csv")'],
    ['Get data.csv', 'read.csv("data.csv")'],
    ['Load the CSV file data.csv', 'read.csv("data.csv")'],
    ['Load the csv file data.csv into my environment', 'read.csv("data.csv")'],
    ['Import the CSV file called data.csv', 'read.csv("data.csv")'],
    ['Load my data from data.csv', 'read.csv("data.csv")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })

  it.each([
    ['Load data.csv as df', 'df <- read.csv("data.csv")'],
    ['Load data.csv into df', 'df <- read.csv("data.csv")'],
    ['Import data.csv as mydata', 'mydata <- read.csv("data.csv")'],
    ['Load data.csv into a data frame called df', 'df <- read.csv("data.csv")'],
  ])('naming the result: %s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })

  it('"into R"/"into my environment" is never mistaken for a variable name literally called R', () => {
    const r = recognizeDataImport('Load data.csv into R')
    expect(r).not.toMatch(/^R\s*<-/)
    expect(r).toBe('read.csv("data.csv")')
  })
})

describe('2. "Import data.xlsx from the second worksheet." — Excel import', () => {
  it('the literal example', () => {
    expect(recognizeDataImport('Import data.xlsx from the second worksheet.'))
      .toBe('readxl::read_excel("data.xlsx", sheet = 2)')
  })

  it.each([
    ['Import data.xlsx', 'readxl::read_excel("data.xlsx")'],
    ['Load data.xlsx', 'readxl::read_excel("data.xlsx")'],
    ['Load data.xls', 'readxl::read_excel("data.xls")'],
    ['Import data.xlsx from sheet 2', 'readxl::read_excel("data.xlsx", sheet = 2)'],
    ['Import data.xlsx from the 2nd worksheet', 'readxl::read_excel("data.xlsx", sheet = 2)'],
    ['Load the Sales sheet from data.xlsx', 'readxl::read_excel("data.xlsx", sheet = "Sales")'],
    ['Read data.xlsx from the worksheet named Sales', 'readxl::read_excel("data.xlsx", sheet = "Sales")'],
    ['Read in the excel file data.xlsx', 'readxl::read_excel("data.xlsx")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })

  it('combines a sheet reference with naming the result', () => {
    expect(recognizeDataImport('Load the first worksheet of data.xlsx as df'))
      .toBe('df <- readxl::read_excel("data.xlsx", sheet = 1)')
  })

  it('uses readxl, not a base-R function (no base-R xlsx reader exists)', () => {
    expect(recognizeDataImport('Import data.xlsx')).toMatch(/^readxl::/)
  })
})

describe('3. "Load data.rds into my environment." — RDS import', () => {
  it.each([
    ['Load data.rds into my environment.', 'readRDS("data.rds")'],
    ['Load data.rds', 'readRDS("data.rds")'],
    ['Import data.rds', 'readRDS("data.rds")'],
    ['Read data.rds', 'readRDS("data.rds")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })

  it('names the result when asked', () => {
    expect(recognizeDataImport('Load data.rds as df')).toBe('df <- readRDS("data.rds")')
  })
})

describe('4. "Import this tab-separated file into R." — delimited-file import', () => {
  it('the literal example has no filename — emits a correct, honestly-marked placeholder', () => {
    const r = recognizeDataImport('Import this tab-separated file into R.')
    expect(r).toMatch(/^read\.delim\("your-file\.txt"\)/)
    expect(r).toContain('replace')
  })

  it.each([
    ['Import this semicolon-separated file into R.', /^read\.csv2\(/],
    ['Import this pipe-separated file into R.', /^read\.table\(.*sep = "\|"/],
    ['Import this comma-separated file into R.', /^read\.csv\(/],
  ])('%s matches %s', (phrase, pattern) => {
    expect(recognizeDataImport(phrase)).toMatch(pattern)
  })

  it.each([
    ['Import the tab-separated file data.txt', 'read.delim("data.txt")'],
    ['Load the tab-delimited file data.txt', 'read.delim("data.txt")'],
    ['Import data.tsv', 'read.delim("data.tsv")'],
    ['Import data.tab', 'read.delim("data.tab")'],
    ['Load data.tsv into df', 'df <- read.delim("data.tsv")'],
    ['Import the semicolon-separated file data.csv', 'read.csv2("data.csv")'],
    ['Import the pipe-delimited file data.txt', 'read.table("data.txt", sep = "|", header = TRUE)'],
  ])('with a real filename: %s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })
})

describe('other formats worth covering ("anything missing")', () => {
  it.each([
    ['Import data.json', 'jsonlite::fromJSON("data.json")'],
    ['Load the JSON file data.json', 'jsonlite::fromJSON("data.json")'],
    ['Import data.sav', 'haven::read_sav("data.sav")'],
    ['Load the SPSS file data.sav', 'haven::read_sav("data.sav")'],
    ['Import data.dta', 'haven::read_dta("data.dta")'],
    ['Load the Stata file data.dta', 'haven::read_dta("data.dta")'],
    ['Import data.sas7bdat', 'haven::read_sas("data.sas7bdat")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })

  it('a URL is accepted directly, the same as a local path (base R\'s read.csv() takes either)', () => {
    expect(recognizeDataImport('Import https://example.com/data.csv'))
      .toBe('read.csv("https://example.com/data.csv")')
  })

  it.each([
    ['Load the dataset mtcars', 'data(mtcars)'],
    ['Load the built-in dataset iris', 'data(iris)'],
  ])('built-in datasets: %s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })
})

describe('writing/exporting — the natural counterpart to importing', () => {
  it.each([
    ['Write df to output.csv', 'write.csv(df, "output.csv", row.names = FALSE)'],
    ['Save df as output.tsv', 'write.table(df, "output.tsv", sep = "\\t", row.names = FALSE)'],
    ['Save df as output.xlsx', 'writexl::write_xlsx(df, "output.xlsx")'],
    ['Export df to data.rds', 'saveRDS(df, "data.rds")'],
    ['Write df to data.json', 'jsonlite::write_json(df, "data.json")'],
  ])('%s -> %s', (phrase, expected) => {
    expect(recognizeDataImport(phrase)).toBe(expected)
  })
})

describe('declines rather than guesses', () => {
  it('a "from ... sheet" clause it does not understand is declined, not force-fit', () => {
    expect(recognizeDataImport('Import data.xlsx from the blah worksheet thing')).toBeNull()
  })
  it('unrelated text returns null', () => {
    expect(recognizeDataImport('mean of 1,2,3')).toBeNull()
  })
})
