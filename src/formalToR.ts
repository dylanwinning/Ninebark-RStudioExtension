// ── formal string → R expression ───────────────────────────────────────────
//
// Same formal-string dialect Ninebark-DesmosExtension's formalToDesmos.ts
// converts to LaTeX, Ninebark-SheetsExtension's formalToSheets.ts converts to
// a spreadsheet formula, and Ninebark-MATLABExtension's formalToMatlab.ts
// converts to a MATLAB expression — reused here via the vendored
// vendor/ninebark-engine/formalStringTokenizer.ts's shared tokenize() — but
// rendered as an ordinary R expression ("mean(c(1, 2, 3))") instead.
//
// This is a SEPARATE precedence-climbing parser, not a shared one with a
// swappable renderer — same reasoning as every prior converter: interleaving
// target-syntax construction into every precedence level makes a shared
// parser+renderer split the higher-risk trade for a small, stable grammar.
// Duplicating the skeleton here is cheaper.
//
// R turns out to be a genuinely MORE expressive target than MATLAB for parts
// of the shared vocabulary, not less — noted inline wherever it changes the
// MATLAB converter's precedent:
//   - R's cov(x, y) / cor(x, y) return a plain scalar for two numeric
//     vectors (MATLAB's cov() returns the full 2×2 matrix, which is why
//     formalToMatlab.ts rejects it) — supported here.
//   - which.max/which.min are real single-call R functions (MATLAB's
//     argmax/argmin need a second output, [~,i]=max(x), not expressible
//     inline — formalToMatlab.ts rejects them; R doesn't need to).
//   - sample(x) shuffles in one call (MATLAB needs a temp variable).
//   - hist()/boxplot()/stripchart() are complete, valid R STATEMENTS (not
//     "a single value") — R's console model runs any statement, so unlike
//     Sheets (a cell needs one value) or MATLAB's formalToMatlab.ts (which
//     rejects these as "not a single value, try plotting instead" because
//     its whole converter target is a single expression), there's no reason
//     to reject them here at all.
// And genuinely LESS expressive in one big way: R ships with no base-package
// symbolic algebra solver (no Symbolic Math Toolbox equivalent) — `solve(...)`
// is rejected with that explained, pointing at uniroot()/polyroot() as the
// manual alternative, and `simplify`/`expand`/Taylor-series formal calls (the
// shared vocab doesn't currently emit these as their own formal names, but
// the guard below still names them explicitly so the message is right if it
// ever does) are rejected the same way.
//
// R identifier and reciprocal-trig gaps checked against R's own base/stats
// documentation (`?Trig`, `?Special`, `?choose`, `?quantile`, …) — anything
// base R has no clean single-expression form for is rejected with a specific
// reason rather than guessed.
import { tokenize, CONSTANTS, type Token } from './vendor/ninebark-engine/formalStringTokenizer'

export class UnsupportedRFormalError extends Error {}

const PREC_ADD = 1
const PREC_MUL = 2
const PREC_UNARY = 3
const PREC_POW = 4
const PREC_ATOM = 5

interface Val { text: string; prec: number }

// Ninebark's internal fnN canonical names → this dialect's own canonical
// names, identical to every other converter's NINEBARK_NAME_REMAP so all
// converters agree on what a given formal name "really" means.
const NINEBARK_NAME_REMAP: Record<string, string> = {
  stdDev: 'stdev', popStdDev: 'stdevp', variance: 'var', sum: 'total', oneVarStats: 'stats',
  popVariance: 'varp', count: 'length', corrCoef: 'corr',
}

// formal name (post-remap) → real base-R function, same argument order. Only
// names verified against base R / the `stats` package (both ship with every
// R install — no CRAN package required); anything else falls through to the
// "not supported" error in renderCall.
const R_FN_MAP: Record<string, string> = {
  mean: 'mean', median: 'median',
  var: 'var',           // sample variance, N-1 denominator — matches Ninebark `variance`
  total: 'sum', length: 'length', min: 'min', max: 'max',
  sort: 'sort', unique: 'unique',
  factorial: 'factorial', sign: 'sign',
  sin: 'sin', cos: 'cos', tan: 'tan',
  asin: 'asin', acos: 'acos', atan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  asinh: 'asinh', acosh: 'acosh', atanh: 'atanh',
  exp: 'exp', abs: 'abs', sqrt: 'sqrt', floor: 'floor', round: 'round',
  iqr: 'IQR', IQR: 'IQR', mad: 'mad',
  argmax: 'which.max', argmin: 'which.min',
  shuffle: 'sample',
  cor: 'cor',
}

// Names with no direct R function but a clean closed-form single expression —
// rendered by hand in renderCall rather than listed in R_FN_MAP, because they
// need more than "wrap the args in fn(...)".
// (kept as documentation of intent; renderCall implements each one directly)

