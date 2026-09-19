// ── formal string → tokens ───────────────────────────────────────────────────
// Lexer for Ninebark's "formal string" dialect (fully-parenthesized ASCII
// math from nlToFormal(), plus ordinary infix math from desmosNlVocab.ts and
// raw Desmos-typed syntax) — target-agnostic: this only decides token
// boundaries, never how a parsed expression gets rendered. Extracted out of
// formalToDesmos.ts so every formal-string → X converter (formalToDesmos.ts,
// formalToSheets.ts, and whatever converter the next interface needs) shares
// one lexer rather than each re-implementing or importing a sibling
// converter's internals.
export type Token = { type: 'NUM' | 'NAME' | 'SYM'; value: string }

// The shared "this formal-string-level input doesn't make sense" error —
// thrown both by desmosNlVocab.ts's own recognizers (before a formal string
// is even produced, e.g. "mean of" with no numbers found) and by each
// converter's parser (formalToDesmos.ts's precedence-climbing parser,
// formalToSheets.ts's). Living alongside the tokenizer rather than in
// either converter keeps it available to both without one converter
// depending on the other.
export class UnsupportedFormalError extends Error {}

// Constants recognized as a single glued-together bare name even without a
// following "(" — see tokenize()'s letter-run handling below. Also consulted
// by each converter's own rendering logic (e.g. formalToDesmos.ts renders
// 'pi' as '\pi') and by anything deciding whether a bare name is a plottable
// variable vs. a named constant.
export const CONSTANTS: Record<string, string> = {
  pi: '\\pi', tau: '\\tau', e: 'e', theta: '\\theta', infinity: '\\infty',
  trigAngleMultiplier: '\\operatorname{trigAngleMultiplier}',
}

export function tokenize(formal: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < formal.length) {
    const ch = formal[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(formal[i + 1] ?? ''))) {
      let j = i + 1
      while (j < formal.length && /[0-9.]/.test(formal[j])) j++
      tokens.push({ type: 'NUM', value: formal.slice(i, j) })
      i = j
      continue
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1
      while (j < formal.length && /[a-zA-Z0-9]/.test(formal[j])) j++
      const run = formal.slice(i, j)
      // A letter-run followed by digits (Q1, x1, D2, …) is always one
      // subscripted identifier — unambiguous, keep together. A single letter
      // is always its own token (the overwhelmingly common case — x, y, n, k…).
      // A pure multi-letter run is glued into one NAME only when it's a
      // genuine name: a recognized constant, or immediately followed by "("
      // (a function call — "sin(", "normaldist(", ".sort("). Otherwise real
      // Desmos reads bare adjacent letters as implicit multiplication of
      // single-letter variables ("ax" = a·x, "mean" untouched by parens =
      // m·e·a·n), so split it into individual single-letter tokens and let
      // the parser's existing implicit-multiplication handling recombine them
      // — critical for correct precedence: "ax^2" must mean a·x², not (a·x)²,
      // which only works if "^2" binds to the lone "x" token, not a glued "ax".
      const hasTrailingDigit = /[0-9]$/.test(run)
      const followedByParen = /^\s*\(/.test(formal.slice(j))
      if (run.length === 1 || hasTrailingDigit || followedByParen || run in CONSTANTS) {
        tokens.push({ type: 'NAME', value: run })
      } else {
        for (const letter of run) tokens.push({ type: 'NAME', value: letter })
      }
      i = j
      continue
    }
    // Multi-char symbols — must be checked before the generic 1-char fallback.
    if (ch === '.' && formal[i + 1] === '.' && formal[i + 2] === '.') {
      tokens.push({ type: 'SYM', value: '...' }); i += 3; continue
    }
    if (ch === '<' && formal[i + 1] === '=') { tokens.push({ type: 'SYM', value: '<=' }); i += 2; continue }
    if (ch === '>' && formal[i + 1] === '=') { tokens.push({ type: 'SYM', value: '>=' }); i += 2; continue }
    if (ch === '!' && formal[i + 1] === '=') { tokens.push({ type: 'SYM', value: '!=' }); i += 2; continue }
    if (ch === '<' && formal[i + 1] === '>') { tokens.push({ type: 'SYM', value: '<>' }); i += 2; continue }
    tokens.push({ type: 'SYM', value: ch })
    i++
  }
  return tokens
}
