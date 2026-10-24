# R port of the parent repo's src/aiRelayClient.ts (Ninebark-DesmosExtension)
# -- see that file's own header, and
# /Users/dylanwinning/.claude/plans/structured-inventing-codd.md section 4,
# for the full design. Hand-ported, not shared-by-copy, same reasoning as
# escalationGate.R.
#
# Deliberately does NOT reuse inputLogger.R's fire-and-forget pattern
# (system2(..., wait = FALSE), response discarded): this call's entire
# point is reading the AI's answer back, so it must be SYNCHRONOUS
# (wait = TRUE) -- the opposite of logging's requirement. Two lessons already
# learned there, carried forward unchanged: curl's own default Content-Type
# must be overridden explicitly (here: application/json, matching
# aiRelayClient.ts's client-side header, NOT inputLogger.R's text/plain --
# this body is read by a real JSON-parsing endpoint, not Code.gs's
# JSON.parse(e.postData.contents) workaround), and the JSON body goes
# through a TEMP FILE via `-d @file` rather than as a raw command-line
# argument, to sidestep system2()'s shell-argument quoting entirely (a
# semicolon in a body argument once produced a literal "sh: b: command not
# found" -- see inputLogger.R's own comment for the full story).
#
# No new package dependency for JSON: the response shape is small and flat
# ({"ok":true,"mode":"formal","result":"..."} etc.), so this hand-rolls a
# narrowly-scoped extractor rather than adding jsonlite, same "avoid a new
# dependency for a narrowly-scoped need" call inputLogger.R already made
# for its own JSON string-escaper.

.nb_relay_timeout_seconds <- 15

# Extracts a top-level JSON string value for `key`, correctly handling
# escape sequences WITHIN the value (\", \\, \n, \t, \r) -- not a naive
# non-greedy regex, which would stop at the first literal '"' even when
# it's part of an escaped sequence. This matters here specifically because
# the value can be arbitrary AI-generated R code, which legitimately
# contains quotes and backslashes a naive parser would mis-split on.
nb_json_extract_string <- function(json, key) {
  pattern <- sprintf('"%s"\\s*:\\s*"', key)
  m <- regexpr(pattern, json, perl = TRUE)
  if (m[1] == -1) return(NULL)
  start <- m[1] + attr(m, "match.length")
  rest <- substring(json, start)
  chars <- strsplit(rest, "")[[1]]
  out <- character(0)
  escaped <- FALSE
  for (ch in chars) {
    if (escaped) {
      out <- c(out, switch(ch, n = "\n", t = "\t", r = "\r", `"` = "\"", `\\` = "\\", `/` = "/", ch))
      escaped <- FALSE
    } else if (ch == "\\") {
      escaped <- TRUE
    } else if (ch == "\"") {
      break
    } else {
      out <- c(out, ch)
    }
  }
  paste(out, collapse = "")
}

nb_json_extract_bool <- function(json, key) {
  pattern <- sprintf('"%s"\\s*:\\s*(true|false)', key)
  m <- regexec(pattern, json, perl = TRUE)
  groups <- regmatches(json, m)[[1]]
  if (length(groups) < 2) return(NA)
  identical(groups[2], "true")
}

# Parses the relay's {ok,...} JSON response into a plain R list mirroring
# aiRelayClient.ts's RelayResponse union: list(ok=TRUE, mode="formal",
# result=...) | list(ok=TRUE, mode="raw-code", language=..., code=...) |
# list(ok=FALSE, reason=...). Returns list(ok=FALSE, reason="network-error")
# for anything that doesn't parse as expected, same fallback aiRelayClient.ts
# uses for a malformed response.
nb_parse_relay_response <- function(body) {
  ok <- nb_json_extract_bool(body, "ok")
  if (!isTRUE(ok)) {
    reason <- nb_json_extract_string(body, "reason")
    return(list(ok = FALSE, reason = if (is.null(reason)) "network-error" else reason))
  }
  mode <- nb_json_extract_string(body, "mode")
  if (identical(mode, "formal")) {
    result <- nb_json_extract_string(body, "result")
    if (is.null(result)) return(list(ok = FALSE, reason = "network-error"))
    return(list(ok = TRUE, mode = "formal", result = result))
  }
  if (identical(mode, "raw-code")) {
    code <- nb_json_extract_string(body, "code")
    language <- nb_json_extract_string(body, "language")
    if (is.null(code)) return(list(ok = FALSE, reason = "network-error"))
    return(list(ok = TRUE, mode = "raw-code", language = language, code = code))
  }
  list(ok = FALSE, reason = "network-error")
}

# Builds the request body -- pure, unit-testable without a network call,
# same split-out-for-testability shape as nb_log_input_body() in
# inputLogger.R. `diagnostic_hint` is recognized_features from
# ninebark_resolve()'s failure, or NULL.
nb_ai_relay_request_body <- function(input, interface_id, tier, diagnostic_hint = NULL) {
  hint_json <- if (length(diagnostic_hint) > 0) {
    paste0('[', paste(sprintf('"%s"', vapply(diagnostic_hint, nb_json_escape_string, character(1))), collapse = ","), ']')
  } else {
    "null"
  }
  sprintf(
    '{"interfaceId":"%s","input":"%s","tier":"%s","diagnosticHint":%s}',
    interface_id,
    nb_json_escape_string(input),
    tier,
    hint_json
  )
}

# The actual synchronous call. Returns the same list shape
# nb_parse_relay_response() produces; NEVER throws -- a missing URL, a
# missing curl, a timeout, or a malformed response all fall back to
# list(ok=FALSE, reason="network-error"|"timeout"), the same
# "fail as data, not as an exception" contract every Ninebark interface
# keeps at its language boundary.
nb_call_ai_relay <- function(input, interface_id, tier, diagnostic_hint = NULL) {
  relay_url <- Sys.getenv("NINEBARK_AI_RELAY_URL", unset = "")
  if (!nzchar(relay_url)) return(list(ok = FALSE, reason = "network-error"))

  body <- nb_ai_relay_request_body(input, interface_id, tier, diagnostic_hint)

  result <- tryCatch({
    tmp <- tempfile(fileext = ".json")
    writeLines(body, tmp, useBytes = TRUE)
    on.exit(unlink(tmp), add = TRUE)

    response <- system2(
      "curl",
      args = c(
        "-s", "-X", "POST",
        "-H", "Content-Type: application/json",
        "--max-time", as.character(.nb_relay_timeout_seconds),
        "-d", paste0("@", tmp),
        paste0(relay_url, "/interpret")
      ),
      wait = TRUE, stdout = TRUE, stderr = FALSE
    )
    paste(response, collapse = "\n")
  }, error = function(e) NULL)

  if (is.null(result) || !nzchar(result)) return(list(ok = FALSE, reason = "network-error"))
  nb_parse_relay_response(result)
}
