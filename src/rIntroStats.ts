// ── R-native: introductory-statistics-course vocabulary ────────────────────
// "the z-score of 85 with mean 70 and standard deviation 10", "the
// five-number summary of score", "the standard error of the mean of
// income", "are there any outliers in score", "the 68-95-99.7 rule for
// score", "the slope and intercept of the regression line", "the critical
// t-value for a 95% confidence level with 10 degrees of freedom" — the
// specific vocabulary an intro stats STUDENT reaches for, textbook terms
// that don't come up once you're past that course (nobody doing real
// analysis asks for "the empirical rule"), distinct from
// rDescriptiveStats.ts's more general mean/median/sd/etc.
//
// Most of these concepts make sense for EITHER a literal list of numbers
// (a problem set just gives you "85, 90, 78, 92, 88") or a data-frame
// column — parseSubject() below picks whichever shape was typed and
// returns the matching R expression (`c(...)` or `df$col`), same
// "either form, whichever fits" posture as rDataCleaning.ts's
// DATA_REF/normalizeDataRef, just for a VALUE rather than a data frame.

const IDENT = String.raw`[A-Za-z][\w.]*`
const NUM = String.raw`-?\d+(?:\.\d+)?`

// A comma/"and"-separated list of numbers -> c(...), or a bare column
// name -> df$col. Returns null for anything that's neither (so the
// caller can decline rather than guess).
function parseSubject(raw: string): string | null {
  const t = raw.trim()
  const nums = t.split(/\s*(?:,|and)\s*/i).map(s => s.trim())
  if (nums.length > 0 && nums.every(n => new RegExp(`^${NUM}$`).test(n))) return `c(${nums.join(', ')})`
  if (new RegExp(`^${IDENT}$`).test(t)) return `df$${t}`
  return null
}

// ── Z-scores ─────────────────────────────────────────────────────────────
// "the z-score of 85 with mean 70 and standard deviation 10" / "z score
// for 85 in a distribution with mean 70 and sd 10" / "standardize 85
// given mean 70 and sd 10" (a single value, explicit parameters) / "the
// z-score of score" / "convert score to z-scores" (a whole column,
// computed from its own mean/sd — distinct from
// rDataTransform.ts's "standardize score", which MUTATES the column;
// this is a read-only value, same bare-vs-mutating split as every other
// category here).
const MEAN_SD = String.raw`mean\s+(?:of\s+)?(${NUM})\s+and\s+(?:a\s+)?(?:standard\s+deviation|sd)\s+(?:of\s+)?(${NUM})`

function tryZScore(text: string): string | null {
  let m = text.match(new RegExp(`^(?:the\\s+)?z[\\s-]?score\\s+of\\s+(${NUM})\\s+with\\s+${MEAN_SD}$`, 'i'))
  if (m) return `(${m[1]} - ${m[2]}) / ${m[3]}`
  m = text.match(new RegExp(`^z[\\s-]?score\\s+for\\s+(${NUM})\\s+in\\s+a\\s+distribution\\s+with\\s+${MEAN_SD}$`, 'i'))
  if (m) return `(${m[1]} - ${m[2]}) / ${m[3]}`
  m = text.match(new RegExp(`^standardize\\s+(${NUM})\\s+given\\s+${MEAN_SD}$`, 'i'))
  if (m) return `(${m[1]} - ${m[2]}) / ${m[3]}`
  m = text.match(new RegExp(`^(?:the\\s+)?z[\\s-]?scores?\\s+(?:of|for)\\s+(${IDENT})$`, 'i'))
  if (m) return `(df$${m[1]} - mean(df$${m[1]}, na.rm = TRUE)) / sd(df$${m[1]}, na.rm = TRUE)`
  m = text.match(new RegExp(`^convert\\s+(${IDENT})\\s+to\\s+z[\\s-]?scores?$`, 'i'))
  if (m) return `(df$${m[1]} - mean(df$${m[1]}, na.rm = TRUE)) / sd(df$${m[1]}, na.rm = TRUE)`
  return null
}

