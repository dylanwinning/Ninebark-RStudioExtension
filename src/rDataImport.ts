// ── R-native: importing and exporting data ─────────────────────────────────
// "Load data.csv into R", "Import data.xlsx from the second worksheet",
// "Load data.rds into my environment", "Import this tab-separated file" —
// the first thing almost anyone opening RStudio actually wants to do, and
// genuinely absent before this file existed (rVectorsAndDataFrames.ts had
// a single narrow read.csv() recognizer and nothing else). Split out as its
// own module (not folded into rVectorsAndDataFrames.ts) because "get data
// INTO R" and "manipulate a data frame already in R" are different enough
// concerns to deserve their own file, matching how every other vocabulary
// domain here (rPlotting.ts, rCalculus.ts, …) already gets one.
//
// Base R covers csv/tsv/other-delimited/rds directly. Excel, JSON, and the
// SPSS/Stata/SAS stats formats have NO base-R reader at all — there's
// nothing to fall back to, so those recognizers call out to the one
// standard package for the job (readxl / jsonlite / haven), namespaced
// (`readxl::read_excel(...)`) rather than preceded by a `library(...)`
// call, so the command works whether or not that package happens to be
// loaded yet — it only needs to be INSTALLED. This mirrors
// rPlotting.ts's `ggplot2` form, except those packages have no base-R
// alternative to default to, so (unlike ggplot2, which is opt-in only
// when the phrase says so) a plain "import data.xlsx" has nowhere else to
// go and uses readxl directly.

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const IDENT = String.raw`[A-Za-z][\w.]*`
// A local path OR a URL — base R's read.csv()/read.delim()/etc. all accept
// a URL directly as the `file` argument, so "import the csv from
// https://..." needs no special-casing beyond allowing the pattern through.
const FILE = String.raw`(?:https?://\S+|[\w./\\ -]+?\.\w+)`
// Each format's own pattern requires ITS OWN extension, local path or URL
// alike — deliberately NOT a bare "any URL" catch-all for any one format
// (CSV in particular, the first one tried in recognizeDataImport() below):
// an un-anchored "https?://\S+" alternative would let a CSV-shaped command
// claim a .json or .xlsx URL before that format's own, more specific
// recognizer ever ran. A URL with no extension at all (some API endpoints,
// some export links) isn't matched by any of these — a known, accepted gap
// rather than a guess at which format it is.
function extFile(ext: string): string {
  return String.raw`(?:https?://\S+\.${ext}|[\w./\\ -]+?\.${ext})`
}
const CSV_FILE = extFile('csv')
const TSV_FILE = String.raw`[\w./\\ -]+?\.(?:tsv|tab)`
const XLSX_FILE = extFile('xlsx?')
const RDS_FILE = extFile('rds')
const JSON_FILE = extFile('json')
const SAV_FILE = String.raw`[\w./\\ -]+?\.sav`
const DTA_FILE = String.raw`[\w./\\ -]+?\.dta`
const SAS_FILE = String.raw`[\w./\\ -]+?\.sas7bdat`

// The verb every import command starts with — every synonym a person
// reaches for: "load", "import", "read" (+ "read in"), "open", "bring in",
// "pull in", "get".
const IMPORT_VERB = String.raw`(?:import|load|read(?:\s+in)?|open|bring\s+in|pull\s+in|get)`

// A trailing phrase that means "just get it into R, I'm not naming it" —
// NOT a variable name, even though "into R" alone would otherwise look
// like "into <identifier 'R'>" to a naive naming regex (a single letter IS
// a valid R identifier). Stripped before the naming check ever runs, so
// "Load data.csv into R" produces the bare call, not `R <- read.csv(...)`.
const GENERIC_TARGET_RE = /\s+(?:into\s+(?:r(?:\s*studio)?|my\s+environment|memory|a\s+data\s*frame)|as\s+a\s+data\s*frame)\.?$/i

function wrap(call: string, varName: string | null): string {
  return varName ? `${varName} <- ${call}` : call
}

