# A real (not mocked) system2() call, local-only (no network) — the two
# bugs found while building the AI relay client (nb_call_ai_relay's own
# Content-Type/Origin headers, and the pre-existing identical one in
# nb_log_input()'s Content-Type header) were BOTH invisible to every
# mocked-system2 test in test-aiRelayClient.R / test-inputLogger.R, since
# mocking system2() entirely skips the real shell word-splitting that
# actually caused them. This file keeps exercising the real mechanism
# those tests can't, using a harmless local shell script instead of a
# real network call, so it stays fast and offline.
#
# NOT `echo`: echo prints all of its argv space-joined with no indication
# of where one argument ended and the next began, so splitting one
# 2-word argument into two separate argv elements is INVISIBLE in its
# output — tried that first, and it looked like there was no bug at all.
# Counting argv entries (via a tiny generated script) is what actually
# distinguishes "one argument containing a space" from "two arguments
# that happen to look the same once printed," which is the real bug.
argv_dump_script <- function() {
  path <- tempfile(fileext = ".sh")
  writeLines(c("#!/bin/sh", 'echo "ARGC=$#"', 'for a in "$@"; do echo "ARG<$a>"; done'), path)
  Sys.chmod(path, "0755")
  path
}

test_that("an UNQUOTED argument containing a space is split into TWO argv entries by system2() -- the bug, reproduced", {
  skip_on_os("windows") # POSIX-shell-specific, same as the real bug's own platform
  script <- argv_dump_script()
  on.exit(unlink(script))
  out <- system2(script, args = c("-H", "Content-Type: application/json"), stdout = TRUE)
  # If this ever starts reporting ARGC=2 (one for -H, one for the whole
  # header value), system2()'s behavior has changed and every shQuote()
  # call this package added to work around it should be re-examined.
  expect_equal(out, c("ARGC=3", "ARG<-H>", "ARG<Content-Type:>", "ARG<application/json>"))
})

test_that("shQuote() on the SAME argument survives as ONE argv entry -- the fix, reproduced", {
  skip_on_os("windows")
  script <- argv_dump_script()
  on.exit(unlink(script))
  out <- system2(script, args = c("-H", shQuote("Content-Type: application/json")), stdout = TRUE)
  expect_equal(out, c("ARGC=2", "ARG<-H>", "ARG<Content-Type: application/json>"))
})

test_that("shQuote() on the Origin header's conventional pseudo-origin survives as ONE argv entry", {
  skip_on_os("windows")
  script <- argv_dump_script()
  on.exit(unlink(script))
  out <- system2(script, args = c("-H", shQuote(paste0("Origin: ", .nb_relay_origin))), stdout = TRUE)
  expect_equal(out, c("ARGC=2", "ARG<-H>", paste0("ARG<Origin: ", .nb_relay_origin, ">")))
})
