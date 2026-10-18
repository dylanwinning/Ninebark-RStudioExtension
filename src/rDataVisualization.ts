// ── R-native: plotting a data-frame column ───────────────────────────────
// "create a histogram of income", "create a boxplot of score for each
// treatment group", "create a scatterplot of study_hours against score" —
// the same plotting vocabulary rPlotting.ts already has ("histogram of
// x", "boxplot of x by group"), but pointed at a COLUMN of an active data
// frame rather than a standalone vector.
//
// Deliberately NOT sharing rPlotting.ts's bare "histogram of X" / "a
// boxplot of X" patterns, even though several of this category's examples
// have that exact shape once you drop the "Create a" lead. Those two use
// cases ("x" is a standalone vector someone built with "let x be a vector
// of ..." vs. "income" is a data-frame column) are syntactically identical
// English and genuinely can't be told apart by pattern alone — but they
// produce different R (`hist(x)` vs `hist(df$income)`), and
// rPlotting.ts's existing examples/tests/README already promise the bare
// form means "standalone vector." Rather than silently changing that
// established behavior, every recognizer here REQUIRES an explicit lead
// verb ("create a"/"make a"/"plot a"/"add a ... to the ...") that
// rPlotting.ts's bare patterns don't have — so "create a histogram of
// income" is unambiguously this file's, "histogram of x" is unambiguously
// rPlotting.ts's, and neither phrasing is support this file silently
// takes away from the other. Confirmed empirically: none of this
// category's literal example phrasings match anything in rPlotting.ts
// today (they all currently fail loud, not with a wrong guess).

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const IDENT = String.raw`[A-Za-z][\w.]*`
const CREATE_LEAD = String.raw`(?:create|make|draw|generate|plot)\s+a\s+`

