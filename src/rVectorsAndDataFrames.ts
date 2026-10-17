// ── R-native: vectors and data-frame wrangling ──────────────────────────────
// "a vector of 1,2,3", "filter df where age is greater than 30", "select
// the columns name and age from df", "sort df by age", "rename column x to
// y in df" — manipulating a data frame that's already in R. Importing data
// (rDataImport.ts) and inspecting it (rDataInspection.ts) are split into
// their own files; this one owns reshaping/subsetting it once it's there.
// All base R — no tidyverse/dplyr dependency assumed, since this needs to
// work with nothing but a fresh R session (dplyr's pipe-and-verb style is
// genuinely nicer for some of this, but requiring library(dplyr) first
// would make half these commands fail on a session that hasn't loaded it —
// base R's df[rows, cols] subsetting always works).

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const IDENT = String.raw`[A-Za-z][\w.]*`

// "a vector of 1,2,3,4" / "a vector containing 1,2,3" / "c(1,2,3) as x" —
// the plain-numeric-list case only; anything with a name or computed values
// goes through rAssignment.ts + formalToR.ts instead ("let x be a vector of
// 1,2,3" already works via that path). This recognizer exists for the
// bare, unnamed form typed straight at the console.
function tryBareVector(text: string): string | null {
  const m = text.match(/^(?:a\s+)?vector\s+(?:of|containing|with)\s+([\d.,\s-]+(?:and[\d.,\s-]+)?)$/i)
  if (!m) return null
  const nums = m[1].split(/\s*(?:,|and)\s*/i).map(s => s.trim()).filter(Boolean)
  if (nums.length === 0 || !nums.every(n => /^-?\d+\.?\d*$/.test(n))) return null
  return `c(${nums.join(', ')})`
}

const COMPARATORS: Array<[RegExp, string]> = [
  [/greater than or equal to/i, '>='], [/at least/i, '>='],
  [/less than or equal to/i, '<='], [/at most/i, '<='],
  [/not equal to/i, '!='],
  [/greater than/i, '>'],
  [/less than/i, '<'],
  [/equal to|equals/i, '=='],
]

function translateCondition(cond: string): string | null {
  let c = cond.trim()
  for (const [re, op] of COMPARATORS) {
    const m = c.match(new RegExp(`^(${IDENT})\\s+is\\s+(?:${re.source})\\s+(.+)$`, 'i'))
    if (m) return `${m[1]}${op}${m[m.length - 1].trim()}`
  }
  return null
}

// "filter df where age is greater than 30" / "filter rows of df where age > 30"
// / "rows of df where age is at least 18" — base R logical-row subsetting.
function tryFilter(text: string): string | null {
  let m = text.match(new RegExp(`^filter\\s+(?:rows?\\s+of\\s+)?(${IDENT})\\s+where\\s+(.+)$`, 'i'))
    ?? text.match(new RegExp(`^(?:the\\s+)?rows?\\s+of\\s+(${IDENT})\\s+where\\s+(.+)$`, 'i'))
    ?? text.match(new RegExp(`^(?:show|find)\\s+(?:the\\s+)?rows?\\s+(?:of|in)\\s+(${IDENT})\\s+where\\s+(.+)$`, 'i'))
  if (!m) return null
  const cond = translateCondition(m[2])
  if (!cond) return null
  return `${m[1]}[${cond}, ]`
}

// "select the columns name and age from df" / "select column age from df"
function trySelect(text: string): string | null {
  const m = text.match(new RegExp(`^select\\s+(?:the\\s+)?columns?\\s+((?:${IDENT})(?:\\s*(?:,|and)\\s*${IDENT})*)\\s+from\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  const cols = m[1].split(/\s*(?:,|and)\s*/i).map(c => rStr(c.trim()))
  return `${m[2]}[, c(${cols.join(', ')})]`
}

// "sort df by age" / "sort df by age descending" / "order df by age ascending"
function trySort(text: string): string | null {
  const m = text.match(new RegExp(`^(?:sort|order)\\s+(${IDENT})\\s+by\\s+(${IDENT})(?:\\s+(ascending|descending|asc|desc))?$`, 'i'))
  if (!m) return null
  const desc = /^des/i.test(m[3] ?? '')
  const key = desc ? `-${m[1]}$${m[2]}` : `${m[1]}$${m[2]}`
  return `${m[1]}[order(${key}), ]`
}

// "add a column called total that is x plus y to df" is complex enough that
// it's left to explicit raw R ("df$total <- df$x + df$y") — but the simple,
// very common "rename column x to y in df" / "remove the column x from df"
// forms are worth their own recognizers.
function tryColumnEdit(text: string): string | null {
  let m = text.match(new RegExp(`^rename\\s+(?:the\\s+)?column\\s+(${IDENT})\\s+to\\s+(${IDENT})\\s+in\\s+(${IDENT})$`, 'i'))
  if (m) return `names(${m[3]})[names(${m[3]}) == ${rStr(m[1])}] <- ${rStr(m[2])}`
  m = text.match(new RegExp(`^(?:remove|drop|delete)\\s+(?:the\\s+)?column\\s+(${IDENT})\\s+from\\s+(${IDENT})$`, 'i'))
  if (m) return `${m[2]}$${m[1]} <- NULL`
  return null
}

// "a data frame with columns x and y" / "an empty data frame with columns
// name, age" — a ready-to-fill skeleton, same "give me the shape, I'll fill
// it in" idea as Ninebark-OverleafExtension's environment skeletons.
function tryDataFrameSkeleton(text: string): string | null {
  const m = text.match(/^(?:a\s+|an\s+empty\s+)?data\s*frame\s+with\s+columns?\s+((?:[A-Za-z]\w*)(?:\s*(?:,|and)\s*[A-Za-z]\w*)*)$/i)
  if (!m) return null
  const cols = m[1].split(/\s*(?:,|and)\s*/i).map(c => c.trim())
  return `data.frame(${cols.map(c => `${c} = c()`).join(', ')})`
}

export function recognizeVectorsAndDataFrames(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryBareVector(text) ??
    tryFilter(text) ??
    trySelect(text) ??
    trySort(text) ??
    tryColumnEdit(text) ??
    tryDataFrameSkeleton(text)
  )
}
