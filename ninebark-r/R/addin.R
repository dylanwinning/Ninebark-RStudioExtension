# The RStudio Addin -- a small gadget dialog (miniUI + shiny, RStudio's own
# recommended pattern for an Addin with interactive input) registered by
# inst/rstudio/addins.dcf. Type a phrase, hit Run (or press Enter); it's
# resolved via ninebark_resolve() (R/resolve.R), then EITHER dispatched
# through rstudioapi -- insertText() into the active Source document for the
# Source target ("in the script ...", inserted unexecuted; this genuinely
# runs immediately, see nb_dispatch()'s comment for why), sendToConsole()
# for the Console target (queued to run, panel closing itself right after so
# that queued run can actually happen -- see nb_dispatch()'s comment for why
# the close is the panel's own job now, not a manual step) -- OR, when
# the "Auto-fill in RStudio" toggle is off, just shown in a copyable box so
# the user pastes and runs it themselves. rstudioapi is the one and only
# thing this file touches to reach the editor (in auto-fill mode), which is
# exactly why this works identically in RStudio Desktop, Server, Workbench,
# and Cloud -- no per-frontend branching anywhere in this file.

nb_log_entry <- function(input_text, outcome_text) {
  # -> / - (an arrow, a horizontal rule) rather than the literal
  # characters, so this file stays pure ASCII -- R CMD check flags non-ASCII
  # bytes in code (comments are exempt, code isn't).
  sprintf("%s\n  -> %s\n%s", input_text, outcome_text, strrep("-", 44))
}

# -- Why the Console target can't auto-EXECUTE while this panel is open,
# and how it still ends up running with no manual step -------------------
# shiny::runGadget() (called at the bottom of ninebark_addin()) blocks R's
# single interpreter thread for as long as the gadget stays open -- this is
# standard, well-documented Shiny behavior (runApp()/runGadget() run their
# own event loop synchronously in the current R process). When this file's
# server() code runs (e.g. the observeEvent() that fires on clicking Run),
# R genuinely IS executing code right then -- but it's executing THIS
# function call, nested inside Shiny's own blocking loop, not sitting idle
# at R's top-level prompt. rstudioapi::sendToConsole(execute = TRUE) asks
# the IDE to submit code to the console FOR EVALUATION, but the console can
# only evaluate NEW top-level input once R returns to that top-level
# prompt -- which will not happen until the gadget itself closes. The
# result (confirmed against real-world addin reports of the same thing,
# and the RStudio Addins/Shiny Gadgets pattern of only touching the console
# from a `done`/close handler, never while a gadget is still running): the
# command gets silently QUEUED at the console -- sendToConsole() itself
# returns without error, R's R top-level is exactly where typed-ahead input
# normally waits its turn, and it runs the moment R next reaches that
# prompt. An earlier version of this file called sendToConsole(execute =
# FALSE) and told the user to close the panel and press Enter themselves --
# correct, but a manual step that didn't need to be manual: once we KNOW
# the queued input will run as soon as the panel closes, the panel can just
# close ITSELF right after queuing it (see do_run()'s `close` handling
# below), which is exactly what turns "close this, then press Enter" into
# nothing the user has to do by hand. (insertText(), used for the Source
# target below, is NOT affected by any of this: it's a pure editor-document
# edit the IDE can complete on its own, with no dependency on R's top-level
# prompt being free -- so that path genuinely does run immediately, panel
# open or not, and never needs to close anything.)
nb_dispatch <- function(result) {
  # result$ok is TRUE here (checked by the caller) -- this only decides
  # WHERE the resolved code goes and reports back what happened, mirroring
  # dispatchRCommand() in the TypeScript engine's rExecClient.ts. Only
  # called when the "Auto-fill in RStudio" toggle is on -- see
  # nb_manual_outcome() for the off case, which never touches rstudioapi.
  # Returns list(message = <log text>, close = <should the panel close
  # itself right after this?>) -- `close` is TRUE only for the Console
  # target, since that's the one case where closing is what lets the
  # already-queued command actually run (see the comment above). focus =
  # TRUE (unlike the old execute = FALSE version, which deliberately left
  # focus alone since nothing was about to run) -- now that this really is
  # about to execute, switching to the Console is what lets the user
  # actually see the output land.
  if (identical(result$target, "console")) {
    rstudioapi::sendToConsole(result$code, execute = TRUE, echo = TRUE, focus = TRUE)
    return(list(
      message = sprintf("ran in the Console (closing this panel to let it submit):  %s", result$code),
      close = TRUE
    ))
  }

  ctx <- tryCatch(rstudioapi::getSourceEditorContext(), error = function(e) NULL)
  if (is.null(ctx)) {
    return(list(
      message = sprintf("resolved, but no Source file is open to insert into (open a .R file first):  %s", result$code),
      close = FALSE
    ))
  }
  rstudioapi::insertText(text = paste0(result$code, "\n"), id = ctx$id)
  label <- if (nzchar(ctx$path)) basename(ctx$path) else "the untitled Source file"
  list(message = sprintf("inserted into %s:  %s", label, result$code), close = FALSE)
}

