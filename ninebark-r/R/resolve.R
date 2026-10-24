# Loads the bundled Ninebark JS engine (inst/js/ninebark.js -- built from
# ../../src/ninebarkBundle.ts by `npm run build:r` in the parent repo; see
# that file's header comment) into a V8 isolate and exposes it as a plain R
# function. This is the ONLY file that touches V8 -- everything else in the
# package (R/addin.R) calls ninebark_resolve() and never sees the JS layer.
#
# Why V8 and not a rewrite in R: the vocabulary (statistics, calculus,
# linear algebra, data-frame verbs, the whole shared NL grammar) already
# exists, is tested (157 passing tests in the parent TypeScript repo), and
# is shared with five other Ninebark interfaces -- duplicating it in R would
# mean two codebases to keep in sync forever. V8 runs the real engine
# unchanged, locally, with no network call and no server-side component.

.ninebark_ctx <- local({
  ctx <- NULL
  function() {
    if (is.null(ctx)) {
      ctx <<- V8::v8()
      js_path <- system.file("js", "ninebark.js", package = "ninebark")
      if (!nzchar(js_path)) {
        stop(
          "ninebark: inst/js/ninebark.js is missing from this package install. ",
          "If you're developing locally, run `npm run build:r` in the repo root first.",
          call. = FALSE
        )
      }
      ctx$source(js_path)
    }
    ctx
  }
})

#' Resolve a plain-English phrase to R code
#'
#' Runs the same natural-language pipeline the Ninebark browser extensions
#' use (embedded here via V8, entirely locally) and returns the resolved R
#' source plus which target it's meant for -- the live Console (run it) or
#' the Source editor (insert it, unexecuted). Never throws for an
#' unrecognized phrase; check `$ok` instead (the same fail-loud-as-data
#' contract every Ninebark interface keeps at its language boundary).
#'
#' @param text A plain-English command, e.g. `"mean of 1,2,3,4,5"`,
#'   `"let x be 5"`, `"in the script for i in 1 to 10 print i"`.
#' @return A list with `ok` (logical). When `ok` is `TRUE`: `target`
#'   (`"console"` or `"source"`) and `code` (the resolved R source, a
#'   character string). When `ok` is `FALSE`: `error` (a specific,
#'   human-readable reason).
#' @examples
#' \dontrun{
#' ninebark_resolve("mean of 1,2,3,4,5")
#' ninebark_resolve("let x be 5")
#' ninebark_resolve("this is not a real command")
#' }
#' @export
ninebark_resolve <- function(text) {
  stopifnot(is.character(text), length(text) == 1)
  ctx <- .ninebark_ctx()
  result <- ctx$call("Ninebark.resolve", text)
  result
}

# Converts an already-formal-string translation (from the AI relay's
# 'formal' tier -- see nb_call_ai_relay() in R/aiRelayClient.R) to R code,
# via the SAME deterministic formalStringToR() every other tier uses. Not
# exported; internal plumbing for ninebark_resolve_with_ai_fallback() below.
# See ninebarkBundle.ts's convertFormal() for why this is a separate V8
# entry point rather than routed back through ninebark_resolve() itself:
# a formal string isn't natural language, there's no NL pipeline left to
# run on it.
ninebark_convert_formal <- function(formal) {
  stopifnot(is.character(formal), length(formal) == 1)
  ctx <- .ninebark_ctx()
  ctx$call("Ninebark.convertFormal", formal)
}

#' Resolve a plain-English phrase, falling back to AI interpretation
#'
#' Tries [ninebark_resolve()] first (unchanged, still fully local, still
#' the function every existing caller/test uses). Only on failure does it
#' consult the escalation gate (R/escalationGate.R) and, if that decides
#' it's worth it, call the AI relay (R/aiRelayClient.R) -- disabled by
#' default (`NINEBARK_AI_RELAY_URL` unset), so this behaves EXACTLY like
#' [ninebark_resolve()] unless that's been explicitly configured.
#'
#' Unlike the browser extensions' resolveToOutputWithAiFallback() (etc.),
#' this genuinely cannot happen inside the V8 isolate at all: V8's R
#' binding is a synchronous call with no event loop to resolve a network
#' Promise against, so the relay round-trip has to happen here in R,
#' AFTER ninebark_resolve() has already returned.
#'
#' @param text Same as [ninebark_resolve()].
#' @return Same shape as [ninebark_resolve()], PLUS (only on a successful
#'   raw-code-tier escalation) `ai_raw_code = TRUE` -- the caller (R/addin.R)
#'   uses this to force the "show, don't auto-run" path regardless of the
#'   Addin's own auto-fill toggle, since this code was never validated by
#'   the deterministic parser the way every other tier's output is (only a
#'   syntax-only check happens server-side -- see the relay's own README).
#' @export
ninebark_resolve_with_ai_fallback <- function(text) {
  result <- ninebark_resolve(text)
  if (isTRUE(result$ok)) return(result)

  decision <- nb_decide_escalation(result$diagnosticCategory, result$recognizedFeatures, text)
  if (!isTRUE(decision$escalate) || is.null(decision$tier)) return(result)

  relay <- nb_call_ai_relay(text, "rstudio", decision$tier, result$recognizedFeatures)
  if (!isTRUE(relay$ok)) return(result) # relay unreachable/budget/rate-limited -> original failure

  if (identical(relay$mode, "formal")) {
    # The model's literal "UNSUPPORTED" sentinel -- confirmed empirically
    # that formalStringToR's own known-name guard WOULD already reject this
    # ("I don't recognize UNSUPPORTED as part of an R command"), but this
    # explicit check is kept anyway for consistency with every other
    # interface and as insurance against that guard ever changing.
    if (identical(trimws(relay$result), "UNSUPPORTED")) return(result)

    conv <- ninebark_convert_formal(relay$result)
    if (!isTRUE(conv$ok)) {
      # A malformed AI translation hits the SAME specific conversion error
      # a human's bad formal syntax would -- surfaced directly, not
      # replaced with the original (less specific) failure.
      return(list(ok = FALSE, error = conv$error))
    }
    return(list(ok = TRUE, target = "console", code = conv$code))
  }

  if (identical(relay$mode, "raw-code")) {
    code <- relay$code
    if (is.null(code) || !nzchar(trimws(code)) || identical(trimws(code), "UNSUPPORTED")) return(result)
    return(list(ok = TRUE, target = "source", code = code, ai_raw_code = TRUE))
  }

  result
}
