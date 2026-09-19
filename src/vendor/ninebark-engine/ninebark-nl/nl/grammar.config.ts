// NL grammar config — IGNORE vocabulary (DECISION-35 / Sprint 7.2)
// Single source of truth for droppable framing tokens.
//
// RULE (curation invariant): IGNORE_VOCAB ∩ MATH_OPERATIVE = ∅
// Enforced by CI test in tests/nl-sprint72.test.ts.
//
// Entries are arrays of lowercase words, longest multi-word first so the
// tokenizer greedily matches the longest applicable phrase at each position.
//
// What belongs here: politeness, discourse fillers, question frames, trailing
// punctuation — words that NEVER carry operative math meaning.
// What does NOT belong here: any math operator, function, or operand word.
// To support a new math phrase, add it to src/nl/lexicon/classes.ts (LEXICON).

export const IGNORE_VOCAB: string[][] = [
  // ── 5-word request frames ────────────────────────────────────────────────
  ['i', 'would', 'like', 'to', 'know'],
  ['can', 'you', 'tell', 'me', 'the'],

  // ── 4-word request frames ────────────────────────────────────────────────
  ['please', 'tell', 'me', 'the'],
  ['can', 'you', 'tell', 'me'],
  ['can', 'you', 'find', 'the'],
  ['can', 'you', 'work', 'out'],
  ['can', 'you', 'figure', 'out'],
  ['can', 'you', 'help', 'me'],
  ['could', 'you', 'tell', 'me'],
  ['would', 'you', 'tell', 'me'],
  ['will', 'you', 'tell', 'me'],
  ['i', 'want', 'to', 'know'],
  ['i', 'need', 'to', 'know'],
  ["i'd", 'like', 'to', 'know'],
  ['help', 'me', 'figure', 'out'],
  ['help', 'me', 'work', 'out'],
  ['can', 'u', 'tell', 'me'],

  // ── 3-word request frames ────────────────────────────────────────────────
  ['i', 'would', 'like'],
  ['the', 'value', 'of'],        // §E stacked framing — "the value of 2 plus 2" → (2+2)
  ['the', 'result', 'of'],       // §E stacked framing — "the result of..."
  // 2-word versions needed when "the" was already consumed by a preceding phrase
  // e.g. "calculate the value of 2" — "calculate the" consumes "the", leaving "value of"
  ['value', 'of'],
  ['result', 'of'],
  ['would', 'you', 'mind'],
  ['please', 'tell', 'me'],
  ['please', 'find', 'the'],
  ['can', 'you', 'find'],
  ['can', 'you', 'calculate'],
  ['can', 'you', 'compute'],
  ['can', 'you', 'evaluate'],
  ['can', 'you', 'simplify'],
  ['can', 'you', 'solve'],
  ['could', 'you', 'find'],
  ['could', 'you', 'work'],
  ['could', 'you', 'calculate'],
  ['could', 'you', 'compute'],
  ['would', 'you', 'find'],
  ['will', 'you', 'find'],
  ['help', 'me', 'calculate'],
  ['help', 'me', 'compute'],
  ['help', 'me', 'evaluate'],
  ['help', 'me', 'with'],
  ['what', 'is', 'the'],
  ['what', 'are', 'the'],
  ["what's", 'the'],
  ['how', 'much', 'is'],
  ['how', 'many', 'is'],
  ['tell', 'me', 'the'],
  ['show', 'me', 'the'],
  ['give', 'me', 'the'],
  ['please', 'find'],
  ['ok', 'thank', 'you'],
  ['thanks', 'a', 'lot'],

  // ── 2-word request frames / fillers ─────────────────────────────────────
  ["i'd", 'like'],               // listed after "i'd like to know" (4-word) for longest-match priority
  ['i', 'wonder'],
  ['can', 'you'],
  ['can', 'u'],
  ['could', 'you'],
  ['could', 'u'],
  ['would', 'you'],
  ['will', 'you'],
  ['i', 'need'],
  ['i', 'want'],
  ['let', 'me'],
  ['help', 'me'],
  ['tell', 'me'],
  ['show', 'me'],
  ['give', 'me'],
  ['what', 'is'],
  ['what', 'are'],
  ['how', 'much'],
  ['how', 'many'],
  ['calculate', 'the'],
  ['compute', 'the'],
  ['evaluate', 'the'],
  ['simplify', 'the'],
  ['find', 'the'],
  ['figure', 'out'],
  ['work', 'out'],
  ['solve', 'for'],
  ['equals', 'what'],
  ['for', 'me'],
  ['ok', 'thanks'],
  ['thank', 'you'],
  ['hey', 'there'],
  ['hi', 'there'],
  ['=', '?'],

  // ── 1-word: request verbs ────────────────────────────────────────────────
  ["what's"],
  ['whats'],
  ['what'],
  ['calculate'],
  ['compute'],
  ['evaluate'],
  ['simplify'],
  ['find'],
  ['solve'],
  ['answer'],
  ['help'],
  ['is'],
  ['are'],
  ['equals'],

  // ── 1-word: politeness ───────────────────────────────────────────────────
  ['please'],
  ['pls'],
  ['kindly'],
  ['thanks'],
  ['thx'],
  ['ty'],
  ['cheers'],

  // ── Sprint 7.6: nominalizing wrappers — reduce to inner parsed Expr (§W / DECISION-42)
  // These phrases wrap a computation but contribute no math; equivalent to transparent framing.
  // 4-word wrappers first (longest match priority).
  ['the', 'number', 'obtained', 'by'],  // "the number obtained by adding X and Y" → (X+Y)
  // 2-word wrappers (for when "the number" was already consumed)
  ['obtained', 'by'],
  ['the', 'quantity'],                  // "the quantity X" → X (transparent grouping)
  // "the result of" / "the value of" are already above (3-word entries).

  // ── 2-word discourse fillers (Sprint 7.6 §S) ────────────────────────────
  ['you', 'know'],
  ['i', 'mean'],
  ['sort', 'of'],
  ['kind', 'of'],

  // ── 1-word: discourse fillers (safe mid-sentence) ───────────────────────
  ['hey'],
  ['hi'],
  ['hello'],
  ['ok'],
  ['okay'],
  ['so'],
  ['um'],
  ['uh'],
  ['er'],
  ['hmm'],
  ['hm'],
  ['well'],
  ['like'],
  ['just'],
  ['actually'],
  ['basically'],
  ['essentially'],
  ['literally'],
  ['obviously'],
  ['simply'],
  ['then'],
  ['now'],
  ['also'],
  ['kinda'],   // Sprint 7.6 §S additions
  ['sorta'],
  ['maybe'],
  ['lol'],
  ['lmao'],
  ['lmfao'],
  ['haha'],
  ['hehe'],
  ['omg'],
  ['tbh'],
  ['ngl'],
  ['imo'],
  ['yo'],
  ['bruh'],

  // ── 1-word: standalone determiners / prepositions (safe mid-sentence) ───
  // Math multi-word entries ("to the power of", "the numbers") win via
  // longest-match in the LEXICON before IGNORE_VOCAB is tried.
  // Sprint 10.1 M130: 'convert' is a pure framing verb for unit-conversion phrasing.
  ['convert'],
  ['the'],
  ['an'],
  ['to'],
  ['in'],
  ['out'],   // "work out", "figure out" — 'out' may be stranded after modal verbs

  // ── Trailing punctuation / symbols ──────────────────────────────────────
  ['?'],
  ['='],
  ['!'],
]