// Names the base-R + stats reference has no clean single-expression
// equivalent for (or whose semantics differ too much to translate
// mechanically) — listed explicitly so renderCall's error message can say
// WHY, not just "no".
const KNOWN_UNSUPPORTED: Record<string, string> = {
  mode: "R's mode() is a different builtin (an object's storage type, e.g. \"numeric\") — statistical mode has no base-R function; base::table(x) plus which.max is the usual manual route.",
  range: "R's range(x) returns c(min(x), max(x)), not the spread max−min — use max(x)-min(x) for the spread.",
  gcd: "base R has no built-in gcd — it needs a short recursive helper function, not expressible inline.",
  lcm: "base R has no built-in lcm — it needs a short helper (lcm(a,b) = a*b/gcd(a,b)), not expressible inline.",
  quartile: "handled directly — see below.",
  Q1: "handled directly — see below.",
  Q3: "handled directly — see below.",
  nPr: "handled directly — see below.",
  nCr: "handled directly — see below.",
  stdev: "handled directly — see below.",
  stdevp: "handled directly — see below.",
  varp: "handled directly — see below.",
  covp: "handled directly — see below.",
  cov: "handled directly — see below.",
  spearman: "handled directly — see below.",
  corr: "handled directly — see below.",
  hypot: "handled directly — see below.",
  cbrt: "handled directly — see below.",
  nthroot: "handled directly — see below.",
  ln: "handled directly — see below.",
  log: "handled directly — see below.",
  ceil: "handled directly — see below.",
  logbase: "handled directly — see below.",
  csc: "handled directly — see below.", sec: "handled directly — see below.", cot: "handled directly — see below.",
  acsc: "handled directly — see below.", asec: "handled directly — see below.", acot: "handled directly — see below.",
  csch: "handled directly — see below.", sech: "handled directly — see below.", coth: "handled directly — see below.",
  acsch: "handled directly — see below.", asech: "handled directly — see below.", acoth: "handled directly — see below.",
  erf: "handled directly — see below.",
  midpoint: "handled directly — see below.", distance: "handled directly — see below.",
  repeat: "handled directly — see below.", join: "handled directly — see below.",
  histogram: "handled directly — see below.", dotplot: "handled directly — see below.", boxplot: "handled directly — see below.",
  quantile: "handled directly — see below.",
  ttest: "R's t.test(x, mu=…) returns a full htest object with a different call shape than a single-value formula — run it as raw R (\"t.test(x, mu = 0)\") instead.",
  ittest: "R's t.test(x, y) (two-sample) returns a full htest object with a different call shape — run it as raw R (\"t.test(x, y)\") instead.",
  tscore: "there's no single-argument t-score function in base R for this shape.",
  random: "R's rnorm/runif/sample/rbinom take different arguments depending on the distribution — not mapped for every shape yet; try one of those directly as raw R.",
  polygon: "polygons are a graphing feature — R has no single-statement equivalent.",
  rgb: "colors aren't an R value here.",
  hsv: "colors aren't an R value here.",
  polyGamma: "R's polygamma-family function (psi) lives in the CRAN `pracma` package, not base R — not mapped.",
}

// Distribution accessor: "<dist>(params).pdf(x)" / ".cdf(x)" / ".inversecdf(p)".
// Desmos-arg-order → R's d/p/q distribution-function stems (the stats
// package's own naming convention: d = density/pmf, p = CDF, q = inverse
// CDF/quantile — ships with every R install, no package needed).
//
// Exported (not just used internally by renderDistAccessor below) so
// rPlotting.ts's "plot a normal distribution with mean 0 and sd 1" can
// reuse the exact same name -> {stem, nparams, discrete} mapping rather
// than maintaining a second copy that could drift out of sync — single
// source of truth for "what distributions does Ninebark know about and
// what R stem/arity does each one have."
export const DISTRIBUTIONS: Record<string, { stem: string; nparams: number; discrete: boolean }> = {
  normaldist: { stem: 'norm', nparams: 2, discrete: false },      // (mean, sd)
  tdist: { stem: 't', nparams: 1, discrete: false },              // (df)
  chisqdist: { stem: 'chisq', nparams: 1, discrete: false },      // (df)
  binomialdist: { stem: 'binom', nparams: 2, discrete: true },    // (size, prob)
  poissondist: { stem: 'pois', nparams: 1, discrete: true },      // (lambda)
  uniformdist: { stem: 'unif', nparams: 2, discrete: false },     // (min, max)
  geodist: { stem: 'geom', nparams: 1, discrete: true },          // (prob) — R counts FAILURES before the first success
}

