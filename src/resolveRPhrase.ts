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
//      descriptive statistics, vectors & data frames, plotting, string
//      ops, calculus, linear algebra. Vocabulary with no
//      Desmos/Sheets/MATLAB equivalent, each producing a complete R
//      statement.
//   2. Vendored tier-1  recognizeDesmosPhrase  → formalStringToR
//   3. Vendored tier-2  nlToFormal             → formalStringToR
//
// Anything unrecognized throws RNlFailure with a specific message — never a
// silent wrong statement.

import { nlToFormal, buildNlErrorMessage } from '@ninebark/nl/index'
import { recognizeDesmosPhrase, stripFiller, normalizeUnicodeMath } from './vendor/ninebark-engine/desmosNlVocab'
import { formalStringToR, UnsupportedRFormalError } from './formalToR'
import { recognizeAssignment, type ValueResolver } from './rAssignment'
import { recognizeControlFlow } from './rControlFlow'
import { recognizeWorkspace } from './rWorkspace'
import { recognizeDataImport } from './rDataImport'
import { recognizeDataInspection } from './rDataInspection'
import { recognizeDescriptiveStats } from './rDescriptiveStats'
import { recognizeDataCleaning } from './rDataCleaning'
import { recognizeDataTransform } from './rDataTransform'
import { recognizeVectorsAndDataFrames } from './rVectorsAndDataFrames'
import { recognizePlotting } from './rPlotting'
import { recognizeStrings } from './rStrings'
import { recognizeCalculus, RCalculusUnsupportedError } from './rCalculus'
import { recognizeLinearAlgebra } from './rLinearAlgebra'

export class RNlFailure extends Error {}

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
  const t = stripFiller(normalizeUnicodeMath(phrase)).trim()
  if (!t) throw new RNlFailure('That command is missing its value.')

  const raw = tryRawR(t)
  if (raw !== null) return raw

  const vocab = recognizeDesmosPhrase(t)
  if (vocab !== null) return toStatement(vocab)

  if (looksLikeRawExpr(t)) return t

  const nl = nlToFormal(t)
  if (nl.ok) return toStatement(nl.formal)

  throw new RNlFailure(buildNlErrorMessage(nl.code, nl.diagnostic))
}

function resolveBody(text: string): string {
  if (!text) throw new RNlFailure('Type a command for R to run.')

  const raw = tryRawR(text)
  if (raw !== null) return raw

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
  if (nl.ok) return toStatement(nl.formal)

  throw new RNlFailure(buildNlErrorMessage(nl.code, nl.diagnostic))
}

export function resolveToRCommand(rawInput: string): RCommand {
  const cleaned = stripRLeadVerb(stripFiller(normalizeUnicodeMath(rawInput.trim()))).trim()
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
