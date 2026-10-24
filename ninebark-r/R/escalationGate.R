# R port of the parent repo's src/escalationGate.ts (Ninebark-DesmosExtension) --
# see that file's own header for the full design reasoning
# (/Users/dylanwinning/.claude/plans/structured-inventing-codd.md section 2).
# Deliberately hand-ported rather than shared/vendored-by-copy the way the TS
# repos do: R has no equivalent of that copy-vendoring convention, and the
# logic here is small and stable enough that keeping it as a 1:1 translation
# (same thresholds, same structure, same comments) is simpler than building
# new infrastructure to share it. If escalationGate.ts's thresholds change,
# mirror the change here too.
#
# Pure, no network, no V8 -- consumes the FLAT diagnostic fields
# ninebarkBundle.ts's resolve() exposes (diagnosticCategory,
# recognizedFeatures), not a nested diagnostic object, since that's what
# survives the V8-to-R marshalling boundary cleanly. Not exported; internal
# to this package, exposed to tests via :::.

# Signal B sub-check 3: a short, explicit request/question-phrase trigger,
# matched near the start of the input -- mirrors
# escalationGate.ts's REQUEST_PHRASE_RE.
.nb_request_phrase_re <- "^\\s*(can you|could you|would you|what('s| is| should)|how do i|how can i|i (have|want|need)|please (help|write|give))\\b"

nb_word_count <- function(s) {
  length(Filter(nzchar, strsplit(trimws(s), "\\s+")[[1]]))
}

nb_sentence_count <- function(s) {
  m <- gregexpr("[.?!]", s)[[1]]
  if (identical(as.integer(m), -1L)) 0L else length(m)
}

# Signal B -- "does this look like a deliberate multi-sentence request,"
# regardless of whether any individual keyword was recognized. Any ONE of
# the three sub-checks is enough -- false negatives here (missing a
# genuine request) cost a user a dead end; false positives just cost one
# wasted cheap-tier call, which is already cheap.
nb_looks_like_deliberate_request <- function(raw_input) {
  nb_word_count(raw_input) >= 10 ||
    nb_sentence_count(raw_input) >= 2 ||
    grepl(.nb_request_phrase_re, raw_input, ignore.case = TRUE, perl = TRUE)
}

# Tier routing within an escalation is deliberately STRICTER than the
# escalation trigger itself -- getting "should we escalate at all" slightly
# wrong is cheap, getting "which model to pay for" wrong is not.
.nb_is_long_multi_sentence <- function(raw_input) {
  nb_word_count(raw_input) >= 20 ||
    (nb_sentence_count(raw_input) >= 2 && nb_word_count(raw_input) >= 12)
}

# Mirrors decideEscalation()'s return shape: a list with $escalate
# (logical), $tier ("formal" | "raw-code" | NULL), $reason (one of
# "recognized-features", "long-deliberate-request", "both", "rejected").
#
# `diagnostic_category`/`recognized_features` come straight from
# ninebark_resolve()'s own return value (R/resolve.R) when $ok is FALSE --
# NULL/empty for a general/unrecognized failure, same as the TS side's
# `diagnostic` being undefined.
nb_decide_escalation <- function(diagnostic_category, recognized_features, raw_input) {
  signal_a <- isTRUE(identical(diagnostic_category, "out-of-coverage")) &&
    length(recognized_features) > 0
  signal_b <- nb_looks_like_deliberate_request(raw_input)

  if (!signal_a && !signal_b) {
    return(list(escalate = FALSE, tier = NULL, reason = "rejected"))
  }

  tier <- if (signal_b && .nb_is_long_multi_sentence(raw_input)) "raw-code" else "formal"
  reason <- if (signal_a && signal_b) "both" else if (signal_a) "recognized-features" else "long-deliberate-request"
  list(escalate = TRUE, tier = tier, reason = reason)
}
