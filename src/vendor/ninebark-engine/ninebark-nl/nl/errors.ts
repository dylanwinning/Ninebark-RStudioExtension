// E_NL_* error family — append-only, never renumbered (Sprint 7 / M33).
// Tests assert on CODE STRINGS only, never on message text.

export const NlErrorCode = {
  COVERAGE:                 'E_NL_001', // input falls outside the supported sublanguage
  AMBIGUOUS:                'E_NL_002', // input produces multiple parses and policy cannot resolve
  BAD_FRAC:                 'E_NL_003', // malformed fraction word-form
  EMPTY:                    'E_NL_004', // empty input after framing strip
  BAD_NUMBER:               'E_NL_005', // malformed number-word run
  ARITY:                    'E_NL_006', // wrong number of arguments for operator (e.g. difference/quotient ≠ 2)
  ANGLE_UNIT:               'E_NL_007', // (retired: DECISION-43 superseded by DECISION-48)
  REGRESSION_NEEDS_PAIRS:   'E_NL_008', // regression given single flat list instead of two lists or pairs
  TEST_NEEDS_PARAM:         'E_NL_009', // stats test recognized but required parameter (μ0/σ) absent
} as const

export type NlErrorCodeValue = typeof NlErrorCode[keyof typeof NlErrorCode]

export const NL_MESSAGES: Record<NlErrorCodeValue, string> = {
  [NlErrorCode.COVERAGE]:   "I didn't recognize that phrasing.",
  [NlErrorCode.AMBIGUOUS]:  "That phrasing is ambiguous — please be more specific.",
  [NlErrorCode.BAD_FRAC]:   "I couldn't read that as a fraction.",
  [NlErrorCode.EMPTY]:      "Nothing to calculate.",
  [NlErrorCode.BAD_NUMBER]: "I couldn't read that as a number.",
  [NlErrorCode.ARITY]:      "Wrong number of arguments — 'difference of' and 'quotient of' take exactly two values.",
  [NlErrorCode.ANGLE_UNIT]: "Inline angle units (degrees/radians) aren't supported yet.",
  [NlErrorCode.REGRESSION_NEEDS_PAIRS]: "Regression needs paired (x, y) data, not a single flat list.",
  [NlErrorCode.TEST_NEEDS_PARAM]: "A t-test needs a hypothesized mean (μ0); a z-test also needs a known σ.",
}
