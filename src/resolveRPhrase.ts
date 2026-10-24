// ── Phrase resolution for the RStudio target ───────────────────────────────
// Mirrors every other interface's resolveTo…/resolve…Phrase.ts shape (a
// single entry point, its own failure class) but returns an RCommand — not
// a bare string — because (per EXECUTION.md §3) this repo has TWO write
// targets, not one: the live Console (the default — R commands are things
// people want the ANSWER to, right now, same reasoning as
// Ninebark-MATLABExtension's live-eval model) and the Source editor (for
// explicitly authoring into an open script, Ninebark-OverleafExtension's
// "insert, never run" model, transplanted correctly this time onto a target
// that actually IS a document).
//
// Resolution order:
//   -0.5. Symbol preprocessing — the vendored normalizeUnicodeMath()
//         handles operator-shaped symbols (×, ≤, √, π, superscripts);
//         three LOCAL preprocessors below handle symbols it doesn't —
//         tryAbsoluteValueBars ("|x|"), normalizeGreekStats (σ/μ/ρ/χ²),
//         normalizeDegreeSymbol ("90°", not just the word "degrees") —
//         because the vendored tier-2 engine SILENTLY DROPS an
//         unrecognized symbol rather than erroring on it, which can
//         produce a wrong answer, not just a missing feature (see
//         CLAUDE.md's "vendored engine silently drops" gotcha).
//   0. Raw R pass-through — the input already IS R ("x <- 5", "plot(t, y)").
//      Same idea as every other interface's raw-syntax pass-through.
//   0.5. Source-editor routing — a leading "in the script"/"in the source
//        editor"/"insert into the file" phrase strips itself off and routes
//        the REST of the resolution to the Source editor instead of the
//        Console. Everything else below is unaffected by which target wins;
//        only the wrapper result's `target` field changes.
//   1. This repo's R-native recognizers — control flow, assignment,
//      workspace/session/packages, data import, data inspection, data
//      cleaning & filtering, creating & transforming variables,
//      descriptive statistics, data visualization, statistical tests &
//      inference, regression & modeling, sampling/diagnostics/research
//      workflows, intro-stats-course vocabulary, vectors & data frames,
//      plotting, string ops, calculus, linear algebra. Vocabulary with
//      no Desmos/Sheets/MATLAB equivalent, each producing a complete R
//      statement.
//   2. Vendored tier-1  recognizeDesmosPhrase  → formalStringToR
//   3. Vendored tier-2  nlToFormal             → formalStringToR
//
// Anything unrecognized throws RNlFailure with a specific message — never a
// silent wrong statement.

import { nlToFormal, buildNlErrorMessage } from '@ninebark/nl/index'
import type { NlDiagnostic } from '@ninebark/types/diagnostic'
import { recognizeDesmosPhrase, stripFiller, normalizeUnicodeMath } from './vendor/ninebark-engine/desmosNlVocab'
import { formalStringToR, UnsupportedRFormalError } from './formalToR'
import { recognizeAssignment, type ValueResolver } from './rAssignment'
import { recognizeControlFlow } from './rControlFlow'
import { recognizeWorkspace } from './rWorkspace'
import { recognizeDataImport } from './rDataImport'
import { recognizeDataInspection } from './rDataInspection'
import { recognizeDescriptiveStats } from './rDescriptiveStats'
import { recognizeDataVisualization } from './rDataVisualization'
import { recognizeStatisticalTests } from './rStatisticalTests'
import { recognizeRegression } from './rRegression'
import { recognizeResearchWorkflow } from './rResearchWorkflow'
import { recognizeIntroStats } from './rIntroStats'
import { recognizeDataCleaning } from './rDataCleaning'
import { recognizeDataTransform } from './rDataTransform'
import { recognizeVectorsAndDataFrames } from './rVectorsAndDataFrames'
import { recognizePlotting } from './rPlotting'
import { recognizeStrings } from './rStrings'
import { recognizeCalculus, RCalculusUnsupportedError } from './rCalculus'
import { recognizeLinearAlgebra } from './rLinearAlgebra'
import { decideEscalation } from './vendor/ninebark-engine/escalationGate'
import { callAiRelay } from './vendor/ninebark-engine/aiRelayClient'

