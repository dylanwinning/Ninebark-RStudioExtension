// ── R-native: descriptive statistics on a data-frame column ─────────────────
// "calculate the mean of income", "create a frequency table for
// education", "calculate the correlation between study_hours and score" —
// the same statistics vocabulary every other Ninebark interface already
// has ("mean of 1,2,3,4,5"), but pointed at a COLUMN of an active data
// frame rather than a literal list. Deliberately its own file rather than
// an extension of the vendored tier-1/tier-2 engine: those vocabularies
// are shared across every interface and only know literal numbers, never
// a data frame. This file's recognizers run FIRST in the native chain
// (resolveRPhrase.ts), so a bare identifier like "income" is claimed here
// before tier-1/tier-2 ever see it; a literal list ("1,2,3,4,5") never
// matches these regexes (IDENT requires a leading letter) and falls
// through to tier-1/tier-2 exactly as before.
//
// Every single-column statistic passes `na.rm = TRUE` — unlike the
// literal-list tier-1 vocabulary (where NA can't occur), a real column is
// one category.ts's own cleaning category away from having missing values,
// and base R's mean()/sd()/etc. silently return NA on an untouched column
// with even one NA — the single most common frustration this file exists
// to avoid. cor() uses the equivalent `use = "complete.obs"` (no na.rm
// parameter exists on cor()).

const IDENT = String.raw`[A-Za-z][\w.]*`
// Oxford-comma-tolerant separator, same shape as rDataCleaning.ts's
// LIST_SEP/rDataTransform.ts's — duplicated per this project's convention
// of keeping each file self-contained rather than cross-importing small
// shared constants.
const LIST_SEP = String.raw`\s*,\s*(?:and\s+)?|\s+and\s+`

// "calculate the"/"compute the"/"find the" are already stripped by the
// shared stripFiller() before any native recognizer sees the text (see
// CLAUDE.md's filler-stripping gotcha) — but "show the"/"display the"/
// "what is" are NOT, so every pattern below still needs to tolerate them
// showing up for real, not just the already-stripped bare form.
const STAT_LEAD = String.raw`(?:(?:calculate|compute|find|show|display)(?:\s+me)?\s+|what\s+is\s+)?(?:the\s+)?`

function statPattern(names: string, extra = ''): RegExp {
  return new RegExp(`^${STAT_LEAD}(?:${names})\\s+of\\s+(${IDENT})${extra}$`, 'i')
}

// ── 41-44. mean / median / standard deviation / variance ───────────────────
function trySimpleStat(text: string): string | null {
  let m = text.match(statPattern('mean|average'))
  if (m) return `mean(df$${m[1]}, na.rm = TRUE)`
  m = text.match(statPattern('median'))
  if (m) return `median(df$${m[1]}, na.rm = TRUE)`
  m = text.match(statPattern('standard\\s+deviation|std\\s+dev|stdev|sd'))
  if (m) return `sd(df$${m[1]}, na.rm = TRUE)`
  m = text.match(statPattern('variance|var'))
  if (m) return `var(df$${m[1]}, na.rm = TRUE)`
  return null
}

