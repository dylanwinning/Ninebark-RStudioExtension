// ── R-native: plotting ───────────────────────────────────────────────────
// "plot y against x", "scatter plot of x and y", "histogram of x", "bar
// chart of counts", "add a title 'Results'", "label the x axis 'time'",
// "a ggplot of x and y with points", "save the plot to plot.png" — base R
// graphics by default (always available, no package needed), with a ggplot2
// form for anyone who has it loaded. Mirrors Ninebark-MATLABExtension's
// matlabPlotting.ts in spirit (a plotting-verbs recognizer alongside the
// value-expression converter) but R's two competing plotting systems (base
// graphics vs. ggplot2's grammar-of-graphics) means this module has to pick
// a default rather than there being one obvious "the" plot call — base
// graphics is the default because it needs no library() first.
//
// This file ALSO recognizes "plot a normal distribution with mean 0 and sd
// 1" / "plot the cdf of a t distribution with 10 degrees of freedom" — a
// genuinely different thing from "cdf of a normal distribution ... at
// 1.96" (formalToR.ts, evaluates the CDF at a specific point → a plain
// number). Both phrasings are meaningful and neither should guess at the
// other: "at 1.96" is a precise ask for the probability at that point, and
// changing it to plot instead would be wrong for anyone who wants the
// number (the far more common statistics question); "plot a normal
// distribution ..." with no point had no way to get a curve at all before
// this, which is the actual gap. tryDistributionPlot below owns "plot
// <distribution phrase>" specifically; every other tryXyz in this file
// still owns "plot <everything else>".
import { recognizeDesmosPhrase, stripFiller, normalizeUnicodeMath } from './vendor/ninebark-engine/desmosNlVocab'
import { DISTRIBUTIONS } from './formalToR'

const IDENT = String.raw`[A-Za-z][\w.$]*`
const FILE = String.raw`[\w./\\ -]+?\.(?:png|pdf|jpe?g|svg)`

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

// "plot y against x" / "plot x vs y" / "scatter plot of x and y" / "scatter x vs y"
function tryScatter(text: string): string | null {
  let m = text.match(new RegExp(`^plot\\s+(${IDENT})\\s+against\\s+(${IDENT})$`, 'i'))
  if (m) return `plot(${m[2]}, ${m[1]})` // "y against x" — R's plot(x, y) wants the independent variable first
  m = text.match(new RegExp(`^(?:plot|scatter(?:\\s*plot)?(?:\\s+of)?)\\s+(${IDENT})\\s+(?:vs\\.?|versus|and)\\s+(${IDENT})$`, 'i'))
  if (m) return `plot(${m[1]}, ${m[2]})`
  return null
}

// Parses "a normal distribution with mean 0 and sd 1" / "a t distribution
// with 10 degrees of freedom" / "a uniform distribution from 0 to 10" /
// etc. by reusing the SAME shared-vocab recognizer that already parses
// this exact phrasing for value lookups ("cdf of a normal distribution
// ... at 1.96") — recognizeDesmosPhrase returns a bare formal string like
// "normaldist(0, 1)" when there's no ".pdf()"/".cdf()"/"at X" accessor,
// which is exactly the distribution-plus-parameters shape this needs.
// Returns null for anything that isn't a recognized distribution — the
// caller falls through to the other plot recognizers, unchanged. Note this
// means null covers TWO different underlying behaviors from
// recognizeDesmosPhrase: it returns null itself for text that isn't a
// distribution phrase at all, but THROWS (e.g. UnsupportedFormalError) for
// text that IS a distribution but is missing a required parameter —
// uniformdist has no default min/max, so "a uniform distribution" alone
// throws rather than returning null. tryDistributionPlot's bounds-stripping
// fallback relies on that second case failing cleanly here (as null) so it
// can retry the unstripped phrase, so the catch below is load-bearing, not
// defensive boilerplate.
function parseDistributionPhrase(phrase: string): { name: string; params: string[] } | null {
  const cleaned = stripFiller(normalizeUnicodeMath(phrase))
  let formal: string | null
  try {
    formal = recognizeDesmosPhrase(cleaned)
  } catch {
    return null
  }
  if (!formal) return null
  const m = /^([a-z]+)\(([^)]*)\)$/i.exec(formal)
  if (!m || !(m[1] in DISTRIBUTIONS)) return null
  const params = m[2].split(',').map(s => s.trim()).filter(s => s.length > 0)
  return { name: m[1], params }
}

