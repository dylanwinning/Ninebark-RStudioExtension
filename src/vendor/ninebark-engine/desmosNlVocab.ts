import { UnsupportedFormalError } from './formalStringTokenizer'

// ── Desmos-specific NL vocabulary ────────────────────────────────────────────
//
// Ninebark's nlToFormal() (see nl/lexicon/classes.ts) already understands a lot
// of statistics phrasing (mean, median, standard deviation, variance, quartiles,
// min/max, one-variable stats), core trig (including sec/csc/cot as reciprocal
// expansions), hyperbolic trig, and even regression ("linear regression of …")
// — those are handled purely by extending the name-mapping table in
// formalToDesmos.ts, or (for genuinely missing vocabulary like hyperbolic
// secant/cosecant/cotangent) by adding lexicon entries in Ninebark-Prototype.
//
// This module covers what Ninebark's grammar has no concept of at all:
// probability distributions, calculus (incl. partial/higher-order derivatives,
// double integrals), number theory, geometry, list ops, visualizations,
// piecewise conditionals, inequalities, factorial, percent-of, and polar
// equations. Recognizers here produce a formal string in the same "name(args)"
// dialect formalToDesmos.ts already parses — sub-expressions are spliced in as
// raw text and left for that parser's real operator-precedence (and
// comparison/postfix) handling, not pre-converted here.
//
// Out of scope for a *natural-language* trigger (though the underlying Desmos
// syntax is wired up in formalToDesmos.ts and reachable via raw pass-through
// if a student types it directly): 3D and matrices, which the embedded
// GraphingCalculator product doesn't support at all regardless of NL phrasing;
// and stateful accessor chains into a *previously run* test's auto-named result
// (e.g. "T1.pvalue") — those require introspecting Desmos's live calculator
// state for an object it names on its own, not just recognizing a phrase.
//
// IMPORTANT — ambiguity with Ninebark's own grammar: "5 less than x" is
// Ninebark's arithmetic idiom for (x − 5), a real and common phrasing. Only
// treat "less than"/"greater than" as a Desmos *inequality* (this module's
// territory) when the phrasing is unambiguous — see inequalityFormal() below.
// Don't loosen that without checking nl-sprint7{4,5}.test.ts in Ninebark-
// Prototype still passes ("5 less than x" must still reach tier 2 as x−5).

function numbersIn(text: string): string[] {
  const nums = text.match(/-?\d+(?:\.\d+)?/g)
  if (!nums || nums.length === 0) throw new UnsupportedFormalError(`I couldn't find any numbers in "${text.trim()}" — try listing them like "1, 2, 3".`)
  return nums
}

function listLiteral(text: string): string {
  return `{${numbersIn(text).join(',')}}`
}