// ── 45. minimum, maximum, and range (together or separately) ───────────────
// "show the minimum, maximum, and range of income" — all three at once, as
// one named vector. "the range of X" on its own is read as the English
// word (the SPREAD, max - min) rather than R's own two-element range()
// function, to stay consistent with what "range" means in that combined
// list (next to min and max already shown separately, R's range() would
// just duplicate them).
function tryMinMaxRange(text: string): string | null {
  let m = text.match(new RegExp(`^${STAT_LEAD}min(?:imum)?\\s*,\\s*max(?:imum)?\\s*(?:,\\s*)?and\\s+range\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) {
    const c = `df$${m[1]}`
    return `c(min = min(${c}, na.rm = TRUE), max = max(${c}, na.rm = TRUE), range = max(${c}, na.rm = TRUE) - min(${c}, na.rm = TRUE))`
  }
  m = text.match(statPattern('min(?:imum)?'))
  if (m) return `min(df$${m[1]}, na.rm = TRUE)`
  m = text.match(statPattern('max(?:imum)?'))
  if (m) return `max(df$${m[1]}, na.rm = TRUE)`
  m = text.match(statPattern('range'))
  if (m) return `max(df$${m[1]}, na.rm = TRUE) - min(df$${m[1]}, na.rm = TRUE)`
  return null
}

// ── 46. interquartile range ───────────────────────────────────────────────
function tryIQR(text: string): string | null {
  const m = text.match(statPattern('interquartile\\s+range|IQR'))
  if (!m) return null
  return `IQR(df$${m[1]}, na.rm = TRUE)`
}

// ── 47. arbitrary percentiles ─────────────────────────────────────────────
// "the 10th, 25th, 50th, 75th, and 90th percentiles of score" / "the 90th
// percentile of score" (singular — a scalar `probs`, not a one-item c()).
function tryPercentiles(text: string): string | null {
  const m = text.match(new RegExp(`^${STAT_LEAD}(.+?)\\s+percentiles?\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  const rawNums = m[1].split(new RegExp(LIST_SEP, 'i')).map(s => s.trim())
  const probs: number[] = []
  for (const raw of rawNums) {
    const nm = raw.match(/^(\d+(?:\.\d+)?)(?:st|nd|rd|th)?$/i)
    if (!nm) return null
    probs.push(Number(nm[1]) / 100)
  }
  const probsArg = probs.length === 1 ? String(probs[0]) : `c(${probs.join(', ')})`
  return `quantile(df$${m[2]}, probs = ${probsArg}, na.rm = TRUE)`
}

// ── 48. frequency table ───────────────────────────────────────────────────
// "create a frequency table for education" / "the frequency of education".
function tryFrequencyTable(text: string): string | null {
  let m = text.match(new RegExp(`^(?:create\\s+)?(?:a\\s+)?frequency\\s+table\\s+(?:for|of)\\s+(${IDENT})$`, 'i'))
  if (m) return `table(df$${m[1]})`
  m = text.match(statPattern('frequenc(?:y|ies)'))
  if (m) return `table(df$${m[1]})`
  return null
}

// ── 49. percentage/proportion breakdown by category ─────────────────────────
// "calculate the percentage of observations in each education category" /
// "the proportion of observations in each education category" (proportion
// stays 0-1, percentage multiplies by 100 — the one place these two
// synonyms genuinely produce different numbers, not just different code).
function tryPercentageByCategory(text: string): string | null {
  let m = text.match(new RegExp(`^${STAT_LEAD}percentage\\s+of\\s+observations\\s+in\\s+each\\s+(${IDENT})\\s+category$`, 'i'))
  if (m) return `prop.table(table(df$${m[1]})) * 100`
  m = text.match(new RegExp(`^${STAT_LEAD}proportion\\s+of\\s+observations\\s+in\\s+each\\s+(${IDENT})\\s+category$`, 'i'))
  if (m) return `prop.table(table(df$${m[1]}))`
  return null
}

// ── 50. contingency table ─────────────────────────────────────────────────
// "create a contingency table of gender by treatment" / "cross-tabulate
// gender and treatment" / "a two-way table of gender and treatment".
function tryContingencyTable(text: string): string | null {
  let m = text.match(new RegExp(`^(?:create\\s+)?(?:a\\s+)?contingency\\s+table\\s+(?:of|for)\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (m) return `table(df$${m[1]}, df$${m[2]})`
  m = text.match(new RegExp(`^(?:create\\s+)?(?:a\\s+)?(?:two-?way\\s+table|cross-?tab(?:ulation)?)\\s+of\\s+(${IDENT})\\s+(?:and|by)\\s+(${IDENT})$`, 'i'))
  if (m) return `table(df$${m[1]}, df$${m[2]})`
  m = text.match(new RegExp(`^cross-?tabulate\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `table(df$${m[1]}, df$${m[2]})`
  return null
}

// ── 51. multiple statistics within each group ────────────────────────────
// "calculate the mean, median, and standard deviation of score for each
// treatment group" — any combination of this file's own simple-stat words,
// applied together, grouped by a second column.
const GROUPED_STAT_FN: Record<string, string> = {
  mean: 'mean', average: 'mean',
  median: 'median',
  'standard deviation': 'sd', 'std dev': 'sd', stdev: 'sd', sd: 'sd',
  variance: 'var', var: 'var',
  min: 'min', minimum: 'min',
  max: 'max', maximum: 'max',
}

function tryGroupedStats(text: string): string | null {
  const m = text.match(new RegExp(`^${STAT_LEAD}(.+?)\\s+of\\s+(${IDENT})\\s+for\\s+each\\s+(${IDENT})\\s+group$`, 'i'))
  if (!m) return null
  const words = m[1].split(new RegExp(LIST_SEP, 'i')).map(s => s.trim().toLowerCase())
  const fns = words.map(w => GROUPED_STAT_FN[w])
  if (words.length === 0 || fns.some(f => !f)) return null
  const terms = words.map((w, i) => `${w.replace(/\s+/g, '_')} = ${fns[i]}(x, na.rm = TRUE)`).join(', ')
  return `aggregate(${m[2]} ~ ${m[3]}, data = df, FUN = function(x) c(${terms}))`
}

// ── 52. correlation between two columns ───────────────────────────────────
function tryCorrelation(text: string): string | null {
  const m = text.match(new RegExp(`^${STAT_LEAD}correlation\\s+between\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `cor(df$${m[1]}, df$${m[2]}, use = "complete.obs")`
}

export function recognizeDescriptiveStats(rawText: string): string | null {
  const text = rawText.trim()
  return (
    trySimpleStat(text) ??
    tryMinMaxRange(text) ??
    tryIQR(text) ??
    tryPercentiles(text) ??
    tryFrequencyTable(text) ??
    tryPercentageByCategory(text) ??
    tryContingencyTable(text) ??
    tryGroupedStats(text) ??
    tryCorrelation(text)
  )
}
