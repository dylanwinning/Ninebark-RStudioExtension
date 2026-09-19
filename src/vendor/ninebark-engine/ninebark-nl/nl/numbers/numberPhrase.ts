import { FRACTION_DENOMS, NUMBER_WORDS, type NlToken } from '../lexicon/classes'
import { NlErrorCode } from '../errors'

// ── Stage B: Number-phrase resolver ──────────────────────────────────────────
//
// Consumes the raw token array from Stage A and collapses:
//   • Word-form integers: "twenty three" → NUM("23")
//   • Word-form decimals: "three point five" → NUM("3.5")
//   • Fractions: "two thirds" → FRAC(2,3), "a half" → FRAC(1,2)
//   • "negative N" as prefix: leaves NEGATIVE + NUM
//
// DECISION (RISK-24): "and" inside a number phrase ("one hundred and five" → 105)
// is consumed only when we are actively mid-number-word-run. Once we exit the
// number run, "and" is left for the grammar.

// ── Word-to-value tables (duplicated from src/calculator/word-numbers.ts to
//    respect the nl/ boundary — no imports from src/calculator/) ──────────────

const UNITS: Record<string, number> = {
  zero:0, one:1, two:2, three:3, four:4, five:5,
  six:6, seven:7, eight:8, nine:9,
}
const TEENS: Record<string, number> = {
  ten:10, eleven:11, twelve:12, thirteen:13, fourteen:14,
  fifteen:15, sixteen:16, seventeen:17, eighteen:18, nineteen:19,
}
const TENS: Record<string, number> = {
  twenty:20, thirty:30, forty:40, fifty:50,
  sixty:60, seventy:70, eighty:80, ninety:90,
}
const MULTIPLIERS: Record<string, number> = {
  hundred:100, thousand:1_000, million:1_000_000,
}

function isNumberWord(w: string): boolean {
  return w in UNITS || w in TEENS || w in TENS || w in MULTIPLIERS || w === 'a'
}

// Parse a "sub-hundred" chunk starting at tokens[idx].
// Returns { value, consumed } or null.
function parseSubHundred(toks: string[], idx: number): { value: number; consumed: number } | null {
  if (idx >= toks.length) return null
  const w = toks[idx]
  if (w === 'a') return { value: 1, consumed: 1 }
  if (w in UNITS) return { value: UNITS[w], consumed: 1 }
  if (w in TEENS) return { value: TEENS[w], consumed: 1 }
  if (w in TENS) {
    const val = TENS[w]
    if (idx + 1 < toks.length && toks[idx + 1] in UNITS && toks[idx + 1] !== 'zero') {
      return { value: val + UNITS[toks[idx + 1]], consumed: 2 }
    }
    return { value: val, consumed: 1 }
  }
  return null
}

function parseHundreds(toks: string[], idx: number): { value: number; consumed: number } | null {
  const sub = parseSubHundred(toks, idx)
  if (!sub) return null
  const after = idx + sub.consumed
  if (after < toks.length && toks[after] === 'hundred') {
    const hval = sub.value * 100
    // Optionally consume "and" after "hundred" (number-internal and — RISK-24)
    let remIdx = after + 1
    if (remIdx < toks.length && toks[remIdx] === 'and' && remIdx + 1 < toks.length && isNumberWord(toks[remIdx + 1])) {
      remIdx++  // consume the "and"
    }
    const rem = parseSubHundred(toks, remIdx)
    if (rem && rem.value > 0) {
      return { value: hval + rem.value, consumed: (remIdx - idx) + rem.consumed }
    }
    return { value: hval, consumed: sub.consumed + 1 }
  }
  return sub
}

/**
 * Try to parse a word-form integer starting at toks[idx].
 * Returns { value, consumed } or null.
 */