function extractNumber(text: string, labels: string[]): string | null {
  for (const label of labels) {
    // "mean of 0" / "probability 0.3"
    const forward = text.match(new RegExp(`${label}\\s*(?:of|is|=)?\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'))
    if (forward) return forward[1]
    // "10 degrees of freedom" / "10 trials"
    const backward = text.match(new RegExp(`(-?\\d+(?:\\.\\d+)?)\\s+${label}`, 'i'))
    if (backward) return backward[1]
  }
  return null
}

// ── Filler stripping ─────────────────────────────────────────────────────────
// Students phrase requests as full questions/commands ("what is the factorial
// of 5?", "can you find the derivative of x^2", "please compute 5 choose 2").
// Individual recognizers below match on trigger words with unanchored regexes
// wherever possible, but a few need the string to *start* with their content
// (postfix "N factorial", "if COND then A", polar "r = …", …) — this strips
// the leading conversational scaffolding once, up front, so every recognizer
// benefits without duplicating the same filler list in each one.
// Exported for resolveSheetsPhrase.ts, which applies the same conversational-
// scaffolding stripping before its own (Sheets-specific) recognizers run.
export function stripFiller(text: string): string {
  let s = text.replace(/[?.!]+\s*$/, '') // trailing punctuation
  let prev: string
  do {
    prev = s
    s = s.replace(/^\s*(?:please|kindly)\s+/i, '')
    s = s.replace(/^\s*(?:can|could|would)\s+you\s+(?:please\s+)?/i, '')
    s = s.replace(/^\s*(?:i\s+want\s+to\s+know|i\s+need)\s+/i, '')
    s = s.replace(/^\s*what\s+is\s+/i, '')
    s = s.replace(/^\s*what's\s+/i, '')
    s = s.replace(/^\s*(?:find|compute|calculate|determine|evaluate|solve\s+for|give\s+me|show\s+me|tell\s+me)\s+(?:me\s+)?/i, '')
    s = s.replace(/^\s*the\s+/i, '')
  } while (s !== prev)
  return s.trim()
}

// Strips a leading graph/plot/sketch/draw verb — used by recognizers whose
// captured groups would otherwise include the verb as un-parseable text, and
// exported for main.ts (multi-graph splitting, tier-3 raw-passthrough).
// The optional trailing "of" covers the equally natural "graph of x^2"
// phrasing (as opposed to the verb-first "graph x^2") — without it, "of"
// is left dangling on the front of the captured expression and every
// downstream recognizer fails to parse it.
export const GRAPH_VERB_RE = /^\s*(?:graph|plot|sketch|draw|show\s+me(?:\s+the)?)\s+(?:of\s+)?/i
export function stripGraphVerb(text: string): string {
  return text.replace(GRAPH_VERB_RE, '').trim()
}

// ── Unicode math symbol normalization ─────────────────────────────────────────
// Students type (or paste from a problem set) real math symbols, not just
// ASCII — "x²", "x·y", "√16", "x ≤ 5", "π". Normalize these to the ASCII
// spellings the rest of the pipeline (tier 1, Ninebark, and the raw-passthrough
// parser) already understands. Applied once, up front, to the whole input.
const UNICODE_MATH_REPLACEMENTS: [RegExp, string][] = [
  [/[×·]/g, '*'],
  [/÷/g, '/'],
  [/[−–]/g, '-'],
  [/≤/g, '<='],
  [/≥/g, '>='],
  [/≠/g, '!='],
  [/√/g, 'sqrt '],
  [/π/g, 'pi'],
  [/⁰/g, '^0'], [/¹/g, '^1'], [/²/g, '^2'], [/³/g, '^3'], [/⁴/g, '^4'],
  [/⁵/g, '^5'], [/⁶/g, '^6'], [/⁷/g, '^7'], [/⁸/g, '^8'], [/⁹/g, '^9'],
]
export function normalizeUnicodeMath(text: string): string {
  let s = text
  for (const [re, replacement] of UNICODE_MATH_REPLACEMENTS) s = s.replace(re, replacement)
  return s
}

// ── Probability distributions ────────────────────────────────────────────────

// "success rate"/"chance of success" needs its own extractor: the number is
// often written as a percentage ("30% success rate" / "success rate of 30%"),
// where the "%" sits directly between the digits and the label — extractNumber
// requires the number and label to be adjacent with only whitespace between,
// so a bare label list can't catch this shape.
function extractProbability(text: string): string | null {
  let m = text.match(/(-?[\d.]+)\s*%\s*(?:success\s+rate|chance\s+of\s+success|success\s+chance)/i)
  if (m) return String(parseFloat(m[1]) / 100)
  m = text.match(/(?:success\s+rate|chance\s+of\s+success|success\s+chance)\s*(?:of|is|=)?\s*(-?[\d.]+)\s*%/i)
  if (m) return String(parseFloat(m[1]) / 100)
  return extractNumber(text, ['probability', 'p', 'success rate', 'chance of success'])
}

function distributionFormal(text: string): string | null {
  if (/\b(?:normal|gaussian)\s+distribution\b/i.test(text) || /\bstandard\s+normal\b/i.test(text)) {
    const mean = extractNumber(text, ['mean', 'mu', 'average', 'center(?:ed)?(?:\\s+at)?']) ?? '0'
    const sd = extractNumber(text, ['standard deviation', 'std dev', 'std\\.? dev\\.?', 'sd', 'sigma', 'spread(?:\\s+of)?']) ?? '1'
    return `normaldist(${mean}, ${sd})`
  }
  if (/\bt[\s-]distribution\b|\bstudent'?s?\s+t[\s-]?distribution\b/i.test(text)) {
    const df = extractNumber(text, ['degrees of freedom', 'df'])
    if (df === null) throw new UnsupportedFormalError('t-distribution needs degrees of freedom, e.g. "t distribution with 10 degrees of freedom"')
    return `tdist(${df})`
  }
  if (/\bchi[\s-]?squared?\s+distribution\b/i.test(text)) {
    const df = extractNumber(text, ['degrees of freedom', 'df'])
    if (df === null) throw new UnsupportedFormalError('chi-square distribution needs degrees of freedom, e.g. "chi-square distribution with 10 degrees of freedom"')
    return `chisqdist(${df})`
  }
  if (/\buniform\s+distribution\b/i.test(text)) {
    const min = extractNumber(text, ['minimum', 'min', 'from'])
    const max = extractNumber(text, ['maximum', 'max', 'to'])
    if (min === null || max === null) throw new UnsupportedFormalError('uniform distribution needs a minimum and maximum, e.g. "uniform distribution from 0 to 1"')
    return `uniformdist(${min}, ${max})`
  }
  if (/\bbinomial\s+distribution\b/i.test(text)) {
    const n = extractNumber(text, ['trials', 'n'])
    const p = extractProbability(text)
    if (n === null || p === null) throw new UnsupportedFormalError('binomial distribution needs a number of trials and a probability, e.g. "binomial distribution with 10 trials and probability 0.3" or "...and a 30% success rate"')
    return `binomialdist(${n}, ${p})`
  }
  if (/\bpoisson\s+distribution\b/i.test(text)) {
    const mean = extractNumber(text, ['mean', 'rate', 'lambda'])
    if (mean === null) throw new UnsupportedFormalError('Poisson distribution needs a mean, e.g. "Poisson distribution with mean 5"')
    return `poissondist(${mean})`
  }
  if (/\bgeometric\s+distribution\b/i.test(text)) {
    const p = extractProbability(text)
    if (p === null) throw new UnsupportedFormalError('geometric distribution needs a success probability, e.g. "geometric distribution with probability 0.7" or "...with a 70% success rate"')
    return `geodist(${p})`
  }
  return null
}

function distributionAccessorFormal(text: string): string | null {
  const m = text.match(/\b(pdf|probability density function|cdf|cumulative distribution function|inverse cdf|inverse cumulative distribution function)\s+of\s+(?:the\s+)?(.+?)\s+at\s+(-?\d+(?:\.\d+)?)\s*$/i)
  if (!m) return null
  const [, methodWord, distPhrase, x] = m
  const distFormal = distributionFormal(distPhrase)
  if (!distFormal) throw new UnsupportedFormalError(`couldn't recognize the distribution in "${distPhrase.trim()}"`)
  const method = /inverse/i.test(methodWord) ? 'inversecdf' : /cdf|cumulative/i.test(methodWord) ? 'cdf' : 'pdf'
  return `${distFormal}.${method}(${x})`
}

// "random sample of 5 from a normal distribution with mean 0 and sd 1"
// "5 random numbers from a uniform distribution from 0 to 10"
// "a random number" / "a random number between 0 and 10"
// "a random integer between 1 and 10" / "5 random integers from 1 to 10"
// Lead verbs students naturally use for randomness ("roll a random number",
// "generate a random integer", "pick a random number") that the patterns
// below (all anchored at "^") wouldn't otherwise see past. Scoped locally
// here rather than added to the shared stripFiller(), which must NOT strip
// "generate"/"make"/"create" globally — those are load-bearing trigger verbs
// for tableFormal/sliderFormal/circleFormal elsewhere in this file.
function stripRandomLeadVerb(text: string): string {
  return text.replace(/^\s*(?:please\s+)?(?:roll|pick|choose|generate|give\s+me)\s+/i, '')
}

function randomFormal(rawText: string): string | null {
  const text = stripRandomLeadVerb(rawText)
  let m: RegExpMatchArray | null

  // Integers first — "random integer" also contains the word "random number"-
  // adjacent phrasing, so this must be tried before the plain-number patterns.
  if ((m = text.match(/^\s*(\d+)\s+random\s+(?:integers|whole\s+numbers)\s+(?:between|from)\s+(-?[\d.]+)\s+(?:and|to)\s+(-?[\d.]+)\s*$/i))) {
    const [, n, a, b] = m
    return `floor(random(${n})*(${b}-${a}+1))+${a}`
  }
  if ((m = text.match(/^\s*(?:an?\s+)?random\s+(?:integer|whole\s+number)\s+(?:between|from)\s+(-?[\d.]+)\s+(?:and|to)\s+(-?[\d.]+)\s*$/i))) {
    const [, a, b] = m
    return `floor(random()*(${b}-${a}+1))+${a}`
  }
  if (/^\s*(?:an?\s+)?random\s+(?:integer|whole\s+number)\s*$/i.test(text)) return 'floor(random()*10)+1'

  if ((m = text.match(/^\s*(?:an?\s+)?random\s+number\s+(?:between|from)\s+(-?[\d.]+)\s+(?:and|to)\s+(-?[\d.]+)\s*$/i)))
    return `uniformdist(${m[1]}, ${m[2]}).random()`
  if (/^\s*(?:an?\s+)?random\s+(?:number|decimal)\s*$/i.test(text)) return 'random()'

  if ((m = text.match(/^\s*(?:an?\s+)?random\s+sample\s+of\s+(\d+)\s+from\s+(?:an?\s+)?(.+)$/i)) ||
      (m = text.match(/^\s*(\d+)\s+random\s+(?:numbers|samples|values)\s+from\s+(?:an?\s+)?(.+)$/i))) {
    const [, n, distPhrase] = m
    const distFormal = distributionFormal(distPhrase)
    if (!distFormal) throw new UnsupportedFormalError(`couldn't recognize the distribution in "${distPhrase.trim()}"`)
    return `${distFormal}.random(${n})`
  }
  return null
}

// ── Number theory ─────────────────────────────────────────────────────────────

function numberTheoryFormal(text: string): string | null {
  let m: RegExpMatchArray | null

  // "is N even/odd/prime" — MUST be tried before anything else here (and
  // before this text ever reaches Ninebark's tier-2 grammar): tier 2 has no
  // concept of "is"/"even"/"odd"/"prime" and silently drops all three,
  // returning just the bare number N as if that answered the question.
  if ((m = text.match(/^\s*is\s+(-?\d+)\s+even\s*$/i))) return `mod(${m[1]},2)=0`
  if ((m = text.match(/^\s*is\s+(-?\d+)\s+odd\s*$/i))) return `mod(${m[1]},2)=1`
  if (/^\s*is\s+-?\d+\s+prime\s*$/i.test(text))
    throw new UnsupportedFormalError('Checking primality isn\'t supported yet — try factoring or dividing manually instead.')

  if ((m = text.match(/^\s*(.+?)\s+choose\s+(.+)$/i))) return `nCr(${m[1].trim()}, ${m[2].trim()})`
  if ((m = text.match(/permutations?\s+of\s+(.+?)\s+(?:things?\s+)?taken\s+(.+?)\s+at\s+a\s+time/i))) return `nPr(${m[1].trim()}, ${m[2].trim()})`
  if ((m = text.match(/^\s*(.+?)\s+permute\s+(.+)$/i))) return `nPr(${m[1].trim()}, ${m[2].trim()})`

  if ((m = text.match(/\b(?:least common multiple|lcm)\s+of\s+(.+)$/i))) return `lcm(${numbersIn(m[1]).join(', ')})`
  if ((m = text.match(/\b(?:greatest common divisor|gcd|greatest common factor|gcf)\s+of\s+(.+)$/i))) return `gcd(${numbersIn(m[1]).join(', ')})`

  if ((m = text.match(/^\s*(.+?)\s+mod(?:ulo)?\s+(.+)$/i))) return `mod(${m[1].trim()}, ${m[2].trim()})`
  if ((m = text.match(/remainder\s+(?:of\s+)?(.+?)\s+divided\s+by\s+(.+)$/i))) return `mod(${m[1].trim()}, ${m[2].trim()})`

  if ((m = text.match(/(\d+)(?:st|nd|rd|th)\s+root\s+of\s+(.+)$/i))) return `nthroot(${m[2].trim()}, ${m[1]})`
  if ((m = text.match(/\bsign\s+of\s+(.+)$/i))) return `sign(${m[1].trim()})`

  if ((m = text.match(/\bfactorial\s+of\s+(.+)$/i))) return `(${m[1].trim()})!`
  if ((m = text.match(/^\s*(.+?)\s+factorial\s*$/i))) return `(${m[1].trim()})!`

  return null
}

// ── Statistics gaps (not already covered by Ninebark's own grammar) ──────────

function statsGapFormal(text: string): string | null {
  let m: RegExpMatchArray | null

  if ((m = text.match(/\bpopulation\s+covariance\s+(?:between|of)\s+(.+?)\s+and\s+(.+)$/i)))
    return `covp(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  if ((m = text.match(/\bcovariance\s+(?:between|of)\s+(.+?)\s+and\s+(.+)$/i)))
    return `cov(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  // Spearman MUST be tried before plain correlation: "spearman correlation
  // between X and Y" contains "correlation between X and Y" as a substring,
  // which the plain-correlation regex below (unanchored, like several
  // others in this file — see the coverage5/6 test sweeps) would otherwise
  // match on its own, silently dropping "spearman" and computing the wrong
  // statistic (Pearson, not Spearman) with no error at all.
  if ((m = text.match(/\bspearman(?:'s)?(?:\s+rank)?(?:\s+correlation)?\s+(?:between|of)\s+(.+?)\s+and\s+(.+)$/i)))
    return `spearman(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  if ((m = text.match(/\b(?:correlation(?: coefficient)?|corr)\s+(?:between|of)\s+(.+?)\s+and\s+(.+)$/i)))
    return `corr(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  if ((m = text.match(/\b(?:mean absolute deviation|mad)\s+of\s+(.+)$/i)))
    return `mad(${listLiteral(m[1])})`
  if ((m = text.match(/\bhow many (?:numbers|values|items|elements) (?:are )?(?:are\s+)?in\s+(.+)$/i)))
    return `length(${listLiteral(m[1])})`
  if ((m = text.match(/\bcount\s+of\s+(.+)$/i)))
    return `length(${listLiteral(m[1])})`
  // Excludes "length of the segment from A to B" — that's geometryFormal's
  // distance-between-two-points phrasing, not a list length.
  if ((m = text.match(/\blength\s+of\s+(?:the\s+list\s+)?(.+)$/i)) && !/\bsegment\b/i.test(text))
    return `length(${listLiteral(m[1])})`
  if ((m = text.match(/\bfive\s+number\s+summary\s+of\s+(.+)$/i)))
    return `stats(${listLiteral(m[1])})`
  if ((m = text.match(/(-?[\d.]+)\s+quantile\s+of\s+(.+)$/i)))
    return `quantile(${listLiteral(m[2])}, ${m[1]})`
  if ((m = text.match(/(\d+)(?:st|nd|rd|th)?\s+quartile\s+of\s+(.+)$/i)))
    return `quartile(${listLiteral(m[2])}, ${m[1]})`
  if ((m = text.match(/\binverse\s+cdf\s+of\s+(?:the\s+list\s+)?(.+?)\s+at\s+(-?[\d.]+)\s*$/i)))
    return `inversecdf(${listLiteral(m[1])}, ${m[2]})`
  if ((m = text.match(/\bindex\s+of\s+the\s+(?:largest|maximum|max)\s+(?:value\s+)?(?:in|of)\s+(.+)$/i)))
    return `argmax(${listLiteral(m[1])})`
  if ((m = text.match(/\bindex\s+of\s+the\s+(?:smallest|minimum|min)\s+(?:value\s+)?(?:in|of)\s+(.+)$/i)))
    return `argmin(${listLiteral(m[1])})`
  if ((m = text.match(/\bindependent\s+(?:samples?\s+)?t[\s-]?test\s+(?:between|of|comparing)\s+(.+?)\s+and\s+(.+)$/i)))
    return `ittest(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  if ((m = text.match(/\btwo[\s-]sample\s+t[\s-]?test\s+(?:between|of|comparing)\s+(.+?)\s+and\s+(.+)$/i)))
    return `ittest(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  if ((m = text.match(/\bt[\s-]?test\s+(?:of|for|on)\s+(?:the\s+list\s+)?(.+)$/i)))
    return `ttest(${listLiteral(m[1])})`

  return null
}

// ── List operations ───────────────────────────────────────────────────────────

function listOpsFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\bsort(?:ed)?(?:\s+list)?\s+(?:of\s+)?(.+)$/i))) return `sort(${listLiteral(m[1])})`
  if ((m = text.match(/\bunique\s+(?:values|elements)?\s*(?:in|of)\s+(.+)$/i))) return `unique(${listLiteral(m[1])})`
  if ((m = text.match(/\bshuffle(?:d)?\s+(?:list\s+of\s+|the\s+list\s+)?(.+)$/i))) return `shuffle(${listLiteral(m[1])})`
  if ((m = text.match(/\bjoin\s+(.+?)\s+and\s+(.+)$/i))) return `join(${listLiteral(m[1])}, ${listLiteral(m[2])})`
  if ((m = text.match(/\blist\s+from\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)$/i))) return `[${m[1]}...${m[2]}]`
  return null
}

// ── Tables ─────────────────────────────────────────────────────────────────
// "make a table" → an empty 2-column table for the student to fill in.
// "make a table with x values 1,2,3 [and y values 4,5,6]" → pre-filled columns.

function tableFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\btable\s+with\s+x\s*(?:values?)?\s*(?:of|:|=)\s*(.+?)(?:\s+and\s+y\s*(?:values?)?\s*(?:of|:|=)\s*(.+))?$/i)) ||
      (m = text.match(/\btable\s+with\s+x\s+values\s+(.+?)(?:\s+and\s+y\s+values\s+(.+))?$/i))) {
    const xs = numbersIn(m[1]).join(',')
    if (m[2]) return `maketable({${xs}},{${numbersIn(m[2]).join(',')}})`
    return `maketable({${xs}})`
  }
  if (/\b(?:make|create|build|show|add|new)\s+(?:me\s+)?a\s+table\b/i.test(text) || /^\s*(?:a\s+)?table\s*$/i.test(text))
    return 'maketable()'
  return null
}

// ── Visualizations ─────────────────────────────────────────────────────────────

function vizFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\bhistogram\s+of\s+(.+)$/i))) return `histogram(${listLiteral(m[1])})`
  if ((m = text.match(/\bdot\s?plot\s+of\s+(.+)$/i))) return `dotplot(${listLiteral(m[1])})`
  if ((m = text.match(/\bbox\s?(?:and\s+whisker\s+)?plot\s+of\s+(.+)$/i))) return `boxplot(${listLiteral(m[1])})`
  return null
}

