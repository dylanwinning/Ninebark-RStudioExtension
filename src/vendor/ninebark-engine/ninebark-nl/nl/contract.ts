/**
 * Canonical-form contract for the NL front-end (M26 / DECISION-30).
 *
 * nlToFormal(input, settings) is a pure string→string (or string→error) function.
 * It MUST NOT evaluate, MUST NOT import the evaluator, and MUST NOT read the symbolTable.
 *
 * Emitted formal strings are:
 *   - Fully parenthesized: every binary operation is wrapped, making the result
 *     invariant under the Pratt-parser EOS table.
 *   - Numbers in canonical decimal digits (word-forms resolved).
 *   - Fractions as parenthesized division: "half" → (1/2).
 *   - Function calls as name(arg, arg, …).
 *   - Lists as {a, b, c}.
 *   - Whitespace normalized to single spaces.
 *   - Deterministic: identical (input, settings) → identical formal string, always.
 */

// DECISION-44: NlResult grows an action/intent variant (Sprint 8 A-NL / §2.1).
// Sprint 13: 'solve' action added (DECISION-73).
// Sprint 15 DECISION-81: failure variant carries structured NlDiagnostic.
// kind:'evaluate' — a value to compute; kind:'action' — a non-compute intent.
export type NlResult =
  | { ok: true;  kind: 'evaluate'; formal: string; ignored: string[]; unrecognized: string[] }
  | { ok: true;  kind: 'action'; action: 'graph' | 'solve'; formal: string; ignored: string[]; unrecognized: string[] }
  | { ok: false; code: string; span?: [number, number]; diagnostic?: import('../types/diagnostic').NlDiagnostic }

export interface NlSettings {
  // Reserved for future use (e.g. locale of number words). Keep minimal.
  // Angle unit, complex mode, etc. are evaluation concerns — not read here.
}