function parseWordInteger(toks: string[], idx: number): { value: number; consumed: number } | null {
  if (idx >= toks.length || !isNumberWord(toks[idx])) return null

  let total = 0
  let i = idx

  // Millions
  const mil = parseHundreds(toks, i)
  if (mil && i + mil.consumed < toks.length && toks[i + mil.consumed] === 'million') {
    total += mil.value * 1_000_000
    i += mil.consumed + 1
    // Thousands after millions
    const th = parseHundreds(toks, i)
    if (th && i + th.consumed < toks.length && toks[i + th.consumed] === 'thousand') {
      total += th.value * 1_000
      i += th.consumed + 1
      const rem = parseHundreds(toks, i)
      if (rem) { total += rem.value; i += rem.consumed }
    } else if (th) {
      total += th.value; i += th.consumed
    }
    return { value: total, consumed: i - idx }
  }

  // Thousands
  const th = parseHundreds(toks, i)
  if (th && i + th.consumed < toks.length && toks[i + th.consumed] === 'thousand') {
    total += th.value * 1_000
    i += th.consumed + 1
    const rem = parseHundreds(toks, i)
    if (rem) { total += rem.value; i += rem.consumed }
    return { value: total, consumed: i - idx }
  }

  // Hundreds or less
  if (th) {
    // If the next word after this run is also a number word we can't compose, throw MALFORMED
    const afterIdx = i + th.consumed
    if (afterIdx < toks.length && isNumberWord(toks[afterIdx]) && toks[afterIdx] !== 'and') {
      throw { code: NlErrorCode.BAD_NUMBER }
    }
    return { value: th.value, consumed: th.consumed }
  }

  return null
}

// ── Fraction resolution ────────────────────────────────────────────────────────

/**
 * Try to parse a fraction phrase starting at words[idx].
 * Patterns: "a half", "one half", "two thirds", "three quarters", "a quarter"
 * Returns { num, den, consumed } or null.
 */
function parseFraction(
  words: string[],
  idx: number,
): { num: number; den: number; consumed: number } | null {
  if (idx >= words.length) return null

  // Any standalone FRACTION_DENOMS word → 1/N.
  // e.g. "half" → 1/2, "quarter" → 1/4, "third" → 1/3, "fourth" → 1/4, …
  // This allows "the third root of X", "the fourth root of X", etc. (§N Sprint 7.5).
  if (words[idx] in FRACTION_DENOMS) {
    return { num: 1, den: FRACTION_DENOMS[words[idx]], consumed: 1 }
  }

  // Numerator (word integer or "a") + denominator word
  // e.g. "two thirds", "a half", "three quarters"
  let numVal: number
  let consumed: number

  if (words[idx] === 'a') {
    numVal = 1
    consumed = 1
  } else {
    const parsed = parseWordInteger(words, idx)
    if (!parsed) return null
    numVal = parsed.value
    consumed = parsed.consumed
  }

  if (idx + consumed < words.length) {
    const denomWord = words[idx + consumed]
    if (denomWord in FRACTION_DENOMS) {
      return { num: numVal, den: FRACTION_DENOMS[denomWord], consumed: consumed + 1 }
    }
  }

  return null
}

// ── Main resolver ─────────────────────────────────────────────────────────────

/**
 * Stage B: resolve number phrases in the raw token array.
 *
 * Takes the output of Stage A (tokenize) and returns a new token array where:
 *   - Runs of NUMBER_WORDS tokens are collapsed to single NUM tokens.
 *   - FRAC placeholder tokens are replaced with resolved FRAC tokens.
 *   - Digit-string NUM tokens are left as-is (already have numVal).
 *   - Number-internal "and" is consumed.
 */