export class RNlFailure extends Error {
  // See Ninebark-DesmosExtension's resolvePhrase.ts NlFailure for why.
  constructor(message: string, public diagnostic?: NlDiagnostic) {
    super(message)
  }
}

// Mirrors Ninebark-DesmosExtension's resolvePhrase.ts fix: nlToFormal is
// deliberately lenient about words it can't place (DECISION-37:
// "drop-and-surface, not reject") — it strips them from the math-only
// stream and still returns ok:true on whatever's left, recording exactly
// what it dropped in `unrecognized`. Trusting ok:true without checking that
// field means e.g. "let x be blah thirds" would silently assign x <- 1/3,
// dropping "blah" with zero indication anything was ignored.
function unrecognizedWordsMessage(words: string[]): string {
  const quoted = words.map(w => `"${w}"`)
  const list = quoted.length <= 2
    ? quoted.join(' and ')
    : `${quoted.slice(0, -1).join(', ')}, and ${quoted[quoted.length - 1]}`
  const noun = quoted.length === 1 ? 'a number, function, or operator' : 'numbers, functions, or operators'
  return `I don't recognize ${list} as ${noun}.`
}

export type RTarget = 'console' | 'source'
export interface RCommand { target: RTarget; code: string }

// ── Raw R pass-through heuristic ───────────────────────────────────────────
// The input already IS R when it is:
// (a) an assignment: an identifier — optionally with ONE "[...]" / "[[...]]"
//     index or "$field" — then "<-" or "=" (not "==", "<=", ">=", "!="),
//     then a non-empty right-hand side. Catches "x <- 5", "x = 5",
//     "A[1] <- 7", "s$field <- 2".
// (b) a single function-call statement: "name(...)" where the FIRST "("
//     pairs with the LAST ")" (so "solve x^2 = 4" is never mistaken for a
//     call). Catches "plot(t, y)", "print(x)", "mean(c(1,2,3))".
// (c) a bare literal value: "c(1, 2, 3)", "1:10", "42", "-3.5", "'text'",
//     "TRUE"/"FALSE"/"NA"/"NULL". Mostly matters as an assignment/argument
//     RHS ("set x to c(1, 2, 3)").
// Mixing English into an assignment RHS ("x <- mean of 1,2,3") is passed
// through verbatim and will error in R — use "let x be the mean of 1,2,3"
// instead (README documents this boundary, same as every other interface).
const RAW_ASSIGN_RE = /^[A-Za-z.][\w.]*(?:\[\[?[^[\]]*\]?\]|\$[A-Za-z.][\w.]*)?\s*(?:<-|=)(?!=)\s*\S[\s\S]*$/
const RAW_LITERAL_RE = /^(?:TRUE|FALSE|NA|NULL|Inf|NaN|"[^"]*"|'[^']*'|-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?L?(?:\s*:\s*-?(?:\d+\.?\d*|\.\d+)){0,2})$/

function looksLikeRawCall(t: string): boolean {
  const m = /^([A-Za-z][\w.]*)\((.*)\)$/s.exec(t)
  if (!m) return false
  let depth = 0
  for (let i = m[1].length; i < t.length; i++) {
    if (t[i] === '(') depth++
    else if (t[i] === ')') {
      depth--
      if (depth === 0 && i !== t.length - 1) return false // first "(" closed early
    }
  }
  return depth === 0
}

function tryRawR(text: string): string | null {
  const t = text.trim().replace(/\s*;\s*$/, '')
  if (RAW_ASSIGN_RE.test(t) || RAW_LITERAL_RE.test(t) || looksLikeRawCall(t)) return t
  return null
}

