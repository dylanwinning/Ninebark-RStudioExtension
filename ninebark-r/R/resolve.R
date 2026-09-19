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