export function resolveNumbers(tokens: NlToken[]): NlToken[] {
  // Work over the raw text of each token to feed the word parsers
  const words = tokens.map(t => t.raw.toLowerCase())
  const result: NlToken[] = []
  let i = 0

  while (i < tokens.length) {
    const tok = tokens[i]
    const w = tok.raw.toLowerCase()

    // Already a resolved digit NUM — pass through
    if (tok.cls === 'NUM' && tok.numVal) {
      result.push(tok)
      i++
      continue
    }

    // "point" decimal: "three point five" → handled below as part of word-integer run
    // (We detect "point" between two number-word runs and merge them.)

    // Try fraction first (fraction denominator words appear as FRAC placeholders)
    if (tok.cls === 'FRAC' || (tok.cls === 'NUM' && NUMBER_WORDS.has(w))) {
      // Check for "N/D" fraction pattern
      const frac = parseFraction(words, i)
      if (frac) {
        result.push({
          cls: 'FRAC',
          raw: tokens.slice(i, i + frac.consumed).map(t => t.raw).join(' '),
          start: tok.start,
          fracNum: frac.num,
          fracDen: frac.den,
        })
        i += frac.consumed
        continue
      }

      // Try word-integer (may span multiple tokens including number-internal "and")
      // Build a flat word array from consecutive number-word tokens
      const wordRun: string[] = []
      let j = i
      while (j < tokens.length) {
        const wj = tokens[j].raw.toLowerCase()
        if (isNumberWord(wj) || (wj === 'and' && j + 1 < tokens.length && isNumberWord(tokens[j + 1].raw.toLowerCase()) && wordRun.length > 0)) {
          wordRun.push(wj)
          j++
        } else if (wj === 'point' && j + 1 < tokens.length && (isNumberWord(tokens[j + 1].raw.toLowerCase()) || /^\d/.test(tokens[j + 1].raw))) {
          // "three point five" → decimal
          wordRun.push(wj)
          j++
        } else {
          break
        }
      }

      if (wordRun.length > 0) {
        // Check for decimal "point" in the run
        const pointIdx = wordRun.indexOf('point')
        if (pointIdx >= 0) {
          const intPart = wordRun.slice(0, pointIdx)
          const decPart = wordRun.slice(pointIdx + 1)
          const intRes = intPart.length > 0 ? parseWordInteger(intPart, 0) : { value: 0, consumed: 0 }
          // Decimal part: each word is a digit
          const decDigits = decPart.map(dw => {
            const v = UNITS[dw]
            if (v === undefined) throw { code: NlErrorCode.BAD_NUMBER }
            return v.toString()
          }).join('')
          const decVal = `${intRes?.value ?? 0}.${decDigits}`
          result.push({
            cls: 'NUM',
            raw: tokens.slice(i, j).map(t => t.raw).join(' '),
            start: tok.start,
            numVal: decVal,
          })
          i = j
          continue
        }

        const parsed = parseWordInteger(wordRun, 0)
        if (parsed) {
          // Count how many actual tokens were consumed (wordRun includes "and")
          // Reconstruct by counting tokens used
          const usedWords = wordRun.slice(0, parsed.consumed)
          // Find how many original tokens produced these words
          let tokConsumed = 0
          let wIdx = 0
          let tIdx = i
          while (wIdx < usedWords.length && tIdx < tokens.length) {
            const wt = tokens[tIdx].raw.toLowerCase()
            if (wt === usedWords[wIdx]) {
              wIdx++; tIdx++; tokConsumed++
            } else if (usedWords[wIdx] === 'and' && wt === 'and') {
              wIdx++; tIdx++; tokConsumed++
            } else {
              break
            }
          }
          if (tokConsumed === 0) tokConsumed = parsed.consumed  // fallback

          result.push({
            cls: 'NUM',
            raw: tokens.slice(i, i + tokConsumed).map(t => t.raw).join(' '),
            start: tok.start,
            numVal: String(parsed.value),
          })
          i += tokConsumed
          continue
        }
      }

      // FRAC placeholder that didn't resolve — error
      if (tok.cls === 'FRAC') {
        throw { code: NlErrorCode.BAD_FRAC }
      }
    }

    // Pass everything else through unchanged
    result.push(tok)
    i++
  }

  return result
}