// The REVERSE lookup — going from a z-score back to the raw value
// (raw = mean + z*sd), just as common an exercise as the forward
// direction tryZScore above already covers.
function tryRawScoreFromZ(text: string): string | null {
  let m = text.match(new RegExp(`^what\\s+raw\\s+score\\s+has\\s+a\\s+z[\\s-]?score\\s+of\\s+(${NUM})\\s+with\\s+${MEAN_SD}$`, 'i'))
  if (!m) m = text.match(new RegExp(`^(?:the\\s+)?raw\\s+score\\s+for\\s+a\\s+z[\\s-]?score\\s+of\\s+(${NUM})\\s+with\\s+${MEAN_SD}$`, 'i'))
  if (!m) return null
  return `${m[2]} + ${m[1]} * ${m[3]}`
}

// ── Five-number summary ──────────────────────────────────────────────────
// fivenum()'s own default IS na.rm = TRUE (unlike mean/sd/var), so no
// extra argument is needed here to get the safe behavior.
function tryFiveNumberSummary(text: string): string | null {
  let m = text.match(/^(?:the\s+)?five[\s-]number\s+summary\s+of\s+(.+)$/i)
  if (!m) m = text.match(/^fivenum\s+of\s+(.+)$/i)
  if (!m) return null
  const subject = parseSubject(m[1])
  return subject ? `fivenum(${subject})` : null
}

// ── Standard error of the mean ───────────────────────────────────────────
// Distinct from standard deviation — the single most common intro-stats
// mix-up this exists to answer correctly. Checked with the more specific
// "of the mean of X" phrasing FIRST so "the standard error of the sample
// mean" (no subject at all — too generic to compute, correctly declined)
// isn't swallowed by a looser pattern that would wrongly try to treat
// "the sample mean" itself as the subject.
function tryStandardError(text: string): string | null {
  let m = text.match(/^(?:the\s+)?standard\s+error\s+of\s+the\s+mean\s+of\s+(.+)$/i)
  if (!m) m = text.match(/^(?:the\s+)?standard\s+error\s+of\s+(.+)$/i)
  if (!m) return null
  const subject = parseSubject(m[1])
  if (!subject) return null
  return `sd(${subject}, na.rm = TRUE) / sqrt(sum(!is.na(${subject})))`
}

// ── Outliers via the IQR (Tukey / boxplot) rule ──────────────────────────
// boxplot.stats()$out IS the 1.5*IQR rule, the exact one taught alongside
// boxplots — not a formula reimplemented by hand.
function tryOutliersIQR(text: string): string | null {
  // "find"/"identify" are themselves stripped by the shared stripFiller()
  // before this ever sees the text (confirmed empirically — same gotcha
  // class as tryEmpiricalRule's "the" above), so the lead verb has to be
  // optional, not required, leaving bare "outliers in X" to match too.
  const m = text.match(new RegExp(`^(?:are\\s+there\\s+any\\s+outliers\\s+in|(?:(?:find|identify)\\s+)?outliers\\s+in)\\s+(${IDENT})(?:\\s+using\\s+the\\s+IQR\\s+rule)?\\??$`, 'i'))
  if (!m) return null
  return `boxplot.stats(na.omit(df$${m[1]}))$out`
}

// ── The empirical rule (68-95-99.7) ──────────────────────────────────────
// "the 68-95-99.7 rule for score" previously misfired through the shared
// tier-2 engine as literal arithmetic (68 minus 95 minus 99.7) — this
// recognizer runs first in the native chain, so that number sequence is
// claimed here as the RULE NAME before tier-2 ever gets a chance to parse
// it as a subtraction chain.
function tryEmpiricalRule(text: string): string | null {
  // "the" is stripped by the shared stripFiller() before this ever sees
  // the text, so "the 68-95-99.7 rule for score" arrives bare —
  // confirmed empirically, same gotcha class documented in CLAUDE.md.
  let m = text.match(/^apply\s+the\s+empirical\s+rule\s+to\s+(.+)$/i)
  if (!m) m = text.match(/^(?:the\s+)?68[\s-]95[\s-]99\.7\s+rule\s+for\s+(.+)$/i)
  if (!m) return null
  const subject = parseSubject(m[1])
  if (!subject) return null
  return `mean(${subject}, na.rm = TRUE) + (-3:3) * sd(${subject}, na.rm = TRUE)`
}