// ── Calculus ───────────────────────────────────────────────────────────────────
// Sub-expressions are spliced in raw and parsed with real precedence by
// formalToDesmos.ts's FormalParser — not resolved through Ninebark, whose
// grammar only knows the variables x/y/t (not e.g. the bound variable "n").

const ORDINAL_WORD_TO_N: Record<string, string> = {
  second: '2', third: '3', fourth: '4', fifth: '5', sixth: '6',
}

function calculusFormal(text: string): string | null {
  let m: RegExpMatchArray | null

  // Derivative/rate-of-change/slope evaluated AT A POINT — MUST be tried
  // before the plain "derivative of X" pattern further down, whose greedy
  // "(.+)$" capture would otherwise swallow "at x=1" as part of the
  // expression and garble it via implicit multiplication ("...atx=1").
  // Distinct from tangentLineFormal: this wants the numeric slope, not a
  // graphable line, so it's tried first even though the trigger words
  // overlap ("tangent" isn't one of these, so no collision either way).
  if ((m = text.match(/\b(?:derivative|rate\s+of\s+change|slope)\s+of\s+(.+?)\s+at\s+(?:x\s*=\s*)?(-?[\d.]+)\s*$/i)))
    return `derivat(${m[1].trim()},${m[2]})`

  // "average rate of change of X from A to B" — the secant slope, distinct
  // from the instantaneous derivat() above. MUST be tried before
  // domainRestrictFormal's generic "EXPR from A to B" pattern, which would
  // otherwise swallow "average rate of change of x^2" whole as an
  // un-parseable expression and garble it via implicit multiplication.
  if ((m = text.match(/\baverage\s+rate\s+of\s+change\s+of\s+(.+?)\s+from\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)\s*$/i)))
    return `avgrate(${m[1].trim()},${m[2]},${m[3]})`

  // "area under (the curve) X from A to B" / "...between A and B" — Desmos
  // has no dedicated "area under" one-liner, but it's exactly a definite
  // integral, which integral() already handles. Also must be tried before
  // domainRestrictFormal for the same reason as above.
  if ((m = text.match(/\barea\s+under\s+(?:the\s+curve\s+)?(.+?)\s+from\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)\s*$/i)) ||
      (m = text.match(/\barea\s+under\s+(?:the\s+curve\s+)?(.+?)\s+between\s+(-?[\d.]+)\s+and\s+(-?[\d.]+)\s*$/i)))
    return `integral(${m[1].trim()},${m[2]},${m[3]})`

  // Higher-order derivatives — MUST be tried before the plain "derivative of"
  // pattern below, or "second derivative of x^3" silently loses "second" and
  // becomes a first derivative (matched only on the "derivative of" tail).
  if ((m = text.match(/\b(second|third|fourth|fifth|sixth)\s+derivative\s+of\s+(.+?)(?:\s+with\s+respect\s+to\s+([a-zA-Z]))?\s*$/i)))
    return `nthderiv(${m[2].trim()}, ${m[3] ?? 'x'}, ${ORDINAL_WORD_TO_N[m[1].toLowerCase()]})`
  if ((m = text.match(/\b(\d+)(?:st|nd|rd|th)\s+derivative\s+of\s+(.+?)(?:\s+with\s+respect\s+to\s+([a-zA-Z]))?\s*$/i)))
    return `nthderiv(${m[2].trim()}, ${m[3] ?? 'x'}, ${m[1]})`
  if ((m = text.match(/\bd\^?(\d+)\s*\/\s*d([a-zA-Z])\^?\d*\s+(?:of\s+)?(.+)$/i)))
    return `nthderiv(${m[3].trim()}, ${m[2]}, ${m[1]})`

  if ((m = text.match(/\bpartial\s+derivative\s+of\s+(.+?)\s+with\s+respect\s+to\s+([a-zA-Z])\s*$/i)))
    return `deriv(${m[1].trim()}, ${m[2]})`
  if ((m = text.match(/\b(?:derivative\s+of|differentiate)\s+(.+?)\s+with\s+respect\s+to\s+([a-zA-Z])\s*$/i)))
    return `deriv(${m[1].trim()}, ${m[2]})`
  if ((m = text.match(/\b(?:derivative\s+of|d\/dx\s+of|differentiate|instantaneous\s+rate\s+of\s+change\s+of)\s+(.+)$/i)))
    return `deriv(${m[1].trim()})`

  if ((m = text.match(/\b(?:double|iterated)\s+integral\s+of\s+(.+?)\s+from\s+x\s*=\s*(.+?)\s+to\s+(.+?)\s+and\s+y\s*=\s*(.+?)\s+to\s+(.+)$/i)))
    return `doubleintegral(${m[1].trim()}, ${m[2].trim()}, ${m[3].trim()}, ${m[4].trim()}, ${m[5].trim()})`
  if ((m = text.match(/\b(?:integral\s+of|integrate)\s+(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i)))
    return `integral(${m[1].trim()}, ${m[2].trim()}, ${m[3].trim()})`

  if ((m = text.match(/\bsum\s+of\s+(.+?)\s+from\s+([a-zA-Z])\s*=\s*(.+?)\s+to\s+(.+)$/i)))
    return `sumseq(${m[1].trim()}, ${m[2]}, ${m[3].trim()}, ${m[4].trim()})`
  if ((m = text.match(/\bsum\s+from\s+([a-zA-Z])\s*=\s*(.+?)\s+to\s+(.+?)\s+of\s+(.+)$/i)))
    return `sumseq(${m[4].trim()}, ${m[1]}, ${m[2].trim()}, ${m[3].trim()})`
  if ((m = text.match(/\bproduct\s+of\s+(.+?)\s+from\s+([a-zA-Z])\s*=\s*(.+?)\s+to\s+(.+)$/i)))
    return `prodseq(${m[1].trim()}, ${m[2]}, ${m[3].trim()}, ${m[4].trim()})`
  if ((m = text.match(/\bproduct\s+from\s+([a-zA-Z])\s*=\s*(.+?)\s+to\s+(.+?)\s+of\s+(.+)$/i)))
    return `prodseq(${m[4].trim()}, ${m[1]}, ${m[2].trim()}, ${m[3].trim()})`

  return null
}