// "|x|" / "|-5|" — formal absolute-value bar notation, wrapping the
// WHOLE expression. Checked before tier-1/tier-2 ever see the text:
// the vendored tier-2 tokenizer treats "|" as unrecognized punctuation
// and silently drops it rather than erroring, so "|-5|" would otherwise
// resolve to the bare literal -5 instead of its actual absolute value,
// 5 — confirmed empirically (nlToFormal('|-5|') -> formal "(-5)"), not
// assumed. Deliberately narrow — only fires when "|" wraps the ENTIRE
// expression with no OTHER pipe character inside — so this never
// misreads R's own "|" (logical OR, e.g. "TRUE | FALSE") or a native
// pipe operator used in the middle of a genuine raw-R expression.
function tryAbsoluteValueBars(text: string): string | null {
  const m = /^\|([^|]+)\|$/.exec(text.trim())
  if (!m) return null
  return `abs(${m[1].trim()})`
}

// Standard Greek-letter statistical notation -> the English word this
// repo's own recognizers (rDescriptiveStats.ts, rStatisticalTests.ts, …)
// already understand. The vendored normalizeUnicodeMath() handles
// operator-shaped symbols (×, ≤, √, π, …) but stops there — it has no
// reason to know "σ" means "standard deviation" in THIS repo's own
// data-column vocabulary, since the shared engine it's written for only
// ever deals with literal numbers, never a column. Applied once, up
// front, same spot as normalizeUnicodeMath — and AFTER it, since a typed
// "σ²" arrives as "σ^2" by then (the vendored step already turned the
// superscript into "^2"), so the variance case has to match that form,
// not the original superscript character.
// "sin(90°)" / "sin 90°" — the degree SYMBOL, as opposed to the spelled-
// out word "degrees" the vendored NL engine already converts correctly
// ("sin 90 degrees" -> sin(90*pi/180)). Left unhandled, "°" is silently
// dropped as unrecognized punctuation (same failure mode as "|" for
// absolute value, confirmed empirically the same way): "sin 90°" became
// `sin(90)` — R's sin() takes RADIANS, so this is a SILENTLY WRONG
// numeric answer (sin(90) in radians is ~0.894, not 1), not just a
// missing feature. Two different fixes for two different shapes: inside
// parens ("sin(90°)" — already shaped like a raw R call, which
// looksLikeRawCall()/tryRawR would otherwise pass through verbatim with
// the literal "°" character still in it, a guaranteed R syntax error) the
// degree symbol is replaced with the radian arithmetic DIRECTLY, keeping
// the result valid R; everywhere else (bare NL, "sin 90°") it's restored
// to the word "degrees" so the vendored engine's own existing conversion
// does the rest, unchanged.
function normalizeDegreeSymbol(text: string): string {
  let t = text.replace(/(\d+(?:\.\d+)?)\s*°(?=\s*\))/g, '($1*pi/180)')
  t = t.replace(/(\d+(?:\.\d+)?)\s*°/g, '$1 degrees')
  return t
}

function normalizeGreekStats(text: string): string {
  return text
    .replace(/σ\s*\^?\s*2/g, 'variance')
    .replace(/σ/g, 'standard deviation')
    .replace(/μ/g, 'mean')
    .replace(/ρ/g, 'correlation')
    .replace(/χ\s*\^?\s*2/g, 'chi-squared')
}

// A softer check, used only AFTER the native recognizers and the tier-1
// vocab have both declined: the text is already an R math expression the
// shared NL engine (tier 2) would mangle rather than parse — genuinely
// R-only syntax ("x[2]", "df$col", "x %% 2", "a:b").
const NL_MATH_WORD_RE =
  /\b(?:of|the|and|to|from|with|by|over|per|choose|mod|modulo|remainder|list|values?|base|power|raised|root|squared?|cubed?|nth|percent)\b/i

