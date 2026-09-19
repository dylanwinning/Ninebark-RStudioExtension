// Sprint 15 DECISION-80/81: Structured NL diagnostic for precise error feedback.
// Produced deterministically from the parse failure — no fuzzy matching, no "did you mean."

export type DiagnosticCategory =
  | 'unrecognized-token'   // word not in NL lexicon
  | 'stray-operand'        // value with no operator connecting it
  | 'missing-operand'      // operator at end with no following value
  | 'unbalanced-grouping'  // mismatched ( )
  | 'ambiguity'            // competing parse readings
  | 'missing-parameter'    // stats test missing required param (μ0 / σ)
  | 'out-of-coverage'      // recognized features but no valid parse combination
  | 'semantic-type'        // type mismatch in the calc engine
  | 'empty-incomplete'     // nothing to calculate
  | 'general'              // uncategorized

export interface NlDiagnostic {
  category: DiagnosticCategory
  offendingToken?: string
  span?: [number, number]
  expected?: string[]
  competingReadings?: { token: string; interpretations: string[] }
  recognized?: { features: string[]; partialResult?: string }
  parenBalance?: { open: number; close: number }
  operation?: string
  typeDetail?: string
}

// Maps canonical function/feature names (fn1Name / fnNName from lexicon) → human-readable label.
// Keys are what the NL tokenizer stores in fn1Name / fnNName fields.
export const FN_LABELS: Record<string, string> = {
  sqrt:        'square root',
  cbrt:        'cube root',
  sin:         'sine',
  cos:         'cosine',
  tan:         'tangent',
  asin:        'arcsine',
  acos:        'arccosine',
  atan:        'arctangent',
  sinh:        'hyperbolic sine',
  cosh:        'hyperbolic cosine',
  tanh:        'hyperbolic tangent',
  log:         'log base 10',
  ln:          'natural log',
  log2:        'log base 2',
  abs:         'absolute value',
  floor:       'floor',
  ceil:        'ceiling',
  round:       'round',
  exp:         'exponential',
  mean:        'mean',
  sum:         'sum',
  median:      'median',
  min:         'minimum',
  max:         'maximum',
  product:     'product',
  variance:    'variance',
  stddev:      'standard deviation',
  nCr:         'combinations (nCr)',
  nPr:         'permutations (nPr)',
  gcd:         'greatest common divisor',
  lcm:         'least common multiple',
  solve:       'equation solver',
  linReg:      'linear regression',
  quadReg:     'quadratic regression',
}

// Feature-keyed example bank: human-readable feature name → 1-2 canonical usage examples.
// Used in the "fix" / "what I can do" parts of error messages.
export const EXAMPLE_BANK: Record<string, string[]> = {
  'square root':             ['the square root of 16', 'sqrt(25)'],
  'cube root':               ['the cube root of 27'],
  'sine':                    ['sin 90 degrees', 'sine of 45'],
  'cosine':                  ['cos(60)', 'cosine of 0'],
  'tangent':                 ['tan 45 degrees'],
  'arcsine':                 ['arcsine of 0.5'],
  'arccosine':               ['arccosine of 1'],
  'arctangent':              ['arctangent of 1'],
  'log base 10':             ['log(100)', 'log of 1000'],
  'natural log':             ['ln(e)', 'natural log of 10'],
  'log base 2':              ['log base 2 of 8'],
  'absolute value':          ['absolute value of -5', 'abs(-3)'],
  'mean':                    ['mean of 4 5 6', 'average of 3, 7, 9'],
  'sum':                     ['sum of 3 and 4', 'the sum of 1 2 3'],
  'median':                  ['median of 3 5 7'],
  'minimum':                 ['min of 3 5 7'],
  'maximum':                 ['max of 3 5 7'],
  'product':                 ['product of 2 3 4'],
  'variance':                ['variance of 3 5 7'],
  'standard deviation':      ['standard deviation of 3 5 7'],
  'combinations (nCr)':      ['5 nCr 2', 'combinations of 5 choose 2'],
  'permutations (nPr)':      ['5 nPr 2'],
}