// ── DECISION-39: Enumerated misspelling alternates (Sprint 7.4 / §I) ─────────
//
// Maps a misspelled word (lowercase) → its canonical form.
// Applied by the tokenizer BEFORE LEXICON / IGNORE_VOCAB lookup.
// Normalized word is used for matching; original word is preserved in token.raw.
//
// HARD BOUNDARY: only ENUMERATED alternates are listed here. Arbitrary
// misspellings are NOT supported (that would require edit-distance, which breaks
// the determinism constraint). Unlisted misspellings → UNKNOWN → loud reject
// via interpretation surface. See DECISION-39 in the engineering spec.
//
// TODO (human decision required): if true typo tolerance is ever wanted, it
// would require edit-distance matching, which breaks "always deterministic."
// Do NOT implement fuzzy matching without explicit engineering decision.
export const ALTERNATES_MAP: Record<string, string> = {
  // Operator misspellings
  'minuss':  'minus',
  'pluss':   'plus',
  'divded':  'divided',
  // Command-verb misspellings
  'muliply':  'multiply',
  'mutliply': 'multiply',
  'sqaure':   'square',
  'additon':  'addition',
  // Framing misspellings
  'calcualte': 'calculate',
  // Angle-unit abbreviations (Sprint 8.1 / #11)
  'deg':  'degrees',
  'rad':  'radians',
  'grad': 'gradians',
}
