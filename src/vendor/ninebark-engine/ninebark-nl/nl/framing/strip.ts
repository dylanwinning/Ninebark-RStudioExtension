import type { NlToken } from '../lexicon/classes'

// ── Stage C: Position-free ignore pass (DECISION-35 / Sprint 7.2)
//             Drop-and-surface for unknowns (DECISION-37 / Sprint 7.3) ──────────
//
// Returns three things:
//   tokens       — residual math-only stream (FRAMING and UNKNOWN removed)
//   ignored      — raw text of FRAMING tokens dropped (known safe filler)
//   unrecognized — raw text of UNKNOWN tokens dropped (surfaced to user)
//
// Step 1 — Remove FRAMING (known ignore-vocab) and UNKNOWN (drop-and-surface) tokens.
// Step 2 — Collapse pause-commas created by filler removal (see note below).
//
// Comma collapse is asymmetric:
//   PREV_SEP includes AND  → COMMA after AND is a pause-comma (removable).
//   NEXT_SEP excludes AND  → COMMA before AND is Oxford comma (must stay).
// Example: "sum of 1, 2, and 3" keeps the Oxford comma; "and, um, 4" drops it.

export interface StripResult {
  tokens: NlToken[]
  ignored: string[]
  unrecognized: string[]
}

const PREV_SEP = new Set([
  'ADD', 'SUB', 'MUL', 'DIV', 'POW',
  'AND', 'MORE', 'LESS', 'THAN', 'OF', 'BY',
  'SQUARED', 'CUBED', 'NEGATIVE', 'TWICE', 'TRIPLE', 'SUBFROM',
  'FUNC1', 'FUNCN', 'COMMA', 'LPAREN', 'LBRACE',
  // Sprint 7.4: command-verb forms and their connectives
  'CMD_ADD', 'CMD_SUB', 'CMD_MUL', 'CMD_DIV', 'CMD_POW', 'CMD_SQ', 'CMD_CB', 'CMD_NEG',
  'FROM',
  // Sprint 7.5: new operative tokens (§L/M/N/O/P)
  'POW_N', 'SECANT', 'COSECANT', 'COTANGENT', 'LOG_BASE', 'ROOT_OF',
  'QUADRUPLE', 'HALVE', 'DOUBLED', 'TRIPLED', 'QUADRUPLED', 'HALVED',
  // Sprint 7.6: angle unit operative (§V) — now emits angle marker (Sprint 8 DECISION-48)
  'ANGLE_UNIT',
  // Sprint 8: new operative classes
  'GRAPH_INTENT', 'VARIABLE', 'MREF', 'REG2',
])

const NEXT_SEP = new Set([
  // Same as PREV_SEP but WITHOUT 'AND' — preserves Oxford comma before "and"
  'ADD', 'SUB', 'MUL', 'DIV', 'POW',
  'MORE', 'LESS', 'THAN', 'OF', 'BY',
  'SQUARED', 'CUBED', 'NEGATIVE', 'TWICE', 'TRIPLE', 'SUBFROM',
  'FUNC1', 'FUNCN', 'COMMA', 'LPAREN', 'LBRACE',
  // Sprint 7.4: command-verb forms and their connectives
  'CMD_ADD', 'CMD_SUB', 'CMD_MUL', 'CMD_DIV', 'CMD_POW', 'CMD_SQ', 'CMD_CB', 'CMD_NEG',
  'FROM',
  // Sprint 7.5: new operative tokens (§L/M/N/O/P)
  'POW_N', 'SECANT', 'COSECANT', 'COTANGENT', 'LOG_BASE', 'ROOT_OF',
  'QUADRUPLE', 'HALVE', 'DOUBLED', 'TRIPLED', 'QUADRUPLED', 'HALVED',
  // Sprint 7.6 / 8
  'ANGLE_UNIT',
  // Sprint 8: new operative classes
  'GRAPH_INTENT', 'VARIABLE', 'MREF', 'REG2',
])

export function stripFraming(tokens: NlToken[]): StripResult {
  const ignored: string[] = []
  const unrecognized: string[] = []

  // Step 1: remove FRAMING and UNKNOWN tokens, recording them separately
  let result = tokens.filter(t => {
    if (t.cls === 'FRAMING') { ignored.push(t.raw); return false }
    if (t.cls === 'UNKNOWN') { unrecognized.push(t.raw); return false }
    return true
  })

  // Step 2: iteratively collapse orphaned commas (runs until stable)
  let changed = true
  while (changed) {
    changed = false
    const next = result.filter((tok, i) => {
      if (tok.cls !== 'COMMA') return true
      const prev = result[i - 1]
      const nxt  = result[i + 1]
      const prevIsSep = prev === undefined || PREV_SEP.has(prev.cls)
      const nextIsSep = nxt  === undefined || NEXT_SEP.has(nxt.cls)
      if (prevIsSep || nextIsSep) { changed = true; return false }
      return true
    })
    result = next
  }

  return { tokens: result, ignored, unrecognized }
}