// ── Simple linear regression: the line itself ────────────────────────────
// Bare forms reuse rRegression.ts's own `model` convention (the same
// lm() object "the existing regression model" already assumes exists);
// forms naming two real columns build a fresh lm() instead, since
// nothing says to reuse a prior model.
function tryRegressionLineBasics(text: string): string | null {
  if (/^(?:the\s+)?slope\s+and\s+intercept\s+of\s+the\s+regression\s+line$/i.test(text)) return 'coef(model)'
  if (/^(?:the\s+)?(?:r-?squared|coefficient\s+of\s+determination)(?:\s+for\s+the\s+regression\s+model)?$/i.test(text)) {
    return 'summary(model)$r.squared'
  }
  let m = text.match(new RegExp(`^(?:the\\s+)?equation\\s+of\\s+the\\s+regression\\s+line\\s+for\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `coef(lm(${m[1]} ~ ${m[2]}, data = df))`
  m = text.match(new RegExp(`^(?:the\\s+)?line\\s+of\\s+best\\s+fit\\s+for\\s+(${IDENT})\\s+and\\s+(${IDENT})$`, 'i'))
  if (m) return `coef(lm(${m[1]} ~ ${m[2]}, data = df))`
  m = text.match(new RegExp(`^(?:the\\s+)?slope\\s+of\\s+the\\s+regression\\s+line\\s+for\\s+(${IDENT})\\s+on\\s+(${IDENT})$`, 'i'))
  if (m) return `coef(lm(${m[1]} ~ ${m[2]}, data = df))[2]`
  return null
}

// ── Critical values (z or t) for a confidence level ─────────────────────
// The quantile that leaves (1 - level)/2 in each tail — the two-sided
// critical value used in every CI problem — computed here in TS and
// embedded as a plain decimal rather than left as arithmetic for R to
// evaluate, so the generated code reads as a single, obvious qnorm/qt call.
function tryCriticalValue(text: string): string | null {
  let m = text.match(/^(?:the\s+)?critical\s+t[\s-]?value\s+for\s+a\s+(\d+)%?\s+confidence\s+level\s+with\s+(\d+)\s+degrees?\s+of\s+freedom$/i)
  if (m) return `qt(${(1 + Number(m[1]) / 100) / 2}, df = ${m[2]})`
  m = text.match(/^(?:the\s+)?critical\s+(?:z[\s-]?)?value\s+for\s+a\s+(\d+)%?\s+confidence\s+(?:level|interval)$/i)
  if (m) return `qnorm(${(1 + Number(m[1]) / 100) / 2})`
  return null
}

// ── Margin of error ──────────────────────────────────────────────────────
// t-based (not z-based) — the correct choice for a REAL column, where the
// population SD is never actually known, only estimated from the sample;
// defaults to 95% when no level is given.
function buildMarginOfError(col: string, level: number): string {
  const q = (1 + level / 100) / 2
  const n = `sum(!is.na(df$${col}))`
  return `qt(${q}, df = ${n} - 1) * sd(df$${col}, na.rm = TRUE) / sqrt(${n})`
}

function tryMarginOfError(text: string): string | null {
  let m = text.match(new RegExp(`^(?:the\\s+)?margin\\s+of\\s+error\\s+for\\s+a\\s+(\\d+)%?\\s+confidence\\s+interval\\s+for\\s+the\\s+mean\\s+(${IDENT})$`, 'i'))
  if (m) return buildMarginOfError(m[2], Number(m[1]))
  m = text.match(new RegExp(`^margin\\s+of\\s+error\\s+for\\s+(${IDENT})$`, 'i'))
  if (m) return buildMarginOfError(m[1], 95)
  return null
}

// ── Sample size planning ─────────────────────────────────────────────────
// "how big does my sample need to be?" — a classic planning-ahead
// exercise, answerable only when BOTH a margin of error and a (known or
// assumed) standard deviation are given; z-based (not t-based), since
// sample size isn't known yet — there's no df to look up.
function buildSampleSize(marginOfError: number, sd: number, level: number): string {
  const q = (1 + level / 100) / 2
  return `ceiling((qnorm(${q}) * ${sd} / ${marginOfError}) ^ 2)`
}

function trySampleSizeForMean(text: string): string | null {
  let m = text.match(new RegExp(`^(?:what\\s+)?sample\\s+size\\s+do\\s+i\\s+need\\s+for\\s+a\\s+margin\\s+of\\s+error\\s+of\\s+(${NUM})\\s+with\\s+a\\s+standard\\s+deviation\\s+of\\s+(${NUM})$`, 'i'))
  if (m) return buildSampleSize(Number(m[1]), Number(m[2]), 95)
  m = text.match(new RegExp(`^(?:the\\s+)?sample\\s+size\\s+needed\\s+for\\s+a\\s+(\\d+)%?\\s+confidence\\s+interval\\s+with\\s+a\\s+margin\\s+of\\s+error\\s+of\\s+(${NUM})\\s+and\\s+a\\s+standard\\s+deviation\\s+of\\s+(${NUM})$`, 'i'))
  if (m) return buildSampleSize(Number(m[2]), Number(m[3]), Number(m[1]))
  return null
}

// ── Degrees of freedom from a sample size alone ──────────────────────────
// Only the one-sample case (n - 1) — the two-independent-samples case has
// no simple closed form once variances are allowed to differ (Welch's
// approximation needs both groups' SDs, not just their sizes), so that
// case is correctly left declined rather than guessed at.
function tryDegreesOfFreedomFromN(text: string): string | null {
  let m = text.match(/^(?:the\s+)?degrees\s+of\s+freedom\s+for\s+a\s+sample\s+of\s+(\d+)$/i)
  if (m) return String(Number(m[1]) - 1)
  m = text.match(/^(?:the\s+)?degrees\s+of\s+freedom\s+for\s+a\s+one[\s-]sample\s+t[\s-]?test\s+with\s+a\s+sample\s+size\s+of\s+(\d+)$/i)
  if (m) return String(Number(m[1]) - 1)
  return null
}

// ── Coefficient of variation ─────────────────────────────────────────────
function tryCoefficientOfVariation(text: string): string | null {
  const m = text.match(/^(?:the\s+)?coefficient\s+of\s+variation\s+of\s+(.+)$/i)
  if (!m) return null
  const subject = parseSubject(m[1])
  return subject ? `sd(${subject}, na.rm = TRUE) / mean(${subject}, na.rm = TRUE)` : null
}

// Same narrow, literal "treatment and control" match as
// rStatisticalTests.ts's own TREATMENT_CONTROL — duplicated here per
// this project's convention of keeping each file self-contained.
const TREATMENT_CONTROL = String.raw`(?:the\s+)?treatment\s+and\s+control(?:\s+groups?)?`

// ── Pooled standard deviation ────────────────────────────────────────────
// The two-independent-samples-t-test formula, computed directly rather
// than left for the student to assemble from n1/n2/s1/s2 by hand —
// intermediate variables, same multi-statement-on-one-line convention as
// rResearchWorkflow.ts's train/test split.
function tryPooledSD(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?pooled\\s+(?:standard\\s+deviation|sd)\\s+of\\s+(${IDENT})\\s+for\\s+${TREATMENT_CONTROL}$`, 'i'))
  if (!m) return null
  const col = m[1]
  const g1 = `df$${col}[df$treatment == "treatment"]`
  const g2 = `df$${col}[df$treatment == "control"]`
  return `n1 <- sum(df$treatment == "treatment"); n2 <- sum(df$treatment == "control"); s1 <- sd(${g1}, na.rm = TRUE); s2 <- sd(${g2}, na.rm = TRUE); sqrt(((n1 - 1) * s1^2 + (n2 - 1) * s2^2) / (n1 + n2 - 2))`
}