// ── Domain restriction ──────────────────────────────────────────────────────
// "graph x^2 over [-10,10]" / "graph x^2 from -4 to 4" / "graph x^2 for
// -4 <= x <= 4" — Desmos restricts a graphed expression to a domain by
// appending "{cond}" (no default clause, unlike piecewise). MUST be tried
// after calculusFormal so "sum of i from i=1 to 10" etc. keep priority.

function domainRestrictFormal(rawText: string): string | null {
  const text = stripGraphVerb(rawText)
  let m: RegExpMatchArray | null

  if ((m = text.match(/^(.+?)\s+(?:over|on)\s+(?:the\s+interval\s+)?\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]$/i)))
    return `restrict(${m[1].trim()},${m[2]}<=x<=${m[3]})`
  if ((m = text.match(/^(.+?)\s+from\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)$/i)))
    return `restrict(${m[1].trim()},${m[2]}<=x<=${m[3]})`
  if ((m = text.match(/^(.+?)\s+for\s+(.+)$/i))) {
    const [, expr, condRaw] = m
    // "X for COND else Y" is a piecewise with a default branch, not a plain
    // domain restriction — bail here (rather than swallowing "else Y" raw
    // into the condition text) so it falls through to piecewiseFormal below.
    if (/\belse\b/i.test(condRaw)) return null
    const betweenM = condRaw.match(/^\s*x\s+is\s+between\s+(.+?)\s+and\s+(.+)$/i)
    if (betweenM) return `restrict(${expr.trim()},${betweenM[1].trim()}<x<${betweenM[2].trim()})`
    const cond = convertComparisonWordsFull(condRaw)
    if (hasComparator(cond)) return `restrict(${expr.trim()},${cond.trim()})`
  }
  return null
}

// ── Intersection ─────────────────────────────────────────────────────────────
// "intersection of x^2 and y=6" — Desmos has no intersection() function; the
// most useful scriptable equivalent is graphing both curves (so it's visible)
// plus solving for where they're equal.

function intersectionFormal(text: string): string | null {
  const m = text.match(/\bintersection\s+(?:of|between)\s+(.+?)\s+and\s+(.+)$/i)
  if (!m) return null
  const stripY = (s: string) => s.trim().replace(/^y\s*=\s*/i, '')
  return `intersection(${stripY(m[1])},${stripY(m[2])})`
}

// ── Circles and other named conics ──────────────────────────────────────────
// "circle centered at (2,3) with radius 4" / "graph a circle centered at
// (2,3)" (radius defaults to 5 if omitted) / "unit circle".

