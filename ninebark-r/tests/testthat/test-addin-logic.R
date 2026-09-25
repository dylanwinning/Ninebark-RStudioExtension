# nb_run_one() / nb_manual_outcome() / nb_dispatch() -- the server-side
# logic behind the "Auto-run in RStudio" toggle. Since this test suite runs
# headlessly (no live RStudio session), rstudioapi::isAvailable() is FALSE
# and any rstudioapi call (sendToConsole/getSourceEditorContext/insertText)
# throws "RStudio not running" -- which turns out to make the auto=TRUE
# path testable too (nb_run_one's own tryCatch around nb_dispatch() turns
# that throw into a "couldn't dispatch" log entry, exercised below), not
# just the auto=FALSE path, which never touches rstudioapi at all and so
# behaves identically here and inside a real session.

test_that("auto = FALSE resolves but never calls rstudioapi, and reports how to paste it in", {
  result <- ninebark:::nb_run_one("let x be 5", auto = FALSE)
  expect_equal(result$code, "x <- 5")
  expect_match(result$entry, "resolved for the Console", fixed = TRUE)
  expect_match(result$entry, "copy it from the box above", fixed = TRUE)
  expect_match(result$entry, "x <- 5", fixed = TRUE)
})

test_that("auto = FALSE reports the Source editor by name when the command targets it", {
  result <- ninebark:::nb_run_one("in the script let x be 5", auto = FALSE)
  expect_equal(result$code, "x <- 5")
  expect_match(result$entry, "resolved for the Source editor", fixed = TRUE)
})

test_that("auto = TRUE attempts rstudioapi dispatch, and a dispatch failure still keeps the resolved code", {
  # Headless here, so rstudioapi::sendToConsole() throws "RStudio not
  # running" -- nb_run_one's tryCatch around nb_dispatch() turns that into
  # a "couldn't dispatch" entry rather than propagating the error, and
  # (this is the part worth pinning) `code` is still populated from the
  # successful RESOLUTION regardless of the FAILED dispatch, so the
  # "Resolved R" copy box still has something useful in it.
  result <- ninebark:::nb_run_one("let x be 5", auto = TRUE)
  expect_equal(result$code, "x <- 5")
  expect_match(result$entry, "couldn't dispatch", fixed = TRUE)
  expect_match(result$entry, "RStudio not running", fixed = TRUE)
})

test_that("empty input returns NULL in both modes (nothing logged, nothing to copy)", {
  expect_null(ninebark:::nb_run_one("", auto = TRUE))
  expect_null(ninebark:::nb_run_one("   ", auto = FALSE))
})

test_that("a failed resolution has no code to copy, in either mode", {
  r_auto <- ninebark:::nb_run_one("asdkjhaskjdhaskjdh", auto = TRUE)
  r_manual <- ninebark:::nb_run_one("asdkjhaskjdhaskjdh", auto = FALSE)
  expect_null(r_auto$code)
  expect_null(r_manual$code)
  expect_true(nzchar(r_auto$entry))
  expect_true(nzchar(r_manual$entry))
})

test_that("nb_manual_outcome() names the right target and never throws", {
  expect_match(
    ninebark:::nb_manual_outcome(list(target = "console", code = "mean(c(1,2,3))")),
    "the Console", fixed = TRUE
  )
  expect_match(
    ninebark:::nb_manual_outcome(list(target = "source", code = "x <- 5")),
    "the Source editor", fixed = TRUE
  )
})

# ── Regression tests: the "silently queued, never runs" bug ────────────────
# shiny::runGadget() blocks R's interpreter for as long as this panel is
# open, so rstudioapi::sendToConsole(execute = TRUE) only QUEUES a command
# at the console -- it can't evaluate until the gadget closes, and
# sendToConsole() itself doesn't error just because R can't get around to
# running it, so an earlier version of nb_dispatch() called it with
# execute = TRUE and wrongly reported "ran in the Console" when nothing had
# actually run. The headless "RStudio not running" error the tests above
# rely on happens too early to catch THIS specific mistake (it masks
# whatever arguments were passed), so these tests mock
# rstudioapi::sendToConsole()/insertText() directly to inspect the actual
# call -- this is what would have caught the bug before it shipped.

test_that("the Console target sends execute = FALSE, never TRUE, and says to close the panel first", {
  calls <- list()
  testthat::local_mocked_bindings(
    sendToConsole = function(code, execute = TRUE, echo = TRUE, focus = TRUE, animate = FALSE) {
      calls[[length(calls) + 1]] <<- list(code = code, execute = execute)
      invisible(NULL)
    },
    .package = "rstudioapi"
  )
  outcome <- ninebark:::nb_dispatch(list(target = "console", code = "mean(c(1, 2, 3))"))

  expect_length(calls, 1)
  expect_identical(calls[[1]]$execute, FALSE)
  expect_identical(calls[[1]]$code, "mean(c(1, 2, 3))")
  expect_match(outcome, "close this panel", fixed = TRUE)
  expect_match(outcome, "press Enter", fixed = TRUE)
  expect_no_match(outcome, "^ran in the Console")
})

test_that("the Source target still calls insertText() and genuinely reports it as done (unaffected by the console-blocking issue)", {
  inserted <- NULL
  testthat::local_mocked_bindings(
    getSourceEditorContext = function() list(id = "doc1", path = "/tmp/script.R"),
    insertText = function(text, id = NULL) { inserted <<- list(text = text, id = id); invisible(NULL) },
    .package = "rstudioapi"
  )
  outcome <- ninebark:::nb_dispatch(list(target = "source", code = "x <- 5"))

  expect_equal(inserted$text, "x <- 5\n")
  expect_equal(inserted$id, "doc1")
  expect_match(outcome, "^inserted into script\\.R")
})