class RFormalParser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  private peek(offset = 0): Token | undefined { return this.tokens[this.pos + offset] }
  private next(): Token {
    const t = this.tokens[this.pos]
    if (!t) throw new UnsupportedRFormalError('Input not recognized.')
    this.pos++
    return t
  }
  private isSym(t: Token | undefined, value: string): boolean {
    return !!t && t.type === 'SYM' && t.value === value
  }
  private expectSym(value: string): void {
    const t = this.next()
    if (t.type !== 'SYM' || t.value !== value) {
      throw new UnsupportedRFormalError(`Expected '${value}' but found '${t.value}'.`)
    }
  }

  parseTopLevel(): string {
    const result = this.parseCompareChain()
    if (this.pos !== this.tokens.length) {
      throw new UnsupportedRFormalError(`Unexpected '${this.peek()?.value}' after a complete expression.`)
    }
    return result.text
  }

  private wrap(v: Val, minPrec: number, strict: boolean): string {
    const needsWrap = strict ? v.prec <= minPrec : v.prec < minPrec
    return needsWrap ? `(${v.text})` : v.text
  }

  private comparatorText(t: Token | undefined): string | null {
    if (!t || t.type !== 'SYM') return null
    switch (t.value) {
      case '<=': return '<='
      case '>=': return '>='
      case '!=': case '<>': return '!=' // R spells "not equal" the ordinary way, unlike MATLAB's ~=
      case '<': return '<'
      case '>': return '>'
      case '=': return '==' // a bare "=" in a formal comparison is equality in R too
      default: return null
    }
  }

  private parseCompareChain(): Val {
    const first = this.parseAddSub()
    const cmp = this.comparatorText(this.peek())
    if (cmp === null) return first
    this.next()
    const rhs = this.parseAddSub()
    if (this.comparatorText(this.peek()) !== null) {
      throw new UnsupportedRFormalError('chained comparisons ("2 < x < 6") are a graphing feature — not something a single R expression can express.')
    }
    return { text: `${first.text}${cmp}${rhs.text}`, prec: PREC_ATOM }
  }

  private parseAddSub(): Val {
    let left = this.parseMulDiv()
    for (;;) {
      const t = this.peek()
      if (this.isSym(t, '+') || this.isSym(t, '-')) {
        this.next()
        const right = this.parseMulDiv()
        const l = this.wrap(left, PREC_ADD, false)
        const r = this.wrap(right, PREC_ADD, true)
        left = { text: `${l}${t!.value}${r}`, prec: PREC_ADD }
      } else break
    }
    return left
  }

  private startsPrimary(t: Token | undefined): boolean {
    if (!t) return false
    if (t.type === 'NUM' || t.type === 'NAME') return true
    return t.type === 'SYM' && (t.value === '(' || t.value === '{' || t.value === '[')
  }

  private parseMulDiv(): Val {
    let left = this.parseUnary()
    for (;;) {
      const t = this.peek()
      if (this.isSym(t, '*') || this.isSym(t, '/')) {
        this.next()
        const right = this.parseUnary()
        const l = this.wrap(left, PREC_MUL, false)
        const r = this.wrap(right, PREC_MUL, true)
        left = { text: `${l}${t!.value}${r}`, prec: PREC_MUL }
      } else if (this.startsPrimary(t)) {
        // Implicit multiplication ("2n", "2(n+1)") — R has no such thing, an
        // explicit "*" is required.
        const right = this.parseUnary()
        const l = this.wrap(left, PREC_MUL, false)
        const r = this.wrap(right, PREC_MUL, true)
        left = { text: `${l}*${r}`, prec: PREC_MUL }
      } else break
    }
    return left
  }

  private parseUnary(): Val {
    const t = this.peek()
    if (this.isSym(t, '+') || this.isSym(t, '-')) {
      this.next()
      const operand = this.parseUnary()
      return { text: `${t!.value}${this.wrap(operand, PREC_UNARY, true)}`, prec: PREC_UNARY }
    }
    return this.parsePower()
  }

  private parsePower(): Val {
    const base = this.parsePostfixPrimary()
    if (this.isSym(this.peek(), '^')) {
      this.next()
      const exp = this.parseUnary()
      const baseText = this.wrap(base, PREC_POW, false)
      const expText = this.wrap(exp, PREC_POW, true)
      return { text: `${baseText}^${expText}`, prec: PREC_POW }
    }
    return base
  }

  private parsePostfixPrimary(): Val {
    let v = this.parsePrimary()
    for (;;) {
      const t = this.peek()
      if (this.isSym(t, '°')) {
        this.next()
        v = { text: `${this.wrap(v, PREC_MUL, false)}*pi/180`, prec: PREC_MUL }
      } else if (t?.type === 'NAME' && t.value === 'rad') {
        this.next() // already radians — no-op
      } else if (t?.type === 'NAME' && t.value === 'grad') {
        this.next()
        v = { text: `${this.wrap(v, PREC_MUL, false)}*pi/200`, prec: PREC_MUL }
      } else if (this.isSym(t, '!')) {
        this.next()
        // R has no postfix factorial operator — factorial() is the only form.
        v = { text: `factorial(${v.text})`, prec: PREC_ATOM }
      } else if (this.isSym(t, '[')) {
        v = { text: this.parseIndex(v), prec: PREC_ATOM }
      } else if (this.isSym(t, '.') && this.peek(1)?.type === 'NAME') {
        const name = this.peek(1)!.value
        if (name === 'x' && !this.isSym(this.peek(2), '(')) {
          this.next(); this.next()
          v = { text: `${this.indexableReceiver(v)}[1]`, prec: PREC_ATOM }
        } else if (name === 'y' && !this.isSym(this.peek(2), '(')) {
          this.next(); this.next()
          v = { text: `${this.indexableReceiver(v)}[2]`, prec: PREC_ATOM }
        } else if (this.isSym(this.peek(2), '(')) {
          this.next()
          const method = this.next().value
          const args = this.parseArgs()
          v = { text: this.renderDistAccessor(v.text, method, args), prec: PREC_ATOM }
        } else break
      } else break
    }
    return v
  }

  // R CAN index a parenthesized/computed vector inline — "c(1, 2, 3)[2]" is
  // perfectly valid R, unlike MATLAB's "[1 2 3](2)" syntax error. So (unlike
  // formalToMatlab.ts's indexableReceiver) this never rejects — every
  // receiver is indexable, wrapped in parens only when its own precedence is
  // looser than an atom (e.g. "x+y" needs "(x+y)[2]"; a call or list literal
  // like "c(1,2,3)" or a bare identifier is already safe to index directly).
  private indexableReceiver(v: Val): string {
    return v.prec >= PREC_ATOM ? v.text : `(${v.text})`
  }

  private parseIndex(receiver: Val): string {
    this.expectSym('[')
    const idx = this.parseAddSub()
    if (this.isSym(this.peek(), '...') || this.comparatorText(this.peek()) !== null) {
      throw new UnsupportedRFormalError('list slicing/filtering ("[3...5]", "[L>4]") isn\'t supported for R yet — index a single element ("[n]").')
    }
    this.expectSym(']')
    return `${this.indexableReceiver(receiver)}[${idx.text}]`
  }

  private parseArgs(): Val[] {
    this.expectSym('(')
    const args: Val[] = []
    if (!this.isSym(this.peek(), ')')) {
      args.push(this.parseCompareChain())
      while (this.isSym(this.peek(), ',')) {
        this.next()
        args.push(this.parseCompareChain())
      }
    }
    this.expectSym(')')
    return args
  }

  private parsePrimary(): Val {
    const t = this.peek()
    if (!t) throw new UnsupportedRFormalError('Input not recognized.')

    if (t.type === 'NUM') {
      this.next()
      // The shared tokenizer glues Desmos's range shorthand into the number
      // token ("1...9", "3..."), rather than emitting a separate "..." — so
      // the range is unpacked here, into an R colon range.
      if (t.value.includes('...')) return { text: this.numRange(t.value), prec: PREC_ATOM }
      return { text: t.value, prec: PREC_ATOM }
    }

    if (this.isSym(t, '(')) return this.parseParenGroup()
    if (this.isSym(t, '{')) return this.parseListOrRange('{', '}')
    if (this.isSym(t, '[')) {
      if (this.peek(1)?.type === 'NAME' && this.isSym(this.peek(2), ']')) {
        throw new UnsupportedRFormalError('matrix registers ("[A]") aren\'t part of a formal expression — use the linear-algebra commands ("determinant of A", "A times B") instead.')
      }
      return this.parseListOrRange('[', ']')
    }

    if (t.type === 'NAME') {
      this.next()
      if (this.isSym(this.peek(), '(')) return this.parseFunctionCall(t.value)
      return this.parseIdentifier(t.value)
    }

    throw new UnsupportedRFormalError(`'${t.value}' isn't something I recognize there.`)
  }

  private parseParenGroup(): Val {
    this.expectSym('(')
    const first = this.parseCompareChain()
    if (this.isSym(this.peek(), ',')) {
      // A point/tuple ("(a,b)") — R has no point type, so this becomes a
      // plain numeric vector (the same thing distance()/midpoint() operate on).
      const items = [first.text]
      while (this.isSym(this.peek(), ',')) {
        this.next()
        items.push(this.parseCompareChain().text)
      }
      this.expectSym(')')
      return { text: `c(${items.join(', ')})`, prec: PREC_ATOM }
    }
    this.expectSym(')')
    return first
  }

  // Desmos's range shorthand "N...M" (glued into one NUM token by the shared
  // tokenizer) → R colon range "(N:M)". An open-ended "N..." has no fixed
  // size; the stepped "[N, K...M]" form is handled in parseListOrRange.
  private numRange(v: string): string {
    const m = /^(-?(?:\d+\.?\d*|\.\d+))\.\.\.(-?(?:\d+\.?\d*|\.\d+))$/.exec(v)
    if (!m) {
      throw new UnsupportedRFormalError('an open-ended range ("[3...]") has no fixed size — R needs a definite end value.')
    }
    return `(${m[1]}:${m[2]})`
  }

  // List literal "{1,2,3}" / "[1,2,3]" → R vector "c(1, 2, 3)".
  // "[1...9]" is handled in parsePrimary (the tokenizer glues it into one
  // number). The stepped "[1,3...13]" form is caught here and reported: its
  // step comes from the first two items, which needs both to be literals.
  private parseListOrRange(open: string, close: string): Val {
    this.expectSym(open)
    if (this.isSym(this.peek(), close)) {
      this.next()
      return { text: 'c()', prec: PREC_ATOM }
    }
    const items: string[] = [this.parseAddSub().text]
    while (this.isSym(this.peek(), ',')) {
      this.next()
      const nextTok = this.peek()
      if (nextTok?.type === 'NUM' && nextTok.value.includes('...')) {
        const m = /^(-?(?:\d+\.?\d*|\.\d+))\.\.\.(-?(?:\d+\.?\d*|\.\d+))$/.exec(nextTok.value)
        const startN = Number(items[0])
        if (m && items.length === 1 && Number.isFinite(startN)) {
          this.next()
          this.expectSym(close)
          const step = Number(m[1]) - startN
          if (!Number.isFinite(step) || step === 0) {
            throw new UnsupportedRFormalError('a stepped range needs literal numeric bounds.')
          }
          return { text: `seq(${startN}, ${m[2]}, by = ${step})`, prec: PREC_ATOM }
        }
        throw new UnsupportedRFormalError('a stepped range ("[1, 3...13]") needs literal numeric start and step.')
      }
      items.push(this.parseAddSub().text)
    }
    this.expectSym(close)
    // A lone "[1...9]" is the range itself, not a 1-element list containing it.
    if (items.length === 1 && /^\(-?[\d.]+:-?[\d.:]+\)$/.test(items[0])) {
      return { text: items[0], prec: PREC_ATOM }
    }
    return { text: `c(${items.join(', ')})`, prec: PREC_ATOM }
  }

  // "<dist>(params).pdf(x)" / ".cdf(x)" / ".inversecdf(p)" → dnorm/pnorm/
  // qnorm, dt/pt/qt, dchisq/pchisq/qchisq, dbinom/pbinom/qbinom, dpois/ppois/
  // qpois, dunif/punif/qunif, dgeom/pgeom/qgeom (base `stats` package).
  private renderDistAccessor(receiverText: string, method: string, args: Val[]): string {
    const m = /^(?:__DIST__)?([a-z]+)\((.*)\)$/i.exec(receiverText)
    const dist = m ? DISTRIBUTIONS[m[1]] : undefined
    if (!m || !dist) {
      throw new UnsupportedRFormalError(`only a normal/t/chi-squared/binomial/poisson/uniform/geometric distribution's .pdf()/.cdf()/.inversecdf() are mapped to R.`)
    }
    const params = splitTopLevel(m[2]).map(s => s.trim()).filter(s => s.length > 0)
    if (params.length !== dist.nparams) {
      throw new UnsupportedRFormalError(`that distribution takes ${dist.nparams} parameter${dist.nparams === 1 ? '' : 's'}.`)
    }
    if (args.length !== 1) throw new UnsupportedRFormalError(`.${method}() takes exactly 1 argument.`)
    const at = args[0].text
    const prefix = method === 'pdf' ? 'd' : method === 'cdf' ? 'p' : method === 'inversecdf' ? 'q' : null
    if (prefix === null) throw new UnsupportedRFormalError(`'${method}' isn't a supported distribution accessor.`)
    return `${prefix}${dist.stem}(${[at, ...params].join(', ')})`
  }

  private renderCall(rawName: string, args: Val[]): string {
    const name = NINEBARK_NAME_REMAP[rawName] ?? rawName
    const argsText = args.map(a => a.text).join(', ')

    // ── Bespoke single-arg / renamed / closed-form expressions ────────────
    if (name === 'ceil') { this.arity(args, 1, name); return `ceiling(${argsText})` } // R spells it ceiling(), not ceil()
    if (name === 'cbrt') { this.arity(args, 1, name); return `${this.wrap(args[0], PREC_POW, false)}^(1/3)` } // no base R cbrt()
    if (name === 'nthroot') { this.arity(args, 2, name); return `${this.wrap(args[0], PREC_POW, false)}^(1/${this.wrap(args[1], PREC_MUL, true)})` }
    if (name === 'ln') { this.arity(args, 1, name); return `log(${argsText})` }       // R's log() with one arg IS natural log
    if (name === 'log') { this.arity(args, 1, name); return `log10(${argsText})` }    // Ninebark `log` = base 10
    if (name === 'logbase') {
      // handled in parseFunctionCall (needs the {value, base} list shape) —
      // this arm only exists so KNOWN_UNSUPPORTED's placeholder never fires.
      throw new UnsupportedRFormalError('logbase should have been rewritten before reaching renderCall — please report this.')
    }
    if (name === 'hypot') { this.arity(args, 2, name); return `sqrt(${this.wrap(args[0], PREC_POW, false)}^2+${this.wrap(args[1], PREC_POW, false)}^2)` } // no base R hypot()
    if (name === 'erf') { this.arity(args, 1, name); return `(2*pnorm(${this.wrap(args[0], PREC_MUL, false)}*sqrt(2))-1)` } // erf via the normal CDF — no base R erf()
    // Reciprocal trig — base R's ?Trig only ships sin/cos/tan (+ hyperbolic
    // + inverse); the reciprocal family has no builtin, so each is its
    // defining formula.
    if (name === 'csc') { this.arity(args, 1, name); return `(1/sin(${argsText}))` }
    if (name === 'sec') { this.arity(args, 1, name); return `(1/cos(${argsText}))` }
    if (name === 'cot') { this.arity(args, 1, name); return `(1/tan(${argsText}))` }
    if (name === 'acsc') { this.arity(args, 1, name); return `asin(1/${this.wrap(args[0], PREC_MUL, true)})` }
    if (name === 'asec') { this.arity(args, 1, name); return `acos(1/${this.wrap(args[0], PREC_MUL, true)})` }
    if (name === 'acot') { this.arity(args, 1, name); return `atan(1/${this.wrap(args[0], PREC_MUL, true)})` }
    if (name === 'csch') { this.arity(args, 1, name); return `(1/sinh(${argsText}))` }
    if (name === 'sech') { this.arity(args, 1, name); return `(1/cosh(${argsText}))` }
    if (name === 'coth') { this.arity(args, 1, name); return `(1/tanh(${argsText}))` }
    if (name === 'acsch') { this.arity(args, 1, name); return `asinh(1/${this.wrap(args[0], PREC_MUL, true)})` }
    if (name === 'asech') { this.arity(args, 1, name); return `acosh(1/${this.wrap(args[0], PREC_MUL, true)})` }
    if (name === 'acoth') { this.arity(args, 1, name); return `atanh(1/${this.wrap(args[0], PREC_MUL, true)})` }
    if (name === 'stdev') { this.arity(args, 1, name); return `sd(${argsText})` }     // sample sd, N-1 — matches R's default
    if (name === 'stdevp') {
      this.arity(args, 1, name)
      const x = this.indexableReceiver(args[0])
      return `sqrt(sum((${x}-mean(${x}))^2)/length(${x}))`
    }
    if (name === 'varp') {
      this.arity(args, 1, name)
      const x = this.indexableReceiver(args[0])
      return `(sum((${x}-mean(${x}))^2)/length(${x}))`
    }
    if (name === 'quartile') {
      this.arity(args, 2, name)
      const q = /^[\w.]+$/.test(args[1].text) ? args[1].text : `(${args[1].text})`
      return `quantile(${args[0].text}, ${q}/4)`
    }
    if (name === 'nPr') {
      this.arity(args, 2, name)
      const n = /^[\w.]+$/.test(args[0].text) ? args[0].text : `(${args[0].text})`
      const r = /^[\w.]+$/.test(args[1].text) ? args[1].text : `(${args[1].text})`
      return `factorial(${args[0].text})/factorial(${n}-${r})`
    }
    if (name === 'nCr') { this.arity(args, 2, name); return `choose(${argsText})` } // base R has choose() built in
    if (name === 'Q1') { this.arity(args, 1, name); return `quantile(${args[0].text}, 0.25)` }
    if (name === 'Q3') { this.arity(args, 1, name); return `quantile(${args[0].text}, 0.75)` }
    if (name === 'quantile') { this.arity(args, 2, name); return `quantile(${args[0].text}, ${args[1].text})` }
    // The two args of midpoint/distance are always points — a numeric-vector
    // literal ("c(1, 2)") or a bare variable — so they need no wrapping.
    if (name === 'midpoint') { this.arity(args, 2, name); return `((${args[0].text})+(${args[1].text}))/2` }
    if (name === 'distance') { this.arity(args, 2, name); return `sqrt(sum(((${args[1].text})-(${args[0].text}))^2))` }
    if (name === 'repeat') { this.arity(args, 2, name); return `rep(${args[0].text}, ${args[1].text})` }
    if (name === 'join') { this.arity(args, 2, name); return `c(${args[0].text}, ${args[1].text})` }
    // Covariance/correlation: R's cov()/cor() return a plain scalar for two
    // numeric-vector arguments — unlike MATLAB's cov() (a 2×2 matrix), so
    // this is supported here where formalToMatlab.ts has to reject it.
    if (name === 'cov') { this.arity(args, 2, name); return `cov(${argsText})` }        // sample covariance, N-1
    if (name === 'covp') {
      this.arity(args, 2, name)
      const x = this.indexableReceiver(args[0])
      return `(cov(${argsText})*(length(${x})-1)/length(${x}))` // population covariance, N
    }
    if (name === 'corr') { this.arity(args, 2, name); return `cor(${argsText})` } // R spells it "cor", not "corr"
    if (name === 'spearman') { this.arity(args, 2, name); return `cor(${args[0].text}, ${args[1].text}, method = "spearman")` }
    // R's console model runs any statement, not just value-returning ones —
    // so unlike formalToMatlab.ts, plot-producing calls are real, complete R
    // and are supported directly.
    if (name === 'histogram') { this.arity(args, 1, name); return `hist(${argsText})` }
    if (name === 'boxplot') { this.arity(args, 1, name); return `boxplot(${argsText})` }
    if (name === 'dotplot') { this.arity(args, 1, name); return `stripchart(${argsText}, method = "stack")` } // closest base-R analogue
    if (name in DISTRIBUTIONS) {
      // A bare distribution with no .pdf/.cdf/.inversecdf accessor — see
      // formalStringToR's final check, which reports this cleanly.
      return `__DIST__${name}(${argsText})`
    }

    if (name in KNOWN_UNSUPPORTED) {
      throw new UnsupportedRFormalError(`'${rawName}' isn't supported for R — ${KNOWN_UNSUPPORTED[name]}`)
    }
    const rName = R_FN_MAP[name]
    if (rName) return `${rName}(${argsText})`

    throw new UnsupportedRFormalError(`'${rawName}' isn't an R function Ninebark knows how to map yet.`)
  }

  private arity(args: Val[], n: number, name: string): void {
    if (args.length !== n) throw new UnsupportedRFormalError(`${name} needs exactly ${n} argument${n === 1 ? '' : 's'}.`)
  }

  private parseFunctionCall(rawName: string): Val {
    if (rawName === 'logbase') {
      // Ninebark emits logbase({value, base}) — one list arg with 2 items,
      // not the generic comma-arg shape. R's log() supports a base=
      // argument directly, so no change-of-base formula is needed.
      this.expectSym('(')
      this.expectSym('{')
      const value = this.parseAddSub()
      this.expectSym(',')
      const base = this.parseAddSub()
      this.expectSym('}')
      this.expectSym(')')
      return { text: `log(${value.text}, base = ${base.text})`, prec: PREC_ATOM }
    }
    const args = this.parseArgs()
    return { text: this.renderCall(rawName, args), prec: PREC_ATOM }
  }

  private parseIdentifier(name: string): Val {
    if (name === 'pi') return { text: 'pi', prec: PREC_ATOM }       // R has a real built-in `pi`
    if (name === 'e') return { text: 'exp(1)', prec: PREC_ATOM }    // R has no `e` literal
    if (name === 'tau') return { text: '(2*pi)', prec: PREC_ATOM }
    if (name === 'infinity') return { text: 'Inf', prec: PREC_ATOM }
    if (name in CONSTANTS) return { text: name, prec: PREC_ATOM }   // theta → theta (a valid R name)
    // A free variable — R is a programming environment, so a variable that
    // isn't bound yet just produces a clear "object '<name>' not found"
    // error at execution, which is the fail-loud behaviour we want. So pass
    // single letters and subscripted names (x1, y2) straight through.
    return { text: name, prec: PREC_ATOM }
  }
}