// ── Expected value ────────────────────────────────────────────────────────
// A binomial's mean (n*p) and a fair die's mean ((sides+1)/2) — both
// closed-form, unambiguous formulas, unlike a GENERIC "expected value of
// a fair six-sided die" needing no domain knowledge beyond what "fair"
// and "die" themselves already pin down.
const DIE_WORDS: Record<string, number> = { four: 4, six: 6, eight: 8, ten: 10, twelve: 12, twenty: 20 }
function tryExpectedValue(text: string): string | null {
  let m = text.match(new RegExp(`^(?:the\\s+)?expected\\s+value\\s+of\\s+a\\s+binomial\\s+distribution\\s+with\\s+(\\d+)\\s+trials?\\s+and\\s+probability\\s+(${NUM})$`, 'i'))
  if (m) return `${m[1]} * ${m[2]}`
  m = text.match(/^(?:the\s+)?expected\s+value\s+of\s+a\s+fair\s+(\d+|four|six|eight|ten|twelve|twenty)[\s-]sided\s+die$/i)
  if (m) {
    const sides = /^\d+$/.test(m[1]) ? Number(m[1]) : DIE_WORDS[m[1].toLowerCase()]
    return `${(sides + 1) / 2}`
  }
  return null
}

// ── Complement of a probability ──────────────────────────────────────────
function tryComplement(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?complement\\s+of\\s+(${NUM})$`, 'i'))
  if (!m) return null
  return `1 - ${m[1]}`
}

// ── Skewness ──────────────────────────────────────────────────────────────
// No base-R skewness() (base R's `summary()`/`sd()` stop at second
// moment) — needs the `e1071` package, same "errors until
// install.packages()" rule as every other optional package elsewhere.
function trySkewness(text: string): string | null {
  let m = text.match(new RegExp(`^(?:the\\s+)?skewness\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `e1071::skewness(df$${m[1]}, na.rm = TRUE)`
  m = text.match(new RegExp(`^is\\s+(${IDENT})\\s+skewed\\??$`, 'i'))
  if (m) return `e1071::skewness(df$${m[1]}, na.rm = TRUE)`
  return null
}

