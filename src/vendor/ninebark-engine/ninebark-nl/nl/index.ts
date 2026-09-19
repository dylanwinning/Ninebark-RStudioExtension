// NL front-end public entry point (M26 / DECISION-30).
//
// Orchestrates Stages A → D:
//   A: Longest-match NL tokenizer     (lexicon/tokenizer.ts)
//   B: Number-phrase resolver          (numbers/numberPhrase.ts)
//   C: Framing + unknown drop pass     (framing/strip.ts)
//   D: Grammar + all-parses parser     (grammar/earley.ts)
//      Disambiguation policy           (disambiguation/policy.ts)
//      Formal-string emitter           (emit/formalString.ts)
//
// INVARIANTS:
//   1. Does NOT import from src/calculator/ or React.
//   2. Does NOT evaluate — only emits a formal string.
//   3. Identical (input, settings) → identical output (deterministic).
//   4. Every dropped token is either FRAMING (known safe, in `ignored`) or
//      UNKNOWN (surfaced in `unrecognized`) — nothing silently consequential.
//
// Already-formal pass-through (DECISION-37 / M47):
//   Formal operators (+,-,*,/,^) are classified by FORMAL_OP_MAP in Stage A.
//   Parentheses and digits are classified by PUNCT_MAP and isDigitNumber.
//   So "20+20", "sin(30)", "(2+3)*4" etc. all pass through the existing
//   grammar path without special-casing — no separate pass-through needed.

import type { NlResult, NlSettings } from './contract'
import { NlErrorCode, NL_MESSAGES } from './errors'
import type { NlErrorCodeValue } from './errors'
import { tokenize } from './lexicon/tokenizer'
import type { NlToken } from './lexicon/classes'
import { resolveNumbers } from './numbers/numberPhrase'
import { stripFraming } from './framing/strip'
import { parseForest } from './grammar/earley'
import { disambiguate } from './disambiguation/policy'
import { emit } from './emit/formalString'
import type { ParseNode } from './grammar/forest'
import type { NlDiagnostic } from '../types/diagnostic'
import { FN_LABELS, EXAMPLE_BANK } from '../types/diagnostic'

export type { NlResult, NlSettings }

// ── Internal helper: run Stages A→D on a substring ───────────────────────────
// Used by pre-processors to convert NL sub-expressions to formal strings without
// going through the calculator engine (preserves INVARIANT 1).

function nlStagesAtoD(str: string): string | null {
  try {
    const raw = tokenize(str.trim())
    const resolved = resolveNumbers(raw)
    const { tokens: stripped } = stripFraming(resolved)
    if (stripped.length === 0) return null
    const forest = parseForest(stripped)
    const best = disambiguate(forest)
    return emit(best)
  } catch { return null }
}

// ── Internal helper: count distinct single-letter free variables in a formal string ──
// Variables are single lowercase ASCII letters not followed by '(' (function calls).
// 'e' (Euler) and 'i' (imaginary unit) are excluded — they are constants in the engine.