// ── 53. Histogram ──────────────────────────────────────────────────────
function tryHistogram(text: string): string | null {
  const m = text.match(new RegExp(`^${CREATE_LEAD}histogram\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `hist(df$${m[1]})`
}

// ── 54. Density plot ──────────────────────────────────────────────────
function tryDensityPlot(text: string): string | null {
  const m = text.match(new RegExp(`^${CREATE_LEAD}density\\s*plot\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `plot(density(df$${m[1]}, na.rm = TRUE))`
}

// ── 55/56. Boxplot (alone, or split by a second column) ────────────────
function tryBoxplot(text: string): string | null {
  let m = text.match(new RegExp(`^${CREATE_LEAD}box\\s*plot\\s+of\\s+(${IDENT})\\s+for\\s+each\\s+(${IDENT})\\s+group$`, 'i'))
  if (m) return `boxplot(df$${m[1]} ~ df$${m[2]})`
  m = text.match(new RegExp(`^${CREATE_LEAD}box\\s*plot\\s+of\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (m) return `boxplot(df$${m[1]} ~ df$${m[2]})`
  m = text.match(new RegExp(`^${CREATE_LEAD}box\\s*plot\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `boxplot(df$${m[1]})`
  return null
}

// ── 57. Scatterplot ───────────────────────────────────────────────────
// "A against B" means A is the dependent variable (vertical axis), B is
// the independent one (horizontal) — same convention rPlotting.ts's own
// "plot y against x" -> plot(x, y) already uses; see tests/rPlotting.test.ts.
function tryScatterplot(text: string): string | null {
  const m = text.match(new RegExp(`^${CREATE_LEAD}scatter\\s*plot\\s+of\\s+(${IDENT})\\s+against\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `plot(df$${m[2]}, df$${m[1]})`
}

// ── 58. Regression line added to that same scatterplot ─────────────────
function tryRegressionLineOnScatter(text: string): string | null {
  const m = text.match(new RegExp(`^add\\s+a\\s+(?:linear\\s+)?regression\\s+line\\s+to\\s+the\\s+scatter\\s*plot\\s+of\\s+(${IDENT})\\s+against\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `abline(lm(df$${m[1]} ~ df$${m[2]}))`
}

// ── 59. Bar chart of counts per category ───────────────────────────────
function tryCountBarChart(text: string): string | null {
  let m = text.match(new RegExp(`^${CREATE_LEAD}bar\\s*(?:chart|plot|graph)\\s+showing\\s+the\\s+number\\s+of\\s+observations\\s+in\\s+each\\s+(${IDENT})$`, 'i'))
  if (m) return `barplot(table(df$${m[1]}))`
  m = text.match(new RegExp(`^${CREATE_LEAD}bar\\s*(?:chart|plot|graph)\\s+of\\s+the\\s+(?:number|count)\\s+of\\s+observations\\s+in\\s+each\\s+(${IDENT})$`, 'i'))
  if (m) return `barplot(table(df$${m[1]}))`
  return null
}

// ── 60. Stacked bar chart ───────────────────────────────────────────────
// "A by B" stacks A (the segments within each bar) across B (the x-axis
// categories) — table(A, B) puts A as rows (barplot's default stacking
// unit) and B as columns (one bar per column).
function tryStackedBarChart(text: string): string | null {
  const m = text.match(new RegExp(`^${CREATE_LEAD}stacked\\s+bar\\s*(?:chart|plot|graph)\\s+of\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `barplot(table(df$${m[1]}, df$${m[2]}), legend = TRUE)`
}

// ── 60b. Pie chart ───────────────────────────────────────────────────────
// "create a pie chart of treatment" — a CATEGORICAL column's counts, the
// same table() wrapping tryCountBarChart/tryStackedBarChart above use, not
// a bare pie(df$treatment) (treatment holds category labels, not slice
// sizes — pie() needs the latter, exactly what table() produces). This is
// the data-frame-column sibling of rPlotting.ts's tryPie ("pie chart of
// x"), which stays bare pie(x) because a bare vector IS already assumed to
// hold slice sizes directly (e.g. "let x be a vector of 10,20,30") — same
// standalone-vector-vs-data-frame-column split as every other chart type
// in this file, see the header comment.
function tryPieChart(text: string): string | null {
  const m = text.match(new RegExp(`^${CREATE_LEAD}pie\\s*chart\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `pie(table(df$${m[1]}))`
}

// ── 61. Line chart over a time/date axis ────────────────────────────────
// "A over time, using B on the x-axis" — "time" in the first clause is
// just descriptive, not a literal column; B (named explicitly) is the
// real x-axis column. Also takes the shorter "A over B" directly.
function tryLineChartOverTime(text: string): string | null {
  let m = text.match(new RegExp(`^${CREATE_LEAD}line\\s*(?:chart|plot|graph)\\s+of\\s+(${IDENT})\\s+over\\s+\\w+\\s*,\\s*using\\s+(${IDENT})\\s+on\\s+the\\s+x-?axis$`, 'i'))
  if (!m) m = text.match(new RegExp(`^${CREATE_LEAD}line\\s*(?:chart|plot|graph)\\s+of\\s+(${IDENT})\\s+over\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `plot(df$${m[2]}, df$${m[1]}, type = "l", xlab = ${rStr(m[2])}, ylab = ${rStr(m[1])})`
}

// ── 62. Q-Q plot ────────────────────────────────────────────────────────
// Points alone aren't a meaningful Q-Q plot without the reference
// line — qqline() is the standard companion, not a separate ask.
function tryQQPlot(text: string): string | null {
  const m = text.match(new RegExp(`^${CREATE_LEAD}q-?q\\s*plot\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `qqnorm(df$${m[1]}); qqline(df$${m[1]})`
}

// ── 63. Correlation matrix heatmap ──────────────────────────────────────
function tryCorrelationHeatmap(text: string): string | null {
  if (!new RegExp(`^${CREATE_LEAD}correlation\\s+matrix\\s+heatmap\\s+for\\s+all\\s+numeric\\s+variables$`, 'i').test(text)) return null
  return 'heatmap(cor(df[sapply(df, is.numeric)], use = "complete.obs"))'
}

// ── 64. Group means with confidence intervals ──────────────────────────
// Needs the `gplots` package — no base-R one-liner does mean + CI error
// bars (building it by hand is a multi-statement aggregate()+segments()
// affair, which breaks this project's one-phrase-one-statement shape) —
// same "errors until install.packages()" rule as every other optional
// package this repo already leans on (readxl, tidyr, ...). plotmeans()'s
// own default confidence level IS 95% (`p = 0.95`), so nothing extra is
// needed to honor "with 95% confidence intervals" specifically — a
// DIFFERENT level would need to be passed explicitly, which this
// recognizer declines rather than silently ignoring if ever asked for.
function tryMeanWithCI(text: string): string | null {
  const m = text.match(new RegExp(`^plot\\s+the\\s+mean\\s+(${IDENT})\\s+for\\s+each\\s+(${IDENT})\\s+group\\s+with\\s+95\\s*(?:%|percent)?\\s*confidence\\s+intervals?$`, 'i'))
  if (!m) return null
  return `gplots::plotmeans(${m[1]} ~ ${m[2]}, data = df)  # 95% CI is plotmeans()'s own default`
}

// ── 65. Saving the current plot at high resolution ──────────────────────
// No prior plot command to re-run (same honesty-over-guessing posture as
// rPlotting.ts's own trySaveDevice) — placeholder filename, real
// publication-quality defaults (300 DPI at 8x6in).
function tryHighResSave(text: string): string | null {
  if (!/^(?:save|export)\s+the\s+(?:current\s+)?plot\s+as\s+a\s+high-?res(?:olution)?\s+png(?:\s+file)?$/i.test(text)) return null
  return 'png("plot.png", width = 2400, height = 1800, res = 300); # re-run your plot command here, then: dev.off()'
}

export function recognizeDataVisualization(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryHistogram(text) ??
    tryDensityPlot(text) ??
    tryBoxplot(text) ??
    tryScatterplot(text) ??
    tryRegressionLineOnScatter(text) ??
    tryCountBarChart(text) ??
    tryStackedBarChart(text) ??
    tryPieChart(text) ??
    tryLineChartOverTime(text) ??
    tryQQPlot(text) ??
    tryCorrelationHeatmap(text) ??
    tryMeanWithCI(text) ??
    tryHighResSave(text)
  )
}
