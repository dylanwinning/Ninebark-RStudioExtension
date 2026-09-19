# nb_addin_ui() (accessed below via ::: since it's internal, not exported)
# is the UI-construction half of ninebark_addin() (see
# R/addin.R's comment on why it's split out): the half that's actually
# possible to test, since the other half (shiny::runGadget()) blocks
# waiting for an interactive viewer to close. These tests catch structural
# mistakes in the tag tree (a malformed htmltools call, a broken resource
# path) without needing a real RStudio session or a browser.

test_that("ninebark:::nb_addin_ui() builds without error and renders to HTML", {
  ui <- ninebark:::nb_addin_ui()
  html <- as.character(htmltools::renderTags(ui)$html)
  expect_true(nzchar(html))
})

test_that("the branded header renders the Ninebark wordmark and logo", {
  ui <- ninebark:::nb_addin_ui()
  html <- as.character(htmltools::renderTags(ui)$html)
  expect_match(html, "Ninebark", fixed = TRUE)
  expect_match(html, "ninebark-assets/ninebark-icon.png", fixed = TRUE)
})

test_that("the logo resource path actually resolves to a real, existing file", {
  ninebark:::nb_addin_ui() # registers the "ninebark-assets" resource path as a side effect
  paths <- shiny::resourcePaths()
  expect_true("ninebark-assets" %in% names(paths))
  expect_true(file.exists(file.path(paths[["ninebark-assets"]], "ninebark-icon.png")))
})

test_that("the input box and Run button are present with the ids the Enter-key handler and server logic expect", {
  ui <- ninebark:::nb_addin_ui()
  html <- as.character(htmltools::renderTags(ui)$html)
  expect_match(html, 'id="nb_input"', fixed = TRUE)
  expect_match(html, 'id="nb_run"', fixed = TRUE)
})