// Splits on a top-level "," respecting (), [], {} nesting — same helper shape
// as every other converter's splitTopLevel.
function splitTopLevel(s: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c === '(' || c === '[' || c === '{') depth++
    else if (c === ')' || c === ']' || c === '}') depth--
    else if (c === ',' && depth === 0) { parts.push(s.slice(start, i)); start = i + 1 }
  }
  parts.push(s.slice(start))
  return parts
}

function convertExpr(formal: string): string {
  return new RFormalParser(tokenize(formal)).parseTopLevel()
}

// Single lowercase free variables in a formal string (for uniroot()'s bound
// variable, or reporting which name an equation was "solved" for).
function freeVars(formal: string): string[] {
  const seen = new Set<string>()
  for (const t of tokenize(formal)) {
    if (t.type === 'NAME' && /^[a-zA-Z]$/.test(t.value) && !(t.value in CONSTANTS)
        && t.value !== 'e' && t.value !== 'i') {
      seen.add(t.value)
    }
  }
  return [...seen]
}

// percentof(a,b) — Ninebark's "N% of M" wrapper. R has no "%" arithmetic
// operator either ("%" starts R's special-operator syntax, %%/%/%/%*%/…),
// so this is plain arithmetic, same as every other converter.
function convertPercentOf(formal: string): string {
  const inner = formal.slice('percentof('.length, -1)
  const [a, b] = splitTopLevel(inner)
  if (a === undefined || b === undefined) throw new UnsupportedRFormalError('Input not recognized.')
  const wrapp = (s: string) => /^[A-Za-z0-9_.]+$/.test(s) ? s : `(${s})`
  return `${wrapp(convertExpr(a.trim()))}/100*${wrapp(convertExpr(b.trim()))}`
}