function circleFormal(text: string): string | null {
  if (!/\bcircle\b/i.test(text)) return null
  // "area of a circle with radius 5" / "circumference of a circle with
  // radius 5" — a computed VALUE, not a request to graph the circle. Must be
  // checked first: both contain the word "circle", which the rest of this
  // function otherwise treats as a graphing trigger on its own.
  let measureM: RegExpMatchArray | null
  if ((measureM = text.match(/\b(area|circumference)\s+of\s+(?:a\s+|the\s+)?circle\s+(?:with\s+)?(?:a\s+)?radius\s+(?:of\s+)?(-?[\d.]+)/i))) {
    const [, measure, r] = measureM
    return measure.toLowerCase() === 'area' ? `pi*(${r})^2` : `2*pi*(${r})`
  }
  if (/\bunit\s+circle\b/i.test(text)) return 'equation(x^2+y^2=1)'
  const centerM = text.match(/center(?:ed)?\s*(?:at|=|:)?\s*(\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\))/i)
  // Fallback for the bare "circle at (2,3)" phrasing — no "center"/"centered"
  // word at all. Without this, the center silently defaulted to (0,0),
  // dropping the point the student actually gave.
  const bareAtM = text.match(/\bat\s*(\(\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\))/i)
  const radiusM = text.match(/radius\s+(?:of\s+)?(-?[\d.]+)/i)
  let h = '0', k = '0'
  if (centerM || bareAtM) {
    const p = [...(centerM ?? bareAtM)![1].matchAll(POINT_RE)][0]
    if (p) { h = p[1]; k = p[2] }
  }
  const r = radiusM ? radiusM[1] : '5'
  return `equation((x-(${h}))^2+(y-(${k}))^2=(${r})^2)`
}

// ── Equations with a comma-separated list of values ─────────────────────────
// "x=1,2,3" / "y = 2, 4, 6" — a list-valued equation, graphing one line per
// value (Desmos accepts a list on either side of "=").

function varEqualsListFormal(text: string): string | null {
  const m = text.match(/^\s*([a-zA-Z])\s*=\s*(-?[\d.]+(?:\s*,\s*-?[\d.]+)+)\s*$/)
  if (!m) return null
  const values = numbersIn(m[2]).join(',')
  return `equation(${m[1]}=[${values}])`
}

// ── Sliders ───────────────────────────────────────────────────────────────────
// "add a slider for a" — the way you make a slider in Desmos is just defining
// the bare variable as its own expression ("a=1"); Desmos recognizes that as a
// slider automatically (as long as the letter isn't used as a function name
// elsewhere) and renders the draggable UI for it. Needed for parameterized
// graphs like "ax^2" — Desmos won't auto-add the slider for "a" on its own,
// you have to define it.

// "add a slider for a" / "...with value of 3" / "...from -5 to 5" /
// "...from -5 to 5 with step 0.5" — pieces are found independently rather
// than with one giant regex, since a student can include any subset of them
// in roughly any order. min/max/step (when given) become the expression's
// real Desmos slider bounds, not just an initial value.
function sliderFormal(text: string): string | null {
  let letterM = text.match(/\bslider\s+(?:for|named|called)\s+([a-zA-Z])\b/i)
  if (!letterM) letterM = text.match(/\bslider\s+([a-zA-Z])\s*$/i)
  if (!letterM) return null
  const letter = letterM[1]

  const valueM = text.match(/(?:with\s+(?:a\s+)?value\s+of|with\s+value|starting\s+at|starting\s+from|equal\s+to|set\s+to|=)\s*(-?[\d.]+)/i)
  const rangeM = text.match(/\bfrom\s+(-?[\d.]+)\s+to\s+(-?[\d.]+)/i)
  const stepM = text.match(/\bstep(?:\s+(?:of|size))?\s+(-?[\d.]+)/i)

  const value = valueM ? valueM[1] : (rangeM ? rangeM[1] : '1')
  const parts = [letter, value]
  if (rangeM) {
    parts.push(rangeM[1], rangeM[2])
    if (stepM) parts.push(stepM[1])
  }
  return `slider(${parts.join(',')})`
}

// ── Geometry ───────────────────────────────────────────────────────────────────

const POINT_RE = /\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)/g

// A point argument is either a literal "(a,b)" coordinate pair, or (falling
// back) a raw sub-expression — e.g. a named point variable like "P" — spliced
// through for formalToDesmos.ts's parser to resolve.
function pointArg(text: string): string {
  const pts = [...text.matchAll(POINT_RE)]
  if (pts.length > 0) return `(${pts[0][1]}, ${pts[0][2]})`
  return text.trim()
}

// Vertices for a "... with vertices (0,0), (3,0), (3,4)" phrasing — shared by
// the polygon-graphing branch below and the new area/perimeter recognizers.
function verticesIn(text: string): { x: string; y: string }[] {
  return [...text.matchAll(POINT_RE)].map(p => ({ x: p[1], y: p[2] }))
}

// Shoelace formula — exact (no JS floats; Desmos does the arithmetic), works
// for any simple polygon given in order, triangle included.
function polygonAreaExpr(pts: { x: string; y: string }[]): string {
  const terms = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]
    return `(${p.x})*(${q.y})-(${q.x})*(${p.y})`
  })
  return `abs(${terms.join('+')})/2`
}

function polygonPerimeterExpr(pts: { x: string; y: string }[]): string {
  const terms = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length]
    return `distance((${p.x},${p.y}),(${q.x},${q.y}))`
  })
  return terms.join('+')
}

function geometryFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\b(x|y)[\s-]coordinate\s+of\s+(.+)$/i)))
    return `${pointArg(m[2])}.${m[1].toLowerCase()}`
  if ((m = text.match(/\bmidpoint\s+(?:of|between)\s+(.+?)\s+and\s+(.+)$/i)) ||
      (m = text.match(/\bmidpoint\s+of\s+the\s+segment\s+from\s+(.+?)\s+to\s+(.+)$/i)))
    return `midpoint(${pointArg(m[1])}, ${pointArg(m[2])})`
  if ((m = text.match(/\bdistance\s+(?:between|from)\s+(.+?)\s+(?:and|to)\s+(.+)$/i)) ||
      (m = text.match(/\blength\s+of\s+the\s+segment\s+from\s+(.+?)\s+to\s+(.+)$/i)))
    return `distance(${pointArg(m[1])}, ${pointArg(m[2])})`
  if ((m = text.match(/\bhypotenuse\s+(?:of\s+(?:a\s+)?(?:right\s+triangle\s+with\s+)?legs?\s+)?(.+?)\s+and\s+(.+)$/i)))
    return `hypot(${m[1].trim()}, ${m[2].trim()})`

  // Vector ops — a plain "(a,b)" point doubles as a 2D vector from the
  // origin. Tried before the generic polygon/coordinate patterns below since
  // "vector" isn't one of their trigger words, so there's no collision.
  if ((m = text.match(/\bdot\s+product\s+of\s+(.+?)\s+and\s+(.+)$/i))) {
    const p1 = [...m[1].matchAll(POINT_RE)][0], p2 = [...m[2].matchAll(POINT_RE)][0]
    if (!p1 || !p2) throw new UnsupportedFormalError('dot product needs two vectors as points, e.g. "dot product of (1,2) and (3,4)"')
    return `(${p1[1]})*(${p2[1]})+(${p1[2]})*(${p2[2]})`
  }
  if ((m = text.match(/\bunit\s+vector\s+of\s+(.+)$/i))) {
    const p = [...m[1].matchAll(POINT_RE)][0]
    if (!p) throw new UnsupportedFormalError('unit vector needs a vector as a point, e.g. "unit vector of (3,4)"')
    const [x, y] = [p[1], p[2]]
    const mag = `sqrt((${x})^2+(${y})^2)`
    return `((${x})/(${mag}),(${y})/(${mag}))`
  }

  // "area/perimeter of a triangle/polygon with vertices (0,0), (3,0), (3,4)"
  // — a computed VALUE, not a request to graph the shape. Tried before the
  // bare "polygon" graphing branch below, which otherwise treats any mention
  // of "polygon" as a graphing trigger regardless of what's actually asked.
  if (/\b(?:area|perimeter)\s+of\s+(?:a\s+|the\s+)?(?:triangle|polygon|quadrilateral|rectangle)\b/i.test(text)) {
    const wantsArea = /\barea\b/i.test(text)
    const pts = verticesIn(text)
    if (pts.length < 3) throw new UnsupportedFormalError(`${wantsArea ? 'area' : 'perimeter'} needs at least 3 vertices, e.g. "area of a triangle with vertices (0,0), (4,0), (0,3)"`)
    return wantsArea ? polygonAreaExpr(pts) : polygonPerimeterExpr(pts)
  }
  if (/\bpolygon\b/i.test(text)) {
    const pairs = [...text.matchAll(POINT_RE)]
    if (pairs.length < 3) throw new UnsupportedFormalError('polygon needs at least 3 points, e.g. "polygon (0,0), (3,4), (4,2)"')
    return `polygon(${pairs.map(p => `(${p[1]}, ${p[2]})`).join(', ')})`
  }
  return null
}

