# nb_json_escape_string() / nb_log_input_body() / nb_log_input() -- the
# anonymous usage-logging path described in R/inputLogger.R and the
# README's "Anonymous usage logging" section. nb_log_input_body() is pure
# (no network, no system2()) and tested directly; nb_log_input() is tested
# by mocking system2() itself, the same local_mocked_bindings() pattern
# test-addin-logic.R already uses for rstudioapi -- so none of these tests
# ever actually hits the network.

test_that("nb_json_escape_string() escapes backslash, quote, and whitespace control chars", {
  expect_equal(nb_json_escape_string("a\\b"), "a\\\\b")
  expect_equal(nb_json_escape_string('say "hi"'), 'say \\"hi\\"')
  expect_equal(nb_json_escape_string("line1\nline2"), "line1\\nline2")
  expect_equal(nb_json_escape_string("a\tb"), "a\\tb")
  expect_equal(nb_json_escape_string("a\rb"), "a\\rb")
  expect_equal(nb_json_escape_string("plain text"), "plain text")
})

test_that("nb_log_input_body() returns NULL for empty or whitespace-only input", {
  expect_null(nb_log_input_body(""))
  expect_null(nb_log_input_body("   "))
  expect_null(nb_log_input_body("\n\t"))
})

test_that("nb_log_input_body() builds the expected JSON, tagged rstudio", {
  expect_equal(
    nb_log_input_body("mean of 1,2,3"),
    '{"text":"mean of 1,2,3","interface":"rstudio"}'
  )
})

test_that("nb_log_input_body() trims surrounding whitespace before encoding", {
  expect_equal(
    nb_log_input_body("  let x be 5  "),
    '{"text":"let x be 5","interface":"rstudio"}'
  )
})

test_that("nb_log_input_body() escapes quotes/backslashes inside the text", {
  expect_equal(
    nb_log_input_body('say "hi" to x\\y'),
    '{"text":"say \\"hi\\" to x\\\\y","interface":"rstudio"}'
  )
})

test_that("nb_log_input_body() truncates text longer than 2000 characters", {
  long_text <- strrep("a", 2500)
  body <- nb_log_input_body(long_text)
  # The body is `{"text":"<2000 a's>","interface":"rstudio"}` -- pull the
  # text back out and check its length directly rather than hand-computing
  # the whole expected string.
  extracted <- sub('^\\{"text":"(a*)".*$', "\\1", body)
  expect_equal(nchar(extracted), 2000)
})

test_that("nb_log_input() calls curl with the right args for ordinary input", {
  # setup.R sets NINEBARK_LOG_URL="" for the whole suite (so the EXISTING
  # test-addin-logic.R tests, which call nb_run_one() -> nb_log_input()
  # with no mocking of their own, never fire a real request) -- an env var
  # that's SET to "" is still "set" as far as Sys.getenv()'s own `unset=`
  # fallback is concerned, so it does NOT fall through to
  # .nb_default_log_url here. This test needs logging actually "on" to
  # exercise the real call, hence setting a (fake) non-empty URL for just
  # this test, same pattern the "custom URL" test below uses.
  old <- Sys.getenv("NINEBARK_LOG_URL", unset = NA)
  Sys.setenv(NINEBARK_LOG_URL = "https://example.com/log")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_LOG_URL") else Sys.setenv(NINEBARK_LOG_URL = old))

  calls <- list()
  testthat::local_mocked_bindings(
    system2 = function(command, args, wait = TRUE, stdout = TRUE, stderr = TRUE) {
      calls[[length(calls) + 1]] <<- list(command = command, args = args, wait = wait)
      invisible(NULL)
    },
    .package = "base"
  )
  nb_log_input("mean of 1,2,3")

  expect_length(calls, 1)
  expect_equal(calls[[1]]$command, "curl")
  expect_false(calls[[1]]$wait)
  expect_true("-X" %in% calls[[1]]$args)
  expect_true("POST" %in% calls[[1]]$args)
  expect_true('{"text":"mean of 1,2,3","interface":"rstudio"}' %in% calls[[1]]$args)
})

test_that("nb_log_input() never calls curl for empty input", {
  calls <- list()
  testthat::local_mocked_bindings(
    system2 = function(...) { calls[[length(calls) + 1]] <<- TRUE; invisible(NULL) },
    .package = "base"
  )
  nb_log_input("")
  nb_log_input("   ")
  expect_length(calls, 0)
})

test_that("nb_log_input() never calls curl when NINEBARK_LOG_URL is set to an empty string", {
  old <- Sys.getenv("NINEBARK_LOG_URL", unset = NA)
  Sys.setenv(NINEBARK_LOG_URL = "")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_LOG_URL") else Sys.setenv(NINEBARK_LOG_URL = old))

  calls <- list()
  testthat::local_mocked_bindings(
    system2 = function(...) { calls[[length(calls) + 1]] <<- TRUE; invisible(NULL) },
    .package = "base"
  )
  nb_log_input("mean of 1,2,3")
  expect_length(calls, 0)
})

test_that("nb_log_input() posts to a custom NINEBARK_LOG_URL when set", {
  old <- Sys.getenv("NINEBARK_LOG_URL", unset = NA)
  Sys.setenv(NINEBARK_LOG_URL = "https://example.com/custom-endpoint")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_LOG_URL") else Sys.setenv(NINEBARK_LOG_URL = old))

  calls <- list()
  testthat::local_mocked_bindings(
    system2 = function(command, args, wait = TRUE, stdout = TRUE, stderr = TRUE) {
      calls[[length(calls) + 1]] <<- list(args = args)
      invisible(NULL)
    },
    .package = "base"
  )
  nb_log_input("mean of 1,2,3")

  expect_length(calls, 1)
  expect_true("https://example.com/custom-endpoint" %in% calls[[1]]$args)
})

test_that("nb_log_input() never throws even if system2() errors", {
  old <- Sys.getenv("NINEBARK_LOG_URL", unset = NA)
  Sys.setenv(NINEBARK_LOG_URL = "https://example.com/log")
  on.exit(if (is.na(old)) Sys.unsetenv("NINEBARK_LOG_URL") else Sys.setenv(NINEBARK_LOG_URL = old))

  testthat::local_mocked_bindings(
    system2 = function(...) stop("curl not found"),
    .package = "base"
  )
  expect_no_error(nb_log_input("mean of 1,2,3"))
})