function looksLikeRawExpr(text: string): boolean {
  const s = text.trim()
  if (!/^[\w\s.,+\-*/^%()[\]{}."':;<>=~!|&@\\$]+$/.test(s)) return false
  if (NL_MATH_WORD_RE.test(s)) return false
  if (/\$|\[\[?|;|::|%%|%\/%|%\*%/.test(s)) return true          // df$col  x[2]  x %% n  A %*% B
  if (/\)\s*[-+*/^%]\s*\S/.test(s)) return true                  // sin(x)/x, (x+1)^2
  return false
}

// "run …" / "execute …" as a conversational lead-in. Checked only AFTER the
// raw pass-through, so a genuine "run('script.R')" call is taken verbatim
// first and never reaches this.
function stripRLeadVerb(text: string): string {
  return text.replace(/^\s*(?:run|execute)\s+(?:the\s+(?:command|statement|code|line)\s+)?/i, '')
}

// "in the script <phrase>" / "in the source editor, <phrase>" / "insert
// <phrase> into the file" / "add <phrase> to the script" — routes the rest
// of resolution to the Source editor instead of the Console (EXECUTION.md
// §3). Stripped BEFORE anything else sees the text, so every recognizer
// below is written with no knowledge that this routing exists.
const SOURCE_LEAD_RE = /^(?:in\s+the\s+(?:script|source(?:\s+editor)?|(?:current\s+)?file)\s*[:,]?\s+)(.+)$/i
const SOURCE_INSERT_WRAP_RE = /^insert\s+(.+?)\s+into\s+the\s+(?:script|source(?:\s+editor)?|file)$/i
const SOURCE_ADD_WRAP_RE = /^add\s+(.+?)\s+to\s+the\s+(?:script|source(?:\s+editor)?|file)$/i

function splitSourceRouting(text: string): { body: string; toSource: boolean } {
  let m = SOURCE_LEAD_RE.exec(text)
  if (m) return { body: m[1].trim(), toSource: true }
  m = SOURCE_INSERT_WRAP_RE.exec(text)
  if (m) return { body: m[1].trim(), toSource: true }
  m = SOURCE_ADD_WRAP_RE.exec(text)
  if (m) return { body: m[1].trim(), toSource: true }
  return { body: text, toSource: false }
}

function toStatement(formal: string): string {
  try {
    return formalStringToR(formal)
  } catch (err) {
    if (err instanceof UnsupportedRFormalError) throw new RNlFailure(err.message)
    throw err
  }
}

// Resolves a SUB-phrase (an assignment RHS, a loop/conditional body, a
// print argument) to an R expression — the value tiers only (raw → tier-1 →
// tier-2), never the native command recognizers, so there's no recursion
// back into this module's own command grammar. Passed into the recognizers
// that need it.
const resolveValue: ValueResolver = (phrase: string): string => {
  const t = stripFiller(normalizeDegreeSymbol(normalizeGreekStats(normalizeUnicodeMath(phrase)))).trim()
  if (!t) throw new RNlFailure('That command is missing its value.')

  const raw = tryRawR(t)
  if (raw !== null) return raw

  const abs = tryAbsoluteValueBars(t)
  if (abs !== null) return abs

  const vocab = recognizeDesmosPhrase(t)
  if (vocab !== null) return toStatement(vocab)

  if (looksLikeRawExpr(t)) return t

  const nl = nlToFormal(t)
  if (nl.ok) {
    if (nl.unrecognized.length > 0) throw new RNlFailure(unrecognizedWordsMessage(nl.unrecognized))
    return toStatement(nl.formal)
  }

  throw new RNlFailure(buildNlErrorMessage(nl.code, nl.diagnostic))
}

function resolveBody(text: string): string {
  if (!text) throw new RNlFailure('Type a command for R to run.')

  const raw = tryRawR(text)
  if (raw !== null) return raw

  const abs = tryAbsoluteValueBars(text)
  if (abs !== null) return abs

  let native: string | null = null
  try {
    native =
      recognizeControlFlow(text, resolveValue) ??
      recognizeWorkspace(text) ??
      recognizeDataImport(text) ??
      recognizeDataInspection(text) ??
      recognizeDataCleaning(text) ??
      recognizeDataTransform(text) ??
      recognizeDescriptiveStats(text) ??
      recognizeDataVisualization(text) ??
      recognizeStatisticalTests(text) ??
      recognizeRegression(text) ??
      recognizeResearchWorkflow(text) ??
      recognizeIntroStats(text) ??
      recognizeVectorsAndDataFrames(text) ??
      recognizePlotting(text) ??
      recognizeStrings(text) ??
      recognizeCalculus(text) ??
      recognizeLinearAlgebra(text) ??
      recognizeAssignment(text, resolveValue)
  } catch (err) {
    if (err instanceof RCalculusUnsupportedError) throw new RNlFailure(err.message)
    throw err
  }
  if (native !== null) return native

  const vocab = recognizeDesmosPhrase(text)
  if (vocab !== null) return toStatement(vocab)

  if (looksLikeRawExpr(text)) return text

  const nl = nlToFormal(text)
  if (nl.ok) {
    if (nl.unrecognized.length > 0) throw new RNlFailure(unrecognizedWordsMessage(nl.unrecognized))
    return toStatement(nl.formal)
  }

  throw new RNlFailure(buildNlErrorMessage(nl.code, nl.diagnostic), nl.diagnostic)
}

export function resolveToRCommand(rawInput: string): RCommand {
  const cleaned = stripRLeadVerb(stripFiller(normalizeDegreeSymbol(normalizeGreekStats(normalizeUnicodeMath(rawInput.trim()))))).trim()
  if (!cleaned) throw new RNlFailure('Type a command for R to run.')

  const { body, toSource } = splitSourceRouting(cleaned)
  const code = resolveBody(body)
  return { target: toSource ? 'source' : 'console', code }
}

// Convenience for callers (tests, the widget's "Show R" toggle) that only
// want the code string and don't care which target it's headed to.
export function resolveToRStatement(rawInput: string): string {
  return resolveToRCommand(rawInput).code
}

// ── Tier 4: AI fallback (browser extension only) ────────────────────────────
// See Ninebark-DesmosExtension's resolvePhrase.ts resolveToOutputWithAiFallback
// for the full reasoning. This is the BROWSER-extension counterpart to the
// R-package Addin's ninebark_resolve_with_ai_fallback() (ninebark-r/R/resolve.R
// + escalationGate.R + aiRelayClient.R) — a separate implementation, not
// shared code, because the Addin's V8 bridge is synchronous with no event
// loop to resolve a network Promise against (see ninebarkBundle.ts's own
// comment), so that side's relay call has to happen in R instead. This side
// runs in a real browser tab with real fetch, so it can just call
// callAiRelay() directly like every other interface.
//
// Confirmed empirically that formalStringToR's own known-name guard already
// rejects the model's literal "UNSUPPORTED" sentinel ("I don't recognize
// UNSUPPORTED as part of an R command") — the explicit check below is kept
// anyway for consistency with every other interface.
//
// raw-code tier ALWAYS resolves to target:'source' (insert into the Ace
// editor, unexecuted) regardless of what the failed deterministic
// resolution's own target would have been — never 'console', which
// extension/src/rstudio.ts dispatches via RPC immediately on receipt. This
// is the browser-extension's equivalent of the Addin's forced
// nb_manual_outcome() override: AI-generated, multi-statement code is
// never auto-run, only ever shown/inserted for review.
export async function resolveToRCommandWithAiFallback(rawInput: string): Promise<RCommand> {
  try {
    return resolveToRCommand(rawInput)
  } catch (err) {
    if (!(err instanceof RNlFailure)) throw err

    const decision = decideEscalation(err.diagnostic, rawInput)
    if (!decision.escalate || !decision.tier) throw err

    const relayResult = await callAiRelay(rawInput, 'rstudio', decision.tier, err.diagnostic?.recognized?.features)
    if (!relayResult.ok) throw err

    if (relayResult.mode === 'formal') {
      if (relayResult.result.trim() === 'UNSUPPORTED') throw err
      return { target: 'console', code: toStatement(relayResult.result) }
    }

    if (relayResult.code.trim() === 'UNSUPPORTED' || !relayResult.code.trim()) throw err
    return { target: 'source', code: relayResult.code }
  }
}
