// ── R-native: control flow ──────────────────────────────────────────────
// "for i in 1 to 10 print i", "if x is greater than 5 print big", "while x
// is less than 10 print x and increment x" — no equivalent anywhere else in
// Ninebark (Desmos/Sheets/MATLAB's expression-oriented interfaces don't
// have a "type a whole loop as one line" idiom the way a Console-driven R
// session naturally invites). Deliberately scoped to a SINGLE-statement
// body — "for i in 1 to 10 print i" — not a multi-line block, matching this
// project's one-phrase-in, one-command-out model everywhere else; a
// genuinely multi-statement loop is exactly what the Source-editor insertion
// path (EXECUTION.md §3) is for, typed as raw R there.

import type { ValueResolver } from './rAssignment'

const COMPARATORS: Array<[RegExp, string]> = [
  [/greater than or equal to/i, '>='], [/at least/i, '>='],
  [/less than or equal to/i, '<='], [/at most/i, '<='],
  [/not equal to/i, '!='],
  [/greater than/i, '>'],
  [/less than/i, '<'],
  [/equal to|equals/i, '=='],
]

function translateCondition(cond: string, resolveValue: ValueResolver): string | null {
  const c = cond.trim()
  for (const [re, op] of COMPARATORS) {
    const m = c.match(new RegExp(`^([A-Za-z][\\w.]*)\\s+is\\s+(?:${re.source})\\s+(.+)$`, 'i'))
    if (m) return `${m[1]}${op}${resolveValue(m[2].trim())}`
  }
  // Fall through to a raw R condition ("x > 5", "x %% 2 == 0") passed as-is.
  if (/^[\w\s.+\-*/^%()<>=!&|]+$/.test(c)) return c
  return null
}

// A bare, unquoted word after "print"/"append" ("print big", the loop
// variable itself, "print total") is a variable reference far more often
// than it's a math phrase — and unlike a math phrase, it's unambiguous, so
// it's passed straight through as a raw R identifier rather than routed
// through resolveValue's NL pipeline, which would otherwise try (and fail)
// to parse "big" as an arithmetic expression and report a confusing "nothing
// to calculate" error for what's really just "print the variable big".
// Anything that ISN'T a bare identifier (a number, an expression, "the mean
// of 1,2,3") still goes through resolveValue as normal.
function resolveBodyValue(s: string, resolveValue: ValueResolver): string {
  const t = s.trim()
  return /^[A-Za-z][\w.]*$/.test(t) ? t : resolveValue(t)
}

