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