# The "Auto-fill in RStudio" toggle is off: resolve, but never call
# rstudioapi at all -- the resolved code is shown in the "Resolved R" box
# (nb_addin_ui()'s uiOutput("nb_resolved")) for the user to copy and paste
# themselves, whichever target it's headed for. This function only builds
# the log message; nb_run_one() is what skips calling nb_dispatch(). Never
# closes the panel itself -- with auto-fill off nothing was queued anywhere,
# so there's nothing a close would let run.
nb_manual_outcome <- function(result) {
  if (identical(result$target, "console")) {
    # Pasting into the Console and pressing Enter needs R to be at its
    # top-level prompt to evaluate it -- which it is NOT while this panel
    # is open (see nb_dispatch()'s comment on why). Editing a Source FILE
    # has no such requirement (it's just text in an editor), so only the
    # Console case needs this caveat.
    return(sprintf(
      "resolved for the Console -- copy it from the box above, close this panel, then paste and run it:  %s",
      result$code
    ))
  }
  sprintf("resolved for the Source editor -- copy it from the box above and paste it in yourself:  %s", result$code)
}

# Returns list(entry = <one log block, always>, code = <the resolved R, or
# NULL when resolution failed>, close = <should the panel close itself
# right after this?>) -- NULL text input is skipped entirely (returns
# NULL), same as before. `code` lets the caller update the "Resolved R"
# copy box regardless of whether auto-run dispatched it or the user is
# going to paste it themselves -- useful either way, so it's populated in
# both modes, not just when auto-run is off. `close` is only ever TRUE for
# a successful auto-fill dispatch to the Console (see nb_dispatch()) --
# every other case (manual mode, Source target, a failed dispatch, an
# unrecognized phrase) leaves the panel open, since there's nothing queued
# anywhere that closing would help.
nb_run_one <- function(raw_text, auto) {
  text <- trimws(raw_text)
  if (!nzchar(text)) return(NULL)

  result <- tryCatch(
    ninebark_resolve_with_ai_fallback(text),
    error = function(e) list(ok = FALSE, error = conditionMessage(e))
  )

  # Logged right after resolution, tagged with whether it actually
  # succeeded -- same contract as inputLogger.ts's browser-side callers
  # (see R/inputLogger.R). `recognized` here means resolution succeeded,
  # not whether a subsequent nb_dispatch() below also succeeds -- an
  # rstudioapi dispatch failure isn't an NL coverage gap. Deliberately
  # covers the AI-fallback tier too (not a separate "recognized by AI"
  # category) -- from the "did this phrase work" perspective the
  # distinction doesn't matter, and the relay's own escalation decision is
  # anyway always inferrable from text that NOW resolves successfully but
  # previously wouldn't have (see plan's "closing the loop in production").
  nb_log_input(text, isTRUE(result$ok))

  if (isTRUE(result$ok)) {
    # AI raw-code output skips nb_dispatch() entirely, regardless of the
    # "Auto-fill in RStudio" toggle: it was never validated by the
    # deterministic parser the way every other tier's code is (only a
    # syntax-only check happens server-side, not a semantic one -- see the
    # relay's own README) -- so it ALWAYS goes through nb_manual_outcome(),
    # the review-before-running path this Addin already had for the
    # "auto-fill off" case. This is the one thing the design plan's section 3
    # safety note ("always show the generated code... never auto-execute")
    # specifically requires, and the only reason this override exists.
    force_manual <- isTRUE(result$ai_raw_code)
    dispatched <- if (isTRUE(auto) && !force_manual) {
      tryCatch(
        nb_dispatch(result),
        error = function(e) list(
          message = sprintf("resolved but couldn't dispatch (%s):  %s", conditionMessage(e), result$code),
          close = FALSE
        )
      )
    } else {
      message <- nb_manual_outcome(result)
      if (force_manual) {
        message <- paste0(
          "AI-generated -- review before running!  ", message
        )
      }
      list(message = message, close = FALSE)
    }
    list(entry = nb_log_entry(text, dispatched$message), code = result$code, close = isTRUE(dispatched$close))
  } else {
    outcome <- if (is.null(result$error)) "unrecognized command" else result$error
    list(entry = nb_log_entry(text, outcome), code = NULL, close = FALSE)
  }
}

