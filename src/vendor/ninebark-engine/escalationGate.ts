// ── Escalation gate for the AI-fallback tier ────────────────────────────────
// See the design plan: /Users/dylanwinning/.claude/plans/structured-inventing-codd.md
//
// When all three deterministic tiers fail, this decides whether the input
// is worth escalating to the AI relay at all, and if so, which cost tier —
// a pure, free, local function so genuine noise ("hiiiii") never reaches
// the network, let alone spends a token.
//
// Two independent signals, OR'd together (escalate on EITHER, reject only
// when BOTH are absent):
//   A. The deterministic engine already recognized SOMETHING domain-
//      meaningful but couldn't fit it together — diagnostic.category ===
//      'out-of-coverage' with a non-empty recognized.features list. This is
//      computed today by extractRecognizedFeatures() in
//      vendor/ninebark-nl/nl/index.ts; nothing new needed to read it.
//   B. The raw input itself looks like a deliberate, multi-clause request —
//      independent of whether any individual keyword was recognized, so a
//      long, conversational "what's the R code for..." ask isn't penalized
//      just because it happens to contain zero recognized vocabulary.
//
// This file is SHARED/vendored — author here, copy into every other
// interface repo's src/vendor/ninebark-engine/, exactly like
// desmosNlVocab.ts is today (see CLAUDE.md's vendoring section).
import type { NlDiagnostic } from '@ninebark/types/diagnostic'

export type EscalationTier = 'formal' | 'raw-code'

export interface EscalationDecision {
  escalate: boolean
  tier: EscalationTier | null
  reason: 'recognized-features' | 'long-deliberate-request' | 'both' | 'rejected'
}

// A short, explicit request/question-phrase trigger list, matched near the
// start of the input — mirrors LEAD_PHRASE_PATTERNS's shape in
// resolvePhrase.ts. Catches short-but-deliberate phrasings ("what should
// the R code be for...") that might not clear the word-count bar alone.
const REQUEST_PHRASE_RE =
  /^\s*(can you|could you|would you|what('?s| is| should)|how do i|how can i|i (have|want|need)|please (help|write|give))\b/i

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

function sentenceCount(s: string): number {
  return (s.match(/[.?!]/g) ?? []).length
}

// Signal B — "does this look like a deliberate multi-sentence request,"
// regardless of whether any individual keyword was recognized. Any ONE of
// the three sub-checks is enough: false negatives here (missing a genuine
// request) cost a user a dead end; false positives just cost one wasted
// cheap-tier call, which is already cheap.
export function looksLikeDeliberateRequest(rawInput: string): boolean {
  return wordCount(rawInput) >= 10
    || sentenceCount(rawInput) >= 2
    || REQUEST_PHRASE_RE.test(rawInput)
}

// Tier routing within an escalation is deliberately STRICTER than the
// escalation trigger itself — getting "should we escalate at all" slightly
// wrong is cheap, getting "which model to pay for" wrong is not. Only a
// genuinely long or clearly multi-sentence input routes to the pricier
// raw-code tier; a short near-miss phrase stays on the cheap formal-string
// tier even if it happens to trip signal B via the request-phrase check.
function isLongMultiSentence(rawInput: string): boolean {
  return wordCount(rawInput) >= 20
    || (sentenceCount(rawInput) >= 2 && wordCount(rawInput) >= 12)
}

export function decideEscalation(diagnostic: NlDiagnostic | undefined, rawInput: string): EscalationDecision {
  const signalA = diagnostic?.category === 'out-of-coverage'
    && (diagnostic.recognized?.features.length ?? 0) > 0
  const signalB = looksLikeDeliberateRequest(rawInput)

  if (!signalA && !signalB) return { escalate: false, tier: null, reason: 'rejected' }

  const tier: EscalationTier = signalB && isLongMultiSentence(rawInput) ? 'raw-code' : 'formal'
  const reason = signalA && signalB ? 'both' : signalA ? 'recognized-features' : 'long-deliberate-request'
  return { escalate: true, tier, reason }
}