// ── Binomial "more than K successes" ─────────────────────────────────────
// P(X > k) = 1 - P(X <= k) — the complement of the CDF the shared tier-1/
// tier-2 engine already computes for "at k"; this phrase just asks for
// the other side of it directly rather than making the student subtract
// by hand.
// P(X > k) = 1 - P(X <= k); P(X < k) = P(X <= k - 1) — the two
// complements of the CDF the shared tier-1/tier-2 engine already
// computes for "at k", so the student never has to do that subtraction
// (or the off-by-one for "fewer than") by hand.
function tryBinomialMoreThan(text: string): string | null {
  let m = text.match(new RegExp(`^(?:the\\s+)?probability\\s+of\\s+(?:getting\\s+)?more\\s+than\\s+(\\d+)\\s+successes?\\s+in\\s+(\\d+)\\s+trials?\\s+with\\s+probability\\s+(${NUM})$`, 'i'))
  if (m) return `1 - pbinom(${m[1]}, ${m[2]}, ${m[3]})`
  m = text.match(new RegExp(`^(?:the\\s+)?probability\\s+of\\s+(?:getting\\s+)?(?:fewer|less)\\s+than\\s+(\\d+)\\s+successes?\\s+in\\s+(\\d+)\\s+trials?\\s+with\\s+probability\\s+(${NUM})$`, 'i'))
  if (m) return `pbinom(${Number(m[1]) - 1}, ${m[2]}, ${m[3]})`
  return null
}

export function recognizeIntroStats(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryZScore(text) ??
    tryRawScoreFromZ(text) ??
    tryFiveNumberSummary(text) ??
    tryStandardError(text) ??
    tryOutliersIQR(text) ??
    tryEmpiricalRule(text) ??
    tryRegressionLineBasics(text) ??
    tryCriticalValue(text) ??
    tryMarginOfError(text) ??
    trySampleSizeForMean(text) ??
    tryDegreesOfFreedomFromN(text) ??
    tryCoefficientOfVariation(text) ??
    tryPooledSD(text) ??
    tryExpectedValue(text) ??
    tryComplement(text) ??
    trySkewness(text) ??
    tryBinomialMoreThan(text)
  )
}