// Strips a trailing ". " (sentence period) and a GENERIC (non-naming)
// target phrase, then pulls off a trailing "into X" / "as X" naming
// clause if there is a real one left. Every import recognizer below starts
// by calling this, so "Load data.csv into R." / "Import data.csv as df" /
// "read data.csv" all arrive at their own parsing already normalized.
function stripTail(text: string): { rest: string; varName: string | null } {
  let rest = text.replace(/\.$/, '').replace(GENERIC_TARGET_RE, '')
  let varName: string | null = null
  const m = rest.match(new RegExp(`\\s+(?:into|as)\\s+(?:a\\s+data\\s*frame\\s+(?:called|named)\\s+)?(${IDENT})$`, 'i'))
  if (m) {
    varName = m[1]
    rest = rest.slice(0, m.index).trim()
  }
  return { rest: rest.trim(), varName }
}

// "Load data.csv into R." / "Import data.csv" / "Read data.csv into df" /
// "open the csv file data.csv" / "read in data.csv" / "bring in data.csv"
// / "import the csv called data.csv" / "load my data from data.csv"
function tryReadCsv(text: string): string | null {
  const { rest, varName } = stripTail(text)
  // The "my/the data from FILE" shape is checked FIRST: the generic
  // pattern below has a permissive enough filename character class (it
  // allows spaces, so a real filename like "my data.csv" still works) that
  // it would otherwise swallow "my data from data.csv" WHOLE as if the
  // entire phrase were the filename, since that too ends in ".csv" — the
  // same class of bug as the Excel sheet-before-filename cases above.
  let m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:csv\\s+)?(?:file\\s+)?)?(${CSV_FILE})$`, 'i'))
  if (m) return wrap(`read.csv(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:csv\\s+)?(?:file\\s+)?(?:called\\s+)?(${CSV_FILE})$`, 'i'))
  if (m) return wrap(`read.csv(${rStr(m[1])})`, varName)
  return null
}

// "write df to output.csv" / "save df as output.csv" / "export df to
// output.csv" / "save df as output.xlsx" / "export df to data.rds" /
// "write df to data.json" / "save df as output.tsv".
function tryWriteFile(text: string): string | null {
  const base = String.raw`^(?:write|export|save)\s+(${IDENT})\s+(?:to|as|into)\s+(?:the\s+(?:file\s+)?)?`
  let m = text.match(new RegExp(`${base}(${CSV_FILE})$`, 'i'))
  if (m) return `write.csv(${m[1]}, ${rStr(m[2])}, row.names = FALSE)`
  m = text.match(new RegExp(`${base}(${TSV_FILE})$`, 'i'))
  if (m) return `write.table(${m[1]}, ${rStr(m[2])}, sep = "\\t", row.names = FALSE)`
  m = text.match(new RegExp(`${base}(${XLSX_FILE})$`, 'i'))
  if (m) return `writexl::write_xlsx(${m[1]}, ${rStr(m[2])})`
  m = text.match(new RegExp(`${base}(${RDS_FILE})$`, 'i'))
  if (m) return `saveRDS(${m[1]}, ${rStr(m[2])})`
  m = text.match(new RegExp(`${base}(${JSON_FILE})$`, 'i'))
  if (m) return `jsonlite::write_json(${m[1]}, ${rStr(m[2])})`
  return null
}

// "load the dataset mtcars" / "load the built-in dataset iris" — R's stock
// teaching datasets, always available via data().
function tryBuiltinDataset(text: string): string | null {
  const m = text.match(new RegExp(`^load\\s+(?:the\\s+)?(?:built-?in\\s+)?data(?:set)?\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `data(${m[1]})`
}

const ORDINAL_TO_NUM: Record<string, number> = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
}
const ORDINAL_WORDS = 'first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth'
const ORDINAL_SHEET_RE = new RegExp(`^from\\s+(?:the\\s+)?(${ORDINAL_WORDS})\\s+(?:worksheet|sheet)$`, 'i')

