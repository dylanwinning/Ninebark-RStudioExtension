// ── R-native: creating and transforming variables ───────────────────────────
// "create a column called total_score by adding math_score and
// reading_score", "standardize income", "merge the datasets students and
// grades using student_id" — building NEW columns/datasets out of existing
// ones, the thing people reach for once a data frame is already clean
// (rDataCleaning.ts) and they're ready to derive something from it.
// All base R except pivot_longer/pivot_wider, which have no base-R
// equivalent at all (reshape() exists but is painful enough that nobody
// asks for it by name) — those two go through `tidyr::`, namespaced
// rather than preceded by `library()`, same reasoning as rDataImport.ts's
// readxl/jsonlite/haven calls.

import { translateCondition } from './rDataCleaning'

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const IDENT = String.raw`[A-Za-z][\w.]*`
const LIST_SEP = String.raw`\s*,\s*(?:and\s+)?|\s+and\s+`

// ── 26. Creating a column from two others by arithmetic ────────────────────
// "create a column called total_score by adding math_score and
// reading_score" / "...by subtracting b from a" / "...by multiplying a and
// b" / "...by dividing a by b" / "create a column called x that is a plus
// b" (also minus/times/multiplied by/divided by) / "add a and b and call
// it x".
function buildArith(name: string, a: string, op: string, b: string): string {
  return `df$${name} <- df$${a} ${op} df$${b}`
}

const ARITH_OPWORD: Record<string, string> = {
  plus: '+', minus: '-', times: '*', 'multiplied by': '*', 'divided by': '/',
}

