// ── R-native: calculus ────────────────────────────────────────────────────
// "differentiate x^2 with respect to x", "integral of x^2 from 0 to 1" —
// base R (no CRAN package) genuinely supports both, but asymmetrically:
// D()/deriv() do real SYMBOLIC differentiation of an R expression (returns
// another R expression, e.g. "2 * x"); integrate() does only NUMERIC
// definite integration (a value + an error estimate, not a symbolic
// antiderivative — base R has no symbolic integrator at all, unlike MATLAB's
// Symbolic Math Toolbox). Both facts are surfaced directly rather than
// glossed over: "the antiderivative of x^2" is rejected with the same honest
// reasoning formalToR.ts's convertSolve() uses for equation-solving.
//
// The expression is taken as raw R syntax (an unevaluated call, exactly what
// D()/integrate()'s first argument wants), same reasoning as
// rPlotting.ts's tryCurve() — NOT run through formalToR.ts, since these
// functions parse the math text as R syntax themselves rather than taking a
// computed value.

function rExprToDCall(expr: string): string {
  // D()'s first argument must be an expression(), not a bare call — wrap it.
  return `expression(${expr.trim()})`
}

// "differentiate x^2 with respect to x" / "the derivative of x^3 - 2x with
// respect to x" / "d/dx of sin(x)". "the"/"find the" are written as optional
// (rather than required) because stripFiller has already dropped a leading
// "the" by the time this text arrives — "the derivative of ..." and
// "derivative of ..." both need to match.
const DERIV_RE = /^(?:differentiate|(?:find\s+)?(?:the\s+)?derivative\s+of)\s+(.+?)\s+with\s+respect\s+to\s+([A-Za-z]\w*)$/i
const DDX_RE = /^d\/d([A-Za-z])\s+(?:of\s+)?(.+)$/i

function tryDerivative(text: string): string | null {
  let m = DERIV_RE.exec(text)
  if (m) return `D(${rExprToDCall(m[1])}, ${JSON.stringify(m[2])})`
  m = DDX_RE.exec(text)
  if (m) return `D(${rExprToDCall(m[2])}, ${JSON.stringify(m[1])})`
  return null
}

// "second derivative of x^3 with respect to x" — D() nested twice; R has no
// direct "order n" argument.
const DERIV2_RE = /^(?:the\s+)?second\s+derivative\s+of\s+(.+?)\s+with\s+respect\s+to\s+([A-Za-z]\w*)$/i

function trySecondDerivative(text: string): string | null {
  const m = DERIV2_RE.exec(text)
  if (!m) return null
  const varName = JSON.stringify(m[2])
  return `D(D(${rExprToDCall(m[1])}, ${varName}), ${varName})`
}

// "integral of x^2 from 0 to 1" / "integrate x^2 from 0 to 1" — numeric
// definite integration only (base R has no symbolic integrator); the
// function body needs the bound variable, which this assumes is "x" unless
// told otherwise ("integral of x^2 with respect to t from 0 to 1").
const INTEGRAL_RE = /^(?:the\s+)?integral\s+of\s+(.+?)(?:\s+with\s+respect\s+to\s+([A-Za-z]\w*))?\s+from\s+(-?[\w.]+)\s+to\s+(-?[\w.]+)$/i
const INTEGRATE_VERB_RE = /^integrate\s+(.+?)(?:\s+with\s+respect\s+to\s+([A-Za-z]\w*))?\s+from\s+(-?[\w.]+)\s+to\s+(-?[\w.]+)$/i

function tryIntegral(text: string): string | null {
  const m = INTEGRAL_RE.exec(text) ?? INTEGRATE_VERB_RE.exec(text)
  if (!m) return null
  const v = m[2] ?? 'x'
  return `integrate(function(${v}) ${m[1].trim()}, lower = ${m[3]}, upper = ${m[4]})`
}

// "the antiderivative of x^2" / "the indefinite integral of x^2" — no base-R
// symbolic form exists; fail loud with the honest reason, same posture as
// formalToR.ts's convertSolve().
const ANTIDERIVATIVE_RE = /^(?:the\s+)?(?:antiderivative|indefinite\s+integral)\s+of\s+(.+)$/i

export class RCalculusUnsupportedError extends Error {}

function checkAntiderivative(text: string): never | null {
  const m = ANTIDERIVATIVE_RE.exec(text)
  if (!m) return null
  throw new RCalculusUnsupportedError(
    'a symbolic antiderivative isn\'t supported for R — base R has no symbolic integrator (unlike its D()/deriv() for symbolic differentiation). '
    + 'A DEFINITE integral works numerically: "integral of x^2 from 0 to 1".',
  )
}

export function recognizeCalculus(rawText: string): string | null {
  const text = rawText.trim()
  checkAntiderivative(text)
  return (
    trySecondDerivative(text) ??
    tryDerivative(text) ??
    tryIntegral(text)
  )
}