// solve(lhs=rhs) — Ninebark's own equation wrapper ("solve x^2 = 4", "roots
// of x^2-4"). Base R ships NO symbolic algebra solver (no Symbolic Math
// Toolbox / no Ryacas without adding a CRAN package) — rejected with the
// honest reason and the two real base-R alternatives, rather than guessed:
// uniroot() (numeric root of a continuous function over an interval — needs
// bounds this command doesn't have) and polyroot() (all roots of a
// polynomial given its coefficients — needs the equation expressed as a
// coefficient vector, which this command doesn't parse for).
function convertSolve(formal: string): string {
  const inner = formal.slice('solve('.length, -1)
  const vars = freeVars(inner)
  const forVar = vars.length === 1 ? ` for ${vars[0]}` : ''
  throw new UnsupportedRFormalError(
    `solving an equation${forVar} isn't supported for R — base R ships no symbolic algebra solver (unlike MATLAB's Symbolic Math Toolbox). `
    + `For a polynomial, try "polyroot(c(constant, ..., leadingCoefficient))" (raw R); for a general continuous function over a known interval, try "uniroot(function(${vars[0] ?? 'x'}) ..., lower = a, upper = b)".`,
  )
}

// Graph-canvas / interactive constructs from the shared vocabulary that have
// no clean single-expression R form. Each gets a specific reason (mirrors
// formalToMatlab.ts's CANVAS_ONLY, per-form messages).
const CANVAS_ONLY: Record<string, string> = {
  'slider(': 'sliders are interactive — R has no equivalent in a one-shot command.',
  'equation(': 'implicit/polar equations are a graphing feature — try the plotting commands instead.',
  'piecewise(': 'a piecewise function needs ifelse()/a defined function with if/else in R — not emitted inline yet; try "define a function called f that takes x and returns ..." with an if/else body.',
  'restrict(': 'restricting a function to a domain is a graphing feature — plot it over the interval instead ("plot ... from a to b").',
  'intersection(': 'finding a curve intersection on a canvas has no single-expression R form — use uniroot() on the difference of the two functions instead.',
  'maketable(': 'building a table is a graphing-canvas action — assign the vectors to a data frame instead ("a data frame with columns ...").',
  'tangentline(': 'a tangent line is a multi-step build — try "differentiate <expr> with respect to x", then evaluate the result at the point.',
  'derivat(': 'evaluating a derivative at a point is a multi-step build — try "differentiate <expr> with respect to x" first.',
  'avgrate(': 'average rate of change is a multi-step build — define the function, then compute (f(b)-f(a))/(b-a).',
}