function tryCreateColumnArith(text: string): string | null {
  let m = text.match(new RegExp(`^create\\s+a\\s+(?:new\\s+)?column\\s+(?:called|named)\\s+(${IDENT})\\s+by\\s+(?:adding|summing)\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return buildArith(m[1], m[2], '+', m[3])
  m = text.match(new RegExp(`^create\\s+a\\s+(?:new\\s+)?column\\s+(?:called|named)\\s+(${IDENT})\\s+by\\s+subtracting\\s+(${IDENT})\\s+from\\s+(${IDENT})$`, 'i'))
  if (m) return buildArith(m[1], m[3], '-', m[2])
  m = text.match(new RegExp(`^create\\s+a\\s+(?:new\\s+)?column\\s+(?:called|named)\\s+(${IDENT})\\s+by\\s+multiplying\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return buildArith(m[1], m[2], '*', m[3])
  m = text.match(new RegExp(`^create\\s+a\\s+(?:new\\s+)?column\\s+(?:called|named)\\s+(${IDENT})\\s+by\\s+dividing\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (m) return buildArith(m[1], m[2], '/', m[3])
  m = text.match(new RegExp(`^create\\s+a\\s+(?:new\\s+)?column\\s+(?:called|named)\\s+(${IDENT})\\s+that\\s+is\\s+(${IDENT})\\s+(plus|minus|times|multiplied\\s+by|divided\\s+by)\\s+(${IDENT})$`, 'i'))
  if (m) return buildArith(m[1], m[2], ARITH_OPWORD[m[3].toLowerCase().replace(/\s+/g, ' ')], m[4])
  m = text.match(new RegExp(`^add\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+and\\s+call\\s+it\\s+(${IDENT})$`, 'i'))
  if (m) return buildArith(m[3], m[1], '+', m[2])
  return null
}

// ── 27. Binary/indicator variable from a condition ──────────────────────────
// "create a binary variable called passed that is 1 when score is at least
// 60 and 0 otherwise" / "...1 if score is at least 60, 0 otherwise" /
// "create an indicator variable called passed for score is at least 60".
// Reuses rDataCleaning.ts's condition grammar (comparators, "between",
// compound and/or) rather than re-deriving it.
function tryBinaryIndicator(text: string): string | null {
  let m = text.match(new RegExp(`^create\\s+a\\s+(?:binary|indicator)\\s+(?:variable|column)\\s+called\\s+(${IDENT})\\s+(?:that\\s+is\\s+|equal\\s+to\\s+)?1\\s+(?:when|if)\\s+(.+?)(?:,)?\\s+(?:(?:and|else)\\s+)?0\\s+otherwise$`, 'i'))
  if (m) {
    const cond = translateCondition(m[2], 'df')
    return cond ? `df$${m[1]} <- ifelse(${cond}, 1, 0)` : null
  }
  m = text.match(new RegExp(`^create\\s+an?\\s+indicator\\s+variable\\s+called\\s+(${IDENT})\\s+for\\s+(.+)$`, 'i'))
  if (m) {
    const cond = translateCondition(m[2], 'df')
    return cond ? `df$${m[1]} <- ifelse(${cond}, 1, 0)` : null
  }
  return null
}

// ── 28. Recoding values ──────────────────────────────────────────────────
// "recode M to Male and F to Female in gender" — any number of "from to"
// pairs, joined "and", building a nested ifelse chain that leaves anything
// not named untouched.
function tryRecode(text: string): string | null {
  const m = text.match(new RegExp(`^recode\\s+(.+?)\\s+in\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  const col = m[2]
  const parts = m[1].split(/\s+and\s+/i).map(s => s.trim())
  const pairs: Array<[string, string]> = []
  for (const p of parts) {
    const pm = p.match(/^(\S+)\s+to\s+(\S+)$/i)
    if (!pm) return null
    pairs.push([pm[1], pm[2]])
  }
  let expr = `df$${col}`
  for (let i = pairs.length - 1; i >= 0; i--) {
    expr = `ifelse(df$${col} == ${rStr(pairs[i][0])}, ${rStr(pairs[i][1])}, ${expr})`
  }
  return `df$${col} <- ${expr}`
}

// ── 29. Binning a numeric column into named groups ──────────────────────────
// "divide age into groups: under 18, 18-29, 30-49, and 50 or older" — each
// group spec is "under N"/"below N"/"less than N" (lower-open), "A-B"/"A
// to B" (an inclusive integer range — en dash or hyphen), or "N or
// older"/"N or more"/"N or above" (upper-open). Order matters: specs are
// taken left-to-right as consecutive, increasing bins.
interface GroupSpec { label: string; lo: number; hi: number }

function parseGroupSpec(raw: string): GroupSpec | null {
  const label = raw.trim().replace(/[–—]/g, '-')
  let m = label.match(/^(?:under|below|less\s+than)\s+(\d+(?:\.\d+)?)$/i)
  if (m) return { label, lo: -Infinity, hi: Number(m[1]) }
  m = label.match(/^(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)$/i)
  if (m) return { label, lo: Number(m[1]), hi: Number(m[2]) + 1 }
  m = label.match(/^(\d+(?:\.\d+)?)\s+or\s+(?:older|more|above|greater)$/i)
  if (m) return { label, lo: Number(m[1]), hi: Infinity }
  return null
}

function fmtBreak(n: number): string {
  if (n === Infinity) return 'Inf'
  if (n === -Infinity) return '-Inf'
  return String(n)
}

function tryGroupBins(text: string): string | null {
  const m = text.match(new RegExp(`^divide\\s+(${IDENT})\\s+into\\s+groups?:?\\s+(.+)$`, 'i'))
  if (!m) return null
  const rawSpecs = m[2].split(new RegExp(LIST_SEP, 'i')).map(s => s.trim()).filter(Boolean)
  const specs = rawSpecs.map(parseGroupSpec)
  if (specs.length === 0 || specs.some(s => s === null)) return null
  const good = specs as GroupSpec[]
  const breaks = [good[0].lo, ...good.map(s => s.hi)].map(fmtBreak)
  const labels = good.map(s => rStr(s.label))
  const col = m[1]
  return `df$${col}_group <- cut(df$${col}, breaks = c(${breaks.join(', ')}), labels = c(${labels.join(', ')}), right = FALSE)`
}

// ── 30. Standardizing a column ────────────────────────────────────────────
// "standardize income to have a mean of zero and standard deviation of
// one" / "standardize income" / "z-score income".
function tryStandardize(text: string): string | null {
  let m = text.match(new RegExp(`^standardize\\s+(${IDENT})(?:\\s+to\\s+have\\s+a\\s+mean\\s+of\\s+zero\\s+and\\s+(?:a\\s+)?standard\\s+deviation\\s+of\\s+one)?$`, 'i'))
  if (m) return `df$${m[1]} <- as.numeric(scale(df$${m[1]}))`
  m = text.match(new RegExp(`^(?:z-?score|compute\\s+the\\s+z-?score\\s+of)\\s+(${IDENT})$`, 'i'))
  if (m) return `df$${m[1]} <- as.numeric(scale(df$${m[1]}))`
  return null
}

// ── 31. Log transform ─────────────────────────────────────────────────────
// "create a natural-log transformation of income" / "create a log
// transformation of income" / "take the natural log of income" /
// "log-transform income".
function tryLogTransform(text: string): string | null {
  let m = text.match(new RegExp(`^create\\s+an?\\s+(?:natural-?\\s*)?log\\s+transformation\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `df$log_${m[1]} <- log(df$${m[1]})`
  m = text.match(new RegExp(`^take\\s+the\\s+(?:natural\\s+)?log\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `df$log_${m[1]} <- log(df$${m[1]})`
  m = text.match(new RegExp(`^log-?transform\\s+(${IDENT})$`, 'i'))
  if (m) return `df$log_${m[1]} <- log(df$${m[1]})`
  return null
}

// ── 32. Squaring values ───────────────────────────────────────────────────
// "square the values in score and save them in a new column called
// score_squared" / "square score and call it score_squared" / bare
// "square score" (defaults to score_squared).
function trySquare(text: string): string | null {
  let m = text.match(new RegExp(`^square\\s+(?:the\\s+values?\\s+in\\s+)?(${IDENT})\\s+and\\s+(?:save\\s+(?:them|it)\\s+(?:in|as)\\s+(?:a\\s+new\\s+column\\s+called\\s+)?|call\\s+it\\s+)(${IDENT})$`, 'i'))
  if (m) return `df$${m[2]} <- df$${m[1]}^2`
  m = text.match(new RegExp(`^square\\s+(?:the\\s+values?\\s+in\\s+)?(${IDENT})$`, 'i'))
  if (m) return `df$${m[1]}_squared <- df$${m[1]}^2`
  return null
}

// ── 33. Days between two dates ────────────────────────────────────────────
// "calculate the number of days between start_date and end_date" — a
// computed value, not stored, unless a column name is explicitly given.
function tryDaysBetween(text: string): string | null {
  let m = text.match(new RegExp(`^create\\s+a\\s+column\\s+called\\s+(${IDENT})\\s+(?:with|for)\\s+the\\s+number\\s+of\\s+days\\s+between\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `df$${m[1]} <- as.numeric(df$${m[3]} - df$${m[2]})`
  m = text.match(new RegExp(`^(?:calculate\\s+)?(?:the\\s+)?number\\s+of\\s+days\\s+between\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `as.numeric(df$${m[2]} - df$${m[1]})`
  m = text.match(new RegExp(`^how\\s+many\\s+days\\s+(?:are\\s+)?between\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `as.numeric(df$${m[2]} - df$${m[1]})`
  m = text.match(new RegExp(`^days\\s+between\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `as.numeric(df$${m[2]} - df$${m[1]})`
  return null
}

// ── 34. Extracting date parts ─────────────────────────────────────────────
// "extract the year and month from date into separate columns" / "extract
// year and month from date".
function tryExtractYearMonth(text: string): string | null {
  const m = text.match(new RegExp(`^extract\\s+(?:the\\s+)?year\\s+and\\s+month\\s+from\\s+(${IDENT})(?:\\s+into\\s+separate\\s+columns)?$`, 'i'))
  if (!m) return null
  return `df$year <- as.numeric(format(df$${m[1]}, "%Y")); df$month <- as.numeric(format(df$${m[1]}, "%m"))`
}

// ── 35. Percentage change between consecutive observations ─────────────────
// "calculate the percentage change in sales between consecutive
// observations" / "calculate the percent change in sales".
function tryPercentChange(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+the\\s+)?percent(?:age)?\\s+change\\s+in\\s+(${IDENT})(?:\\s+between\\s+consecutive\\s+observations)?$`, 'i'))
  if (!m) return null
  const col = m[1]
  return `df$${col}_pct_change <- c(NA, diff(df$${col}) / df$${col}[-length(df$${col})] * 100)`
}

// ── 36. Merging two datasets ──────────────────────────────────────────────
// "merge the datasets students and grades using student_id" / "merge
// students and grades on student_id" / "merge students with grades by
// student_id".
function tryMerge(text: string): string | null {
  const m = text.match(new RegExp(`^merge\\s+(?:the\\s+datasets\\s+)?(${IDENT})\\s+(?:and|with)\\s+(${IDENT})\\s+(?:using|on|by)\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `merge(${m[1]}, ${m[2]}, by = ${rStr(m[3])})`
}

// ── 37. Appending rows ─────────────────────────────────────────────────────
// "append the rows of new_data to data" / "append new_data to data".
function tryAppendRows(text: string): string | null {
  let m = text.match(new RegExp(`^append\\s+(?:the\\s+rows\\s+of\\s+)?(${IDENT})\\s+to\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `rbind(${m[2]}, ${m[1]})`
}

// ── 38/39. Reshaping wide <-> long ─────────────────────────────────────────
// "convert the dataset from wide format to long format using
// pivot_longer()" / "convert the dataset from long format to wide format
// using pivot_wider()" — no base-R equivalent worth asking for by name
// (reshape() exists but nobody asks for it that way), so these need
// `tidyr::`, and genuinely need column choices only the user has — same
// "right call shape, obvious placeholder" posture as
// rDataImport.ts's tryGenericDelimitedNoFilename.
function tryReshape(text: string): string | null {
  const DF = String.raw`(?:the\s+dataset|this\s+dataset|my\s+dataset|${IDENT})`
  let m = text.match(new RegExp(`^convert\\s+(?:${DF})\\s+from\\s+wide\\s+(?:format\\s+)?to\\s+long\\s+(?:format\\s+)?(?:using\\s+pivot_longer\\(\\)\\s*)?$`, 'i'))
  if (m) return 'tidyr::pivot_longer(df, cols = everything(), names_to = "name", values_to = "value")  # adjust cols/names_to/values_to for your data'
  m = text.match(new RegExp(`^convert\\s+(?:${DF})\\s+from\\s+long\\s+(?:format\\s+)?to\\s+wide\\s+(?:format\\s+)?(?:using\\s+pivot_wider\\(\\)\\s*)?$`, 'i'))
  if (m) return 'tidyr::pivot_wider(df, names_from = "name", values_from = "value")  # adjust names_from/values_from for your data'
  return null
}

// ── 40. Ranking within a group ─────────────────────────────────────────────
// "rank participants by score within each treatment group" / "rank by
// score within each treatment group".
function tryRankWithinGroup(text: string): string | null {
  const m = text.match(new RegExp(`^rank\\s+(?:\\w+\\s+)?by\\s+(${IDENT})\\s+within\\s+each\\s+(${IDENT})\\s+group$`, 'i'))
  if (!m) return null
  return `df$${m[1]}_rank <- ave(df$${m[1]}, df$${m[2]}, FUN = rank)`
}

export function recognizeDataTransform(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryCreateColumnArith(text) ??
    tryBinaryIndicator(text) ??
    tryRecode(text) ??
    tryGroupBins(text) ??
    tryStandardize(text) ??
    tryLogTransform(text) ??
    trySquare(text) ??
    tryDaysBetween(text) ??
    tryExtractYearMonth(text) ??
    tryPercentChange(text) ??
    tryMerge(text) ??
    tryAppendRows(text) ??
    tryReshape(text) ??
    tryRankWithinGroup(text)
  )
}
