// ── R-native: cleaning and filtering an existing data frame ─────────────────
// "remove rows with missing values in income", "keep only observations
// where age is greater than 18", "sort the dataset by income from highest
// to lowest", "convert gender into a categorical variable" — the other
// most common things people do to a data frame once it's already in R, past
// importing it (rDataImport.ts) and inspecting it (rDataInspection.ts).
//
// Safety convention followed throughout this file: operations that DROP
// rows or columns (filter/keep-only/remove-missing/remove-duplicates/
// remove-outliers/select-columns/sort) return a bare subsetting expression
// — df[cond, ] — rather than auto-reassigning it to df. That matches the
// pre-existing "filter df where …" behavior this file's filter/select/sort
// functions were migrated from, and it means a command never silently
// discards the user's original data in one shot; they decide to keep the
// result by reassigning it themselves. Operations that only modify VALUES
// within the existing shape (single-column remove/rename, type conversion,
// bulk column-name cleanup, missing-value imputation) are narrow and don't
// carry that risk, so they DO produce an assignment statement directly —
// same as this file's pre-existing rename/remove-column behavior.
// All base R — no tidyverse/dplyr dependency assumed (see
// rVectorsAndDataFrames.ts's header for why).

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const IDENT = String.raw`[A-Za-z][\w.]*`
const DATA_REF = String.raw`(?:${IDENT}|my\s+dataset|the\s+dataset|this\s+dataset|my\s+data|the\s+data|this\s+data|it)`
// A separator between list items that tolerates an Oxford comma: "age,
// income, and education" has BOTH a comma AND "and" before the last item,
// not just one or the other — "," alone and " and " alone must also still
// work for 2-item lists ("age and income" / "age, income").
const LIST_SEP = String.raw`\s*,\s*(?:and\s+)?|\s+and\s+`
const IDENT_LIST = String.raw`${IDENT}(?:(?:${LIST_SEP})${IDENT})*`
function splitIdentList(raw: string): string[] {
  return raw.split(new RegExp(`${LIST_SEP}`, 'i')).map(s => s.trim()).filter(Boolean)
}

function normalizeDataRef(raw: string): string {
  const t = raw.trim()
  if (/^it$/i.test(t)) return 'df'
  return /^[A-Za-z][\w.]*$/.test(t) ? t : 'df'
}

// ── Conditions: shared by filter/keep-only (also reused for row-dropping
// phrasing elsewhere in this file) ──────────────────────────────────────────
// Ordered longest/most-specific phrase first within each operator, so e.g.
// "greater than or equal to" is never cut short by "greater than" matching
// first and leaving "or equal to 18" as a bogus tail (same ordering
// discipline as the filename-pattern gotcha documented in CLAUDE.md).
const COMPARATORS: Array<[RegExp, string]> = [
  [/greater than or equal to|no less than/i, '>='], [/at least/i, '>='],
  [/less than or equal to|no more than/i, '<='], [/at most/i, '<='],
  [/not equal to/i, '!='],
  [/greater than|above|over|more than/i, '>'],
  [/less than|below|under|fewer than/i, '<'],
  [/equal to|equals/i, '=='],
]

// "age is between 18 and 30" -> (df$age >= 18 & df$age <= 30); a single
// comparator clause otherwise. Never a compound and/or — that's handled one
// level up, in translateCondition, so this always returns ONE term.
// `dfName` is REQUIRED on every column reference this produces: base R's
// `[.data.frame` does not do dplyr-style NSE, so a bare `age > 18` inside
// `df[age > 18, ]` throws "object 'age' not found" — confirmed with a real
// R session, not assumed. Every column mentioned in a condition must come
// out as `${dfName}$column`, never bare.
function translateSingleCondition(cond: string, dfName: string): string | null {
  const c = cond.trim()
  const between = c.match(new RegExp(`^(${IDENT})\\s+is\\s+between\\s+(.+?)\\s+and\\s+(.+)$`, 'i'))
  if (between) {
    const col = `${dfName}$${between[1]}`
    return `(${col} >= ${between[2].trim()} & ${col} <= ${between[3].trim()})`
  }
  for (const [re, op] of COMPARATORS) {
    const m = c.match(new RegExp(`^(${IDENT})\\s+is\\s+(?:${re.source})\\s+(.+)$`, 'i'))
    if (m) return `${dfName}$${m[1]}${op}${m[m.length - 1].trim()}`
  }
  return null
}