// "graph the line through (1,2) and (3,4)" — computed with real Desmos
// arithmetic (division produces \frac{}{}) rather than pre-divided in JS, so
// it stays an exact fraction instead of a rounded decimal. A vertical line
// (equal x-coordinates) becomes "x = h" instead of dividing by zero.
function lineThroughFormal(text: string): string | null {
  const m = text.match(/\bline\s+(?:through|between|connecting)\s+(.+?)\s+and\s+(.+)$/i)
  if (!m) return null
  const p1 = [...m[1].matchAll(POINT_RE)][0]
  const p2 = [...m[2].matchAll(POINT_RE)][0]
  if (!p1 || !p2) throw new UnsupportedFormalError('line through needs two points, e.g. "line through (1,2) and (3,4)"')
  const [x1, y1, x2, y2] = [p1[1], p1[2], p2[1], p2[2]]
  if (x1 === x2) return `equation(x=${x1})`
  return `equation(y-(${y1})=(${y2}-${y1})/(${x2}-${x1})*(x-(${x1})))`
}

// "line with slope 2 through (1,3)" (point-slope form) / "equation of a line
// with slope 2 and y-intercept 3" (slope-intercept form). Distinct trigger
// word ("slope") from lineThroughFormal above, so no ordering conflict.
function lineSlopeFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\bline\s+with\s+(?:a\s+)?slope\s+(?:of\s+)?(-?[\d.]+)\s+(?:and\s+)?(?:through|passing\s+through)\s+(.+)$/i))) {
    const [, slope, ptText] = m
    const p = [...ptText.matchAll(POINT_RE)][0]
    if (!p) throw new UnsupportedFormalError('line with a slope needs a point, e.g. "line with slope 2 through (1,3)"')
    return `equation(y-(${p[2]})=(${slope})*(x-(${p[1]})))`
  }
  if ((m = text.match(/\bline\s+with\s+(?:a\s+)?slope\s+(?:of\s+)?(-?[\d.]+)\s+and\s+(?:a\s+)?y[\s-]?intercept\s+(?:of\s+)?(-?[\d.]+)/i)))
    return `equation(y=(${m[1]})*x+(${m[2]}))`
  return null
}

// ── Regression — phrasings Ninebark's own REG2 grammar doesn't cover ───────
// Ninebark already handles "linear regression of 1,2,3 and 4,5,6" natively
// (tier 2) — this covers the shapes it doesn't: separate labeled x/y lists,
// and a list of points. Both produce the exact same "linReg({xs},{ys})"
// formal shape Ninebark's own grammar emits, so they flow through the same
// tryParseRegression() table + equation output with no parser changes needed.
const REGRESSION_TYPE_WORDS: Record<string, string> = {
  linear: 'linReg', quadratic: 'quadReg', cubic: 'cubicReg',
  logarithmic: 'lnReg', exponential: 'expReg', power: 'pwrReg',
  sinusoidal: 'sinReg', logistic: 'logistic',
}
function regressionTypeName(word: string | undefined): string {
  return REGRESSION_TYPE_WORDS[(word ?? '').toLowerCase()] ?? 'linReg'
}

// "linear regression with x values of 1,2,3 and y values of 4,5,6" /
// "regression with x values 1,2,3 and y values 4,5,6" (type word optional,
// "of"/":" after "values" optional).
function regressionValuesFormal(text: string): string | null {
  const m = text.match(
    /\b(?:(linear|quadratic|cubic|logarithmic|exponential|power|sinusoidal|logistic)\s+)?regression\s+(?:with|using|for)\s+x\s*(?:values?)?\s*(?:of|:|=)?\s*(.+?)\s+and\s+y\s*(?:values?)?\s*(?:of|:|=)?\s*(.+)$/i
  )
  if (!m) return null
  const [, typeWord, xsText, ysText] = m
  return `${regressionTypeName(typeWord)}(${listLiteral(xsText)},${listLiteral(ysText)})`
}

// "linear regression through (1,2), (2,4), (3,6)" — a list of points instead
// of two parallel lists. Falls through to null (not an error) when there
// aren't at least 2 points, so "regression of 1,2,3 and 4,5,6" — Ninebark's
// own supported list phrasing, which this pattern's "of" alternative would
// otherwise also match syntactically — correctly reaches tier 2 unclaimed.
function regressionPointsFormal(text: string): string | null {
  const m = text.match(/\b(?:(linear|quadratic|cubic|logarithmic|exponential|power|sinusoidal|logistic)\s+)?regression\s+(?:through|of|for)\s+(.+)$/i)
  if (!m) return null
  const pairs = [...m[2].matchAll(POINT_RE)]
  if (pairs.length < 2) return null
  const xs = pairs.map(p => p[1]).join(',')
  const ys = pairs.map(p => p[2]).join(',')
  return `${regressionTypeName(m[1])}({${xs}},{${ys}})`
}

// "the tangent line to x^2 at x=1" / "...at 1" — Desmos has no "evaluate the
// derivative at a point" one-liner, so this defines the function (needed so
// f(1) and f'(1) below have something to reference — Desmos genuinely
// supports naming a function this way, e.g. "f(x)=x^2" then "f'(1)") and the
// tangent line as a second expression: two Desmos expressions from one
// command, using the multi-output channel already built for regression.
function tangentLineFormal(text: string): string | null {
  const m = text.match(/\btangent(?:\s+line)?\s+to\s+(.+?)\s+at\s+(?:x\s*=\s*)?(-?[\d.]+)\s*$/i)
  if (!m) return null
  return `tangentline(${m[1].trim()},${m[2]})`
}

// ── Quadratics: vertex / axis of symmetry ────────────────────────────────────
// "vertex of x^2+2x+1" / "axis of symmetry of 2x^2-4x+3" — extracts a, b, c
// from standard form ax^2+bx+c (the overwhelmingly common way students write
// it) and lets Desmos do the actual arithmetic (exact fractions, not JS
// floats): vertex x = -b/(2a), y = the original expression evaluated there.

const QUADRATIC_RE = /^([+-]?\d*\.?\d*)x\^2\s*(?:([+-]\s*\d*\.?\d*)x)?\s*(?:([+-]\s*\d+\.?\d*))?$/i

// Strips a redundant leading "+" ("+2" -> "2") so spliced-in coefficients
// don't leave a stray unary-plus in the output — valid either way, but ugly.
function stripLeadingPlus(s: string): string {
  return s.startsWith('+') ? s.slice(1) : s
}

function coeffText(raw: string | undefined, bareValue: string): string {
  if (raw === undefined) return '0'
  const t = raw.replace(/\s+/g, '')
  if (t === '' || t === '+') return bareValue
  if (t === '-') return `-${bareValue}`
  return stripLeadingPlus(t)
}

function parseQuadraticCoeffs(expr: string): { a: string; b: string; c: string } | null {
  const m = QUADRATIC_RE.exec(expr.replace(/\s+/g, ''))
  if (!m) return null
  const a = coeffText(m[1], '1')
  const b = coeffText(m[2], '1')
  const c = coeffText(m[3], '0')
  if (a === '0') throw new UnsupportedFormalError(`"${expr.trim()}" has a zero leading coefficient — not a quadratic`)
  return { a, b, c }
}

// Strips leading descriptive filler ("the parabola", "the complex number", …)
// that a student naturally includes but that isn't part of the actual
// math content a downstream parser (quadratic coefficients, a+bi) expects.
function stripDescriptiveFiller(text: string, nouns: string[]): string {
  const re = new RegExp(`^\\s*(?:the\\s+)?(?:${nouns.join('|')})\\s+`, 'i')
  const stripped = text.replace(re, '').trim()
  return stripped || text.trim()
}

function vertexAxisFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  const QUADRATIC_FILLER = ['parabola', 'quadratic(?:\\s+equation)?', 'function', 'equation'
  ]
  if ((m = text.match(/\bvertex\s+of\s+(.+)$/i))) {
    const expr = stripDescriptiveFiller(m[1], QUADRATIC_FILLER)
    const coef = parseQuadraticCoeffs(expr)
    if (!coef) throw new UnsupportedFormalError(`couldn't read "${expr}" as a standard-form quadratic ax^2+bx+c`)
    const xv = `(-(${coef.b}))/(2*(${coef.a}))`
    return `(${xv},(${coef.a})*(${xv})^2+(${coef.b})*(${xv})+(${coef.c}))`
  }
  if ((m = text.match(/\baxis\s+of\s+symmetry\s+of\s+(.+)$/i))) {
    const expr = stripDescriptiveFiller(m[1], QUADRATIC_FILLER)
    const coef = parseQuadraticCoeffs(expr)
    if (!coef) throw new UnsupportedFormalError(`couldn't read "${expr}" as a standard-form quadratic ax^2+bx+c`)
    return `equation(x=(-(${coef.b}))/(2*(${coef.a})))`
  }
  return null
}

// ── Complex numbers ─────────────────────────────────────────────────────────
// Basic complex arithmetic ("3+4i", "(2+3i)*(1-i)") already works with zero
// extra code: "i" is just a single-letter identifier (like x, y, n, …) and
// Desmos treats bare "i" as the imaginary unit natively — implicit
// multiplication already renders "4i" correctly. What's missing is magnitude/
// conjugate/real/imaginary-part phrasing. Desmos's own complex-number function
// names aren't in the reference source used throughout this file, so rather
// than guess them, these are computed from primitives that ARE verified
// (sqrt, arithmetic) plus plain text manipulation of the real/imaginary
// coefficients — always correct regardless of what Desmos calls them
// internally. ("absolute value of 3+4i" still goes through Ninebark's own
// verified abs()/|·| — these use "magnitude"/"modulus" so they don't compete.)

function parseComplexNumber(text: string): { re: string; im: string } | null {
  const s = text.trim().replace(/\s+/g, '')
  let m = s.match(/^([+-]?\d*\.?\d*)([+-]\d*\.?\d*)i$/)
  if (m) {
    const re = m[1] === '' ? '0' : stripLeadingPlus(m[1])
    const im = m[2] === '+' ? '1' : m[2] === '-' ? '-1' : stripLeadingPlus(m[2])
    return { re, im }
  }
  m = s.match(/^([+-]?\d*\.?\d*)i$/)
  if (m) {
    const im = m[1] === '' || m[1] === '+' ? '1' : m[1] === '-' ? '-1' : stripLeadingPlus(m[1])
    return { re: '0', im }
  }
  if (/^-?\d+\.?\d*$/.test(s)) return { re: stripLeadingPlus(s), im: '0' }
  return null
}

function negateNumText(n: string): string {
  return n.startsWith('-') ? n.slice(1) : `-${n}`
}

const COMPLEX_FILLER = ['complex\\s+number', 'number']

function complexFormal(text: string): string | null {
  let m: RegExpMatchArray | null
  if ((m = text.match(/\b(?:magnitude|modulus)\s+of\s+(.+)$/i))) {
    // "magnitude of the vector (3,4)" — same formula as a complex number's
    // magnitude (sqrt(x^2+y^2)), but expressed as a point, not "a+bi". Check
    // for that shape FIRST: without this, it fell through to
    // parseComplexNumber(), which doesn't understand "(3,4)" syntax at all
    // and threw a confusing "as a complex number a+bi" error.
    const vec = [...m[1].matchAll(POINT_RE)][0]
    if (vec) return `sqrt((${vec[1]})^2+(${vec[2]})^2)`
    const expr = stripDescriptiveFiller(m[1], COMPLEX_FILLER)
    const c = parseComplexNumber(expr)
    if (!c) throw new UnsupportedFormalError(`couldn't read "${expr}" as a complex number a+bi`)
    return `sqrt((${c.re})^2+(${c.im})^2)`
  }
  if ((m = text.match(/\bconjugate\s+of\s+(.+)$/i))) {
    const expr = stripDescriptiveFiller(m[1], COMPLEX_FILLER)
    const c = parseComplexNumber(expr)
    if (!c) throw new UnsupportedFormalError(`couldn't read "${expr}" as a complex number a+bi`)
    return `(${c.re})+(${negateNumText(c.im)})i`
  }
  if ((m = text.match(/\breal\s+part\s+of\s+(.+)$/i))) {
    const expr = stripDescriptiveFiller(m[1], COMPLEX_FILLER)
    const c = parseComplexNumber(expr)
    if (!c) throw new UnsupportedFormalError(`couldn't read "${expr}" as a complex number a+bi`)
    return c.re
  }
  if ((m = text.match(/\bimaginary\s+part\s+of\s+(.+)$/i))) {
    const expr = stripDescriptiveFiller(m[1], COMPLEX_FILLER)
    const c = parseComplexNumber(expr)
    if (!c) throw new UnsupportedFormalError(`couldn't read "${expr}" as a complex number a+bi`)
    return c.im
  }
  return null
}

// Plain complex arithmetic ("3+4i", "(2+3i)*(1-i)") needs no dedicated
// recognizer to WORK — "i" is just a single-letter identifier our own parser
// already handles like x, y, n, … But Ninebark's tier-2 grammar has no concept
// of "i" at all, and per its lenient "drop what it doesn't recognize" design
// (see the module-level comment up top), it silently drops the bare "i" token
// and turns "3+4i" into "3+4" — losing the imaginary part entirely, with no
// error to signal it. Caught here, narrowly: only strings that are ALREADY
// pure arithmetic-with-i syntax (digits/operators/parens/i, nothing else) are
// routed straight to the raw-syntax parser, bypassing Ninebark's tier 2
// entirely so it never gets the chance to eat the "i". Anything with other
// words ("sum of i from i=1 to 10", "for i in...") fails the character-class
// check and is left completely alone.
function complexArithmeticFormal(text: string): string | null {
  const t = text.trim()
  if (!/i/.test(t)) return null
  if (!/^[0-9+\-*/^().\si]+$/.test(t)) return null
  return t
}

// ── Polar ────────────────────────────────────────────────────────────────────

function polarFormal(text: string): string | null {
  const m = text.match(/^\s*r\s*(?:=|equals)\s*(.+)$/i)
  if (!m) return null
  return `equation(r=${m[1].trim()})`
}

// ── Trig: amplitude / period ─────────────────────────────────────────────────
// Only the common single-term case — "A*sin(B*x)"/"A*cos(B*x)" (A, B
// optional, default 1) — the overwhelmingly common way students write it, the
// same narrow-but-useful approach as the quadratic vertex parser above.
// Anything else (sums of terms, a phase shift, a bound variable other than
// x) doesn't match and falls through rather than guessing.
const AMP_PERIOD_RE = /^(-?\d*\.?\d*)\s*\*?\s*(?:sin|cos)\s*\(\s*(-?\d*\.?\d*)\s*\*?\s*x\s*\)$/i

function trigMeasureFormal(text: string): string | null {
  const m = text.match(/\b(amplitude|period)\s+of\s+(.+)$/i)
  if (!m) return null
  const [, measure, exprRaw] = m
  const em = AMP_PERIOD_RE.exec(exprRaw.trim().replace(/\s+/g, ''))
  if (!em) throw new UnsupportedFormalError(`couldn't read "${exprRaw.trim()}" as A*sin(B*x) or A*cos(B*x)`)
  const [, aRaw, bRaw] = em
  const a = aRaw === '' || aRaw === '+' ? '1' : aRaw === '-' ? '-1' : aRaw
  const b = bRaw === '' || bRaw === '+' ? '1' : bRaw === '-' ? '-1' : bRaw
  return measure.toLowerCase() === 'amplitude' ? `abs(${a})` : `2*pi/abs(${b})`
}