// "Import data.xlsx from the second worksheet" / "from sheet 2" / "from
// the worksheet named Sales" / "from the Sales sheet" / "the first
// worksheet of data.xlsx" (sheet descriptor BEFORE the filename, via "of"
// rather than "from" after it) / bare "import data.xlsx" (no sheet —
// readxl defaults to the first). Parsed in stages (filename, then naming,
// then sheet reference) rather than one giant regex, since the clauses can
// combine in more than one order.
function tryReadExcel(text: string): string | null {
  const { rest: afterName, varName } = stripTail(text)

  // "my/the data(set) from FILE.xlsx" (no sheet named) checked FIRST —
  // same permissive-character-class bug as tryReadCsv's own fix.
  const dm = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${XLSX_FILE})$`, 'i'))
  if (dm) return wrap(`readxl::read_excel(${rStr(dm[1])})`, varName)

  // "the Nth worksheet OF data.xlsx" / "the Sales sheet FROM data.xlsx" —
  // sheet descriptor BEFORE the filename, connected by either "of" or
  // "from". Checked FIRST, in numeric/ordinal/named order: the generic
  // filename-first parse below has a permissive enough character class
  // (it allows spaces, so a real filename like "my data.xlsx" still works)
  // that it would otherwise swallow "first worksheet of data.xlsx" WHOLE
  // as if the entire phrase were the filename, since that too ends in
  // ".xlsx" — and within THIS block, numeric/ordinal shapes have to be
  // tried before the generic named-sheet fallback, or an ordinal word like
  // "second" would itself get captured as a literal sheet NAME string
  // instead of being recognized as the number 2.
  let sm = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(\\d+)(?:st|nd|rd|th)?\\s+(?:worksheet|sheet)\\s+(?:of|from)\\s+(${XLSX_FILE})$`, 'i'))
  if (sm) return wrap(`readxl::read_excel(${rStr(sm[2])}, sheet = ${sm[1]})`, varName)
  sm = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?sheet\\s+(\\d+)\\s+(?:of|from)\\s+(${XLSX_FILE})$`, 'i'))
  if (sm) return wrap(`readxl::read_excel(${rStr(sm[2])}, sheet = ${sm[1]})`, varName)
  sm = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(${ORDINAL_WORDS})\\s+(?:worksheet|sheet)\\s+(?:of|from)\\s+(${XLSX_FILE})$`, 'i'))
  if (sm) return wrap(`readxl::read_excel(${rStr(sm[2])}, sheet = ${ORDINAL_TO_NUM[sm[1].toLowerCase()]})`, varName)
  sm = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:worksheet|sheet)\\s+(?:named|called)\\s+['"]?([\\w .-]+?)['"]?\\s+(?:of|from)\\s+(${XLSX_FILE})$`, 'i'))
  if (sm) return wrap(`readxl::read_excel(${rStr(sm[2])}, sheet = ${rStr(sm[1])})`, varName)
  sm = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?([\\w.-]+(?:\\s+[\\w.-]+)*?)\\s+(?:worksheet|sheet)\\s+(?:of|from)\\s+(${XLSX_FILE})$`, 'i'))
  if (sm) return wrap(`readxl::read_excel(${rStr(sm[2])}, sheet = ${rStr(sm[1])})`, varName)

  const m = afterName.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:excel\\s+)?(?:file\\s+|spreadsheet\\s+)?(${XLSX_FILE})(.*)$`, 'i'))
  if (!m) return null
  const file = m[1]
  const rest = m[2].trim()

  let sheetArg: string | null = null
  if (rest) {
    let sm = rest.match(/^from\s+(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+(?:worksheet|sheet)$/i)
    if (sm) sheetArg = sm[1]
    if (!sheetArg) {
      sm = rest.match(/^from\s+(?:the\s+)?sheet\s+(\d+)$/i)
      if (sm) sheetArg = sm[1]
    }
    if (!sheetArg) {
      sm = rest.match(ORDINAL_SHEET_RE)
      if (sm) sheetArg = String(ORDINAL_TO_NUM[sm[1].toLowerCase()])
    }
    if (!sheetArg) {
      sm = rest.match(/^from\s+(?:the\s+)?(?:worksheet|sheet)\s+(?:named|called)\s+['"]?([\w .-]+?)['"]?$/i)
      if (sm) sheetArg = rStr(sm[1])
    }
    if (!sheetArg) {
      sm = rest.match(/^from\s+(?:the\s+)?([\w.-]+(?:\s+[\w.-]+)*?)\s+(?:worksheet|sheet)$/i)
      if (sm) sheetArg = rStr(sm[1])
    }
    if (!sheetArg) return null // a "from ..." clause we don't understand — decline rather than guess
  }

  const args = [rStr(file), ...(sheetArg ? [`sheet = ${sheetArg}`] : [])].join(', ')
  return wrap(`readxl::read_excel(${args})`, varName)
}

// "Load data.rds into my environment" / "Import data.rds" / "read data.rds
// as df" — readRDS() returns the one object stored in the file; unlike
// .RData (handled separately in rWorkspace.ts's tryLoad — a .RData file
// can hold several named objects and load() restores them directly, so it
// takes no "into X" target at all), an .rds file's contents are a single
// value you choose what to do with, same as any other import here.
function tryReadRds(text: string): string | null {
  const { rest, varName } = stripTail(text)
  // "my/the data(set) from FILE.rds" checked FIRST — same permissive-
  // character-class bug as tryReadCsv's own fix, since RDS_FILE also
  // allows spaces in a filename.
  let m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${RDS_FILE})$`, 'i'))
  if (m) return wrap(`readRDS(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:file\\s+)?(${RDS_FILE})$`, 'i'))
  if (!m) return null
  return wrap(`readRDS(${rStr(m[1])})`, varName)
}

// "Import this tab-separated file into R." — the literal example has NO
// filename at all ("this" stands in for one). Rather than declining (and
// leaving a real, common request unsupported) or guessing a filename that
// would be wrong, this emits the correct call shape with an obvious
// placeholder and a comment — the same "give me the shape, fill in the
// rest" posture rPlotting.ts's trySaveDevice() already takes for "save the
// plot" with no prior plot command to re-run.
function tryGenericDelimitedNoFilename(text: string): string | null {
  const { rest } = stripTail(text)
  const m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:this|that|my|the)\\s+(tab[\\s-]?(?:separated|delimited)|comma[\\s-]?separated|semicolon[\\s-]?separated|pipe[\\s-]?(?:separated|delimited))\\s+file$`, 'i'))
  if (!m) return null
  const kind = m[1].toLowerCase()
  if (kind.startsWith('tab')) return 'read.delim("your-file.txt")  # replace "your-file.txt" with your actual file path'
  if (kind.startsWith('comma')) return 'read.csv("your-file.csv")  # replace "your-file.csv" with your actual file path'
  if (kind.startsWith('semicolon')) return 'read.csv2("your-file.csv")  # replace "your-file.csv" with your actual file path'
  return 'read.table("your-file.txt", sep = "|", header = TRUE)  # replace "your-file.txt" with your actual file path'
}

