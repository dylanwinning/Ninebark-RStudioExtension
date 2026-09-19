import { LEXICON, NUMBER_WORDS, FRACTION_DENOMS, type NlToken } from './classes'
import { IGNORE_VOCAB, ALTERNATES_MAP } from '../grammar.config'

// ── Longest-match phrase tokenizer (Stage A) ──────────────────────────────────
//
// Algorithm per position:
//  1. Digit number → NUM.
//  2. Single punctuation in PUNCT_MAP → that class.
//  3. Formal operator symbol (+, -, …) → that class.
//  4. Word in NUMBER_WORDS → NUM placeholder (Stage B resolves).
//  5. Word in FRACTION_DENOMS → FRAC placeholder (Stage B resolves).
//  6. Math LEXICON longest-match (FRAMING entries removed; lives in grammar.config.ts).
//  7. IGNORE_VOCAB longest-match → FRAMING token (removed by Stage C ignore pass).
//  8. Unrecognized → return null (caller emits E_NL_COVERAGE).

interface RawWord { text: string; start: number }

function splitInput(input: string): RawWord[] {
  const result: RawWord[] = []
  // Letters/apostrophes, numbers (including leading-decimal like .25), individual ASCII punctuation,
  // and Unicode math operators.
  // Unicode: × (U+00D7), ÷ (U+00F7), · (U+00B7 middle dot), − (U+2212 minus sign)
  // Leading-decimal alternative must come BEFORE the digit-first alternative (longest wins via regex order).
  const re = /[a-zA-Z']+|\.[0-9]+(?:[eE][+-]?[0-9]+)?|[0-9]+(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|[(){}.,?=!+\-*/^%×÷·−]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(input)) !== null) {
    result.push({ text: m[0], start: m.index })
  }
  return result
}

// Attempt to match a LEXICON entry starting at position pos.
// Uses normalizedLower for matching (alternates applied) but raw words for token.raw.
function tryLexicon(words: RawWord[], normalizedLower: string[], pos: number): { token: NlToken; consumed: number } | null {
  for (const entry of LEXICON) {
    const n = entry.words.length
    if (pos + n > words.length) continue
    let match = true
    for (let i = 0; i < n; i++) {
      if (normalizedLower[pos + i] !== entry.words[i]) { match = false; break }
    }
    if (!match) continue

    const raw = words.slice(pos, pos + n).map(w => w.text).join(' ')
    const token: NlToken = {
      cls: entry.cls,
      raw,
      start: words[pos].start,
      fn1Name: entry.fn1Name,
      fnNName: entry.fnNName,
      constName: entry.constName,
      powVal: entry.powVal,
      angleUnit: entry.angleUnit,
      varName: entry.varName,
      mrefName: entry.mrefName,
      reg2Name: entry.reg2Name,
      convFrom: entry.convFrom,
      convTo: entry.convTo,
    }
    return { token, consumed: n }
  }
  return null
}

// Attempt to match an IGNORE_VOCAB entry starting at position pos.
// Uses normalizedLower for matching; emits a FRAMING token.
function tryIgnoreVocab(words: RawWord[], normalizedLower: string[], pos: number): { token: NlToken; consumed: number } | null {
  for (const phrase of IGNORE_VOCAB) {
    const n = phrase.length
    if (pos + n > words.length) continue
    let match = true
    for (let i = 0; i < n; i++) {
      if (normalizedLower[pos + i] !== phrase[i]) { match = false; break }
    }
    if (!match) continue

    const raw = words.slice(pos, pos + n).map(w => w.text).join(' ')
    return {
      token: { cls: 'FRAMING', raw, start: words[pos].start },
      consumed: n,
    }
  }
  return null
}

function isDigitNumber(s: string): boolean {
  // Accept leading-decimal form like ".25" in addition to normal "0.25" / "25".
  return /^\.?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(s)
}

const PUNCT_MAP: Record<string, NlToken['cls']> = {
  '(': 'LPAREN',
  ')': 'RPAREN',
  '{': 'LBRACE',
  '}': 'RBRACE',
  ',': 'COMMA',
}

const FORMAL_OP_MAP: Record<string, NlToken['cls']> = {
  '+': 'ADD',
  '-': 'SUB',
  '*': 'MUL',
  '/': 'DIV',
  '^': 'POW',
  // Unicode math operators (§G / Sprint 7.4)
  '%': 'PERCENT', // percent symbol
  '×': 'MUL',   // U+00D7 multiplication sign
  '÷': 'DIV',   // U+00F7 division sign
  '·': 'MUL',   // U+00B7 middle dot (implicit multiply)
  '−': 'SUB',   // U+2212 minus sign (distinct from hyphen-minus)
}

/**
 * Tokenize a natural-language (or already-formal) math expression.
 * Returns null if an unrecognized word is encountered — the caller emits E_NL_COVERAGE.
 * FRAMING tokens are emitted for IGNORE_VOCAB matches and stripped by Stage C.
 */
