// ── R-native: variable & function assignment ───────────────────────────────
// "let x be 5", "set x to 5", "define f of x as x^2" — commands with no
// Desmos/Sheets/MATLAB equivalent shape once rendered: R spells assignment
// "<-" (idiomatic; "=" also works but "<-" is what every R style guide and
// R's own documentation prefers, so that's what Ninebark emits) and a
// function value is a first-class "function(params) body" expression, not
// a separate declaration form.
//
// The value/body on the right-hand side is resolved through the SAME value
// pipeline the bare phrase would use (raw R → tier-1 vocab → tier-2 NL),
// passed in as `resolveValue` so this file doesn't import — and cycle with
// — resolveRPhrase.ts. So "let r be the mean of 1,2,3" becomes
// "r <- mean(c(1, 2, 3))", and "set A to c(1, 2, 3, 4)" passes the literal
// through untouched.

export type ValueResolver = (phrase: string) => string

const PARAM_SPLIT_RE = /\s*(?:,|and)\s*/i

// "define f of x as x^2" / "define f(x) as x^2" / "let g of x and y be x + y"
// → an R closure assignment "f <- function(x) x^2".
const FN_DEF_RE =
  /^(?:let|define)\s+([A-Za-z]\w*)\s*(?:\(\s*([A-Za-z][\w,\s]*?)\s*\)|of\s+([A-Za-z][\w,\s]*?))\s+(?:be|to\s+be|as|=)\s+(.+)$/i

// "let x be 5" / "define x as 3*4" / "set A to c(1, 2, 3, 4)" — a plain
// value assignment. "let"/"define" use "be"/"as"; "set" uses "to".
const LET_RE = /^(?:let|define)\s+([A-Za-z]\w*)\s+(?:be|to\s+be|as|=)\s+(.+)$/i
const SET_RE = /^set\s+([A-Za-z]\w*)\s+(?:to|=)\s+(.+)$/i

function splitParams(raw: string): string[] {
  return raw.split(PARAM_SPLIT_RE).map(s => s.trim()).filter(Boolean)
}

export function recognizeAssignment(rawText: string, resolveValue: ValueResolver): string | null {
  const text = rawText.trim()

  const fn = FN_DEF_RE.exec(text)
  if (fn) {
    const name = fn[1]
    const params = splitParams(fn[2] ?? fn[3] ?? '')
    if (params.length === 0) return null
    if (!params.every(p => /^[A-Za-z]\w*$/.test(p))) return null
    const body = resolveValue(fn[4].trim())
    return `${name} <- function(${params.join(', ')}) ${body}`
  }

  const let_ = LET_RE.exec(text) ?? SET_RE.exec(text)
  if (let_) {
    const name = let_[1]
    const value = resolveValue(let_[2].trim())
    return `${name} <- ${value}`
  }

  return null
}
