# Run once before the whole test suite (testthat's own convention for any
# tests/testthat/setup*.R file). Disables anonymous input logging for every
# test in this suite by default -- nb_run_one() (R/addin.R) calls
# nb_log_input() (R/inputLogger.R) unconditionally, so without this,
# test-addin-logic.R's existing tests (which call nb_run_one() directly,
# with no mocking of their own) would fire a REAL curl request to
# Ninebark's production logging endpoint on every test run, for every test
# phrase in that file ("let x be 5", "asdkjhaskjdhaskjdh", …) -- not just
# slow/pointless, but genuinely polluting real usage data with test noise.
#
# test-inputLogger.R's own tests of the "custom URL" and "default URL"
# behavior override this locally (Sys.setenv + on.exit restore) within
# just those specific tests, which correctly takes precedence over this
# suite-wide default for their duration.
Sys.setenv(NINEBARK_LOG_URL = "")

# Same reasoning, for nb_check_for_update() (R/updateCheck.R): nothing in
# this suite should make a real network call to GitHub on every test run.
# test-updateCheck.R's own tests of nb_check_for_update() itself override
# this locally for just those tests.
Sys.setenv(NINEBARK_SKIP_UPDATE_CHECK = "true")

# Same reasoning again, for nb_call_ai_relay() (R/aiRelayClient.R):
# ninebark_resolve_with_ai_fallback() (R/resolve.R), which nb_run_one() now
# calls, would otherwise fire a REAL request to the AI relay for every
# unrecognized test phrase if a developer happens to have this set in
# their own shell/.Renviron for manual testing. The function already
# defaults to disabled when unset, but setting it explicitly here is the
# same belt-and-suspenders this file already applies to the other two
# optional network calls, not a behavior change on its own.
Sys.setenv(NINEBARK_AI_RELAY_URL = "")