// Splits "age is above 18 and income is below 50000" into its two clauses —
// but NOT "age is between 18 and 30", whose only "and" joins the two bounds
// of a single between-clause rather than introducing a new "IDENT is …"
// clause. The lookahead is what tells those two "and"s apart: only a
// conjunction immediately followed by another "IDENT is" counts as a
// clause boundary.
function splitTopLevelClauses(cond: string, conj: 'and' | 'or'): string[] {
  const re = new RegExp(`\\s+${conj}\\s+(?=${IDENT}\\s+is\\s+)`, 'gi')
  return cond.split(re)
}

// "age is greater than 30" (single) / "age is between 18 and 30 and income
// is above 30000" (between + compound and) / "age is under 10 or age is
// over 60" (compound or). Mixing and+or in one condition isn't supported —
// genuinely ambiguous without parens, and none of this vocabulary's target
// phrasings need it. Exported — rDataTransform.ts's binary-indicator
// variables ("1 when score is at least 60, 0 otherwise") reuse this same
// condition grammar rather than duplicating it.
export function translateCondition(cond: string, dfName: string): string | null {
  const andClauses = splitTopLevelClauses(cond, 'and')
  if (andClauses.length > 1) {
    const parts = andClauses.map(c => translateSingleCondition(c, dfName))
    return parts.every((p): p is string => p !== null) ? parts.join(' & ') : null
  }
  const orClauses = splitTopLevelClauses(cond, 'or')
  if (orClauses.length > 1) {
    const parts = orClauses.map(c => translateSingleCondition(c, dfName))
    return parts.every((p): p is string => p !== null) ? parts.join(' | ') : null
  }
  return translateSingleCondition(cond, dfName)
}

// ── Filtering rows ───────────────────────────────────────────────────────
// "filter df where age is greater than 30" / "rows of df where age is at
// least 18" / "keep only observations where age is greater than 18"
// (bare — no data frame named, defaults to df) / "keep observations where
// age is between 18 and 30 and income is above 30000".
function tryFilterRows(text: string): string | null {
  let m = text.match(new RegExp(`^filter\\s+(?:rows?\\s+of\\s+)?(${IDENT})\\s+where\\s+(.+)$`, 'i'))
    ?? text.match(new RegExp(`^(?:the\\s+)?rows?\\s+of\\s+(${IDENT})\\s+where\\s+(.+)$`, 'i'))
    ?? text.match(new RegExp(`^(?:show|find)\\s+(?:the\\s+)?rows?\\s+(?:of|in)\\s+(${IDENT})\\s+where\\s+(.+)$`, 'i'))
    ?? text.match(new RegExp(`^keep\\s+only\\s+(?:the\\s+)?(?:rows?|observations?|records?)\\s+(?:of|in)\\s+(${IDENT})\\s+where\\s+(.+)$`, 'i'))
  if (m) {
    const cond = translateCondition(m[2], m[1])
    return cond ? `${m[1]}[${cond}, ]` : null
  }
  m = text.match(new RegExp(`^keep\\s+(?:only\\s+)?(?:the\\s+)?(?:rows?|observations?|records?)\\s+where\\s+(.+)$`, 'i'))
  if (m) {
    const cond = translateCondition(m[1], 'df')
    return cond ? `df[${cond}, ]` : null
  }
  return null
}

// ── Removing rows with missing values ───────────────────────────────────
// "remove all rows with missing values in income" / "drop rows where
// income is missing" / "remove rows with missing income" /
// "remove missing income values" — a single named column.
function tryRemoveMissingInColumn(text: string): string | null {
  let m = text.match(new RegExp(`^(?:remove|drop|delete|exclude)\\s+(?:all\\s+)?(?:the\\s+)?(?:rows?|observations?|records?)\\s+(?:with|that\\s+(?:have|contain))\\s+missing\\s+values?\\s+(?:in|for)\\s+(${IDENT})$`, 'i'))
  if (m) return `df[!is.na(df$${m[1]}), ]`
  m = text.match(new RegExp(`^(?:remove|drop|delete|exclude)\\s+(?:all\\s+)?(?:the\\s+)?(?:rows?|observations?|records?)\\s+where\\s+(${IDENT})\\s+is\\s+(?:missing|NA)$`, 'i'))
  if (m) return `df[!is.na(df$${m[1]}), ]`
  m = text.match(new RegExp(`^(?:remove|drop|delete|exclude)\\s+(?:all\\s+)?(?:the\\s+)?(?:rows?|observations?|records?)\\s+with\\s+(?:an?\\s+)?(?:missing|NA)\\s+(${IDENT})$`, 'i'))
  if (m) return `df[!is.na(df$${m[1]}), ]`
  m = text.match(new RegExp(`^(?:remove|drop|delete|exclude)\\s+missing\\s+(${IDENT})\\s+values?$`, 'i'))
  if (m) return `df[!is.na(df$${m[1]}), ]`
  m = text.match(new RegExp(`^(?:remove|drop|delete|exclude)\\s+(?:all\\s+)?(?:the\\s+)?(?:rows?|observations?|records?)\\s+with\\s+(?:an?\\s+)?NA\\s+(?:value\\s+)?in\\s+(${IDENT})$`, 'i'))
  if (m) return `df[!is.na(df$${m[1]}), ]`
  return null
}