const FREE_VAR_RE = /\b([a-z])\b(?!\s*\()/g
const EXCLUDED_VAR_CONSTANTS = new Set(['e', 'i'])

function freeVarsInFormal(formal: string): Set<string> {
  const vars = new Set<string>()
  for (const m of formal.matchAll(FREE_VAR_RE)) {
    if (!EXCLUDED_VAR_CONSTANTS.has(m[1])) vars.add(m[1])
  }
  return vars
}

// ── Sprint 15 DECISION-81: Diagnostic helpers ─────────────────────────────────
// These run on Stage-A token profiles to produce NlDiagnostic deterministically.

// NlTokenClass subsets that are ambiguous connectors or infix operators
const AMBIGUOUS_CONNECTOR_CLASSES = new Set(['AND', 'OF', 'BY'])
const INFIX_CLASSES = new Set(['ADD', 'SUB', 'MUL', 'DIV', 'POW', 'SUBFROM', 'MORE', 'LESS'])

function countParens(rawInput: string): { open: number; close: number } {
  let open = 0, close = 0
  for (const ch of rawInput) {
    if (ch === '(') open++
    else if (ch === ')') close++
  }
  return { open, close }
}

function findTrailingOperator(rawTokens: NlToken[]): string | null {
  const relevant = rawTokens.filter(t => t.cls !== 'FRAMING' && t.cls !== 'UNKNOWN')
  if (relevant.length === 0) return null
  const last = relevant[relevant.length - 1]
  if (INFIX_CLASSES.has(last.cls)) return last.raw
  return null
}

function findStrayOperand(rawTokens: NlToken[]): string | null {
  const relevant = rawTokens.filter(t => t.cls !== 'FRAMING')
  for (let i = 0; i < relevant.length - 1; i++) {
    const cur = relevant[i], nxt = relevant[i + 1]
    const isValue = (t: NlToken) => t.cls === 'NUM' || t.cls === 'CONST'
    // Implied-mult cases (NUM→VARIABLE or NUM→LPAREN) are NOT stray operands
    const impliedMul = (a: NlToken, b: NlToken) =>
      (a.cls === 'NUM' || a.cls === 'VARIABLE') && (b.cls === 'VARIABLE' || b.cls === 'LPAREN')
    if (isValue(cur) && isValue(nxt) && !impliedMul(cur, nxt)) return nxt.raw
  }
  return null
}

function extractRecognizedFeatures(rawTokens: NlToken[]): string[] {
  const features: string[] = []
  for (const tok of rawTokens) {
    if (tok.cls === 'FUNC1' && tok.fn1Name) {
      features.push(FN_LABELS[tok.fn1Name] ?? tok.fn1Name)
    } else if (tok.cls === 'FUNCN' && tok.fnNName) {
      features.push(FN_LABELS[tok.fnNName] ?? tok.fnNName)
    }
  }
  return features
}

function findAmbiguousToken(rawTokens: NlToken[]): string {
  const ambig = rawTokens.find(t => AMBIGUOUS_CONNECTOR_CLASSES.has(t.cls))
  return ambig ? ambig.raw : 'this phrase'
}

function describeNode(n: ParseNode): string {
  switch (n.t) {
    case 'add':   return 'addition'
    case 'sub':   return 'subtraction'
    case 'mul':   return 'multiplication'
    case 'div':   return 'division'
    case 'pow':   return 'exponentiation'
    case 'list':  return 'list'
    case 'fn1':   return FN_LABELS[n.fn] ?? n.fn
    case 'fnN':   return FN_LABELS[n.fn] ?? n.fn
    case 'num':   return 'number'
    case 'const': return n.name
    default:      return n.t
  }
}

function computeNlDiagnostic(
  rawInput: string,
  rawTokens: NlToken[],
  code: string,
  competingParses?: ParseNode[],
): NlDiagnostic {
  // 1. Empty
  if (code === NlErrorCode.EMPTY) return { category: 'empty-incomplete' }

  // 2. Missing stats parameter
  if (code === NlErrorCode.TEST_NEEDS_PARAM) {
    return { category: 'missing-parameter', offendingToken: 'mean (μ0)' }
  }

  // 3. Ambiguity — carry the competing interpretations
  if (code === NlErrorCode.AMBIGUOUS && competingParses && competingParses.length >= 2) {
    const interpretations = competingParses.map(describeNode)
    return {
      category: 'ambiguity',
      competingReadings: { token: findAmbiguousToken(rawTokens), interpretations },
    }
  }

  // 4. Unbalanced parentheses
  const parenBalance = countParens(rawInput)
  if (parenBalance.open !== parenBalance.close) {
    return { category: 'unbalanced-grouping', parenBalance }
  }

  // 5. Unrecognized token — UNKNOWN in Stage A
  const unknowns = rawTokens.filter(t => t.cls === 'UNKNOWN')
  if (unknowns.length > 0) {
    const tok = unknowns[0]
    return {
      category: 'unrecognized-token',
      offendingToken: tok.raw,
      span: [tok.start, tok.start + tok.raw.length],
    }
  }

  // 6. Recognized function features but parse failed → out-of-coverage
  const features = extractRecognizedFeatures(rawTokens)
  if (features.length > 0) {
    return { category: 'out-of-coverage', recognized: { features } }
  }

  // 7. Trailing infix operator → missing operand
  const trailingOp = findTrailingOperator(rawTokens)
  if (trailingOp) {
    return { category: 'missing-operand', offendingToken: trailingOp, expected: ['operand'] }
  }

  // 8. Stray operand — two adjacent value tokens with no operator
  const stray = findStrayOperand(rawTokens)
  if (stray) {
    return { category: 'stray-operand', offendingToken: stray }
  }

  // 9. General fallback
  return { category: 'general' }
}

// Build a human-readable error message from a code + diagnostic.
// Exported for use in App.tsx when surfacing NL failures.
export function buildNlErrorMessage(code: string, diagnostic?: NlDiagnostic): string {
  if (!diagnostic || diagnostic.category === 'general') {
    return NL_MESSAGES[code as NlErrorCodeValue] ?? "I didn't understand that. Try: 'square root of 16' or 'two plus two'."
  }
  switch (diagnostic.category) {
    case 'empty-incomplete':
      return "Nothing to calculate. Try: '2 + 2', 'square root of 16', or 'sin 90 degrees'."

    case 'unrecognized-token':
      return `I didn't recognize "${diagnostic.offendingToken}". That's not a function or operator I know. ` +
        'Functions include: square root, sine, log, absolute value. Operators: plus, minus, times, divided by.'

    case 'missing-operand':
      return `"${diagnostic.offendingToken}" needs a value after it — e.g. '5 ${diagnostic.offendingToken} 3'.`

    case 'stray-operand':
      return `"${diagnostic.offendingToken}" has no operator connecting it to the previous value. ` +
        `Add an operator — e.g. '… plus ${diagnostic.offendingToken}' or '… times ${diagnostic.offendingToken}'.`

    case 'unbalanced-grouping': {
      const bal = diagnostic.parenBalance!
      const diff = bal.open - bal.close
      const missing = diff > 0
        ? `${diff} closing parenthes${diff === 1 ? 'is' : 'es'}`
        : `${Math.abs(diff)} opening parenthes${Math.abs(diff) === 1 ? 'is' : 'es'}`
      return `Unbalanced parentheses — ${bal.open} open, ${bal.close} close. Add ${missing}.`
    }

    case 'ambiguity': {
      const cr = diagnostic.competingReadings!
      const interps = cr.interpretations.join(' or ')
      return `"${cr.token}" is ambiguous here — it could mean ${interps}. ` +
        "Use a more specific form: e.g. 'plus' for addition, or 'the list …, …' for a list."
    }

    case 'missing-parameter':
      return NL_MESSAGES[NlErrorCode.TEST_NEEDS_PARAM]!

    case 'out-of-coverage': {
      const feats = diagnostic.recognized?.features ?? []
      const featList = feats.join(' and ')
      const examples = feats.flatMap(f => EXAMPLE_BANK[f] ?? []).slice(0, 2)
      const exStr = examples.length > 0 ? ` Examples: ${examples.map(e => `'${e}'`).join('; ')}.` : ''
      return `I recognized ${featList}, but not how they fit together.${exStr}`
    }

    default:
      return NL_MESSAGES[code as NlErrorCodeValue] ?? "I didn't understand that phrasing."
  }
}

// ── Pre-processor regexes ─────────────────────────────────────────────────────

// Sprint 13 DECISION-73: explicit "solve" / "find x" prefix
const SOLVE_PRE_RE =
  /^(?:can\s+you\s+|could\s+you\s+|please\s+|would\s+you\s+)?(?:solve|find\s+x)\s+(?:for\s+|if\s+|when\s+)?(.+)/i

// Sprint 13.1 DECISION-77: "roots of / zeros of / x-intercepts of <expr>" → solve <expr>=0
const ROOTS_PRE_RE =
  /^(?:(?:find|give\s+me|compute|calculate)\s+)?(?:the\s+)?(?:roots?|zeros?|x-intercepts?)\s+(?:of\s+)?(.+)/i

// Sprint 13.1 DECISION-76: stats-test NL patterns
const T_TEST_PRE_RE =
  /^(?:(?:run|perform|do|execute|conduct|carry\s+out)\s+)?(?:a\s+)?(?:one[- ]sample\s+)?(?:student'?s?\s+)?t[-\s]?test\s+(?:for|of|on)\s+(.+)/i
const Z_TEST_PRE_RE =
  /^(?:(?:run|perform|do|execute|conduct|carry\s+out)\s+)?(?:a\s+)?(?:one[- ]sample\s+)?z[-\s]?test\s+(?:for|of|on)\s+(.+)/i

// ── Stats param extractors ────────────────────────────────────────────────────

function extractMeanParam(s: string): { mu0: number; rest: string } | null {
  const m = s.match(
    /\bwith\s+(?:mean|mu0?|μ0?|hypothesized?\s+mean?)\s*(?:of\s+)?(?:=\s*)?([-\d.]+)/i
  )
  if (!m || m.index === undefined) return null
  return { mu0: parseFloat(m[1]), rest: s.slice(0, m.index) + s.slice(m.index + m[0].length) }
}

function extractSigmaParam(s: string): { sigma: number; rest: string } | null {
  const m = s.match(
    /\b(?:and\s+)?(?:sigma|σ|std\.?\s*dev\.?|s\.?d\.?|sd)\s*(?:=\s*)?([-\d.]+)/i
  )
  if (!m || m.index === undefined) return null
  return { sigma: parseFloat(m[1]), rest: s.slice(0, m.index) + s.slice(m.index + m[0].length) }
}

function extractNumbers(s: string): number[] | null {
  const nums: number[] = []
  for (const m of s.matchAll(/([-\d.]+(?:[eE][-+]?\d+)?)/g)) {
    const v = parseFloat(m[1])
    if (isFinite(v)) nums.push(v)
  }
  return nums.length >= 1 ? nums : null
}

// ── Sprint 8.1 #3: Strip definition prefixes before tokenization ──────────────
// "graph y = x^2", "graph f(x) = x^2", "y(x) = x+1" → strip the LHS + "="
// so only the RHS expression is tokenized.  Pattern:
//   optional-graph-verb  <name>[(<var>)]  optional-spaces = optional-spaces
// Capture group 1: the optional graph verb prefix (kept).
const DEF_PREFIX_RE = /^((?:graph|plot|sketch|draw|show\s+me(?:\s+the)?)\s+)?[a-zA-Z]\w*(?:\s*\([a-zA-Z]\s*\))?\s*=\s*/i

function stripDefinitionPrefix(s: string): string {
  const m = DEF_PREFIX_RE.exec(s)
  if (!m) return s
  // Keep the graph verb prefix (group 1) if present, then take the RHS.
  const verb = m[1] ?? ''
  return verb + s.slice(m[0].length)
}

// ── DECISION-51: free variable in parse → graph intent ────────────────────────
// If the best parse contains any 'var' node (unbound algebraic variable),
// the expression cannot evaluate to a scalar — route it as a graph action.
function hasVariable(node: ParseNode): boolean {
  switch (node.t) {
    case 'var':   return true
    case 'num':   case 'frac': case 'const': case 'mref': return false
    case 'neg':   case 'pos':  case 'fn1':   return hasVariable(node.arg)
    case 'fnN':   return (node as { items: ParseNode[] }).items.some(hasVariable)
    case 'list':  return (node as { items: ParseNode[] }).items.some(hasVariable)
    case 'angleMark': return hasVariable((node as { expr: ParseNode }).expr)
    case 'graph': return hasVariable((node as { expr: ParseNode }).expr)
    case 'fnN2':  return (node as { xs: ParseNode[]; ys: ParseNode[] }).xs.some(hasVariable) || (node as { xs: ParseNode[]; ys: ParseNode[] }).ys.some(hasVariable)
    default: {
      // Binary nodes (add, sub, mul, div, pow) use l/r fields
      const n = node as { l?: ParseNode; r?: ParseNode; arg?: ParseNode; frac?: ParseNode }
      if (n.l && n.r) return hasVariable(n.l) || hasVariable(n.r)
      if (n.arg) return hasVariable(n.arg)
      if (n.frac) return hasVariable(n.frac)
      return false
    }
  }
}

export function nlToFormal(input: string, _settings: NlSettings = {}): NlResult {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, code: NlErrorCode.EMPTY, diagnostic: { category: 'empty-incomplete' } }

  // ── Pre-processor 1: explicit solve/find-x prefix (Sprint 13 DECISION-73, extended 13.1 DECISION-77) ──
  // Intercepts "solve <expr>" and "solve <lhs>=<rhs>".
  // When no '=' is present, solves <expr>=0 if <expr> contains a free variable.
  // "solve 2+2" falls through (no free variable, no '=') → normal pipeline.
  const solveMatch = SOLVE_PRE_RE.exec(trimmed)
  if (solveMatch) {
    const equationStr = solveMatch[1].trim()
    const eqIdx = equationStr.indexOf('=')
    if (eqIdx > 0) {
      // Has '=' — process both sides
      const lhsStr = equationStr.slice(0, eqIdx).trim()
      const rhsStr = equationStr.slice(eqIdx + 1).trim()
      const lhsFormal = nlStagesAtoD(lhsStr)
      const rhsFormal = nlStagesAtoD(rhsStr)
      if (lhsFormal !== null && rhsFormal !== null) {
        const formal = `solve(${lhsFormal}=${rhsFormal})`
        return { ok: true, kind: 'action', action: 'solve', formal, ignored: [], unrecognized: [] }
      }
    } else {
      // No '=' — solve <expr>=0 when <expr> has a free variable (DECISION-77)
      const exprFormal = nlStagesAtoD(equationStr)
      if (exprFormal !== null && freeVarsInFormal(exprFormal).size >= 1) {
        const formal = `solve(${exprFormal}=0)`
        return { ok: true, kind: 'action', action: 'solve', formal, ignored: [], unrecognized: [] }
      }
      // No free variable (e.g. "solve 2+2") — fall through to normal pipeline
    }
  }

  // ── Pre-processor 2: "roots/zeros/x-intercepts of <expr>" (Sprint 13.1 DECISION-77) ──
  const rootsMatch = ROOTS_PRE_RE.exec(trimmed)
  if (rootsMatch) {
    const exprStr = rootsMatch[1].trim()
    const exprFormal = nlStagesAtoD(exprStr)
    if (exprFormal !== null && freeVarsInFormal(exprFormal).size >= 1) {
      const formal = `solve(${exprFormal}=0)`
      return { ok: true, kind: 'action', action: 'solve', formal, ignored: [], unrecognized: [] }
    }
    // Falls through to normal pipeline if expression has no variable or can't parse
  }

  // ── Pre-processor 3: 1-sample t-test NL (Sprint 13.1 DECISION-76) ──
  const tTestMatch = T_TEST_PRE_RE.exec(trimmed)
  if (tTestMatch) {
    const rest0 = tTestMatch[1]
    const meanResult = extractMeanParam(rest0)
    if (!meanResult) {
      return { ok: false, code: NlErrorCode.TEST_NEEDS_PARAM, diagnostic: { category: 'missing-parameter', offendingToken: 'mean (μ0)', expected: ['mean'] } }
    }
    const nums = extractNumbers(meanResult.rest)
    if (!nums || nums.length < 2) {
      return { ok: false, code: NlErrorCode.COVERAGE }
    }
    const listFormal = `{${nums.join(', ')}}`
    return { ok: true, kind: 'evaluate', formal: `tTestData(${meanResult.mu0}, ${listFormal})`, ignored: [], unrecognized: [] }
  }

  // ── Pre-processor 4: 1-sample z-test NL (Sprint 13.1 DECISION-76) ──
  const zTestMatch = Z_TEST_PRE_RE.exec(trimmed)
  if (zTestMatch) {
    const rest0 = zTestMatch[1]
    const meanResult = extractMeanParam(rest0)
    if (!meanResult) {
      return { ok: false, code: NlErrorCode.TEST_NEEDS_PARAM, diagnostic: { category: 'missing-parameter', offendingToken: 'mean (μ0)', expected: ['mean', 'sigma'] } }
    }
    const sigmaResult = extractSigmaParam(meanResult.rest)
    if (!sigmaResult) {
      return { ok: false, code: NlErrorCode.TEST_NEEDS_PARAM, diagnostic: { category: 'missing-parameter', offendingToken: 'sigma (σ)', expected: ['sigma'] } }
    }
    const nums = extractNumbers(sigmaResult.rest)
    if (!nums || nums.length < 1) {
      return { ok: false, code: NlErrorCode.COVERAGE }
    }
    const listFormal = `{${nums.join(', ')}}`
    return { ok: true, kind: 'evaluate', formal: `zTestData(${meanResult.mu0}, ${sigmaResult.sigma}, ${listFormal})`, ignored: [], unrecognized: [] }
  }

  // ── Pre-processor 5: implicit equation routing (Sprint 13.1 DECISION-75) ──
  // An input with '=' that isn't a definition (y=f(x) form) may be an equation
  // to solve.  Split at first '=', parse both sides, count free variables:
  //   exactly 1 variable → solve intent
  //   2+ variables        → fall through (e.g. y + x = 5, let normal pipeline handle)
  //   0 variables         → fall through (e.g. would-be bare arithmetic)
  // DEF_PREFIX_RE check: "y=x^2", "f(x)=..." are definitions, not equations.
  if (trimmed.includes('=') && !DEF_PREFIX_RE.test(trimmed)) {
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const lhsStr = trimmed.slice(0, eqIdx).trim()
      const rhsStr = trimmed.slice(eqIdx + 1).trim()
      const lhsFormal = nlStagesAtoD(lhsStr)
      const rhsFormal = nlStagesAtoD(rhsStr)
      if (lhsFormal !== null && rhsFormal !== null) {
        const allVars = freeVarsInFormal(`${lhsFormal} ${rhsFormal}`)
        if (allVars.size === 1) {
          const formal = `solve(${lhsFormal}=${rhsFormal})`
          return { ok: true, kind: 'action', action: 'solve', formal, ignored: [], unrecognized: [] }
        }
        // 2+ vars (relation like y+x=5) or 0 vars — fall through
      }
    }
  }

  // Sprint 8.1 #3: Strip definition prefixes ("y = ...", "f(x) = ...", "graph y = ...")
  const preprocessed = stripDefinitionPrefix(trimmed)

  // Stage A: tokenize — never throws (unknown words → UNKNOWN tokens, start positions preserved).
  // Extracted before the try block so diagnostic computation has the token profile on failure.
  const rawTokensForDiag = tokenize(preprocessed)

  try {
    // Stage B: resolve number phrases
    const resolved = resolveNumbers(rawTokensForDiag)

    // Stage C: drop framing + unknowns, collect what was dropped
    const { tokens: stripped, ignored, unrecognized } = stripFraming(resolved)
    if (stripped.length === 0) {
      return { ok: false, code: NlErrorCode.EMPTY, diagnostic: { category: 'empty-incomplete' } }
    }

    // Sprint 8 DECISION-48: ANGLE_UNIT tokens now produce inline angle markers (not rejected).
    // The grammar's parseAtom handles NUM ANGLE_UNIT → angleMark node.
    // Any ANGLE_UNIT NOT adjacent to a value will cause E_NL_COVERAGE (correct behavior).

    // Stage D: parse → forest → disambiguate → emit
    const forest = parseForest(stripped)
    const best = disambiguate(forest)   // throws E_NL_* on failure
    const formal = emit(best)

    // Sprint 8 DECISION-44: explicit graph intent → action:'graph' result
    if (best.t === 'graph') {
      return { ok: true, kind: 'action', action: 'graph', formal, ignored, unrecognized }
    }

    // Sprint 8.1 DECISION-51: expression with unbound free variable → graph intent.
    // (symbolTable state not available in NL layer — 'x'/'y'/'t' always → graph)
    if (hasVariable(best)) {
      return { ok: true, kind: 'action', action: 'graph', formal, ignored, unrecognized }
    }

    return { ok: true, kind: 'evaluate', formal, ignored, unrecognized }
  } catch (e) {
    const err = e as { code?: string; span?: [number, number]; competingParses?: ParseNode[] }
    const code = err.code ?? NlErrorCode.COVERAGE
    // Sprint 15 DECISION-81: compute structured diagnostic from token profile + error code.
    const diagnostic = computeNlDiagnostic(trimmed, rawTokensForDiag, code, err.competingParses)
    return { ok: false, code, span: err.span, diagnostic }
  }
}
