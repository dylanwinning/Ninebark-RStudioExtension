# The RStudio Addin -- a small gadget dialog (miniUI + shiny, RStudio's own
# recommended pattern for an Addin with interactive input) registered by
# inst/rstudio/addins.dcf. Type a phrase, hit Run (or press Enter); it's
# resolved via ninebark_resolve() (R/resolve.R) and dispatched through
# rstudioapi -- sendToConsole() for the Console target (real evaluation, real
# output, same posture as the Chrome extension's live-eval model), or
# insertText() into the active Source document for the Source target
# ("in the script ...", inserted unexecuted). rstudioapi is the one and only
# thing this file touches to reach the editor, which is exactly why this
# works identically in RStudio Desktop, Server, Workbench, and Cloud -- no
# per-frontend branching anywhere in this file.

nb_log_entry <- function(input_text, outcome_text) {
  # -> / - (an arrow, a horizontal rule) rather than the literal
  # characters, so this file stays pure ASCII -- R CMD check flags non-ASCII
  # bytes in code (comments are exempt, code isn't).
  sprintf("%s\n  -> %s\n%s", input_text, outcome_text, strrep("-", 44))
}

nb_dispatch <- function(result) {
  # result$ok is TRUE here (checked by the caller) -- this only decides
  # WHERE the resolved code goes and reports back what happened, mirroring
  # dispatchRCommand() in the TypeScript engine's rExecClient.ts.
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

nb_run_one <- function(raw_text) {
  text <- trimws(raw_text)
  if (!nzchar(text)) return(NULL)

  result <- tryCatch(
    ninebark_resolve(text),
    error = function(e) list(ok = FALSE, error = conditionMessage(e))
  )

  if (isTRUE(result$ok)) {
    outcome <- tryCatch(
      nb_dispatch(result),
      error = function(e) sprintf("resolved but couldn't dispatch (%s):  %s", conditionMessage(e), result$code)
    )
  } else {
    outcome <- if (is.null(result$error)) "unrecognized command" else result$error
  }
  nb_log_entry(text, outcome)
}

#' Launch the Ninebark Addin
#'
#' Opens a small dialog: type a plain-English R command, press Run (or
#' Enter), and it's run in the live Console or inserted into the open
#' Source file -- see [ninebark_resolve()] for the resolution contract this
#' wraps. Registered as an RStudio Addin (Addins menu, or bind it to a
#' keyboard shortcut via Tools > Modify Keyboard Shortcuts > search
#' "Ninebark") by `inst/rstudio/addins.dcf` -- this function is not usually
#' called directly, though nothing stops you.
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

  ui <- miniUI::miniPage(
    shiny::tags$head(shiny::tags$style(shiny::HTML(
      "#nb_log { background:#f7f7f7; border-radius:4px; padding:8px;
       font-family:monospace; font-size:12px; white-space:pre-wrap;
       overflow-y:auto; height:100%; }"
    ))),
    shiny::tags$script(shiny::HTML(
      "document.addEventListener('keydown', function(e) {
         if (e.key === 'Enter' && e.target && e.target.id === 'nb_input') {
           e.preventDefault();
           document.getElementById('nb_run').click();
         }
       });"
    )),
    miniUI::gadgetTitleBar(
      "Ninebark",
      right = miniUI::miniTitleBarButton("done", "Close", primary = TRUE)
    ),
    miniUI::miniContentPanel(
      shiny::fillCol(
        flex = c(NA, 1),
        shiny::fillRow(
          flex = c(1, NA),
          shiny::textInput("nb_input", label = NULL, placeholder = "mean of 1,2,3,4,5", width = "100%"),
          shiny::actionButton("nb_run", "Run", class = "btn-primary", style = "margin-left:8px;")
        ),
        shiny::uiOutput("nb_log")
      ),
      padding = 10
    )
  )

  server <- function(input, output, session) {
    log_entries <- shiny::reactiveVal(character(0))

    do_run <- function() {
      entry <- nb_run_one(input$nb_input)
      if (!is.null(entry)) log_entries(c(entry, log_entries()))
      shiny::updateTextInput(session, "nb_input", value = "")
    }

    shiny::observeEvent(input$nb_run, do_run(), ignoreInit = TRUE)
    output$nb_log <- shiny::renderUI({
      shiny::tags$pre(id = "nb_log", paste(log_entries(), collapse = "\n\n"))
    })
    shiny::observeEvent(input$done, shiny::stopApp())
  }

  shiny::runGadget(ui, server, viewer = shiny::dialogViewer("Ninebark", width = 640, height = 520))
}
