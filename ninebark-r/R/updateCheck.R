# No R package — from GitHub or even CRAN — updates itself; every update
# needs an explicit `remotes::install_github()` rerun (see the README's
# "Updating" section). This file is the nudge: when the Addin opens, it
# does a quick, bounded check against this repo's own DESCRIPTION file on
# GitHub, and if the installed package is behind, seeds the Addin's log
# pane with a message naming the exact command to paste.
#
# Deliberately fails SILENTLY the same way nb_log_input() does: a flaky or
# offline network, a missing `curl`, a malformed response, or
# packageVersion() itself erroring should never delay or break opening the
# Addin -- nb_check_for_update() just returns NULL for "nothing to say"
# and "couldn't check" alike. Bounded with curl's own --max-time so a
# dead/slow connection can't hang the Addin's launch waiting on this
# (confirmed necessary the same way nb_log_input()'s own curl call needed
# `wait = FALSE` -- this one can't be fire-and-forget, since the whole
# point is showing the result, but it can still refuse to hang).
.nb_description_url <- "https://raw.githubusercontent.com/dylanwinning/Ninebark-RStudioExtension/main/ninebark-r/DESCRIPTION"

# Disable the check entirely (e.g. on an offline/firewalled RStudio Server
# where this request would just time out on every single Addin open) by
# setting this to any non-empty value.
.nb_skip_update_check_var <- "NINEBARK_SKIP_UPDATE_CHECK"

# Pure-ish: given the installed and latest version strings, returns the
# ready-to-paste message, or NULL if already current. Split out from
# nb_check_for_update() below so the actual comparison/message-building
# logic is unit-testable without mocking system2()/packageVersion() just
# to exercise it. Not exported.
nb_update_message <- function(installed, latest) {
  if (is.null(installed) || is.null(latest) || !nzchar(latest)) return(NULL)
  newer <- tryCatch(utils::compareVersion(latest, installed) > 0, error = function(e) FALSE)
  if (!newer) return(NULL)

  paste(
    sprintf("Ninebark has been updated (installed: %s, latest: %s).", installed, latest),
    "To get the update, paste this into the Console:",
    "",
    '  remotes::install_github("dylanwinning/Ninebark-RStudioExtension", subdir = "ninebark-r")',
    "",
    "Then restart your R session (Session > Restart R) before using the Addin again.",
    sep = "\n"
  )
}

# Impure: does the actual network call and version lookup, then defers to
# nb_update_message() above. Not exported.
nb_check_for_update <- function() {
  if (nzchar(Sys.getenv(.nb_skip_update_check_var))) return(NULL)

  installed <- tryCatch(as.character(utils::packageVersion("ninebark")), error = function(e) NULL)
  if (is.null(installed)) return(NULL)

  latest <- tryCatch({
    out <- system2("curl", args = c("-s", "--max-time", "2", .nb_description_url), stdout = TRUE, stderr = FALSE, wait = TRUE)
    version_line <- grep("^Version:", out, value = TRUE)
    if (length(version_line) == 0) NULL else trimws(sub("^Version:\\s*", "", version_line[1]))
  }, error = function(e) NULL)

  nb_update_message(installed, latest)
}