// Regression: linear/quadratic/cubic → lm() with poly() for degree > 1,
// reading off the fitted coefficients. Nonlinear fits need nls() with
// starting parameters this command has no way to guess.
const REGRESSION_DEGREE: Record<string, number> = { linReg: 1, quadReg: 2, cubicReg: 3 }
const REGRESSION_NONLINEAR = new Set(['lnReg', 'expReg', 'pwrReg', 'sinReg', 'logistic', 'medMed'])
const REGRESSION_CALL_RE = /^([a-zA-Z]+)\(\{([^{}]*)\},\{([^{}]*)\}\)$/

function convertRegression(name: string, xsRaw: string, ysRaw: string): string {
  const xs = xsRaw.split(',').map(s => s.trim()).filter(s => s.length > 0)
  const ys = ysRaw.split(',').map(s => s.trim()).filter(s => s.length > 0)
  if (xs.length === 0 || ys.length === 0 || xs.length !== ys.length) {
    throw new UnsupportedRFormalError('a regression fit needs equal-length, non-empty x and y lists.')
  }
  const deg = REGRESSION_DEGREE[name]
  const xVec = `c(${xs.join(', ')})`
  const yVec = `c(${ys.join(', ')})`
  if (deg === 1) return `coef(lm(${yVec} ~ ${xVec}))`
  return `coef(lm(${yVec} ~ poly(${xVec}, ${deg}, raw = TRUE)))`
}

