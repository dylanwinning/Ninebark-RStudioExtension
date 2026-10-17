# Anonymous input logging -- the R-side equivalent of inputLogger.ts in the
# browser extensions' shared engine (src/vendor/ninebark-engine/inputLogger.ts
# in the parent repo; see that file's own header for the full "what/why").
# Same contract: every phrase typed into this Addin is sent, tagged
# "rstudio", to the same Google Apps Script endpoint those extensions use --
# whether or not it resolved, since logging failed attempts is how coverage
# gaps get found. No names, no session id, nothing else is sent.
#
# Code.gs (the parent repo's google-apps-script/) already recognizes the
# "rstudio" tag and routes it to its own sheet tab -- this file needed no
# server-side change, only a client that actually calls it.
#
# Override the endpoint with the NINEBARK_LOG_URL environment variable; set
# it to "" to disable logging entirely for a local dev/test session. Unset,
# it defaults to Ninebark's own logging endpoint -- matching how the
# browser extensions' SHIPPED builds already bake in a real URL by default
# (inputLogger.ts's VITE_INPUT_LOG_URL is empty only in an unconfigured
# clone of that repo; what actually ships to real users has one set).
.nb_default_log_url <- "https://script.google.com/macros/s/AKfycbztjBu8AXl70Ay4NAOLkefj4B1Q_unC__SE-aAhkXgF4UcP0OFQdU-I0SX8-nDy3FcI/exec"

# Defensive cap, same number and same reasoning as inputLogger.ts: a pasted
# essay isn't a plain-English R command and isn't worth transmitting.
.nb_max_logged_length <- 2000

# Minimal JSON-string escaper -- just enough for arbitrary plain-English/R
# input text, not a general-purpose encoder: backslash and double-quote are
# JSON's two mandatory escapes; newline/tab/carriage-return are included
# too since a pasted multi-line command shouldn't be able to break the
# request body. R strings are UTF-8 already, which JSON accepts natively,
# so non-ASCII text needs no further escaping here. Not exported --
# internal to this file, exposed to tests via :::.
nb_json_escape_string <- function(x) {
  x <- gsub("\\\\", "\\\\\\\\", x)
  x <- gsub("\"", "\\\\\"", x)
  x <- gsub("\n", "\\\\n", x)
  x <- gsub("\r", "\\\\r", x)
  x <- gsub("\t", "\\\\t", x)
  x
}

# Pure: builds the JSON body to send, or NULL if there's nothing worth
# sending (empty/whitespace-only input). Separated from nb_log_input()
# below specifically so it's unit-testable on its own, with no network
# call, no system2() involved, and nothing to mock -- the same reason
# nb_addin_ui() is split out from ninebark_addin() elsewhere in this
# package. Not exported.
nb_log_input_body <- function(text) {
  trimmed <- trimws(text)
  if (!nzchar(trimmed)) return(NULL)
  if (nchar(trimmed) > .nb_max_logged_length) {
    trimmed <- substr(trimmed, 1, .nb_max_logged_length)
  }
  sprintf('{"text":"%s","interface":"rstudio"}', nb_json_escape_string(trimmed))
}

# Fire-and-forget: shells out to the `curl` command-line tool as a
# DETACHED BACKGROUND process (wait = FALSE), rather than using httr::POST()
# or the curl R package, for two reasons: it avoids adding a new package
# dependency (this package currently makes no network calls at all -- see
# DESCRIPTION/README, both updated alongside this file to say "the
# resolution itself" rather than claiming no network calls anywhere), and
# it needs to be genuinely non-blocking. An ordinary synchronous HTTP call
# would stall this Addin's single-threaded Shiny event loop for however
# long the round-trip takes -- the same "never awaited" behavior
# inputLogger.ts's fetch() gets for free in JS has to be built by hand
# here, since R has no non-blocking I/O primitive as readily available.
# curl ships with every platform this Addin runs on (macOS and Linux
# pre-install it; Windows 10+ ships curl.exe natively) -- if it's somehow
# missing, this silently does nothing, the same as every other failure
# path here (unset log URL, empty input, network failure once detached).
nb_log_input <- function(text) {
  log_url <- Sys.getenv("NINEBARK_LOG_URL", unset = .nb_default_log_url)
  if (!nzchar(log_url)) return(invisible(NULL))

  body <- nb_log_input_body(text)
  if (is.null(body)) return(invisible(NULL))

  tryCatch(
    system2(
      "curl",
      args = c("-s", "-X", "POST", "-d", body, log_url),
      wait = FALSE, stdout = FALSE, stderr = FALSE
    ),
    error = function(e) invisible(NULL)
  )
  invisible(NULL)
}
