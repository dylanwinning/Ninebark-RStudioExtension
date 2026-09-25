# The RStudio Addin -- a small gadget dialog (miniUI + shiny, RStudio's own
# recommended pattern for an Addin with interactive input) registered by
# inst/rstudio/addins.dcf. Type a phrase, hit Run (or press Enter); it's
# resolved via ninebark_resolve() (R/resolve.R), then EITHER dispatched
# through rstudioapi -- sendToConsole() for the Console target (real
# evaluation, real output, same posture as the Chrome extension's live-eval
# model), or insertText() into the active Source document for the Source
# target ("in the script ...", inserted unexecuted) -- OR, when the
# "Auto-run in RStudio" toggle is off, just shown in a copyable box so the
# user pastes and runs it themselves. rstudioapi is the one and only thing
# this file touches to reach the editor (in auto-run mode), which is
# exactly why this works identically in RStudio Desktop, Server, Workbench,
# and Cloud -- no per-frontend branching anywhere in this file.

nb_log_entry <- function(input_text, outcome_text) {
  # -> / - (an arrow, a horizontal rule) rather than the literal
  # characters, so this file stays pure ASCII -- R CMD check flags non-ASCII
  # bytes in code (comments are exempt, code isn't).
  sprintf("%s\n  -> %s\n%s", input_text, outcome_text, strrep("-", 44))
}

nb_dispatch <- function(result) {
  # result$ok is TRUE here (checked by the caller) -- this only decides
  # WHERE the resolved code goes and reports back what happened, mirroring
  # dispatchRCommand() in the TypeScript engine's rExecClient.ts. Only
  # called when the "Auto-run in RStudio" toggle is on -- see
  # nb_manual_outcome() for the off case, which never touches rstudioapi.
  if (identical(result$target, "console")) {
    rstudioapi::sendToConsole(result$code, execute = TRUE, echo = TRUE, focus = FALSE)
    return(sprintf("ran in the Console:  %s", result$code))
  }

  ctx <- tryCatch(rstudioapi::getSourceEditorContext(), error = function(e) NULL)
  if (is.null(ctx)) {
    return(sprintf(
      "resolved, but no Source file is open to insert into (open a .R file first):  %s",
      result$code
    ))
  }
  rstudioapi::insertText(text = paste0(result$code, "\n"), id = ctx$id)
  label <- if (nzchar(ctx$path)) basename(ctx$path) else "the untitled Source file"
  sprintf("inserted into %s:  %s", label, result$code)
}

# The "Auto-run in RStudio" toggle is off: resolve, but never call
# rstudioapi at all -- the resolved code is shown in the "Resolved R" box
# (nb_addin_ui()'s uiOutput("nb_resolved")) for the user to copy and paste
# themselves, whichever target it's headed for. This function only builds
# the log message; nb_run_one() is what skips calling nb_dispatch().
nb_manual_outcome <- function(result) {
  where <- if (identical(result$target, "console")) "the Console" else "the Source editor"
  sprintf("resolved for %s -- copy it from the box above and paste it in yourself:  %s", where, result$code)
}

# Returns list(entry = <one log block, always>, code = <the resolved R, or
# NULL when resolution failed>) -- NULL text input is skipped entirely
# (returns NULL), same as before. `code` lets the caller update the
# "Resolved R" copy box regardless of whether auto-run dispatched it or the
# user is going to paste it themselves -- useful either way, so it's
# populated in both modes, not just when auto-run is off.
nb_run_one <- function(raw_text, auto) {
  text <- trimws(raw_text)
  if (!nzchar(text)) return(NULL)

  result <- tryCatch(
    ninebark_resolve(text),
    error = function(e) list(ok = FALSE, error = conditionMessage(e))
  )

  if (isTRUE(result$ok)) {
    outcome <- if (isTRUE(auto)) {
      tryCatch(
        nb_dispatch(result),
        error = function(e) sprintf("resolved but couldn't dispatch (%s):  %s", conditionMessage(e), result$code)
      )
    } else {
      nb_manual_outcome(result)
    }
    list(entry = nb_log_entry(text, outcome), code = result$code)
  } else {
    outcome <- if (is.null(result$error)) "unrecognized command" else result$error
    list(entry = nb_log_entry(text, outcome), code = NULL)
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
        # Default TRUE: preserves this addin's original behavior (resolve
        # AND run/insert immediately) unless someone explicitly opts into
        # the paste-it-yourself mode instead.
        shiny::checkboxInput(
          "nb_auto",
          "Auto-run in RStudio (off: show the R below to copy and paste in yourself)",
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
#' type a plain-English R command, press Run (or Enter), and it's run in the
#' live Console or inserted into the open Source file -- see
#' [ninebark_resolve()] for the resolution contract this wraps. Registered
#' as an RStudio Addin (Addins menu, or bind it to a keyboard shortcut via
#' Tools > Modify Keyboard Shortcuts > search "Ninebark") by
#' `inst/rstudio/addins.dcf` -- this function is not usually called
#' directly, though nothing stops you.
#'
#' The "Auto-run in RStudio" checkbox (on by default) controls what happens
#' next: on, the resolved R is run in the Console or inserted into the
#' Source file immediately; off, nothing is run or inserted automatically
#' -- the resolved R instead appears in a "Resolved R" box you click to
#' select and copy, to paste and run yourself wherever and whenever you
#' want.
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
    log_entries <- shiny::reactiveVal(character(0))
    last_code <- shiny::reactiveVal("")

    do_run <- function() {
      result <- nb_run_one(input$nb_input, isTRUE(input$nb_auto))
      if (!is.null(result)) {
        log_entries(c(result$entry, log_entries()))
        if (!is.null(result$code)) last_code(result$code)
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