// ── Comparison-word conversion (shared by piecewise conditions and the
//    standalone inequality recognizer below) ─────────────────────────────────
//
// "Strong" forms are unambiguous — they never collide with Ninebark's own
// "5 less than x" (= x−5) arithmetic idiom, because that idiom never uses
// "is", "or equal to", "at least/most", or "not equal to". Safe to convert
// anywhere, anytime.
function convertComparisonWordsStrong(text: string): string {
  return text
    .replace(/\b(?:is\s+)?less\s+than\s+or\s+equal\s+to\b|\b(?:is\s+)?at\s+most\b|\b(?:is\s+)?no\s+more\s+than\b/gi, ' <= ')
    .replace(/\b(?:is\s+)?greater\s+than\s+or\s+equal\s+to\b|\b(?:is\s+)?at\s+least\b|\b(?:is\s+)?no\s+less\s+than\b/gi, ' >= ')
    .replace(/\bis\s+not\s+equal\s+to\b|\bdoes\s+not\s+equal\b|\bis\s+different\s+from\b|\bnot\s+equal\s+to\b/gi, ' != ')
    .replace(/\bis\s+less\s+than\b/gi, ' < ')
    .replace(/\bis\s+greater\s+than\b/gi, ' > ')
    // Any leftover bare copula ("x is 5", stray "is"/"are" not consumed by the
    // patterns above) would otherwise glom onto an adjacent token via
    // implicit multiplication (e.g. "xis5") — strip it as a last resort.
    .replace(/\b(?:is|are)\b/gi, ' ')
}
// "Full" additionally converts the *bare* "less than"/"greater than" idiom —
// only safe where the text is already known to be a condition/relation (a
// piecewise condition clause, or a phrase with an explicit graph verb).
function convertComparisonWordsFull(text: string): string {
  return convertComparisonWordsStrong(text)
    .replace(/\bless\s+than\b/gi, ' < ')
    .replace(/\bgreater\s+than\b/gi, ' > ')
    .replace(/\bis\s+equal\s+to\b|\bequals\b/gi, ' = ')
}
function hasComparator(text: string): boolean {
  return /<=|>=|!=|[<>]/.test(text)
}

// ── Piecewise / conditional expressions ────────────────────────────────────────
// Conditions are spliced raw and parsed by formalToDesmos.ts's comparison-chain
// support (so "x < 0", "2 < x < 6", "x >= 0" all work as written) — worded
// conditions ("x is greater than 0") are converted to symbols first.

function piecewiseFormal(rawText: string): string | null {
  const text = stripGraphVerb(rawText)
  let m: RegExpMatchArray | null

  const branch = (cond: string, val: string, dflt?: string) => {
    const c = convertComparisonWordsFull(cond).trim()
    return dflt !== undefined
      ? `piecewise(${c}:${val.trim()},${dflt.trim()})`
      : `piecewise(${c}:${val.trim()})`
  }

  // "if X then A otherwise/else B" / "if X then A"
  if ((m = text.match(/^\s*if\s+(.+?)\s+then\s+(.+?)(?:\s*,?\s*(?:otherwise|else)\s+(.+))?$/i)))
    return branch(m[1], m[2], m[3])
  // "A when X otherwise/else B" / "A when X"
  if ((m = text.match(/^\s*(.+?)\s+when\s+(.+?)(?:\s*,?\s*(?:otherwise|else)\s+(.+))?$/i)))
    return branch(m[2], m[1], m[3])
  // "A if X else B" / "A if X"
  if ((m = text.match(/^\s*(.+?)\s+if\s+(.+?)(?:\s*,?\s*else\s+(.+))?$/i)))
    return branch(m[2], m[1], m[3])
  // "A for X else B" / "A for X" — domainRestrictFormal (tried before this)
  // already handles the plain "A for X" case; it deliberately bails when it
  // sees a trailing "else" so that shape lands here instead, with a real
  // default branch instead of "else B" garbled into the condition text.
  if ((m = text.match(/^\s*(.+?)\s+for\s+(.+?)\s*,?\s*else\s+(.+)$/i)))
    return branch(m[2], m[1], m[3])
  return null
}

// ── Inequalities / relations (not conditional — a standalone graphable
//    relation, e.g. "graph x <= 5", "y is greater than x^2") ────────────────
//
// See the big comment at the top of this file: bare "X less than Y" without
// an explicit graph verb is deliberately left alone (returns null) so it
// falls through to Ninebark's "5 less than x" = (x−5) arithmetic idiom.

function inequalityFormal(rawText: string): string | null {
  const hasGraphVerb = GRAPH_VERB_RE.test(rawText)
  const text = stripGraphVerb(rawText)

  // "X is between A and B" → A < X < B
  const betweenM = text.match(/^(.+?)\s+is\s+between\s+(.+?)\s+and\s+(.+)$/i)
  if (betweenM) return `${betweenM[2].trim()}<${betweenM[1].trim()}<${betweenM[3].trim()}`

  const strong = convertComparisonWordsStrong(text)
  if (hasComparator(strong)) return strong.trim()

  if (hasGraphVerb) {
    const full = convertComparisonWordsFull(text)
    if (hasComparator(full)) return full.trim()
  }
  return null
}

// ── Percent-of ──────────────────────────────────────────────────────────────
// "12% of 25" / "12 percent of 25" → Desmos's literal N%of M token sequence.

function percentOfFormal(text: string): string | null {
  const m = text.match(/^\s*(.+?)\s*(?:%|percent)\s+of\s+(.+)$/i)
  if (!m) return null
  return `percentof(${m[1].trim()},${m[2].trim()})`
}

// "what percent of 50 is 10" → (10/50)*100. Must be tried BEFORE
// percentOfFormal: that pattern's greedy "(.+?) % of (.+)" would otherwise
// match "what" as the percent-value capture and glom "is 10" onto the
// remainder, producing garbage. Distinguished from percentOfFormal by having
// no literal "%"/"percent" token before "of" — it's a different question
// shape (find the percentage) rather than "find the value" or "N% of M".
function percentOfReverseFormal(text: string): string | null {
  const m = text.match(/^\s*what\s+percent(?:age)?\s+of\s+(.+?)\s+is\s+(.+)$/i)
  if (!m) return null
  return `((${m[2].trim()})/(${m[1].trim()}))*100`
}

// ── Misc single-word Desmos constants ─────────────────────────────────────────

function miscConstantFormal(text: string): string | null {
  if (/^\s*trig(?:onometric)?\s+angle\s+multiplier\s*$/i.test(text)) return 'trigAngleMultiplier'
  return null
}

// ── Entry point ────────────────────────────────────────────────────────────────

export function recognizeDesmosPhrase(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const text = stripFiller(trimmed)

  return (
    distributionAccessorFormal(text) ??
    // Tried before distributionFormal: "5 random numbers from a normal
    // distribution..." contains "normal distribution" as a substring, which
    // distributionFormal would otherwise match first and return standalone
    // (dropping the "5 random numbers from" part entirely).
    randomFormal(text) ??
    distributionFormal(text) ??
    numberTheoryFormal(text) ??
    statsGapFormal(text) ??
    listOpsFormal(text) ??
    tableFormal(text) ??
    vizFormal(text) ??
    calculusFormal(text) ??
    tangentLineFormal(text) ??
    vertexAxisFormal(text) ??
    complexFormal(text) ??
    complexArithmeticFormal(text) ??
    // sliderFormal MUST come before domainRestrictFormal: its generic
    // "EXPR from A to B" pattern would otherwise swallow "add a slider for a
    // from -5 to 5" whole (a bare number-to-number tail is all it checks for).
    sliderFormal(text) ??
    // Tried after calculusFormal (so "sum of i from i=1 to 10" etc. keep
    // priority) and before piecewise/inequality (so "graph x^2 for x > 0"
    // is read as a domain restriction, not a bare relation).
    domainRestrictFormal(text) ??
    geometryFormal(text) ??
    lineThroughFormal(text) ??
    lineSlopeFormal(text) ??
    trigMeasureFormal(text) ??
    // Tried before circleFormal/intersectionFormal: "regression" phrasings
    // don't overlap those patterns, but keeping regression together with the
    // other stats-flavored recognizers above would risk future collisions —
    // safer here, right after the geometry block.
    regressionValuesFormal(text) ??
    regressionPointsFormal(text) ??
    circleFormal(text) ??
    intersectionFormal(text) ??
    varEqualsListFormal(text) ??
    percentOfReverseFormal(text) ??
    percentOfFormal(text) ??
    miscConstantFormal(text) ??
    polarFormal(text) ??
    piecewiseFormal(text) ??
    inequalityFormal(text)
  )
}
