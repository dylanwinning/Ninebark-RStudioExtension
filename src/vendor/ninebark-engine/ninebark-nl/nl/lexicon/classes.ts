// NL synonym classes — single source of truth for the NL lexicon.
// Multi-word phrases are listed longest-first so the tokenizer always matches greedily.

export type NlTokenClass =
  | 'NUM'        // resolved decimal number (from digit string or word-form)
  | 'FRAC'       // resolved fraction (half, two thirds, …)
  | 'CONST'      // mathematical constant: pi, e
  | 'FUNC1'      // unary function: sqrt, sin, cos, …
  | 'FUNCN'      // variadic / list function: mean, sum, …
  | 'ADD'        // plus
  | 'SUB'        // minus
  | 'MUL'        // times, multiplied by
  | 'DIV'        // divided by, over
  | 'POW'        // to the power of, raised to the power of
  | 'MORE'       // "more" (part of "X more than Y")
  | 'LESS'       // "less" (part of "X less than Y")
  | 'THAN'       // "than"
  | 'OF'         // "of" (AMBIGUOUS: function-apply vs multiply)
  | 'AND'        // "and" (AMBIGUOUS: addition vs list separator)
  | 'BY'         // "by" (AMBIGUOUS: division vs dimension, only when standalone)
  | 'SQUARED'    // "squared" (postfix)
  | 'CUBED'      // "cubed" (postfix)
  | 'NEGATIVE'   // "negative" (prefix)
  | 'TWICE'      // "twice", "double" (prefix multiplier → ×2)
  | 'TRIPLE'     // "triple" (prefix multiplier → ×3)
  | 'SUBFROM'    // "subtracted from" (order-inverting infix → Y−X)
  // ── Sprint 7.4: Command-verb forms (§A) ───────────────────────────────────
  | 'CMD_ADD'    // "add" / "addition" — imperative add: "add X and Y" → (X+Y)
  | 'CMD_SUB'    // "subtract" / "take" — imperative subtract (inverting): "subtract X from Y" → (Y-X)
  | 'CMD_MUL'    // "multiply" — imperative multiply: "multiply X by Y" → (X*Y)
  | 'CMD_DIV'    // "divide" — imperative divide: "divide X by Y" → (X/Y)
  | 'CMD_POW'    // "raise" — imperative power: "raise X to the power of Y" → (X^Y)
  | 'CMD_SQ'     // "square" — imperative square: "square X" → (X^2)
  | 'CMD_CB'     // "cube" — imperative cube: "cube X" → (X^3)
  | 'CMD_NEG'    // "negate" — imperative negate: "negate X" → (-X)
  | 'FROM'       // "from" — connective in subtract/take command forms
  | 'LPAREN'     // ( — also produced by spoken "open paren/bracket" (Sprint 7.5 §L)
  | 'RPAREN'     // ) — also produced by spoken "close paren/bracket"
  | 'LBRACE'     // {
  | 'RBRACE'     // }
  | 'COMMA'      // ,
  | 'LIST_FRAME' // "the numbers", "the list", "the values", "the set"
  // ── Sprint 7.5: new operative classes (DECISION-40/41) ─────────────────────
  | 'POW_N'      // ordinal/elliptical power form: "to the third/fourth/…" → ^N (§O)
  | 'SECANT'     // secant/sec — expands to (1/cos(X)) (DECISION-41, §M)
  | 'COSECANT'   // cosecant/csc — expands to (1/sin(X)) (DECISION-41, §M)
  | 'COTANGENT'  // cotangent/cot — expands to (1/tan(X)) (DECISION-41, §M)
  | 'LOG_BASE'   // "log base" — introduces logbase(val, base) production (§N)
  | 'ROOT_OF'    // "root of" / "root" — Nth-root infix: FRAC ROOT_OF Expr → X^(1/N) (§N)
  | 'QUADRUPLE'  // prefix ×4 (§P)
  | 'HALVE'      // prefix ÷2 (§P)
  | 'DOUBLED'    // postfix ×2 (§P)
  | 'TRIPLED'    // postfix ×3 (§P)
  | 'QUADRUPLED' // postfix ×4 (§P)
  | 'HALVED'     // postfix ÷2 (§P)
  // ── Sprint 7.6: new operative classes (DECISION-42/43) ─────────────────────
  | 'ANGLE_UNIT' // degrees/radians/gradians — Sprint 8 DECISION-48: now emits inline angle marker (not reject)
  // ── Sprint 8: new operative classes (DECISION-44/48) ──────────────────────
  | 'GRAPH_INTENT' // "graph"/"plot"/"sketch" — produces action:'graph' result (§A-NL)
  | 'VARIABLE'   // algebraic variable: x, y, t — for graph expressions
  | 'MREF'       // matrix register reference: "matrix a" → [A], bare 'a' → [A] (§B-NL)
  | 'REG2'       // two-list regression: "linear regression of" → fnN2(linReg, xs, ys) (§D-NL)
  | 'UNIT_CONV'  // angle unit conversion: "degrees to radians" etc. (Sprint 10.1 M130 / DECISION-60)
  | 'PERCENT'    // "percent" / "pct" / "%" — postfix: E PERCENT → (E/100); E PERCENT OF E2 → ((E/100)*E2)
  | 'FRAMING'    // known-ignore words (IGNORE_VOCAB) — dropped silently, recorded in `ignored`
  | 'UNKNOWN'    // word that is neither math nor IGNORE — dropped and surfaced in `unrecognized`

export interface NlToken {
  cls: NlTokenClass
  raw: string          // original text span (for error spans)
  start: number        // char offset in original input
  // Additional payloads set by number resolver:
  numVal?: string      // for NUM: canonical decimal string
  fracNum?: number     // for FRAC: numerator
  fracDen?: number     // for FRAC: denominator
  constName?: string   // for CONST: 'pi' | 'e'
  fn1Name?: string     // for FUNC1: canonical name
  fnNName?: string     // for FUNCN: canonical name
  powVal?: string      // for POW_N: ordinal exponent as decimal string (Sprint 7.5 §O)
  // Sprint 8 payloads:
  angleUnit?: 'degrees' | 'radians' | 'gradians'   // for ANGLE_UNIT: which unit
  varName?: string     // for VARIABLE: variable name ('x', 'y', 't')
  mrefName?: string    // for MREF: register letter ('A'..'J')
  reg2Name?: string    // for REG2: canonical regression function name (e.g. 'linReg')
  convFrom?: 'degrees' | 'radians' | 'gradians'  // for UNIT_CONV (Sprint 10.1 M130)
  convTo?:   'degrees' | 'radians' | 'gradians'
}