# Builds the gadget's UI, separated out from ninebark_addin() itself so it
# can be constructed and inspected (see tests/testthat/test-addin-ui.R)
# without also calling the blocking shiny::runGadget() below it -- there's
# no way to unit-test a function that opens an interactive gadget and waits
# for it to close, but the UI it's built from is just an htmltools tag tree,
# and that part IS testable. Not exported -- an implementation detail of
# ninebark_addin(), below.
nb_addin_ui <- function() {
  # Serves inst/www/ninebark-icon.png at /ninebark-assets/ninebark-icon.png
  # for the branded title bar below. A resource path, not a base64 data URI
  # baked into the R source (the Chrome extension inlines its logo as a data
  # URI instead -- see vite.config.ts's assetsInlineLimit comment -- because
  # a Chrome extension has no server to serve a separate file from; a running
  # Shiny gadget IS one, so the ordinary Shiny way to serve a static asset is
  # the better fit here).
  shiny::addResourcePath("ninebark-assets", system.file("www", package = "ninebark"))

  # The Chrome extension's own header markup (extension/src/shared/widget.ts)
  # is "<img 20x20> <span class=nb-word>Ninebark</span>", weight 700, 13.5px,
  # color #1f2a24 -- reproduced here so the two feel like the same product.
  branded_title <- shiny::tagList(
    shiny::tags$img(
      src = "ninebark-assets/ninebark-icon.png", alt = "",
      style = "width:20px; height:20px; display:block; margin-right:6px;"
    ),
    shiny::tags$span(
      "Ninebark",
      style = "font-weight:700; font-size:13.5px; color:#1f2a24;"
    )
  )

  # gadgetTitleBar() wraps its title in <h1>. miniUI's own h1 rule already
  # makes it position:absolute, top/right/bottom/left:0 (fills the whole
  # bar) with text-align:center -- so overriding display to flex WITHOUT
  # also setting justify-content:center (a mistake in an earlier version of
  # this file) drops that centering and left-aligns the logo+wordmark
  # instead, which then sits directly under the title bar's left button.
  # justify-content is what actually centers it here; align-items centers
  # it vertically the same way miniUI's own line-height:44px did for plain
  # text.
  ninebark_head_css <- "
    #nb_log { background:#f7f7f7; border-radius:4px; padding:8px;
      font-family:monospace; font-size:12px; white-space:pre-wrap;
      overflow-y:auto; height:100%; }
    .gadget-title { border-bottom: 2px solid #2f7a4f; }
    .gadget-title h1 { margin: 0; display: flex; align-items: center; justify-content: center; }
    #nb_auto { margin: 6px 0; font-size: 12px; }
    .nb-resolved-label { font-size: 11px; color: #5b675f; display: block; margin: 4px 0 2px; }
    .nb-resolved-box { width: 100%; font-family: monospace; font-size: 12px; padding: 6px 8px;
      border: 1px solid #dde3df; border-radius: 4px; background: #fafaf8; color: #1f2a24; }
    .nb-resolved-box:focus { outline: none; border-color: #2f7a4f; box-shadow: 0 0 0 3px #e8f5ec; }
  "

  miniUI::miniPage(
    shiny::tags$head(shiny::tags$style(shiny::HTML(ninebark_head_css))),
    shiny::tags$script(shiny::HTML(
      "document.addEventListener('keydown', function(e) {
         if (e.key === 'Enter' && e.target && e.target.id === 'nb_input') {
           e.preventDefault();
           document.getElementById('nb_run').click();
         }
       });
       // Genuinely disables the input + Run button when an update is
       // required (not just a log message you could ignore) -- plain
       // Shiny.addCustomMessageHandler, a core Shiny JS API, not
       // shinyjs, so this needs no new package dependency.
       Shiny.addCustomMessageHandler('nb-block-usage', function(blocked) {
         var input = document.getElementById('nb_input');
         var run = document.getElementById('nb_run');
         if (input) {
           input.disabled = blocked;
           if (blocked) input.placeholder = 'Update required - see message below';
         }
         if (run) run.disabled = blocked;
       });"
    )),
    # left = NULL suppresses gadgetTitleBar()'s DEFAULT left-side button
    # (miniTitleBarCancelButton(), a "Cancel" wired to input$cancel) -- this
    # gadget only ever had one dismiss action (the "Close" button below,
    # wired to input$done), so the default Cancel button was both visually
    # colliding with the centered wordmark and functionally dead (nothing in
    # server() below ever observed input$cancel).
    miniUI::gadgetTitleBar(
      branded_title,
      left = NULL,
      right = miniUI::miniTitleBarButton("done", "Close", primary = TRUE)
    ),
    miniUI::miniContentPanel(
      shiny::fillCol(
        flex = c(NA, NA, NA, 1),
        shiny::fillRow(
          flex = c(1, NA),
          shiny::textInput("nb_input", label = NULL, placeholder = "mean of 1,2,3,4,5", width = "100%"),
          shiny::actionButton("nb_run", "Run", class = "btn-primary", style = "margin-left:8px;")
        ),
        # Default TRUE: preserves this addin's original behavior (act on the
        # result immediately -- insert into the Source file, or type it into
        # the Console) unless someone explicitly opts into the
        # paste-it-yourself mode instead. NOTE the label doesn't promise the
        # Console case will actually RUN: it can't, while this panel is open
        # (see nb_dispatch()'s comment) -- typed in and ready is the honest,
        # achievable claim there. The Source case genuinely is immediate.
        shiny::checkboxInput(
          "nb_auto",
          "Auto-fill in RStudio (off: show the R below to copy and paste in yourself)",
          value = TRUE
        ),
        shiny::uiOutput("nb_resolved"),
        shiny::uiOutput("nb_log")
      ),
      padding = 10
    )
  )
}

#' Launch the Ninebark Addin
#'
#' Opens a small panel in RStudio's Viewer pane (bottom-right by default):
#' type a plain-English R command, press Run (or Enter), and it's inserted
#' into the open Source file or typed into the Console -- see
#' [ninebark_resolve()] for the resolution contract this wraps. Registered
#' as an RStudio Addin (Addins menu, or bind it to a keyboard shortcut via
#' Tools > Modify Keyboard Shortcuts > search "Ninebark") by
#' `inst/rstudio/addins.dcf` -- this function is not usually called
#' directly, though nothing stops you.
#'
#' The "Auto-fill in RStudio" checkbox (on by default) controls what
#' happens next: on, the resolved R for the Source target is inserted
#' immediately, and for the Console target is queued to run and this panel
#' closes itself right away so that run can actually happen (RStudio can't
#' evaluate new Console input while this panel's own Shiny process is
#' running, so the close is what lets the already-queued command go through
#' -- you never have to close it or press Enter yourself; reopen the Addin
#' for your next command); off, nothing is inserted or typed automatically
#' -- the resolved R instead appears in a "Resolved R" box you click to
#' select and copy, to paste in yourself wherever and whenever you want.
#'
#' @export
ninebark_addin <- function() {
  if (!rstudioapi::isAvailable()) {
    stop(
      "ninebark_addin() needs to run inside RStudio (Desktop, Server, Workbench, or Cloud) ",
      "so it can reach the Console/Source editor via rstudioapi.",
      call. = FALSE
    )
  }

  ui <- nb_addin_ui()

  server <- function(input, output, session) {
    # Seeds the log with an update notice if one applies (see
    # R/updateCheck.R) -- runs once, synchronously, right when the Addin
    # opens, bounded to a couple of seconds so a slow/offline network
    # can't meaningfully delay the panel becoming usable. New entries from
    # do_run() get PREPENDED below, so this notice stays visible at the
    # bottom rather than getting buried above newer activity.
    update_message <- nb_check_for_update()
    blocked <- !is.null(update_message)
    log_entries <- shiny::reactiveVal(if (blocked) update_message else character(0))
    last_code <- shiny::reactiveVal("")

    # Genuinely prevents using Ninebark while out of date, not just a
    # message you could ignore: the input/Run button are disabled
    # client-side (the JS handler in nb_addin_ui()) the instant the panel
    # opens, and do_run() below refuses to resolve/dispatch anything as a
    # second, server-side guard -- belt and suspenders, in case the
    # client-side disable doesn't apply for some reason (e.g. devtools).
    if (blocked) session$sendCustomMessage("nb-block-usage", TRUE)

    do_run <- function() {
      if (blocked) return(invisible(NULL))
      result <- nb_run_one(input$nb_input, isTRUE(input$nb_auto))
      if (!is.null(result)) {
        log_entries(c(result$entry, log_entries()))
        if (!is.null(result$code)) last_code(result$code)
        # A successful auto-fill dispatch to the Console (see
        # nb_dispatch()) already queued the command at R's top-level
        # prompt -- closing the panel right now is what lets R get back
        # to that prompt and actually run it, so the user never has to
        # close this themselves or go press Enter in the Console by hand.
        # Skips clearing the input box below: the panel's going away.
        if (isTRUE(result$close)) {
          shiny::stopApp()
          return(invisible(NULL))
        }
      }
      shiny::updateTextInput(session, "nb_input", value = "")
    }

    shiny::observeEvent(input$nb_run, do_run(), ignoreInit = TRUE)

    output$nb_resolved <- shiny::renderUI({
      code <- last_code()
      if (!nzchar(code)) return(NULL)
      shiny::tagList(
        shiny::tags$label("Resolved R (click the box, then Cmd/Ctrl+C):", class = "nb-resolved-label"),
        # A plain readonly <input>, not shiny::textInput() -- this is a
        # DISPLAY the user copies FROM, not a value the server reads back;
        # onclick="this.select()" selects the whole value in one click, no
        # need for the Clipboard API (whose permissions inside RStudio's
        # gadget viewer are unconfirmed, so this doesn't depend on it).
        shiny::tags$input(
          type = "text", readonly = NA, value = code, class = "nb-resolved-box",
          onclick = "this.select();"
        )
      )
    })

    output$nb_log <- shiny::renderUI({
      shiny::tags$pre(id = "nb_log", paste(log_entries(), collapse = "\n\n"))
    })
    shiny::observeEvent(input$done, shiny::stopApp())
  }

  # paneViewer(), not dialogViewer(): docks the gadget into RStudio's Viewer
  # pane instead of opening a big centered modal. In RStudio's default
  # 4-pane layout the Viewer pane sits bottom-right (grouped with Plots/
  # Files/Packages/Help) -- this is the real, documented RStudio Addin
  # viewer option for "small and tucked in a corner" rather than "takes over
  # the middle of the screen"; there's no Addin API for floating a
  # borderless widget over an arbitrary screen position the way the Chrome
  # extension's overlay can. minHeight is left NULL (use whatever size the
  # pane already is) rather than forcing a resize, to stay out of the way.
  shiny::runGadget(ui, server, viewer = shiny::paneViewer(minHeight = NULL))
}