// "remove all rows that contain any missing values" / "drop incomplete
// rows" / "keep only complete cases" — whole-row, any column.
function tryRemoveAnyMissing(text: string): string | null {
  if (/^(?:remove|drop|delete|exclude)\s+(?:all\s+)?(?:the\s+)?(?:rows?|observations?|records?)\s+(?:that\s+(?:have|contain)\s+any|with\s+any)\s+missing\s+(?:values?|data)$/i.test(text)) return 'na.omit(df)'
  if (/^(?:remove|drop|delete|exclude)\s+(?:all\s+)?(?:the\s+)?missing\s+values?$/i.test(text)) return 'na.omit(df)'
  if (/^(?:remove|drop|delete|exclude)\s+(?:all\s+)?(?:the\s+)?(?:rows?\s+with\s+)?missing\s+values?\s+from\s+(.+)$/i.test(text)) {
    const m = text.match(new RegExp(`^(?:remove|drop|delete|exclude)\\s+(?:all\\s+)?(?:the\\s+)?(?:rows?\\s+with\\s+)?missing\\s+values?\\s+from\\s+(${DATA_REF})$`, 'i'))
    if (m) return `na.omit(${normalizeDataRef(m[1])})`
  }
  if (/^(?:remove|drop|delete|exclude)\s+(?:all\s+)?incomplete\s+(?:rows?|cases|observations?)$/i.test(text)) return 'na.omit(df)'
  if (/^keep\s+only\s+(?:the\s+)?complete\s+(?:rows?|cases|observations?)$/i.test(text)) return 'na.omit(df)'
  if (/^(?:the\s+)?complete\s+cases$/i.test(text)) return 'na.omit(df)'
  const m = text.match(new RegExp(`^(?:the\\s+)?complete\\s+cases\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) { const d = normalizeDataRef(m[1]); return `${d}[complete.cases(${d}), ]` }
  return null
}

// ── Removing duplicate rows ──────────────────────────────────────────────
// "remove duplicate rows from the dataset" / "remove duplicates" /
// "drop repeated rows" / "deduplicate the data".
function tryRemoveDuplicates(text: string): string | null {
  let m = text.match(new RegExp(`^(?:remove|drop|delete)\\s+duplicate\\s+rows?(?:\\s+from\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `unique(${normalizeDataRef(m[1] ?? 'df')})`
  if (/^(?:remove|drop|delete)\s+duplicates?$/i.test(text)) return 'unique(df)'
  if (/^(?:remove|drop|delete)\s+(?:all\s+)?repeated\s+rows?$/i.test(text)) return 'unique(df)'
  if (/^de-?duplicate(?:\s+(?:the\s+)?(?:dataset|data|df))?$/i.test(text)) return 'unique(df)'
  m = text.match(new RegExp(`^(?:remove|drop)\\s+rows?\\s+that\\s+are\\s+duplicates?(?:\\s+(?:from|in)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `unique(${normalizeDataRef(m[1] ?? 'df')})`
  return null
}

// ── Keeping/removing columns ─────────────────────────────────────────────
function buildSelect(df: string, colsRaw: string): string {
  const cols = splitIdentList(colsRaw).map(c => rStr(c))
  return `${df}[, c(${cols.join(', ')})]`
}

// "select the columns name and age from df" / "keep only the columns age,
// income, and education" (bare, defaults to df) / "select columns age and income".
function trySelectColumns(text: string): string | null {
  let m = text.match(new RegExp(`^select\\s+(?:the\\s+)?columns?\\s+(${IDENT_LIST})\\s+from\\s+(${IDENT})$`, 'i'))
  if (m) return buildSelect(m[2], m[1])
  m = text.match(new RegExp(`^keep\\s+only\\s+(?:the\\s+)?columns?\\s+(${IDENT_LIST})\\s+(?:from|in)\\s+(${IDENT})$`, 'i'))
  if (m) return buildSelect(m[2], m[1])
  m = text.match(new RegExp(`^keep\\s+only\\s+(?:the\\s+)?columns?\\s+(${IDENT_LIST})$`, 'i'))
  if (m) return buildSelect('df', m[1])
  m = text.match(new RegExp(`^select\\s+(?:the\\s+)?columns?\\s+(${IDENT_LIST})$`, 'i'))
  if (m) return buildSelect('df', m[1])
  return null
}

// "remove the column participant_id from df" / "remove the column
// participant_id" (bare, defaults to df) / "drop column x".
function tryRemoveColumn(text: string): string | null {
  let m = text.match(new RegExp(`^(?:remove|drop|delete)\\s+(?:the\\s+)?column\\s+(${IDENT})\\s+from\\s+(${IDENT})$`, 'i'))
  if (m) return `${m[2]}$${m[1]} <- NULL`
  m = text.match(new RegExp(`^(?:remove|drop|delete)\\s+(?:the\\s+)?column\\s+(${IDENT})$`, 'i'))
  if (m) return `df$${m[1]} <- NULL`
  return null
}

// ── Sorting ───────────────────────────────────────────────────────────────
function buildSort(df: string, col: string, desc: boolean): string {
  const key = desc ? `-${df}$${col}` : `${df}$${col}`
  return `${df}[order(${key}), ]`
}

// "sort df by age" / "sort df by age descending" / "sort the dataset by
// income from highest to lowest" / "order df by age ascending".
function trySortDataset(text: string): string | null {
  let m = text.match(new RegExp(`^(?:sort|order)\\s+(${DATA_REF})\\s+by\\s+(${IDENT})\\s+from\\s+(highest\\s+to\\s+lowest|lowest\\s+to\\s+highest)$`, 'i'))
  if (m) return buildSort(normalizeDataRef(m[1]), m[2], /^highest/i.test(m[3]))
  m = text.match(new RegExp(`^(?:sort|order)\\s+(${DATA_REF})\\s+by\\s+(${IDENT})(?:\\s+(ascending|descending|asc|desc))?$`, 'i'))
  if (m) return buildSort(normalizeDataRef(m[1]), m[2], /^des/i.test(m[3] ?? ''))
  // No data frame named at all — "sort by score ascending" — defaults
  // to df, same convention as every other unnamed form elsewhere.
  m = text.match(new RegExp(`^(?:sort|order)\\s+by\\s+(${IDENT})(?:\\s+(ascending|descending|asc|desc))?$`, 'i'))
  if (m) return buildSort('df', m[1], /^des/i.test(m[2] ?? ''))
  return null
}

// ── Renaming columns ──────────────────────────────────────────────────────
function buildRename(df: string, from: string, to: string): string {
  return `names(${df})[names(${df}) == ${rStr(from)}] <- ${rStr(to)}`
}

// "rename column x to y in df" / "rename column educ to education" (bare,
// defaults to df) / "rename educ to education" (no "column" at all).
function tryRenameColumn(text: string): string | null {
  let m = text.match(new RegExp(`^rename\\s+(?:the\\s+)?column\\s+(${IDENT})\\s+to\\s+(${IDENT})\\s+in\\s+(${IDENT})$`, 'i'))
  if (m) return buildRename(m[3], m[1], m[2])
  m = text.match(new RegExp(`^rename\\s+(?:the\\s+)?column\\s+(${IDENT})\\s+to\\s+(${IDENT})$`, 'i'))
  if (m) return buildRename('df', m[1], m[2])
  // "rename the X column to Y" — the reverse word order, "column" AFTER
  // the name instead of before it.
  m = text.match(new RegExp(`^rename\\s+the\\s+(${IDENT})\\s+column\\s+to\\s+(${IDENT})$`, 'i'))
  if (m) return buildRename('df', m[1], m[2])
  m = text.match(new RegExp(`^rename\\s+(${IDENT})\\s+to\\s+(${IDENT})$`, 'i'))
  if (m) return buildRename('df', m[1], m[2])
  return null
}

// ── Bulk column-name standardization ─────────────────────────────────────
// "rename all column names to lowercase with underscores instead of
// spaces" / "lowercase the column names and replace spaces with
// underscores" / "make column names snake case" / "clean up the column names".
function tryStandardizeColumnNames(text: string): string | null {
  if (/^(?:rename\s+all\s+column\s+names?|(?:make|convert)\s+(?:all\s+)?(?:the\s+)?column\s+names?)\s+(?:to\s+)?lowercase\s+with\s+underscores?\s+instead\s+of\s+spaces?$/i.test(text)) {
    return 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'
  }
  if (/^lowercase\s+(?:all\s+)?(?:the\s+)?column\s+names?\s+and\s+replace\s+spaces?\s+with\s+underscores?$/i.test(text)) {
    return 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'
  }
  if (/^(?:make|convert)\s+(?:all\s+)?(?:the\s+)?column\s+names?\s+(?:to\s+)?snake[\s_-]?case$/i.test(text)) {
    return 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'
  }
  if (/^(?:clean\s+up|standardize)\s+(?:all\s+)?(?:the\s+)?column\s+names?$/i.test(text)) {
    return 'colnames(df) <- gsub(" ", "_", tolower(colnames(df)))'
  }
  if (/^replace\s+spaces?\s+in\s+(?:the\s+)?column\s+names?\s+with\s+underscores?$/i.test(text)) {
    return 'colnames(df) <- gsub(" ", "_", colnames(df))'
  }
  if (/^(?:make|convert)\s+(?:all\s+)?(?:the\s+)?column\s+names?\s+lowercase$/i.test(text)) {
    return 'colnames(df) <- tolower(colnames(df))'
  }
  if (/^lowercase\s+(?:all\s+)?(?:the\s+)?column\s+names?$/i.test(text)) {
    return 'colnames(df) <- tolower(colnames(df))'
  }
  return null
}

// ── Type conversion ───────────────────────────────────────────────────────
// "convert gender into a categorical variable" / "convert income from text
// to numeric" / "convert date into a date variable" / "make gender a
// factor" / "turn income into a number" / "income should be numeric" /
// "treat gender as categorical" / "parse date as a date".
const TYPE_TO_FN: Record<string, string> = {
  categorical: 'as.factor', category: 'as.factor', factor: 'as.factor',
  numeric: 'as.numeric', number: 'as.numeric',
  text: 'as.character', character: 'as.character', string: 'as.character',
  integer: 'as.integer',
  date: 'as.Date',
  logical: 'as.logical', boolean: 'as.logical',
}
const TYPE_WORDS = Object.keys(TYPE_TO_FN).join('|')

function buildConvert(col: string, typeWord: string): string {
  const fn = TYPE_TO_FN[typeWord.toLowerCase()]
  return `df$${col} <- ${fn}(df$${col})`
}

// "the X column"/"column X"/"X" — the same identifier wrapping shows up
// across most of these phrasings ("convert the gender column to...").
const COL_REF = String.raw`(?:the\s+(${IDENT})\s+column|column\s+(${IDENT})|(${IDENT}))`
function colFrom(m: RegExpMatchArray, start: number): string {
  return m[start] ?? m[start + 1] ?? m[start + 2]
}

function tryConvertType(text: string): string | null {
  let m = text.match(new RegExp(`^convert\\s+${COL_REF}\\s+(?:from\\s+\\w+\\s+)?(?:to|into)\\s+(?:an?\\s+)?(${TYPE_WORDS})(?:\\s+(?:variable|object|column))?$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  m = text.match(new RegExp(`^make\\s+${COL_REF}\\s+(?:an?\\s+)?(${TYPE_WORDS})$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  m = text.match(new RegExp(`^turn\\s+${COL_REF}\\s+into\\s+(?:an?\\s+)?(${TYPE_WORDS})(?:\\s+(?:variable|object))?$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  m = text.match(new RegExp(`^${COL_REF}\\s+should\\s+be\\s+(?:an?\\s+)?(${TYPE_WORDS})$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  m = text.match(new RegExp(`^treat\\s+${COL_REF}\\s+as\\s+(?:an?\\s+)?(${TYPE_WORDS})$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  m = text.match(new RegExp(`^parse\\s+${COL_REF}\\s+as\\s+(?:an?\\s+)?(${TYPE_WORDS})$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  // "change gender to a factor" — the everyday-English verb, as common a
  // way to ask for this as "convert"/"turn".
  m = text.match(new RegExp(`^change\\s+${COL_REF}\\s+to\\s+(?:an?\\s+)?(${TYPE_WORDS})$`, 'i'))
  if (m) return buildConvert(colFrom(m, 1), m[4])
  return null
}

// ── Missing-value imputation ──────────────────────────────────────────────
// "replace missing values in income with the median income" / "impute
// missing income with the mean" / "fill missing income values with the
// median" / "replace NAs in income with the mean" / "impute income using
// the median".
function buildImpute(col: string, statWord: string): string {
  const fn = /^aver/i.test(statWord) ? 'mean' : statWord.toLowerCase()
  return `df$${col}[is.na(df$${col})] <- ${fn}(df$${col}, na.rm = TRUE)`
}

function tryImputeMissing(text: string): string | null {
  const STAT = '(mean|median|average)'
  let m = text.match(new RegExp(`^(?:replace|impute)\\s+missing\\s+values?\\s+in\\s+(${IDENT})\\s+with\\s+(?:the\\s+)?${STAT}(?:\\s+\\w+)?$`, 'i'))
  if (m) return buildImpute(m[1], m[2])
  m = text.match(new RegExp(`^(?:replace|impute)\\s+missing\\s+(${IDENT})\\s+(?:values?\\s+)?with\\s+(?:the\\s+)?${STAT}(?:\\s+\\w+)?$`, 'i'))
  if (m) return buildImpute(m[1], m[2])
  m = text.match(new RegExp(`^fill(?:\\s+in)?\\s+missing\\s+(${IDENT})(?:\\s+values?)?\\s+with\\s+(?:the\\s+)?${STAT}(?:\\s+\\w+)?$`, 'i'))
  if (m) return buildImpute(m[1], m[2])
  m = text.match(new RegExp(`^replace\\s+NAs?\\s+in\\s+(${IDENT})\\s+with\\s+(?:the\\s+)?${STAT}(?:\\s+\\w+)?$`, 'i'))
  if (m) return buildImpute(m[1], m[2])
  m = text.match(new RegExp(`^impute\\s+(${IDENT})\\s+(?:using|with)\\s+(?:the\\s+)?${STAT}(?:\\s+\\w+)?$`, 'i'))
  if (m) return buildImpute(m[1], m[2])
  return null
}

// ── Outlier removal ───────────────────────────────────────────────────────
// "remove observations with income more than three standard deviations
// above or below its mean" / "remove rows where income is more than 2
// standard deviations from the mean" / "remove outliers in income".
const NUMBER_WORDS: Record<string, string> = {
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
}
function parseN(raw: string): string {
  return NUMBER_WORDS[raw.toLowerCase()] ?? raw
}

function buildOutlierBound(col: string, n: string): string {
  return `df[abs(df$${col} - mean(df$${col}, na.rm = TRUE)) <= ${n} * sd(df$${col}, na.rm = TRUE), ]`
}

function tryRemoveOutliers(text: string): string | null {
  let m = text.match(new RegExp(`^(?:remove|drop|exclude)\\s+(?:observations?|rows?|records?)\\s+with\\s+(${IDENT})\\s+more\\s+than\\s+(\\w+)\\s+standard\\s+deviations?\\s+(?:above\\s+or\\s+below|away\\s+from|from)\\s+its\\s+mean$`, 'i'))
  if (m) return buildOutlierBound(m[1], parseN(m[2]))
  m = text.match(new RegExp(`^(?:remove|drop|exclude)\\s+(?:observations?|rows?|records?)\\s+where\\s+(${IDENT})\\s+is\\s+more\\s+than\\s+(\\w+)\\s+standard\\s+deviations?\\s+(?:above\\s+or\\s+below|away\\s+from|from)\\s+(?:its\\s+|the\\s+)?mean$`, 'i'))
  if (m) return buildOutlierBound(m[1], parseN(m[2]))
  m = text.match(new RegExp(`^(?:remove|drop|exclude)\\s+outliers?\\s+(?:in|from)\\s+(${IDENT})$`, 'i'))
  if (m) return buildOutlierBound(m[1], '3')
  m = text.match(new RegExp(`^(?:remove|drop|exclude)\\s+(${IDENT})\\s+outliers?$`, 'i'))
  if (m) return buildOutlierBound(m[1], '3')
  return null
}

export function recognizeDataCleaning(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryRemoveMissingInColumn(text) ??
    tryRemoveAnyMissing(text) ??
    tryRemoveDuplicates(text) ??
    tryFilterRows(text) ??
    trySelectColumns(text) ??
    tryRemoveColumn(text) ??
    trySortDataset(text) ??
    tryStandardizeColumnNames(text) ??
    tryRenameColumn(text) ??
    tryConvertType(text) ??
    tryImputeMissing(text) ??
    tryRemoveOutliers(text)
  )
}