// ── Multi-word phrases (longest first within each class) ──────────────────────
// Each entry: { words: string[], class, payload }

export interface LexEntry {
  words: string[]
  cls: NlTokenClass
  fn1Name?: string
  fnNName?: string
  constName?: string
  powVal?: string      // for POW_N entries
  // Sprint 8 payloads:
  angleUnit?: 'degrees' | 'radians' | 'gradians'
  varName?: string
  mrefName?: string
  reg2Name?: string    // for REG2: canonical regression function name
  // Sprint 10.1 M130: UNIT_CONV payload
  convFrom?: 'degrees' | 'radians' | 'gradians'
  convTo?:   'degrees' | 'radians' | 'gradians'
}

export const LEXICON: LexEntry[] = [
  // (FRAMING entries removed — they now live in src/nl/grammar.config.ts IGNORE_VOCAB)

  // ── Sprint 7.5: Spoken grouping → real LPAREN/RPAREN (§L / DECISION-40) ───
  // Operative tokens — NEVER move to IGNORE_VOCAB (same failure class as Multiply→⅚).
  { words: ['open', 'parentheses'], cls: 'LPAREN' },
  { words: ['open', 'parenthesis'], cls: 'LPAREN' },
  { words: ['open', 'paren'],       cls: 'LPAREN' },
  { words: ['left', 'parentheses'], cls: 'LPAREN' },
  { words: ['left', 'parenthesis'], cls: 'LPAREN' },
  { words: ['open', 'bracket'],     cls: 'LPAREN' },
  { words: ['left', 'bracket'],     cls: 'LPAREN' },
  { words: ['close', 'parentheses'], cls: 'RPAREN' },
  { words: ['close', 'parenthesis'], cls: 'RPAREN' },
  { words: ['close', 'paren'],       cls: 'RPAREN' },
  { words: ['right', 'parentheses'], cls: 'RPAREN' },
  { words: ['right', 'parenthesis'], cls: 'RPAREN' },
  { words: ['close', 'bracket'],    cls: 'RPAREN' },
  { words: ['right', 'bracket'],    cls: 'RPAREN' },

  // ── Percent / percentage ────────────────────────────────────────────────────
  { words: ['percent'], cls: 'PERCENT' },
  { words: ['pct'],     cls: 'PERCENT' },

  // ── Sprint 7.4: Command-verb forms (§A / DECISION-38) ─────────────────────
  // Sprint 7.6: gerund forms ('adding', 'subtracting', etc.) added here (§W / DECISION-42)
  // Longest multi-word command phrases first (e.g. "add up" before "add").
  { words: ['add', 'up'],      cls: 'FUNCN', fnNName: 'sum' },  // "add up 1, 2, 3" → sum
  { words: ['add'],            cls: 'CMD_ADD' },
  { words: ['addition'],       cls: 'CMD_ADD' },  // "addition of X and Y"
  { words: ['adding'],         cls: 'CMD_ADD' },  // gerund: "adding X and Y" → (X+Y)
  { words: ['subtract'],       cls: 'CMD_SUB' },
  // 'subtracting' gerund — safe here (no 2-word 'subtracting from' entry)
  { words: ['subtracting'],    cls: 'CMD_SUB' },  // gerund: "subtracting X from Y" → (Y-X)
  { words: ['take'],           cls: 'CMD_SUB' },  // "take away" (2-word SUB) wins via longest-match
  { words: ['multiply'],       cls: 'CMD_MUL' },
  // 'multiplying' gerund — safe here (no 2-word 'multiplying by' entry)
  { words: ['multiplying'],    cls: 'CMD_MUL' },  // gerund: "multiplying X and Y" → (X*Y)
  { words: ['divide'],         cls: 'CMD_DIV' },
  // 'dividing' gerund — safe here (no 2-word 'dividing by' entry)
  { words: ['dividing'],       cls: 'CMD_DIV' },  // gerund: "dividing X by Y" → (X/Y)
  { words: ['raise'],          cls: 'CMD_POW' },
  { words: ['negate'],         cls: 'CMD_NEG' },
  { words: ['from'],           cls: 'FROM' },      // connective in "subtract X from Y"
  // Sprint 8: graph/plot intent — GRAPH_INTENT class (DECISION-44 / §A-NL)
  // Sprint 8.1 #4: "show me", "draw" added. "show me" is also in IGNORE_VOCAB but
  // LEXICON is checked first, so this entry takes priority when followed by a math expr.
  { words: ['show', 'me', 'the'], cls: 'GRAPH_INTENT' },
  { words: ['show', 'me'],  cls: 'GRAPH_INTENT' },
  { words: ['graph'],  cls: 'GRAPH_INTENT' },
  { words: ['plot'],   cls: 'GRAPH_INTENT' },
  { words: ['sketch'], cls: 'GRAPH_INTENT' },
  { words: ['draw'],   cls: 'GRAPH_INTENT' },

  // Sprint 8: algebraic variable references — for graph expressions (§A-NL)
  { words: ['x'], cls: 'VARIABLE', varName: 'x' },
  { words: ['y'], cls: 'VARIABLE', varName: 'y' },
  { words: ['t'], cls: 'VARIABLE', varName: 't' },

  // Sprint 8: matrix register references (§B-NL / DECISION-49-b)
  // 2-word "matrix <letter>" forms first (longest-match priority)
  { words: ['matrix', 'a'], cls: 'MREF', mrefName: 'A' },
  { words: ['matrix', 'b'], cls: 'MREF', mrefName: 'B' },
  { words: ['matrix', 'c'], cls: 'MREF', mrefName: 'C' },
  { words: ['matrix', 'd'], cls: 'MREF', mrefName: 'D' },
  { words: ['matrix', 'e'], cls: 'MREF', mrefName: 'E' },
  { words: ['matrix', 'f'], cls: 'MREF', mrefName: 'F' },
  { words: ['matrix', 'g'], cls: 'MREF', mrefName: 'G' },
  { words: ['matrix', 'h'], cls: 'MREF', mrefName: 'H' },
  { words: ['matrix', 'i'], cls: 'MREF', mrefName: 'I' },
  { words: ['matrix', 'j'], cls: 'MREF', mrefName: 'J' },
  // Sprint 8.1 #5: bare single-letter matrix register references.
  // 'a' is handled in the tokenizer (pre-NUMBER_WORDS special case).
  // 'e' conflicts with CONST e (Euler); use "matrix e" for register E.
  // All others (b-j except e) are unconditional here.
  { words: ['b'], cls: 'MREF', mrefName: 'B' },
  { words: ['c'], cls: 'MREF', mrefName: 'C' },
  { words: ['d'], cls: 'MREF', mrefName: 'D' },
  { words: ['f'], cls: 'MREF', mrefName: 'F' },
  { words: ['g'], cls: 'MREF', mrefName: 'G' },
  { words: ['h'], cls: 'MREF', mrefName: 'H' },
  // 'i' omitted: conflicts with English pronoun "I" in framing phrases ("i want", "i need").
  // Register I is accessible via the 2-word form "matrix i" above.
  { words: ['j'], cls: 'MREF', mrefName: 'J' },

  // Sprint 7.6 / Sprint 8: ANGLE_UNIT — now emits inline angle marker (DECISION-48 supersedes 43)
  // Must be OPERATIVE (never IGNORE) — silently dropping angle units gives wrong answers.
  // "degrees of freedom" (statistical) is a 3-word FRAMING phrase — listed first (longest-match wins).
  { words: ['degrees', 'of', 'freedom'], cls: 'FRAMING' }, // statistical — droppable
  // Sprint 10.1 M130 / DECISION-60: UNIT_CONV — angle unit conversion phrases (3 words).
  // Must appear BEFORE the 1-word ANGLE_UNIT entries so longest-match wins.
  { words: ['degrees', 'to', 'radians'],    cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'radians'  },
  { words: ['degree',  'to', 'radians'],    cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'radians'  },
  { words: ['degrees', 'in', 'radians'],    cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'radians'  },
  { words: ['degree',  'in', 'radians'],    cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'radians'  },
  { words: ['degrees', 'into', 'radians'],  cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'radians'  },
  { words: ['degree',  'into', 'radians'],  cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'radians'  },
  { words: ['radians', 'to', 'degrees'],    cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'degrees'  },
  { words: ['radian',  'to', 'degrees'],    cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'degrees'  },
  { words: ['radians', 'in', 'degrees'],    cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'degrees'  },
  { words: ['radian',  'in', 'degrees'],    cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'degrees'  },
  { words: ['radians', 'into', 'degrees'],  cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'degrees'  },
  { words: ['radian',  'into', 'degrees'],  cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'degrees'  },
  { words: ['degrees', 'to', 'gradians'],   cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'gradians' },
  { words: ['degree',  'to', 'gradians'],   cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'gradians' },
  { words: ['degrees', 'in', 'gradians'],   cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'gradians' },
  { words: ['degrees', 'into', 'gradians'], cls: 'UNIT_CONV', convFrom: 'degrees',  convTo: 'gradians' },
  { words: ['gradians', 'to', 'degrees'],   cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'degrees'  },
  { words: ['gradian',  'to', 'degrees'],   cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'degrees'  },
  { words: ['gradians', 'in', 'degrees'],   cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'degrees'  },
  { words: ['gradians', 'into', 'degrees'], cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'degrees'  },
  { words: ['gradians', 'to', 'radians'],   cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'radians'  },
  { words: ['gradian',  'to', 'radians'],   cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'radians'  },
  { words: ['gradians', 'in', 'radians'],   cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'radians'  },
  { words: ['gradians', 'into', 'radians'], cls: 'UNIT_CONV', convFrom: 'gradians', convTo: 'radians'  },
  { words: ['radians', 'to', 'gradians'],   cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'gradians' },
  { words: ['radian',  'to', 'gradians'],   cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'gradians' },
  { words: ['radians', 'in', 'gradians'],   cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'gradians' },
  { words: ['radians', 'into', 'gradians'], cls: 'UNIT_CONV', convFrom: 'radians',  convTo: 'gradians' },
  // 1-word ANGLE_UNIT entries (after all 3-word UNIT_CONV entries — first-match = longest-match)
  { words: ['degrees'],  cls: 'ANGLE_UNIT', angleUnit: 'degrees' },
  { words: ['degree'],   cls: 'ANGLE_UNIT', angleUnit: 'degrees' },
  { words: ['radians'],  cls: 'ANGLE_UNIT', angleUnit: 'radians' },
  { words: ['radian'],   cls: 'ANGLE_UNIT', angleUnit: 'radians' },
  { words: ['gradians'], cls: 'ANGLE_UNIT', angleUnit: 'gradians' },
  { words: ['gradian'],  cls: 'ANGLE_UNIT', angleUnit: 'gradians' },

  // LIST_FRAME — list context introducers (longest first)
  { words: ['the', 'numbers'],   cls: 'LIST_FRAME' },
  { words: ['the', 'values'],    cls: 'LIST_FRAME' },
  { words: ['the', 'list'],      cls: 'LIST_FRAME' },
  { words: ['the', 'set'],       cls: 'LIST_FRAME' },
  { words: ['the', 'data'],      cls: 'LIST_FRAME' },

  // FUNC1 — unary functions (longest phrase first)
  { words: ['square', 'root', 'of'], cls: 'FUNC1', fn1Name: 'sqrt' },
  { words: ['square', 'root'],       cls: 'FUNC1', fn1Name: 'sqrt' },
  { words: ['square'],               cls: 'CMD_SQ' },  // "square X" → (X^2); "square root…" wins above via longest-match
  { words: ['cube', 'root', 'of'],   cls: 'FUNC1', fn1Name: 'cbrt' },
  { words: ['cube', 'root'],         cls: 'FUNC1', fn1Name: 'cbrt' },
  { words: ['cube'],                 cls: 'CMD_CB' },  // "cube X" → (X^3); "cube root…" wins above via longest-match
  { words: ['absolute', 'value', 'of'], cls: 'FUNC1', fn1Name: 'abs' },
  { words: ['absolute', 'value'],    cls: 'FUNC1', fn1Name: 'abs' },
  { words: ['natural', 'log', 'of'], cls: 'FUNC1', fn1Name: 'ln' },
  { words: ['natural', 'log'],       cls: 'FUNC1', fn1Name: 'ln' },
  { words: ['sqrt'],                 cls: 'FUNC1', fn1Name: 'sqrt' },
  { words: ['cbrt'],                 cls: 'FUNC1', fn1Name: 'cbrt' },
  // ROOT_OF — for Nth-root: "the third root of X" → X^(1/3).
  // Listed AFTER "cube root" and "square root" — longest-match ensures those win.
  { words: ['root', 'of'],           cls: 'ROOT_OF' },
  { words: ['root'],                 cls: 'ROOT_OF' },
  { words: ['sine'],                 cls: 'FUNC1', fn1Name: 'sin' },
  { words: ['sin'],                  cls: 'FUNC1', fn1Name: 'sin' },
  { words: ['cosine'],               cls: 'FUNC1', fn1Name: 'cos' },
  { words: ['cos'],                  cls: 'FUNC1', fn1Name: 'cos' },
  { words: ['tangent'],              cls: 'FUNC1', fn1Name: 'tan' },
  { words: ['tan'],                  cls: 'FUNC1', fn1Name: 'tan' },
  // Sprint 7.5: arc-form synonyms (DECISION-40 §M)
  { words: ['arc', 'sine', 'of'],    cls: 'FUNC1', fn1Name: 'asin' },
  { words: ['arc', 'sine'],          cls: 'FUNC1', fn1Name: 'asin' },
  { words: ['arcsine'],              cls: 'FUNC1', fn1Name: 'asin' },
  { words: ['arc', 'cosine', 'of'],  cls: 'FUNC1', fn1Name: 'acos' },
  { words: ['arc', 'cosine'],        cls: 'FUNC1', fn1Name: 'acos' },
  { words: ['arccosine'],            cls: 'FUNC1', fn1Name: 'acos' },
  { words: ['arc', 'tangent', 'of'], cls: 'FUNC1', fn1Name: 'atan' },
  { words: ['arc', 'tangent'],       cls: 'FUNC1', fn1Name: 'atan' },
  { words: ['arctangent'],           cls: 'FUNC1', fn1Name: 'atan' },
  { words: ['arcsin'],               cls: 'FUNC1', fn1Name: 'asin' },
  { words: ['arccos'],               cls: 'FUNC1', fn1Name: 'acos' },
  { words: ['arctan'],               cls: 'FUNC1', fn1Name: 'atan' },
  { words: ['asin'],                 cls: 'FUNC1', fn1Name: 'asin' },
  { words: ['acos'],                 cls: 'FUNC1', fn1Name: 'acos' },
  { words: ['atan'],                 cls: 'FUNC1', fn1Name: 'atan' },
  // Sprint 7.5: hyperbolic trig (engine has sinh/cosh/tanh)
  { words: ['hyperbolic', 'sine', 'of'],    cls: 'FUNC1', fn1Name: 'sinh' },
  { words: ['hyperbolic', 'sine'],          cls: 'FUNC1', fn1Name: 'sinh' },
  { words: ['hyperbolic', 'cosine', 'of'],  cls: 'FUNC1', fn1Name: 'cosh' },
  { words: ['hyperbolic', 'cosine'],        cls: 'FUNC1', fn1Name: 'cosh' },
  { words: ['hyperbolic', 'tangent', 'of'], cls: 'FUNC1', fn1Name: 'tanh' },
  { words: ['hyperbolic', 'tangent'],       cls: 'FUNC1', fn1Name: 'tanh' },
  { words: ['sinh'],                        cls: 'FUNC1', fn1Name: 'sinh' },
  { words: ['cosh'],                        cls: 'FUNC1', fn1Name: 'cosh' },
  { words: ['tanh'],                        cls: 'FUNC1', fn1Name: 'tanh' },
  // Hyperbolic reciprocal functions (sech/csch/coth) — unlike sec/csc/cot,
  // Desmos has direct sech/csch/coth support, so these are plain FUNC1 entries
  // rather than a reciprocal-expansion class.
  { words: ['hyperbolic', 'secant', 'of'],    cls: 'FUNC1', fn1Name: 'sech' },
  { words: ['hyperbolic', 'secant'],          cls: 'FUNC1', fn1Name: 'sech' },
  { words: ['sech'],                          cls: 'FUNC1', fn1Name: 'sech' },
  { words: ['hyperbolic', 'cosecant', 'of'],  cls: 'FUNC1', fn1Name: 'csch' },
  { words: ['hyperbolic', 'cosecant'],        cls: 'FUNC1', fn1Name: 'csch' },
  { words: ['csch'],                          cls: 'FUNC1', fn1Name: 'csch' },
  { words: ['hyperbolic', 'cotangent', 'of'], cls: 'FUNC1', fn1Name: 'coth' },
  { words: ['hyperbolic', 'cotangent'],       cls: 'FUNC1', fn1Name: 'coth' },
  { words: ['coth'],                          cls: 'FUNC1', fn1Name: 'coth' },
  // Inverse hyperbolic functions — British-English "ar-" variants included
  // (arsinh etc.), matching Desmos's own accepted spellings.
  { words: ['inverse', 'hyperbolic', 'sine', 'of'],    cls: 'FUNC1', fn1Name: 'asinh' },
  { words: ['inverse', 'hyperbolic', 'sine'],          cls: 'FUNC1', fn1Name: 'asinh' },
  { words: ['arcsinh'],                                cls: 'FUNC1', fn1Name: 'asinh' },
  { words: ['arsinh'],                                 cls: 'FUNC1', fn1Name: 'asinh' },
  { words: ['inverse', 'hyperbolic', 'cosine', 'of'],  cls: 'FUNC1', fn1Name: 'acosh' },
  { words: ['inverse', 'hyperbolic', 'cosine'],        cls: 'FUNC1', fn1Name: 'acosh' },
  { words: ['arccosh'],                                cls: 'FUNC1', fn1Name: 'acosh' },
  { words: ['arcosh'],                                 cls: 'FUNC1', fn1Name: 'acosh' },
  { words: ['inverse', 'hyperbolic', 'tangent', 'of'], cls: 'FUNC1', fn1Name: 'atanh' },
  { words: ['inverse', 'hyperbolic', 'tangent'],       cls: 'FUNC1', fn1Name: 'atanh' },
  { words: ['arctanh'],                                cls: 'FUNC1', fn1Name: 'atanh' },
  { words: ['artanh'],                                 cls: 'FUNC1', fn1Name: 'atanh' },
  { words: ['inverse', 'hyperbolic', 'cotangent', 'of'], cls: 'FUNC1', fn1Name: 'acoth' },
  { words: ['inverse', 'hyperbolic', 'cotangent'],       cls: 'FUNC1', fn1Name: 'acoth' },
  { words: ['arccoth'],                                  cls: 'FUNC1', fn1Name: 'acoth' },
  { words: ['arcoth'],                                   cls: 'FUNC1', fn1Name: 'acoth' },
  { words: ['inverse', 'hyperbolic', 'secant', 'of'],  cls: 'FUNC1', fn1Name: 'asech' },
  { words: ['inverse', 'hyperbolic', 'secant'],        cls: 'FUNC1', fn1Name: 'asech' },
  { words: ['arcsech'],                                cls: 'FUNC1', fn1Name: 'asech' },
  { words: ['arsech'],                                 cls: 'FUNC1', fn1Name: 'asech' },
  { words: ['inverse', 'hyperbolic', 'cosecant', 'of'], cls: 'FUNC1', fn1Name: 'acsch' },
  { words: ['inverse', 'hyperbolic', 'cosecant'],       cls: 'FUNC1', fn1Name: 'acsch' },
  { words: ['arccsch'],                                 cls: 'FUNC1', fn1Name: 'acsch' },
  { words: ['arcsch'],                                  cls: 'FUNC1', fn1Name: 'acsch' },
  // Inverse trig words missing from the arc-form list above.
  { words: ['arc', 'cotangent', 'of'], cls: 'FUNC1', fn1Name: 'acot' },
  { words: ['arc', 'cotangent'],       cls: 'FUNC1', fn1Name: 'acot' },
  { words: ['arccotangent'],           cls: 'FUNC1', fn1Name: 'acot' },
  { words: ['arccot'],                 cls: 'FUNC1', fn1Name: 'acot' },
  { words: ['acot'],                   cls: 'FUNC1', fn1Name: 'acot' },
  { words: ['arc', 'secant', 'of'],    cls: 'FUNC1', fn1Name: 'asec' },
  { words: ['arc', 'secant'],          cls: 'FUNC1', fn1Name: 'asec' },
  { words: ['arcsecant'],              cls: 'FUNC1', fn1Name: 'asec' },
  { words: ['arcsec'],                 cls: 'FUNC1', fn1Name: 'asec' },
  { words: ['asec'],                   cls: 'FUNC1', fn1Name: 'asec' },
  { words: ['arc', 'cosecant', 'of'],  cls: 'FUNC1', fn1Name: 'acsc' },
  { words: ['arc', 'cosecant'],        cls: 'FUNC1', fn1Name: 'acsc' },
  { words: ['arccosecant'],            cls: 'FUNC1', fn1Name: 'acsc' },
  { words: ['arccsc'],                 cls: 'FUNC1', fn1Name: 'acsc' },
  { words: ['acsc'],                   cls: 'FUNC1', fn1Name: 'acsc' },
  // Error function
  { words: ['error', 'function', 'of'], cls: 'FUNC1', fn1Name: 'erf' },
  { words: ['error', 'function'],       cls: 'FUNC1', fn1Name: 'erf' },
  { words: ['erf'],                     cls: 'FUNC1', fn1Name: 'erf' },
  // Sprint 7.5: derived/reciprocal trig (DECISION-41 §M) — NL sugar only
  // sec/csc/cot are absent from the engine; the grammar expands them to formal.
  { words: ['secant', 'of'],    cls: 'SECANT' },
  { words: ['secant'],          cls: 'SECANT' },
  { words: ['sec', 'of'],       cls: 'SECANT' },
  { words: ['sec'],             cls: 'SECANT' },
  { words: ['cosecant', 'of'],  cls: 'COSECANT' },
  { words: ['cosecant'],        cls: 'COSECANT' },
  { words: ['csc', 'of'],       cls: 'COSECANT' },
  { words: ['csc'],             cls: 'COSECANT' },
  { words: ['cotangent', 'of'], cls: 'COTANGENT' },
  { words: ['cotangent'],       cls: 'COTANGENT' },
  { words: ['cot', 'of'],       cls: 'COTANGENT' },
  { words: ['cot'],             cls: 'COTANGENT' },
  { words: ['abs'],                  cls: 'FUNC1', fn1Name: 'abs' },
  { words: ['ln'],                   cls: 'FUNC1', fn1Name: 'ln' },
  // LOG_BASE — connector variants (§R Sprint 7.6 / DECISION-42): "with/to/in base" all work.
  // Longest entries first so "log to the base" (4-word) wins over "log to base" (3-word).
  { words: ['log', 'to', 'the', 'base'], cls: 'LOG_BASE' },
  { words: ['log', 'with', 'base'],      cls: 'LOG_BASE' },
  { words: ['log', 'to', 'base'],        cls: 'LOG_BASE' },
  { words: ['log', 'in', 'base'],        cls: 'LOG_BASE' },
  { words: ['logarithm', 'to', 'the', 'base'], cls: 'LOG_BASE' },
  { words: ['logarithm', 'with', 'base'],      cls: 'LOG_BASE' },
  { words: ['logarithm', 'to', 'base'],        cls: 'LOG_BASE' },
  { words: ['logarithm', 'base'],              cls: 'LOG_BASE' },
  // Sprint 7.5 original 2-word entry — must come after longer variants
  { words: ['log', 'base'],          cls: 'LOG_BASE' },
  // 'logarithm' standalone → log base-10 (FUNC1)
  { words: ['logarithm', 'of'],      cls: 'FUNC1', fn1Name: 'log' },
  { words: ['logarithm'],            cls: 'FUNC1', fn1Name: 'log' },
  { words: ['log'],                  cls: 'FUNC1', fn1Name: 'log' },
  { words: ['exp'],                  cls: 'FUNC1', fn1Name: 'exp' },
  { words: ['floor'],                cls: 'FUNC1', fn1Name: 'floor' },
  { words: ['ceil'],                 cls: 'FUNC1', fn1Name: 'ceil' },
  { words: ['round'],                cls: 'FUNC1', fn1Name: 'round' },
  // Sprint 8: matrix unary functions (§B-NL) — longest-first (with-'of' before bare)
  { words: ['determinant', 'of'],    cls: 'FUNC1', fn1Name: 'det' },
  { words: ['determinant'],          cls: 'FUNC1', fn1Name: 'det' },
  { words: ['transpose', 'of'],      cls: 'FUNC1', fn1Name: 'transpose' },
  { words: ['transpose'],            cls: 'FUNC1', fn1Name: 'transpose' },
  { words: ['inverse', 'of'],        cls: 'FUNC1', fn1Name: 'inverse' },
  { words: ['inverse'],              cls: 'FUNC1', fn1Name: 'inverse' },

  // FUNCN — variadic / list functions (longest first)
  // Sprint 8.1 #8: 1-Var Statistics synonyms (longest first)
  //
  // Sprint 10.2 M135 / DECISION-61: hyphenated "1-variable" / "one-variable" forms.
  // splitInput splits "1-variable" into ["1", "-", "variable"]; the LEXICON must hold
  // entries starting with '1'/'-' so tryLexicon (now running FIRST in the tokenizer loop)
  // claims the whole phrase before the number resolver can pre-consume the leading '1'.
  // Longest entries first (first-match rule).
  { words: ['1', '-', 'variable', 'statistics', 'of'],  cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['1', '-', 'variable', 'statistics'],         cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['1', '-', 'variable', 'stats', 'of'],        cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['1', '-', 'variable', 'stats'],              cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['1', '-', 'var', 'stats', 'of'],             cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['1', '-', 'var', 'stats'],                   cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['one', '-', 'variable', 'statistics', 'of'], cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['one', '-', 'variable', 'statistics'],       cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['one', '-', 'variable', 'stats', 'of'],      cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['one', '-', 'variable', 'stats'],            cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['one', '-', 'var', 'stats', 'of'],           cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['one', '-', 'var', 'stats'],                 cls: 'FUNCN', fnNName: 'oneVarStats' },
  // Remaining 1-variable synonyms — entries start from second word (first-match picks these
  // up for space-separated forms like "1 variable stats" via the existing NUM+FUNCN grammar path).
  { words: ['single', 'variable', 'statistics', 'of'], cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['single', 'variable', 'statistics'],       cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['variable', 'statistics', 'of'],           cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['variable', 'statistics'],                 cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['summary', 'statistics', 'of'],            cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['summary', 'statistics'],                  cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['var', 'stats', 'of'],                     cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['var', 'stats'],                           cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['variable', 'stats', 'of'],                cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['variable', 'stats'],                      cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['descriptive', 'statistics', 'of'],        cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['descriptive', 'statistics'],              cls: 'FUNCN', fnNName: 'oneVarStats' },
  // Sprint 10.1 M128: "stats for" / bare "stats" (longest first per curation rule)
  { words: ['stats', 'for'],  cls: 'FUNCN', fnNName: 'oneVarStats' },
  { words: ['stats'],         cls: 'FUNCN', fnNName: 'oneVarStats' },

  // Sprint 8: stats variants (§D-NL) — longest phrases first
  { words: ['population', 'standard', 'deviation', 'of'], cls: 'FUNCN', fnNName: 'popStdDev' },
  { words: ['population', 'standard', 'deviation'],       cls: 'FUNCN', fnNName: 'popStdDev' },
  { words: ['sample', 'standard', 'deviation', 'of'],     cls: 'FUNCN', fnNName: 'stdDev' },
  { words: ['sample', 'standard', 'deviation'],           cls: 'FUNCN', fnNName: 'stdDev' },
  { words: ['population', 'variance', 'of'],              cls: 'FUNCN', fnNName: 'popVariance' },
  { words: ['sample', 'variance', 'of'],                  cls: 'FUNCN', fnNName: 'variance' },
  { words: ['sample', 'variance'],                        cls: 'FUNCN', fnNName: 'variance' },
  { words: ['interquartile', 'range', 'of'],              cls: 'FUNCN', fnNName: 'IQR' },
  { words: ['interquartile', 'range'],                    cls: 'FUNCN', fnNName: 'IQR' },
  { words: ['first', 'quartile', 'of'],                   cls: 'FUNCN', fnNName: 'Q1' },
  { words: ['first', 'quartile'],                         cls: 'FUNCN', fnNName: 'Q1' },
  // NOTE: 'third quartile' cannot be matched — 'third' is intercepted by FRACTION_DENOMS before LEXICON.
  // Use 'upper quartile' as the spoken synonym for Q3.
  { words: ['upper', 'quartile', 'of'],                   cls: 'FUNCN', fnNName: 'Q3' },
  { words: ['upper', 'quartile'],                         cls: 'FUNCN', fnNName: 'Q3' },
  { words: ['standard', 'deviation', 'of'], cls: 'FUNCN', fnNName: 'stdDev' },
  { words: ['standard', 'deviation'],       cls: 'FUNCN', fnNName: 'stdDev' },
  { words: ['population', 'variance'],      cls: 'FUNCN', fnNName: 'popVariance' },
  { words: ['population', 'std', 'dev'],    cls: 'FUNCN', fnNName: 'popStdDev' },
  { words: ['iqr'],                         cls: 'FUNCN', fnNName: 'IQR' },
  { words: ['q1'],                          cls: 'FUNCN', fnNName: 'Q1' },
  { words: ['q3'],                          cls: 'FUNCN', fnNName: 'Q3' },
  { words: ['mean'],                        cls: 'FUNCN', fnNName: 'mean' },
  { words: ['average'],                     cls: 'FUNCN', fnNName: 'mean' },
  { words: ['middle', 'value'],             cls: 'FUNCN', fnNName: 'median' }, // Sprint 7.5 §Q synonym audit
  { words: ['median'],                      cls: 'FUNCN', fnNName: 'median' },
  { words: ['mode'],                        cls: 'FUNCN', fnNName: 'mode' },
  { words: ['sum'],                         cls: 'FUNCN', fnNName: 'sum' },
  { words: ['total'],                       cls: 'FUNCN', fnNName: 'sum' },
  // Binary-phrase family: difference/quotient/product (DECISION-34)
  { words: ['difference', 'of'],  cls: 'FUNCN', fnNName: 'difference' },
  { words: ['difference'],        cls: 'FUNCN', fnNName: 'difference' },
  { words: ['quotient', 'of'],    cls: 'FUNCN', fnNName: 'quotient' },
  { words: ['quotient'],          cls: 'FUNCN', fnNName: 'quotient' },
  { words: ['product', 'of'],     cls: 'FUNCN', fnNName: 'prod' },
  { words: ['product'],           cls: 'FUNCN', fnNName: 'prod' },
  { words: ['prod'],              cls: 'FUNCN', fnNName: 'prod' },
  { words: ['count'],                       cls: 'FUNCN', fnNName: 'count' },
  { words: ['minimum'],                     cls: 'FUNCN', fnNName: 'min' },
  { words: ['maximum'],                     cls: 'FUNCN', fnNName: 'max' },
  { words: ['min'],                         cls: 'FUNCN', fnNName: 'min' },
  { words: ['max'],                         cls: 'FUNCN', fnNName: 'max' },
  { words: ['range'],                       cls: 'FUNCN', fnNName: 'range' },
  { words: ['variance'],                    cls: 'FUNCN', fnNName: 'variance' },
  { words: ['stddev'],                      cls: 'FUNCN', fnNName: 'stdDev' },

  // REG2 — two-list regression functions (§D-NL / DECISION-50)
  // "linear regression of <xs> and <ys>" → fnN2(linReg, xs, ys)
  // Sprint 8.1 #9: "line of best fit", "best fit line", corrCoef, corrCoefSq added.
  // Longest phrases first.
  { words: ['coefficient', 'of', 'determination', 'of'], cls: 'REG2', reg2Name: 'corrCoefSq' },
  { words: ['coefficient', 'of', 'determination'],       cls: 'REG2', reg2Name: 'corrCoefSq' },
  { words: ['correlation', 'coefficient', 'of'],         cls: 'REG2', reg2Name: 'corrCoef' },
  { words: ['correlation', 'coefficient'],               cls: 'REG2', reg2Name: 'corrCoef' },
  { words: ['pearson', 'correlation', 'of'],             cls: 'REG2', reg2Name: 'corrCoef' },
  { words: ['pearson', 'correlation'],                   cls: 'REG2', reg2Name: 'corrCoef' },
  { words: ['line', 'of', 'best', 'fit', 'for'],         cls: 'REG2', reg2Name: 'linReg' },
  { words: ['line', 'of', 'best', 'fit'],                cls: 'REG2', reg2Name: 'linReg' },
  { words: ['best', 'fit', 'line', 'for'],               cls: 'REG2', reg2Name: 'linReg' },
  { words: ['best', 'fit', 'line'],                      cls: 'REG2', reg2Name: 'linReg' },
  { words: ['linear', 'regression', 'of'],       cls: 'REG2', reg2Name: 'linReg' },
  { words: ['linear', 'regression'],             cls: 'REG2', reg2Name: 'linReg' },
  { words: ['quadratic', 'regression', 'of'],    cls: 'REG2', reg2Name: 'quadReg' },
  { words: ['quadratic', 'regression'],          cls: 'REG2', reg2Name: 'quadReg' },
  { words: ['cubic', 'regression', 'of'],        cls: 'REG2', reg2Name: 'cubicReg' },
  { words: ['cubic', 'regression'],              cls: 'REG2', reg2Name: 'cubicReg' },
  { words: ['logarithmic', 'regression', 'of'],  cls: 'REG2', reg2Name: 'lnReg' },
  { words: ['logarithmic', 'regression'],        cls: 'REG2', reg2Name: 'lnReg' },
  { words: ['exponential', 'regression', 'of'],  cls: 'REG2', reg2Name: 'expReg' },
  { words: ['exponential', 'regression'],        cls: 'REG2', reg2Name: 'expReg' },
  { words: ['power', 'regression', 'of'],        cls: 'REG2', reg2Name: 'pwrReg' },
  { words: ['power', 'regression'],              cls: 'REG2', reg2Name: 'pwrReg' },
  { words: ['sinusoidal', 'regression', 'of'],   cls: 'REG2', reg2Name: 'sinReg' },
  { words: ['sinusoidal', 'regression'],         cls: 'REG2', reg2Name: 'sinReg' },
  { words: ['logistic', 'regression', 'of'],     cls: 'REG2', reg2Name: 'logistic' },
  { words: ['logistic', 'regression'],           cls: 'REG2', reg2Name: 'logistic' },
  { words: ['median', 'median', 'of'],           cls: 'REG2', reg2Name: 'medMed' },
  { words: ['median', 'median'],                 cls: 'REG2', reg2Name: 'medMed' },
  { words: ['linreg', 'of'],                     cls: 'REG2', reg2Name: 'linReg' },
  { words: ['linreg'],                           cls: 'REG2', reg2Name: 'linReg' },
  { words: ['quadreg', 'of'],                    cls: 'REG2', reg2Name: 'quadReg' },
  { words: ['quadreg'],                          cls: 'REG2', reg2Name: 'quadReg' },

  // OPERATORS — multi-word first (longest match within each class)
  // Sprint 7.5: ordinal/elliptical power forms (§O / DECISION-40).
  // "to the Nth [power]" / "raised to the Nth [power]" → POW_N.
  // MUST come before "raised to the power of" / "to the power of" so longer entries win.
  { words: ['raised', 'to', 'the', 'second', 'power'], cls: 'POW_N', powVal: '2' },
  { words: ['raised', 'to', 'the', 'third',  'power'], cls: 'POW_N', powVal: '3' },
  { words: ['raised', 'to', 'the', 'fourth', 'power'], cls: 'POW_N', powVal: '4' },
  { words: ['raised', 'to', 'the', 'fifth',  'power'], cls: 'POW_N', powVal: '5' },
  { words: ['raised', 'to', 'the', 'sixth',  'power'], cls: 'POW_N', powVal: '6' },
  { words: ['raised', 'to', 'the', 'seventh','power'], cls: 'POW_N', powVal: '7' },
  { words: ['raised', 'to', 'the', 'eighth', 'power'], cls: 'POW_N', powVal: '8' },
  { words: ['raised', 'to', 'the', 'ninth',  'power'], cls: 'POW_N', powVal: '9' },
  { words: ['raised', 'to', 'the', 'tenth',  'power'], cls: 'POW_N', powVal: '10' },
  { words: ['raised', 'to', 'the', 'second'], cls: 'POW_N', powVal: '2' },
  { words: ['raised', 'to', 'the', 'third'],  cls: 'POW_N', powVal: '3' },
  { words: ['raised', 'to', 'the', 'fourth'], cls: 'POW_N', powVal: '4' },
  { words: ['raised', 'to', 'the', 'fifth'],  cls: 'POW_N', powVal: '5' },
  { words: ['raised', 'to', 'the', 'sixth'],  cls: 'POW_N', powVal: '6' },
  { words: ['raised', 'to', 'the', 'seventh'], cls: 'POW_N', powVal: '7' },
  { words: ['raised', 'to', 'the', 'eighth'], cls: 'POW_N', powVal: '8' },
  { words: ['raised', 'to', 'the', 'ninth'],  cls: 'POW_N', powVal: '9' },
  { words: ['raised', 'to', 'the', 'tenth'],  cls: 'POW_N', powVal: '10' },
  { words: ['to', 'the', 'second', 'power'],  cls: 'POW_N', powVal: '2' },
  { words: ['to', 'the', 'third',  'power'],  cls: 'POW_N', powVal: '3' },
  { words: ['to', 'the', 'fourth', 'power'],  cls: 'POW_N', powVal: '4' },
  { words: ['to', 'the', 'fifth',  'power'],  cls: 'POW_N', powVal: '5' },
  { words: ['to', 'the', 'sixth',  'power'],  cls: 'POW_N', powVal: '6' },
  { words: ['to', 'the', 'seventh','power'],  cls: 'POW_N', powVal: '7' },
  { words: ['to', 'the', 'eighth', 'power'],  cls: 'POW_N', powVal: '8' },
  { words: ['to', 'the', 'ninth',  'power'],  cls: 'POW_N', powVal: '9' },
  { words: ['to', 'the', 'tenth',  'power'],  cls: 'POW_N', powVal: '10' },
  { words: ['to', 'the', 'second'], cls: 'POW_N', powVal: '2' },
  { words: ['to', 'the', 'third'],  cls: 'POW_N', powVal: '3' },
  { words: ['to', 'the', 'fourth'], cls: 'POW_N', powVal: '4' },
  { words: ['to', 'the', 'fifth'],  cls: 'POW_N', powVal: '5' },
  { words: ['to', 'the', 'sixth'],  cls: 'POW_N', powVal: '6' },
  { words: ['to', 'the', 'seventh'], cls: 'POW_N', powVal: '7' },
  { words: ['to', 'the', 'eighth'], cls: 'POW_N', powVal: '8' },
  { words: ['to', 'the', 'ninth'],  cls: 'POW_N', powVal: '9' },
  { words: ['to', 'the', 'tenth'],  cls: 'POW_N', powVal: '10' },
  { words: ['raised', 'to', 'the', 'power', 'of'], cls: 'POW' },
  { words: ['to', 'the', 'power', 'of'],  cls: 'POW' },
  { words: ['to', 'the', 'power'],        cls: 'POW' },
  { words: ['raised', 'to'],              cls: 'POW' },
  { words: ['subtracted', 'from'],        cls: 'SUBFROM' },
  // Sprint 7.6: past-participle entries — must come AFTER their 2-word counterparts above
  // so longest-match wins ("subtracted from" before "subtracted", "divided by" before "divided", etc.)
  { words: ['subtracted'],               cls: 'CMD_SUB' },  // postfix: "4 from 10 subtracted" — but mainly for completeness
  { words: ['multiplied', 'by'],          cls: 'MUL' },
  { words: ['multiplied'],               cls: 'CMD_MUL' },  // postfix: "3 and 4 multiplied" → (3*4)
  { words: ['divided', 'by'],             cls: 'DIV' },
  { words: ['divided'],                  cls: 'CMD_DIV' },  // postfix: "X and Y divided" → (X/Y)
  { words: ['added'],                    cls: 'CMD_ADD' },  // postfix: "2 and 2 added" → (2+2)
  { words: ['increased', 'by'],           cls: 'ADD' },
  { words: ['combined', 'with'],          cls: 'ADD' },
  { words: ['decreased', 'by'],           cls: 'SUB' },
  { words: ['take', 'away'],              cls: 'SUB' },
  // NOTE: "more than" and "less than" are NOT multi-word tokens.
  // They are parsed as INFIX: Expr MORE THAN Expr (see grammar/rules.ts binary extension).
  // Multi-word entries would consume "than" before the grammar sees it.
  { words: ['plus'],                      cls: 'ADD' },
  { words: ['minus'],                     cls: 'SUB' },
  { words: ['times'],                     cls: 'MUL' },
  { words: ['over'],                      cls: 'DIV' },
  { words: ['and'],                       cls: 'AND' },
  { words: ['by'],                        cls: 'BY' },
  { words: ['of'],                        cls: 'OF' },
  { words: ['than'],                      cls: 'THAN' },
  { words: ['more'],                      cls: 'MORE' },
  { words: ['less'],                      cls: 'LESS' },

  // POSTFIX
  { words: ['squared'],     cls: 'SQUARED' },
  { words: ['cubed'],       cls: 'CUBED' },
  // Sprint 7.5: suffix multiplier participles (§P / DECISION-40)
  { words: ['doubled'],     cls: 'DOUBLED' },
  { words: ['tripled'],     cls: 'TRIPLED' },
  { words: ['quadrupled'],  cls: 'QUADRUPLED' },
  { words: ['halved'],      cls: 'HALVED' },

  // PREFIX multipliers
  { words: ['twice'],       cls: 'TWICE' },
  { words: ['double'],      cls: 'TWICE' },
  { words: ['triple'],      cls: 'TRIPLE' },
  // Sprint 7.5: additional prefix multipliers (§P / DECISION-40)
  { words: ['quadruple'],   cls: 'QUADRUPLE' },
  { words: ['halve'],       cls: 'HALVE' },

  // PREFIX
  { words: ['negative'], cls: 'NEGATIVE' },
  { words: ['minus'],    cls: 'SUB' },  // already above, but keep for clarity

  // CONSTANTS
  { words: ['pi'],      cls: 'CONST', constName: 'pi' },
  { words: ['e'],       cls: 'CONST', constName: 'e' },

]

// Word-form number words (handled by numberPhrase.ts, not the main lexicon)
export const NUMBER_WORDS = new Set([
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
  'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety',
  'hundred', 'thousand', 'million',
  'a',  // "a half", "a quarter"
])

// Fraction denominator words (for "two thirds", "a quarter", etc.)
export const FRACTION_DENOMS: Record<string, number> = {
  half: 2, halves: 2,
  third: 3, thirds: 3,
  quarter: 4, quarters: 4, fourth: 4, fourths: 4,
  fifth: 5, fifths: 5,
  sixth: 6, sixths: 6,
  seventh: 7, sevenths: 7,
  eighth: 8, eighths: 8,
  ninths: 9, ninth: 9,
  tenth: 10, tenths: 10,
}