// The same formats, but WITH a real filename given — "import the
// tab-separated file data.txt", "load data.tsv" (extension alone implies
// the format), "data.txt as a tab-separated file", "the semicolon-separated
// file data.csv", "the pipe-delimited file data.txt".
function tryReadDelimitedNamed(text: string): string | null {
  const { rest, varName } = stripTail(text)

  let m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?tab[\\s-]?(?:separated|delimited)\\s+file\\s+(${FILE})$`, 'i'))
    ?? rest.match(new RegExp(`^${IMPORT_VERB}\\s+(${FILE})\\s+as\\s+(?:a\\s+)?tab[\\s-]?(?:separated|delimited)(?:\\s+file)?$`, 'i'))
  if (m) return wrap(`read.delim(${rStr(m[1])})`, varName)

  // "my/the data(set) from FILE.tsv" checked FIRST — same permissive-
  // character-class bug as tryReadCsv's own "my data from FILE" fix
  // above: TSV_FILE allows spaces (so a real filename like "my data.tsv"
  // still works), so without this, "import the dataset from data.tsv"
  // was swallowed WHOLE as if "dataset from data.tsv" were the literal
  // filename, since that string too ends in ".tsv" — confirmed
  // empirically, not just reasoned about.
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${TSV_FILE})$`, 'i'))
  if (m) return wrap(`read.delim(${rStr(m[1])})`, varName)

  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:file\\s+)?(${TSV_FILE})$`, 'i'))
  if (m) return wrap(`read.delim(${rStr(m[1])})`, varName)

  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?semicolon[\\s-]?separated\\s+file\\s+(${FILE})$`, 'i'))
    ?? rest.match(new RegExp(`^${IMPORT_VERB}\\s+(${FILE})\\s+as\\s+(?:a\\s+)?semicolon[\\s-]?separated(?:\\s+file)?$`, 'i'))
  if (m) return wrap(`read.csv2(${rStr(m[1])})`, varName)

  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?pipe[\\s-]?(?:separated|delimited)\\s+file\\s+(${FILE})$`, 'i'))
    ?? rest.match(new RegExp(`^${IMPORT_VERB}\\s+(${FILE})\\s+as\\s+(?:a\\s+)?pipe[\\s-]?(?:separated|delimited)(?:\\s+file)?$`, 'i'))
  if (m) return wrap(`read.table(${rStr(m[1])}, sep = "|", header = TRUE)`, varName)

  return null
}

// "Import data.json" / "load the JSON file data.json" — jsonlite is the
// one standard JSON reader for R (no base-R equivalent).
function tryReadJson(text: string): string | null {
  const { rest, varName } = stripTail(text)
  // "my/the data(set) from FILE.json" checked FIRST — same permissive-
  // character-class bug as tryReadCsv's own fix.
  let m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${JSON_FILE})$`, 'i'))
  if (m) return wrap(`jsonlite::fromJSON(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:json\\s+)?(?:file\\s+)?(${JSON_FILE})$`, 'i'))
  if (!m) return null
  return wrap(`jsonlite::fromJSON(${rStr(m[1])})`, varName)
}