// Every multi-letter name that can legitimately appear in a Ninebark formal
// string — function names (pre- and post-remap), distributions, accessors,
// constants, wrapper/regression forms. A formal string is machine-generated,
// so any OTHER alphabetic run of 3+ letters means upstream passed English
// through as junk, and the right move is a clean failure, not garbage R.
const KNOWN_FORMAL_NAMES = new Set<string>([
  ...Object.keys(R_FN_MAP), ...Object.keys(NINEBARK_NAME_REMAP),
  ...Object.keys(DISTRIBUTIONS), ...Object.keys(CONSTANTS),
  ...Object.keys(REGRESSION_DEGREE), ...REGRESSION_NONLINEAR,
  ...Object.keys(KNOWN_UNSUPPORTED),
  ...Object.keys(CANVAS_ONLY).map(k => k.replace(/\($/, '')),
  'sqrt', 'cbrt', 'abs', 'sign', 'exp', 'floor', 'ceil', 'round', 'nthroot',
  'ln', 'log', 'logbase', 'stdev', 'stdevp', 'varp', 'quartile', 'atan',
  'midpoint', 'distance', 'hypot', 'repeat', 'join', 'spearman', 'corr', 'cov', 'covp',
  'pdf', 'cdf', 'inversecdf', 'percentof', 'solve', 'tau', 'infinity', 'rad', 'grad',
  'nPr', 'nCr', 'Q1', 'Q3', 'IQR', 'csc', 'sec', 'cot', 'acsc', 'asec', 'acot',
  'csch', 'sech', 'coth', 'acsch', 'asech', 'acoth', 'erf', 'mode', 'range', 'gcd', 'lcm',
  'histogram', 'boxplot', 'dotplot', 'ttest', 'ittest', 'tscore', 'random', 'polygon',
  'rgb', 'hsv', 'polyGamma', 'argmax', 'argmin', 'shuffle',
])

function guardAgainstJunkWords(formal: string): void {
  for (const run of formal.match(/[a-zA-Z]{3,}/g) ?? []) {
    if (!KNOWN_FORMAL_NAMES.has(run) && !KNOWN_FORMAL_NAMES.has(run.toLowerCase())) {
      throw new UnsupportedRFormalError(`I don't recognize "${run}" as part of an R command.`)
    }
  }
}

export function formalStringToR(formal: string): string {
  const trimmed = formal.trim()

  for (const prefix of Object.keys(CANVAS_ONLY)) {
    if (trimmed.startsWith(prefix)) throw new UnsupportedRFormalError(CANVAS_ONLY[prefix])
  }
  guardAgainstJunkWords(trimmed)
  if (trimmed.startsWith('percentof(')) return convertPercentOf(trimmed)
  if (trimmed.startsWith('solve(')) return convertSolve(trimmed)

  const reg = REGRESSION_CALL_RE.exec(trimmed.replace(/\s+/g, ''))
  if (reg) {
    if (reg[1] in REGRESSION_DEGREE) return convertRegression(reg[1], reg[2], reg[3])
    if (REGRESSION_NONLINEAR.has(reg[1])) {
      throw new UnsupportedRFormalError('nonlinear regression fits need nls() with starting parameters this command has no way to guess — linear, quadratic, and cubic fits work via lm()/poly().')
    }
    // Not a regression name (corr/cov also match name({...},{...})) — fall
    // through to the generic parser.
  }

  const body = convertExpr(trimmed)
  if (body.includes('__DIST__')) {
    throw new UnsupportedRFormalError('a distribution on its own isn\'t a single value — ask for its pdf, cdf, or inverse cdf at a point, e.g. "cdf of a normal distribution with mean 0 and sd 1 at 1.96".')
  }
  return body
}