export function tokenize(input: string): NlToken[] {
  const words = splitInput(input)
  // normalizedLower: ALTERNATES_MAP applied for matching, originals preserved in words[].text
  // (DECISION-39: enumerated misspellings are normalized before LEXICON/IGNORE_VOCAB lookup)
  const normalizedLower = words.map(w => ALTERNATES_MAP[w.text.toLowerCase()] ?? w.text.toLowerCase())
  const tokens: NlToken[] = []
  let pos = 0

  while (pos < words.length) {
    const w = words[pos]
    const low = normalizedLower[pos]  // use normalized form for all lookups

    // DECISION-61: LEXICON longest-match runs FIRST — before the number resolver (isDigitNumber)
    // and NUMBER_WORDS — so phrases that begin with a digit or number word (e.g. "1-variable
    // stats", "one-variable stats") are matched atomically rather than having their leading
    // token pre-consumed by the number resolver before the phrase can be recognized.
    const lex = tryLexicon(words, normalizedLower, pos)
    if (lex) {
      tokens.push(lex.token)
      pos += lex.consumed
      continue
    }

    // Digit-form number
    if (isDigitNumber(w.text)) {
      tokens.push({ cls: 'NUM', raw: w.text, start: w.start, numVal: w.text })
      pos++
      continue
    }

    // Single punctuation
    if (PUNCT_MAP[w.text]) {
      tokens.push({ cls: PUNCT_MAP[w.text]!, raw: w.text, start: w.start })
      pos++
      continue
    }

    // Formal operator symbols — includes Unicode math operators (§G / Sprint 7.4)
    if (FORMAL_OP_MAP[w.text]) {
      tokens.push({ cls: FORMAL_OP_MAP[w.text]!, raw: w.text, start: w.start })
      pos++
      continue
    }

    // Sprint 8.1 #5: Bare 'a' (letter A) → MREF([A]) when NOT followed by a fraction-denominator
    // or magnitude-multiplier word (hundred/thousand/million). In those contexts "a" acts as
    // an indefinite article or numeric "a thousand", so falls through to NUMBER_WORDS below.
    if (low === 'a') {
      const nextLow = pos + 1 < words.length ? normalizedLower[pos + 1] : null
      const nextIsFracDenom = nextLow !== null && nextLow in FRACTION_DENOMS
      const nextIsMultiplier = nextLow === 'hundred' || nextLow === 'thousand' || nextLow === 'million'
      if (!nextIsFracDenom && !nextIsMultiplier) {
        tokens.push({ cls: 'MREF', raw: w.text, start: w.start, mrefName: 'A' })
        pos++
        continue
      }
    }

    // Number words → NUM placeholder (Stage B resolves)
    if (NUMBER_WORDS.has(low)) {
      tokens.push({ cls: 'NUM', raw: w.text, start: w.start })
      pos++
      continue
    }

    // Fraction denominator words → FRAC placeholder (Stage B resolves)
    if (low in FRACTION_DENOMS) {
      tokens.push({ cls: 'FRAC', raw: w.text, start: w.start })
      pos++
      continue
    }

    // IGNORE_VOCAB longest-match → FRAMING token (removed by Stage C, recorded in `ignored`)
    const ign = tryIgnoreVocab(words, normalizedLower, pos)
    if (ign) {
      tokens.push(ign.token)
      pos += ign.consumed
      continue
    }

    // Unrecognized — emit UNKNOWN token (DECISION-37: drop-and-surface, not reject).
    // Stage C removes UNKNOWN tokens and records them in `unrecognized` on the NlResult.
    // If the residual after dropping cannot form a valid parse, Stage D rejects loudly (E_NL_*).
    tokens.push({ cls: 'UNKNOWN', raw: w.text, start: w.start })
    pos++
  }

  // DECISION-68: Implied multiplication insertion pass.
  // Insert a synthetic MUL token between adjacent tokens that imply multiplication:
  //   NUM   → VARIABLE | LPAREN   (e.g. "2x", "2(x+1)")
  //   VARIABLE → LPAREN           (e.g. "x(x+1)")
  // This allows formal-math-style coefficient notation in graph and algebraic expressions.
  const withImplied: NlToken[] = []
  for (let i = 0; i < tokens.length; i++) {
    withImplied.push(tokens[i])
    const next = tokens[i + 1]
    if (next) {
      const dst = next.cls === 'VARIABLE' || next.cls === 'LPAREN'
      const src = tokens[i].cls === 'NUM' || tokens[i].cls === 'VARIABLE'
      // VARIABLE → VARIABLE would be ambiguous (e.g. "x y"); only NUM/VARIABLE → VARIABLE/LPAREN
      // and specifically not VARIABLE → VARIABLE (leave as-is; they can never form a useful product).
      const notVarVar = !(tokens[i].cls === 'VARIABLE' && next.cls === 'VARIABLE')
      if (src && dst && notVarVar) {
        withImplied.push({ cls: 'MUL', raw: '', start: tokens[i].start })
      }
    }
  }
  return withImplied
}