// "Import data.sav" / "load the SPSS file data.sav" / "read data.dta" /
// "import the Stata file data.dta" / "load data.sas7bdat" — the
// social-science stats formats, all via `haven` (no base-R equivalent for
// any of the three).
function tryReadStatPackage(text: string): string | null {
  const { rest, varName } = stripTail(text)
  // "my/the data(set) from FILE.ext" checked FIRST for each format —
  // same permissive-character-class bug as tryReadCsv's own fix.
  let m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${SAV_FILE})$`, 'i'))
  if (m) return wrap(`haven::read_sav(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${DTA_FILE})$`, 'i'))
  if (m) return wrap(`haven::read_dta(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:my\\s+|the\\s+)?data(?:set)?\\s+from\\s+(?:the\\s+(?:file\\s+)?)?(${SAS_FILE})$`, 'i'))
  if (m) return wrap(`haven::read_sas(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:spss\\s+)?(?:file\\s+)?(${SAV_FILE})$`, 'i'))
  if (m) return wrap(`haven::read_sav(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:stata\\s+)?(?:file\\s+)?(${DTA_FILE})$`, 'i'))
  if (m) return wrap(`haven::read_dta(${rStr(m[1])})`, varName)
  m = rest.match(new RegExp(`^${IMPORT_VERB}\\s+(?:the\\s+)?(?:sas\\s+)?(?:file\\s+)?(${SAS_FILE})$`, 'i'))
  if (m) return wrap(`haven::read_sas(${rStr(m[1])})`, varName)
  return null
}

export function recognizeDataImport(rawText: string): string | null {
  const text = rawText.trim()
  return (
    // tryReadDelimitedNamed MUST run before tryReadCsv: its "tab-
    // separated"/"semicolon-separated"/"pipe-separated" qualifier words
    // are meaningful, but tryReadCsv's filename pattern is permissive
    // enough (it allows spaces and hyphens, so a real filename like
    // "my data.csv" still matches) that it would otherwise swallow
    // "semicolon-separated file data.csv" WHOLE as if that entire phrase
    // were the filename, since it too ends in ".csv". Explicit format
    // words always win over the generic guess.
    tryReadDelimitedNamed(text) ??
    tryReadCsv(text) ??
    tryReadExcel(text) ??
    tryReadRds(text) ??
    tryReadJson(text) ??
    tryReadStatPackage(text) ??
    tryGenericDelimitedNoFilename(text) ??
    tryBuiltinDataset(text) ??
    tryWriteFile(text)
  )
}
