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

function tryHist(text: string): string | null {
  const m = text.match(new RegExp(`^(?:a\\s+)?histogram\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `hist(${m[1]})`
}

function tryBoxplot(text: string): string | null {
  let m = text.match(new RegExp(`^(?:a\\s+)?box\\s*plot\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `boxplot(${m[1]})`
  m = text.match(new RegExp(`^(?:a\\s+)?box\\s*plot\\s+of\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (m) return `boxplot(${m[1]} ~ ${m[2]})`
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
