# R/aiRelayClient.R -- the R-side AI relay call. Mirrors
# test-inputLogger.R's local_mocked_bindings(system2 = ...) pattern so
# none of these tests ever hits a real network call, but — unlike that
# file's fire-and-forget call — the mock here must actually RETURN a
# response (stdout), since this call's whole point is reading it back.

test_that("nb_json_extract_string / nb_json_extract_bool parse the relay's flat JSON shapes", {
  expect_equal(nb_json_extract_string('{"ok":true,"mode":"formal","result":"(1+1)"}', "result"), "(1+1)")
  expect_true(nb_json_extract_bool('{"ok":true,"mode":"formal","result":"x"}', "ok"))
  expect_false(nb_json_extract_bool('{"ok":false,"reason":"budget-exceeded"}', "ok"))
  expect_null(nb_json_extract_string('{"ok":false,"reason":"budget-exceeded"}', "result"))
})

test_that("nb_json_extract_string correctly un-escapes quotes/backslashes/newlines inside the value", {
  # The value can be arbitrary AI-generated R code, which legitimately
  # contains these — a naive non-greedy regex would stop at the first
  # literal quote even when it's itself escaped.
  json <- '{"ok":true,"mode":"raw-code","code":"x <- \\"a\\\\b\\"\\nprint(x)"}'
  expect_equal(nb_json_extract_string(json, "code"), 'x <- "a\\b"\nprint(x)')
})

test_that("nb_parse_relay_response: formal tier", {
  r <- nb_parse_relay_response('{"ok":true,"mode":"formal","result":"(1+1)"}')
  expect_equal(r, list(ok = TRUE, mode = "formal", result = "(1+1)"))
})

test_that("nb_parse_relay_response: raw-code tier", {
  r <- nb_parse_relay_response('{"ok":true,"mode":"raw-code","language":"r","code":"mean(c(1,2))"}')
  expect_equal(r, list(ok = TRUE, mode = "raw-code", language = "r", code = "mean(c(1,2))"))
})

test_that("nb_parse_relay_response: an ok:false response passes its reason through", {
  r <- nb_parse_relay_response('{"ok":false,"reason":"budget-exceeded"}')
  expect_equal(r, list(ok = FALSE, reason = "budget-exceeded"))
})

test_that("nb_parse_relay_response: malformed/unexpected JSON falls back to network-error, never throws", {
  expect_equal(nb_parse_relay_response("not json at all"), list(ok = FALSE, reason = "network-error"))
  expect_equal(nb_parse_relay_response(""), list(ok = FALSE, reason = "network-error"))
})

test_that("nb_ai_relay_request_body builds the expected JSON, with and without a diagnostic hint", {
  expect_equal(
    nb_ai_relay_request_body("mean of", "rstudio", "formal", c("mean")),
    '{"interfaceId":"rstudio","input":"mean of","tier":"formal","diagnosticHint":["mean"]}'
  )
  expect_equal(
    nb_ai_relay_request_body("hiiiii", "rstudio", "formal", NULL),
    '{"interfaceId":"rstudio","input":"hiiiii","tier":"formal","diagnosticHint":null}'
  )
})

test_that("nb_call_ai_relay returns network-error with no network call when the URL is unset", {
  old <- Sys.getenv("NINEBARK_AI_RELAY_URL", unset = NA)
  Sys.setenv(NINEBARK_AI_RELAY_URL = "")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_AI_RELAY_URL") else Sys.setenv(NINEBARK_AI_RELAY_URL = old))

  calls <- list()
  testthat::local_mocked_bindings(
    system2 = function(command, args, wait = TRUE, stdout = TRUE, stderr = TRUE) {
      calls[[length(calls) + 1]] <<- list(args = args)
      character(0)
    },
    .package = "base"
  )
  result <- nb_call_ai_relay("mean of", "rstudio", "formal", c("mean"))
  expect_equal(result, list(ok = FALSE, reason = "network-error"))
  expect_length(calls, 0)
})

test_that("nb_call_ai_relay calls curl synchronously with the right args and parses a successful response", {
  old <- Sys.getenv("NINEBARK_AI_RELAY_URL", unset = NA)
  Sys.setenv(NINEBARK_AI_RELAY_URL = "https://example.com")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_AI_RELAY_URL") else Sys.setenv(NINEBARK_AI_RELAY_URL = old))

  calls <- list()
  testthat::local_mocked_bindings(
    system2 = function(command, args, wait = TRUE, stdout = TRUE, stderr = TRUE) {
      # Read the body file's content HERE, inside the mock, before
      # returning — nb_call_ai_relay() cleans the tempfile up via its own
      # on.exit() as soon as this call returns (correct for a synchronous
      # call with no detached process that might read it later, unlike
      # nb_log_input()'s deliberately-not-cleaned-up one), so by the time
      # control is back in this test body the file is already gone.
      data_arg <- args[which(args == "-d") + 1]
      body_file <- sub("^@", "", data_arg)
      body_content <- readLines(body_file)
      calls[[length(calls) + 1]] <<- list(command = command, args = args, wait = wait, body_content = body_content)
      '{"ok":true,"mode":"formal","result":"(1+1)"}'
    },
    .package = "base"
  )
  result <- nb_call_ai_relay("mean of", "rstudio", "formal", c("mean"))

  expect_equal(result, list(ok = TRUE, mode = "formal", result = "(1+1)"))
  expect_length(calls, 1)
  expect_equal(calls[[1]]$command, "curl")
  # Synchronous, unlike nb_log_input()'s detached (wait = FALSE) call --
  # this one's whole point is reading the response back.
  expect_true(calls[[1]]$wait)
  expect_true("Content-Type: application/json" %in% calls[[1]]$args)
  expect_true("--max-time" %in% calls[[1]]$args)
  expect_true(any(grepl("/interpret$", calls[[1]]$args)))
  # curl sends no Origin header at all unless told to — confirmed against
  # the live relay that this gets rejected as forbidden-origin regardless
  # of ALLOWED_ORIGINS otherwise (see this call's own comment).
  expect_true("Origin: https://ninebark-rstudio-addin.local" %in% calls[[1]]$args)

  # Body via -d @tempfile, same reasoning/same bug class as
  # nb_log_input()'s own comment — not a literal command-line argument.
  data_arg <- calls[[1]]$args[which(calls[[1]]$args == "-d") + 1]
  expect_match(data_arg, "^@")
  expect_equal(
    calls[[1]]$body_content,
    '{"interfaceId":"rstudio","input":"mean of","tier":"formal","diagnosticHint":["mean"]}'
  )
})

test_that("nb_call_ai_relay returns network-error if the curl call itself errors", {
  old <- Sys.getenv("NINEBARK_AI_RELAY_URL", unset = NA)
  Sys.setenv(NINEBARK_AI_RELAY_URL = "https://example.com")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_AI_RELAY_URL") else Sys.setenv(NINEBARK_AI_RELAY_URL = old))

  testthat::local_mocked_bindings(
    system2 = function(command, args, wait = TRUE, stdout = TRUE, stderr = TRUE) {
      stop("curl not found")
    },
    .package = "base"
  )
  expect_equal(nb_call_ai_relay("mean of", "rstudio", "formal"), list(ok = FALSE, reason = "network-error"))
})
