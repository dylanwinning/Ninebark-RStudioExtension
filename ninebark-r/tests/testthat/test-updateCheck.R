# nb_update_message() / nb_check_for_update() -- the update-nudge shown in
# the Addin's log pane on open when a newer version exists, described in
# R/updateCheck.R. nb_update_message() is pure (no network, no system2(),
# no packageVersion()) and tested directly; nb_check_for_update() is
# tested by mocking system2() and packageVersion() themselves, the same
# local_mocked_bindings() pattern used for inputLogger.R's tests -- so
# none of these ever actually hits the network. setup.R sets
# NINEBARK_SKIP_UPDATE_CHECK="true" for the whole suite by default; tests
# here that need the check actually "on" unset it locally.

test_that("nb_update_message() returns NULL when installed is already current", {
  expect_null(nb_update_message("0.1.0", "0.1.0"))
})

test_that("nb_update_message() returns NULL when installed is NEWER than latest", {
  # e.g. a local dev install ahead of what's tagged/pushed -- never tell
  # someone to downgrade.
  expect_null(nb_update_message("0.2.0", "0.1.0"))
})

test_that("nb_update_message() returns a message with the install command when latest is newer", {
  msg <- nb_update_message("0.1.0", "0.1.1")
  expect_match(msg, "installed: 0.1.0", fixed = TRUE)
  expect_match(msg, "latest: 0.1.1", fixed = TRUE)
  expect_match(
    msg,
    'remotes::install_github("dylanwinning/Ninebark-RStudioExtension", subdir = "ninebark-r")',
    fixed = TRUE
  )
  expect_match(msg, "Restart R", fixed = TRUE)
})

test_that("nb_update_message() returns NULL for NULL or empty inputs rather than erroring", {
  expect_null(nb_update_message(NULL, "0.1.1"))
  expect_null(nb_update_message("0.1.0", NULL))
  expect_null(nb_update_message("0.1.0", ""))
})

test_that("nb_check_for_update() returns NULL when the skip env var is set (the suite-wide default)", {
  # No mocking needed here -- setup.R's default should already prevent
  # any network call; this just pins that behavior explicitly.
  expect_null(nb_check_for_update())
})

test_that("nb_check_for_update() returns a message when curl reports a newer version", {
  old <- Sys.getenv("NINEBARK_SKIP_UPDATE_CHECK", unset = NA)
  Sys.unsetenv("NINEBARK_SKIP_UPDATE_CHECK")
  on.exit(if (!is.na(old)) Sys.setenv(NINEBARK_SKIP_UPDATE_CHECK = old))

  testthat::local_mocked_bindings(
    packageVersion = function(pkg) as.numeric_version("0.1.0"),
    .package = "utils"
  )
  testthat::local_mocked_bindings(
    system2 = function(command, args, stdout = TRUE, stderr = TRUE, wait = TRUE) {
      c("Package: ninebark", "Version: 0.2.0", "License: MIT")
    },
    .package = "base"
  )

  msg <- nb_check_for_update()
  expect_match(msg, "installed: 0.1.0", fixed = TRUE)
  expect_match(msg, "latest: 0.2.0", fixed = TRUE)
})

test_that("nb_check_for_update() returns NULL when curl's output has no Version line (network failure, blocked request, …)", {
  old <- Sys.getenv("NINEBARK_SKIP_UPDATE_CHECK", unset = NA)
  Sys.unsetenv("NINEBARK_SKIP_UPDATE_CHECK")
  on.exit(if (!is.na(old)) Sys.setenv(NINEBARK_SKIP_UPDATE_CHECK = old))

  testthat::local_mocked_bindings(
    packageVersion = function(pkg) as.numeric_version("0.1.0"),
    .package = "utils"
  )
  testthat::local_mocked_bindings(
    system2 = function(...) character(0),
    .package = "base"
  )

  expect_null(nb_check_for_update())
})

test_that("nb_check_for_update() never throws even if system2() errors", {
  old <- Sys.getenv("NINEBARK_SKIP_UPDATE_CHECK", unset = NA)
  Sys.unsetenv("NINEBARK_SKIP_UPDATE_CHECK")
  on.exit(if (!is.na(old)) Sys.setenv(NINEBARK_SKIP_UPDATE_CHECK = old))

  testthat::local_mocked_bindings(
    packageVersion = function(pkg) as.numeric_version("0.1.0"),
    .package = "utils"
  )
  testthat::local_mocked_bindings(
    system2 = function(...) stop("curl not found"),
    .package = "base"
  )

  expect_no_error(nb_check_for_update())
  expect_null(nb_check_for_update())
})