// A plotting range wide enough to show the whole meaningful shape of each
// distribution family without the caller having to specify one — a UX
// default, not a semantic guess (an explicit "from A to B" always overrides
// it; see tryDistributionPlot). Continuous families use their standard
// "how many SDs/width to show" convention; discrete families use their
// natural finite-or-practical support so the spike/step plot isn't mostly
// empty.
function defaultDistributionBounds(name: string, params: string[]): [number, number] {
  const p = params.map(Number)
  switch (name) {
    case 'normaldist': { const [mean, sd] = p; return [mean - 4 * sd, mean + 4 * sd] }
    case 'uniformdist': { const [a, b] = p; return [a, b] }
    case 'tdist': return [-4, 4] // t's shape is essentially normal-range regardless of df
    case 'chisqdist': { const [df] = p; return [0, Math.ceil(df + 4 * Math.sqrt(2 * df))] }
    case 'binomialdist': { const [n] = p; return [0, Math.round(n)] }
    case 'poissondist': { const [lambda] = p; return [0, Math.max(10, Math.ceil(lambda + 4 * Math.sqrt(lambda)))] }
    case 'geodist': { const [prob] = p; return [0, Math.min(50, Math.ceil(5 / prob))] }
    default: return [-4, 4]
  }
}

// "plot a normal distribution with mean 0 and sd 1" (defaults to the PDF —
// the density/bell-curve shape, what "plot a distribution" means absent
// other information) / "plot the pdf of ..." / "plot the cdf of ...".
// Continuous families (normal/t/chi-squared/uniform) get a real curve();
// discrete families (binomial/poisson/geometric) get a spike plot (pmf,
// type="h") or step plot (cdf, type="s") instead — curve() draws a
// continuous line, which would misrepresent a distribution that only has
// mass at integers.
//
// Bounds resolution tries a trailing "from A to B" as an EXPLICIT BOUNDS
// OVERRIDE first, stripping it and parsing whatever's left as the
// distribution phrase — this is what makes "plot a normal distribution
// with mean 0 and sd 1 from -3 to 3" actually honor "-3 to 3" instead of
// the computed default. Only when that stripped parse fails does it fall
// back to trying the WHOLE remainder unstripped: recognizeDesmosPhrase
// tolerates (silently ignores) trailing text it doesn't recognize as part
// of a distribution's own grammar, so trying the stripped version FIRST is
// required, not just tidier — trying the whole string first would always
// succeed and silently swallow the override before the bounds-stripped
// branch ever got a chance to run. The fallback exists specifically for
// uniformdist, whose own parameters ARE spelled "from A to B" ("a uniform
// distribution from 0 to 10") — stripping that leaves "a uniform
// distribution" with no parameters, which correctly fails to parse, so
// this falls back to the whole string and uniform's own min/max become the
// plot bounds too (there's nothing else they could sensibly be).
function tryDistributionPlot(text: string): string | null {
  const m = /^plot\s+(?:the\s+(pdf|cdf)\s+of\s+)?(.+)$/i.exec(text)
  if (!m) return null
  const kind = (m[1] ?? 'pdf').toLowerCase() === 'cdf' ? 'cdf' : 'pdf'
  const rest = m[2].trim()

  let dist: { name: string; params: string[] } | null = null
  let bounds: [string, string] | null = null

  const boundsMatch = /^(.+?)\s+from\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)$/i.exec(rest)
  if (boundsMatch) {
    dist = parseDistributionPhrase(boundsMatch[1].trim())
    if (dist) bounds = [boundsMatch[2], boundsMatch[3]]
  }
  if (!dist) dist = parseDistributionPhrase(rest)
  if (!dist) return null

  const info = DISTRIBUTIONS[dist.name]
  const [from, to] = bounds ?? defaultDistributionBounds(dist.name, dist.params).map(String)
  const fn = (kind === 'cdf' ? 'p' : 'd') + info.stem
  const params = dist.params.join(', ')

  if (!info.discrete) {
    return `curve(${fn}(x, ${params}), from = ${from}, to = ${to})`
  }
  const xs = `${Math.round(Number(from))}:${Math.round(Number(to))}`
  const type = kind === 'cdf' ? 's' : 'h'
  const ylab = kind === 'cdf' ? 'cumulative probability' : 'probability'
  return `plot(${xs}, ${fn}(${xs}, ${params}), type = "${type}", xlab = "x", ylab = "${ylab}")`
}