// The single-statement action a loop/conditional body runs. Kept deliberately
// small (print / assignment / a bare expression) — anything else, write it
// as raw R directly.
function translateBody(body: string, resolveValue: ValueResolver): string | null {
  const b = body.trim()
  let m = b.match(/^print\s+(.+)$/i)
  if (m) return `print(${resolveBodyValue(m[1], resolveValue)})`
  m = b.match(/^(?:say|output)\s+['"“](.+?)['"”]$/i)
  if (m) return `print(${JSON.stringify(m[1])})`
  m = b.match(/^increment\s+([A-Za-z][\w.]*)$/i)
  if (m) return `${m[1]} <- ${m[1]} + 1`
  m = b.match(/^decrement\s+([A-Za-z][\w.]*)$/i)
  if (m) return `${m[1]} <- ${m[1]} - 1`
  m = b.match(/^append\s+(.+?)\s+to\s+([A-Za-z][\w.]*)$/i)
  if (m) return `${m[2]} <- c(${m[2]}, ${resolveBodyValue(m[1], resolveValue)})`
  // A bare raw-R statement (already looks like R, not English) — passed
  // through untouched, same "already IS R" heuristic resolveRPhrase.ts uses
  // at the top level.
  if (/^[A-Za-z][\w.]*\s*(?:<-|=)\s*\S/.test(b) || /^[A-Za-z][\w.]*\(.*\)$/.test(b)) return b
  return null
}

// "for i in 1 to 10 print i" / "for i from 1 to 10 print i" / "for each x
// in the vector v print x"
const FOR_RANGE_RE = /^for\s+([A-Za-z]\w*)\s+(?:in|from)\s+(-?\d+)\s+to\s+(-?\d+)\s+(.+)$/i
const FOR_EACH_RE = /^for\s+each\s+([A-Za-z]\w*)\s+in\s+([A-Za-z][\w.]*)\s+(.+)$/i

function tryFor(text: string, resolveValue: ValueResolver): string | null {
  let m = FOR_RANGE_RE.exec(text)
  if (m) {
    const body = translateBody(m[4], resolveValue)
    if (!body) return null
    return `for (${m[1]} in ${m[2]}:${m[3]}) { ${body} }`
  }
  m = FOR_EACH_RE.exec(text)
  if (m) {
    const body = translateBody(m[3], resolveValue)
    if (!body) return null
    return `for (${m[1]} in ${m[2]}) { ${body} }`
  }
  return null
}

// "if x is greater than 5 print big" / "if x is greater than 5 print big
// else print small"
const IF_RE = /^if\s+(.+?)\s+(?:then\s+)?(print\s+.+?|say\s+.+?|output\s+.+?|increment\s+.+?|decrement\s+.+?|append\s+.+?|[A-Za-z][\w.]*\s*(?:<-|=)\s*\S.+?)(?:\s+else\s+(.+))?$/i

function tryIf(text: string, resolveValue: ValueResolver): string | null {
  const m = IF_RE.exec(text)
  if (!m) return null
  // Find where "if" condition ends: split on the FIRST recognized action verb.
  const condEnd = text.search(/\s+(?:then\s+)?(?:print|say|output|increment|decrement|append)\b/i)
  const cond = condEnd > 0 ? text.slice(3, condEnd).trim() : m[1].trim()
  const rCond = translateCondition(cond, resolveValue)
  if (!rCond) return null
  const thenBody = translateBody(m[2], resolveValue)
  if (!thenBody) return null
  const elseBody = m[3] ? translateBody(m[3], resolveValue) : null
  if (m[3] && !elseBody) return null
  return elseBody ? `if (${rCond}) { ${thenBody} } else { ${elseBody} }` : `if (${rCond}) { ${thenBody} }`
}

// "while x is less than 10 print x and increment x" — a single body action;
// "and" chains a second action (commonly "increment" the loop variable,
// otherwise this would be an infinite loop the way a person would actually
// type it, so supporting the chain is what makes the command usable at all).
const WHILE_RE = /^while\s+(.+?)\s+(print\s+.+?|say\s+.+?|output\s+.+?)(?:\s+and\s+(increment|decrement)\s+([A-Za-z][\w.]*))?$/i

function tryWhile(text: string, resolveValue: ValueResolver): string | null {
  const m = WHILE_RE.exec(text)
  if (!m) return null
  const rCond = translateCondition(m[1].trim(), resolveValue)
  if (!rCond) return null
  const body = translateBody(m[2], resolveValue)
  if (!body) return null
  const step = m[3] ? `; ${m[4]} <- ${m[4]} ${m[3] === 'increment' ? '+' : '-'} 1` : ''
  return `while (${rCond}) { ${body}${step} }`
}

// "repeat 5 times print hi"
const REPEAT_RE = /^repeat\s+(\d+)\s+times?\s+(.+)$/i

function tryRepeat(text: string, resolveValue: ValueResolver): string | null {
  const m = REPEAT_RE.exec(text)
  if (!m) return null
  const body = translateBody(m[2], resolveValue)
  if (!body) return null
  return `for (.i in 1:${m[1]}) { ${body} }`
}

export function recognizeControlFlow(rawText: string, resolveValue: ValueResolver): string | null {
  const text = rawText.trim()
  return (
    tryFor(text, resolveValue) ??
    tryIf(text, resolveValue) ??
    tryWhile(text, resolveValue) ??
    tryRepeat(text, resolveValue)
  )
}
