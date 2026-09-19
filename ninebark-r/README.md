# ninebark (R package)

An RStudio **Addin**: type a command in plain English ("mean of 1,2,3,4,5",
"let x be 5", "read the csv file data.csv into df", "for i in 1 to 10
print i") and it's turned into real R and either run in the live Console or
inserted into the open Source file.

This is the **download-and-use** way to get Ninebark into RStudio, as
opposed to the [Chrome extension](../README.md) one directory up. The two
exist for different reasons — see the root README's "Two ways to use this"
section — but the short version: **this package works in RStudio Desktop**
(and Server, Workbench, and Cloud, identically), because it talks to the
editor only through the official `rstudioapi` package rather than through a
browser tab. The Chrome extension can only ever reach the web editions —
RStudio Desktop is an Electron window, not a Chrome tab, so no browser
extension can attach to it, full stop. This package sidesteps that
entirely by running *inside* R itself.

## Install

```r
# install.packages("remotes")  # if you don't have it
remotes::install_github("dylanwinning/Ninebark-RStudioExtension", subdir = "ninebark-r")
```

That's it — no API key, no server, no account. Everything runs locally.

## Use

Open the **Addins** menu (top toolbar) → **Ninebark**. A small dialog
opens: type a phrase, press **Run** (or Enter), and it either runs in your
Console or gets inserted into whichever Source file you have open —
[the root README](../README.md#what-it-supports) has the full list of
what's understood.

Want a keyboard shortcut instead of the menu? **Tools → Modify Keyboard
Shortcuts…**, search "Ninebark", and bind it to whatever you like.

You can also skip the dialog entirely and call the resolver directly from
a script or the console:

```r
library(ninebark)
ninebark_resolve("mean of 1,2,3,4,5")
#> $ok
#> [1] TRUE
#> $target
#> [1] "console"
#> $code
#> [1] "mean(c(1, 2, 3, 4, 5))"
```

`ninebark_resolve()` never runs or inserts anything itself — it just
resolves English to R and tells you where it was headed. `ninebark_addin()`
(what the Addins-menu entry calls) is the thing that actually dispatches
the result via `rstudioapi`.

## How it's built

- `R/resolve.R` — loads `inst/js/ninebark.js` into an embedded V8 JavaScript
  engine (the `V8` package — no Node.js install needed, no network calls)
  and exposes it as `ninebark_resolve()`. `inst/js/ninebark.js` is a
  **committed, tracked file**, not a build artifact you need to regenerate
  to install this package — see "Rebuilding the JS bundle," below, for when
  you'd actually touch it.
- `R/addin.R` — the Addin itself: a `miniUI`/`shiny` gadget dialog, and the
  `rstudioapi` calls (`sendToConsole()` for the Console target,
  `insertText()` for the Source target) that turn a resolved `{ target,
  code }` into something actually happening in your RStudio session.
- `inst/rstudio/addins.dcf` — the one file that registers `ninebark_addin`
  as an entry in RStudio's Addins menu.

## Rebuilding the JS bundle

Only needed if you're developing the natural-language engine itself (in the
parent TypeScript repo, `../src/`) and want your R package install to pick
up the change — a normal install from GitHub never needs this, the bundle
in `inst/js/ninebark.js` is already there.

From the **repo root** (one directory up from here):

```bash
npm install
npm run build:r     # → ninebark-r/inst/js/ninebark.js
```

This runs `../src/ninebarkBundle.ts` (a tiny entry point that imports the
SAME `resolveRPhrase.ts` pipeline the Chrome extension uses — nothing
DOM-specific, since there's no DOM inside a V8 isolate) through Vite,
producing one self-contained script with no external dependencies. Then
reinstall the R package:

```bash
R CMD INSTALL ninebark-r
```

## Tests

```r
# from this directory
devtools::test()
# or, without devtools:
Rscript -e 'library(testthat); library(ninebark); test_dir("tests/testthat")'
```

`tests/testthat/test-resolve.R` checks the R ↔ V8 ↔ bundled-JS bridge
itself (does the bundle load, do arguments/results marshal correctly across
the boundary) — it deliberately does NOT re-verify the natural-language
vocabulary in depth, since that's already covered by 157 passing tests
against the same engine in the parent repo's `../tests/`.