// "plot sin(x) from 0 to 2*pi" / "plot x^2 from -5 to 5" — needs the
// expression as raw R already (curve() takes an R expression in x
// literally), not run through formalToR.ts, since curve()'s expression
// argument is unevaluated R syntax naming "x", not a value. Bounds are also
// taken as raw R (not just plain numbers) so "0 to 2*pi" works.
function tryCurve(text: string): string | null {
  const m = text.match(/^plot\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i)
  if (!m) return null
  return `curve(${m[1].trim()}, from = ${m[2].trim()}, to = ${m[3].trim()})`
}

// Excludes common English function words from the bare (no "of") forms
// below — "histogram the"/"boxplot of" truncated would otherwise leak
// one of these through as a plot variable, since they're themselves
// syntactically valid identifiers. Same reasoning as
// rDescriptiveStats.ts's bare noun-noun stat pattern.
const PLOT_STOPWORDS = new Set(['of', 'the', 'a', 'an', 'in', 'on', 'for', 'to', 'from', 'by', 'with', 'and', 'or', 'is', 'are'])

function tryHist(text: string): string | null {
  let m = text.match(new RegExp(`^(?:a\\s+)?histogram\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `hist(${m[1]})`
  // "histogram age" — no "of" at all.
  m = text.match(new RegExp(`^histogram\\s+(${IDENT})$`, 'i'))
  if (m && !PLOT_STOPWORDS.has(m[1].toLowerCase())) return `hist(${m[1]})`
  return null
}

function tryBoxplot(text: string): string | null {
  let m = text.match(new RegExp(`^(?:a\\s+)?box\\s*plot\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `boxplot(${m[1]})`
  m = text.match(new RegExp(`^(?:a\\s+)?box\\s*plot\\s+of\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (m) return `boxplot(${m[1]} ~ ${m[2]})`
  // "boxplot score" — no "of" at all.
  m = text.match(new RegExp(`^box\\s*plot\\s+(${IDENT})$`, 'i'))
  if (m && !PLOT_STOPWORDS.has(m[1].toLowerCase())) return `boxplot(${m[1]})`
  return null
}

function tryBarplot(text: string): string | null {
  const m = text.match(new RegExp(`^(?:a\\s+)?bar\\s*(?:chart|plot|graph)\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `barplot(${m[1]})`
}

function tryLinePlot(text: string): string | null {
  const m = text.match(new RegExp(`^(?:a\\s+)?line\\s*(?:chart|plot|graph)\\s+of\\s+(${IDENT})\\s+(?:vs\\.?|versus|and|against)\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `plot(${m[2]}, ${m[1]}, type = "l")`
}

function tryPie(text: string): string | null {
  const m = text.match(new RegExp(`^(?:a\\s+)?pie\\s*chart\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `pie(${m[1]})`
}

// "add a title 'Results'" / "title the plot 'Results'"
function tryTitle(text: string): string | null {
  const m = text.match(/^(?:add\s+a\s+title|title\s+the\s+plot)\s+['"“](.+?)['"”]$/i)
  if (!m) return null
  return `title(${rStr(m[1])})`
}

// "label the x axis 'time (s)'" / "label the y axis 'value'"
function tryAxisLabel(text: string): string | null {
  const m = text.match(/^label\s+the\s+(x|y)\s*[- ]?axis\s+['"“](.+?)['"”]$/i)
  if (!m) return null
  const arg = m[1].toLowerCase() === 'x' ? 'xlab' : 'ylab'
  return `title(${arg} = ${rStr(m[2])})`
}

// "hold the plot" / "add points x and y to the plot" (base R's points()/
// lines() overlay onto the current device, the plot.new()-per-call default
// otherwise clears it — this is base R's equivalent of MATLAB's "hold on").
function tryOverlay(text: string): string | null {
  let m = text.match(new RegExp(`^add\\s+points?\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+to\\s+the\\s+plot$`, 'i'))
  if (m) return `points(${m[1]}, ${m[2]})`
  m = text.match(new RegExp(`^add\\s+a\\s+line\\s+(?:for\\s+)?(${IDENT})\\s+and\\s+(${IDENT})\\s+to\\s+the\\s+plot$`, 'i'))
  if (m) return `lines(${m[1]}, ${m[2]})`
  m = text.match(/^add\s+a\s+horizontal\s+line\s+at\s+(-?[\d.]+)$/i)
  if (m) return `abline(h = ${m[1]})`
  m = text.match(/^add\s+a\s+vertical\s+line\s+at\s+(-?[\d.]+)$/i)
  if (m) return `abline(v = ${m[1]})`
  m = text.match(new RegExp(`^add\\s+a\\s+(?:regression|trend|best[- ]fit)\\s+line\\s+(?:for\\s+)?(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `abline(lm(${m[2]} ~ ${m[1]}))`
  return null
}

function tryClose(text: string): string | null {
  if (/^(?:close|clear)\s+(?:all\s+)?(?:the\s+)?plots?$/i.test(text)) return 'dev.off()'
  if (/^(?:new|open)\s+(?:a\s+)?(?:new\s+)?(?:plot|figure|graphics)\s+(?:window|device)?$/i.test(text)) return 'dev.new()'
  return null
}

// "save the plot to plot.png" / "export the plot as chart.pdf" — the
// print-device pattern (open device, re-issue the plot, close it) needs the
// PRIOR plot command, which this recognizer doesn't have — so it emits the
// device open/close pair around a placeholder comment, which is honest about
// what's missing rather than guessing at the plot call.
function trySaveDevice(text: string): string | null {
  const m = text.match(new RegExp(`^(?:save|export)\\s+the\\s+plot\\s+(?:to|as)\\s+(${FILE})$`, 'i'))
  if (!m) return null
  const ext = m[1].split('.').pop()!.toLowerCase()
  const device = ext === 'png' ? 'png' : ext === 'pdf' ? 'pdf' : ext.startsWith('jp') ? 'jpeg' : 'svg'
  return `${device}(${rStr(m[1])}); # re-run your plot command here, then: dev.off()`
}

// ── ggplot2 forms ───────────────────────────────────────────────────────
// Only reachable when the phrase explicitly says "ggplot" — never emitted
// as the default for a bare "scatter plot of x and y" (which stays base R,
// so it never fails on a session that hasn't loaded ggplot2).
function tryGgplot(text: string): string | null {
  let m = text.match(new RegExp(`^(?:a\\s+)?ggplot\\s+(?:scatter\\s*plot\\s+)?of\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+(?:from|in)\\s+(${IDENT})$`, 'i'))
  if (m) return `ggplot(${m[3]}, aes(x = ${m[1]}, y = ${m[2]})) + geom_point()`
  m = text.match(new RegExp(`^(?:a\\s+)?ggplot\\s+(?:line\\s*chart\\s+)?of\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+(?:from|in)\\s+(${IDENT})\\s+as\\s+a\\s+line$`, 'i'))
  if (m) return `ggplot(${m[3]}, aes(x = ${m[1]}, y = ${m[2]})) + geom_line()`
  m = text.match(new RegExp(`^(?:a\\s+)?ggplot\\s+(?:bar\\s*chart\\s+)?of\\s+(${IDENT})\\s+(?:from|in)\\s+(${IDENT})$`, 'i'))
  if (m) return `ggplot(${m[2]}, aes(x = ${m[1]})) + geom_bar()`
  m = text.match(new RegExp(`^(?:a\\s+)?ggplot\\s+histogram\\s+of\\s+(${IDENT})\\s+(?:from|in)\\s+(${IDENT})$`, 'i'))
  if (m) return `ggplot(${m[2]}, aes(x = ${m[1]})) + geom_histogram()`
  m = text.match(new RegExp(`^(?:a\\s+)?ggplot\\s+box\\s*plot\\s+of\\s+(${IDENT})\\s+by\\s+(${IDENT})\\s+(?:from|in)\\s+(${IDENT})$`, 'i'))
  if (m) return `ggplot(${m[3]}, aes(x = ${m[2]}, y = ${m[1]})) + geom_boxplot()`
  if (/^add\s+a\s+smooth(?:ed)?\s+(?:line|trend)(?:\s+to\s+the\s+plot)?$/i.test(text)) return '+ geom_smooth()'
  if (/^(?:save|export)\s+the\s+(?:last\s+)?ggplot\s+(?:to|as)\s+/i.test(text)) {
    const fm = text.match(new RegExp(`(${FILE})$`, 'i'))
    if (fm) return `ggsave(${rStr(fm[1])})`
  }
  return null
}

export function recognizePlotting(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryGgplot(text) ??
    tryDistributionPlot(text) ??
    tryScatter(text) ??
    tryCurve(text) ??
    tryHist(text) ??
    tryBoxplot(text) ??
    tryBarplot(text) ??
    tryLinePlot(text) ??
    tryPie(text) ??
    tryTitle(text) ??
    tryAxisLabel(text) ??
    tryOverlay(text) ??
    tryClose(text) ??
    trySaveDevice(text)
  )
}
