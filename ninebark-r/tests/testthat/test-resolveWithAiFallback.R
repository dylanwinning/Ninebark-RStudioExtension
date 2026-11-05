# ninebark_resolve_with_ai_fallback() (R/resolve.R) -- mirrors the browser
# extensions' resolveToOutputWithAiFallback() test suites (see e.g.
# Ninebark-DesmosExtension's tests/resolveToOutputWithAiFallback.test.ts)
# but for the R-package Addin's own entry point. nb_call_ai_relay() is
# mocked throughout (it's tested on its own merits in test-aiRelayClient.R)
# so these tests exercise only ninebark_resolve_with_ai_fallback()'s own
# decision tree, including the `escalated` field added for Code.gs's
# "Escalated to AI" column -- an escalation ATTEMPT (the relay was called)
# is tracked separately from an escalation SUCCESS, so `escalated` is TRUE
# even when the relay call itself ends up falling back to the original
# failure.
#
# "mean of" is used for the escalation-candidate fixtures (confirmed
# empirically to reach the real out-of-coverage/recognized-features path:
# diagnosticCategory "out-of-coverage", recognizedFeatures "mean", which
# nb_decide_escalation() routes to the 'formal' tier).

test_that("a deterministically-successful input returns immediately, never calling the relay, with escalated: FALSE", {
  calls <- list()
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(...) { calls[[length(calls) + 1]] <<- TRUE; list(ok = FALSE, reason = "should-not-be-called") },
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback("mean of 1,2,3,4,5")
  expect_true(result$ok)
  expect_false(isTRUE(result$escalated))
  expect_length(calls, 0)
})

test_that("pure noise that the gate rejects falls back to the original failure, never calling the relay, with escalated: FALSE", {
  calls <- list()
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(...) { calls[[length(calls) + 1]] <<- TRUE; list(ok = FALSE, reason = "should-not-be-called") },
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback("hiiiii")
  expect_false(result$ok)
  expect_false(isTRUE(result$escalated))
  expect_length(calls, 0)
})

test_that("an escalated input whose relay translation succeeds (formal tier) returns console-targeted code with escalated: TRUE", {
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(input, interface_id, tier, diagnostic_hint = NULL) {
      list(ok = TRUE, mode = "formal", result = "(1 + 1)")
    },
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback("mean of")
  expect_true(result$ok)
  expect_equal(result$target, "console")
  expect_equal(result$code, "1+1")
  expect_true(isTRUE(result$escalated))
})

test_that("an escalated input whose relay returns raw-code targets source (insert, never auto-run) with escalated: TRUE and ai_raw_code: TRUE", {
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(input, interface_id, tier, diagnostic_hint = NULL) {
      list(ok = TRUE, mode = "raw-code", code = "df <- data.frame(x = 1)\nggplot2::ggplot(df)")
    },
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback(
    "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that"
  )
  expect_true(result$ok)
  expect_equal(result$target, "source")
  expect_true(isTRUE(result$ai_raw_code))
  expect_true(isTRUE(result$escalated))
})

test_that("the model's literal UNSUPPORTED sentinel (formal tier) falls back to the original failure, tagged escalated: TRUE", {
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(...) list(ok = TRUE, mode = "formal", result = "UNSUPPORTED"),
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback("mean of")
  expect_false(result$ok)
  expect_match(result$error, "mean")
  expect_true(isTRUE(result$escalated))
})

test_that("a relay failure (budget exceeded, rate limited, etc.) falls back to the ORIGINAL deterministic message, tagged escalated: TRUE", {
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(...) list(ok = FALSE, reason = "budget-exceeded"),
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback("mean of")
  expect_false(result$ok)
  expect_match(result$error, "mean")
  expect_true(isTRUE(result$escalated))
})

test_that("a malformed (non-sentinel) formal-tier translation surfaces the converter's OWN error, tagged escalated: TRUE", {
  testthat::local_mocked_bindings(
    nb_call_ai_relay = function(...) list(ok = TRUE, mode = "formal", result = "2+"),
    .package = "ninebark"
  )
  result <- ninebark_resolve_with_ai_fallback("mean of")
  expect_false(result$ok)
  expect_true(isTRUE(result$escalated))
})
