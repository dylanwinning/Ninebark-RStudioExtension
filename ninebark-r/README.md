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

**What you need:** R and RStudio — any edition (Desktop, Server, Workbench,
Posit Cloud). Nothing else: no API key, no account, no server, no Node.js.
Everything runs locally on your own machine, and Ninebark makes no network
calls.

**1. Install the package.** Paste both lines into the RStudio **Console**
(bottom-left pane by default) and press Enter:

```r
install.packages("remotes")
remotes::install_github("dylanwinning/Ninebark-RStudioExtension", subdir = "ninebark-r")
```

Skip the first line if you already have `remotes`. The second pulls in a
few dependencies (`V8`, `rstudioapi`, `shiny`, `miniUI`) and takes a minute
or two the first time. The `subdir = "ninebark-r"` part is required — this
repo holds a browser extension alongside the R package, and that argument
is what points the installer at the package.

**2. Restart R.** *Session → Restart R*, or Ctrl/Cmd+Shift+F10. RStudio
doesn't list a newly installed addin until you do.

**3. Open it.** **Addins** menu in the top toolbar → **Ninebark**.

### If something goes wrong

- **`there is no package called 'remotes'`** — run
  `install.packages("remotes")` first, then retry.
- **`HTTP error 404` / "Did you spell the repo owner and name correctly?"** —
  either the repo name is mistyped, or you don't have access to it (it's
  private). If it's private and you should have access, you'll also need a
  GitHub personal access token: create one at
  [github.com/settings/tokens](https://github.com/settings/tokens) with the
  `repo` scope, then run `Sys.setenv(GITHUB_PAT = "your_token_here")` before
  the install line.
- **`V8` fails to install (Linux only)** — macOS and Windows get a prebuilt
  binary and need nothing extra. On Linux, install the system library
  first, then retry the install:
  ```bash
  sudo apt install libv8-dev    # Debian / Ubuntu
  sudo dnf install v8-devel     # Fedora / RHEL
  ```
- **"Ninebark" isn't in the Addins menu** — restart RStudio completely
  (quit and reopen), not just the R session.

### Updating and uninstalling

To update, rerun the same `install_github(...)` line and restart R. To
remove it entirely:

```r
remove.packages("ninebark")
```

## Use

Open the **Addins** menu (top toolbar) → **Ninebark**. A small panel opens
in the Viewer pane (bottom-right by default): type a phrase, press **Run**
(or Enter) — [the root README](../README.md#what-it-supports) has the full
list of what's understood.

What happens next depends on where the command is headed:

- **Console commands** (the default — "mean of 1,2,3,4,5") get **typed into
  the Console, ready to run, but not run for you**. To actually run them:
  **close the Ninebark panel, then press Enter in the Console.**
- **Source commands** ("in the script ...") are **inserted into your open
  file immediately** — nothing further needed.

That asymmetry is a hard limit of RStudio, not a missing feature: while the
Ninebark panel is open it occupies R itself, and RStudio can't evaluate
*anything* new at the Console until it closes — not Ninebark's code, not
code you type by hand. Editing a file has no such requirement, which is why
the Source side is instant.

Uncheck **Auto-fill in RStudio** if you'd rather review the R before it
touches your session at all: with it off, nothing is inserted or typed
automatically — the resolved R appears instead in a "Resolved R" box
(click it to select the text, then Cmd/Ctrl+C), so you can paste it in
wherever and whenever you want.

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
