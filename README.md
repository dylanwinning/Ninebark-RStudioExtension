# Ninebark for RStudio

A natural-language front end for RStudio — type a command in plain English
("mean of 1,2,3,4,5", "let x be 5", "read the csv file data.csv into df",
"for i in 1 to 10 print i") and it's translated into real R headed for the
live **Console** you already have open. A second command form — "in the
script ...", "insert ... into the script" — routes instead to the **Source
editor**, for authoring into an open `.R` file rather than running
something immediately.

## Install

Most people want the **RStudio Addin** — it works in every edition of
RStudio, including regular Desktop. In the RStudio Console:

```r
install.packages("remotes")
remotes::install_github("dylanwinning/Ninebark-RStudioExtension", subdir = "ninebark-r")
```

Then restart R (*Session → Restart R*) and open **Addins → Ninebark**.
Full instructions, requirements, and troubleshooting:
**[`ninebark-r/README.md`](ninebark-r/README.md#install)**.

If you use RStudio only through a browser (Posit Cloud, RStudio Server,
Posit Workbench), there's also a Chrome extension — see
[`extension/README.md`](extension/README.md). It can't reach RStudio
Desktop; the Addin above can reach everything.

## How it reaches your session

Exactly what "headed for the Console" means differs by which of the two
delivery mechanisms below you use: the Chrome extension can genuinely run
it there and show you the real output (same posture as
Ninebark-MATLABExtension driving a live MATLAB session), because it talks
to RStudio over the same network call its own browser client uses — no R
process of its own to get in the way. The Addin talks to RStudio through R
itself, though, and R has a hard limit the extension doesn't: while the
Addin's own panel is open, RStudio can't evaluate anything new at the
Console (the panel occupies R), so its Console target is typed in, ready to
go, rather than run automatically — close the panel, then press Enter
there. Its own README explains why. The Addin also has an "Auto-fill"
toggle ([below](#two-ways-to-use-this)) — off, it shows you the resolved R
in a copy box instead of touching your session at all.

## Two ways to use this

RStudio isn't one thing — Desktop, Server, Workbench, and Posit Cloud are
four different ways to run it, and they're not all reachable the same way.
This repo ships **two independent delivery mechanisms**, and which one you
want depends on which RStudio you use:

- **[`ninebark-r/`](ninebark-r/) — an RStudio Addin (R package).** Install
  with `remotes::install_github(..., subdir = "ninebark-r")`, use it from
  the Addins menu. Works identically in **Desktop, Server, Workbench, and
  Cloud**, because it reaches the editor only through the official
  `rstudioapi` package, running inside R itself — nothing browser-shaped
  about it. **This is almost certainly what you want** if you're using
  regular desktop RStudio, which most people are. Running through R itself
  is also its one real trade-off: RStudio can't evaluate new Console input
  while the Addin's own panel is open, so the Console target gets typed in
  ready to go rather than run automatically (close the panel, then press
  Enter there) — the Source target has no such limit and is genuinely
  instant. Has an "Auto-fill in RStudio" toggle (on by default) — turn it
  off to get the resolved R in a copy-and-paste box instead of having it
  inserted/typed automatically. See
  [`ninebark-r/README.md`](ninebark-r/README.md).
- **[`extension/`](extension/) — a Chrome extension.** Targets **Posit
  Cloud, RStudio Server, and Posit Workbench only** — the web editions,
  opened in a real browser tab. **Cannot reach RStudio Desktop**: since
  2022.12 Desktop runs the identical GWT web client the server editions
  serve, just inside an Electron window instead of a browser tab — a
  Chrome content script attaches to Chrome tabs, and an Electron window
  isn't one, no matter what `manifest.json` says. This was the first thing
  built here (see [EXECUTION.md](EXECUTION.md) for the full write-path
  investigation) and still works fine for the web editions; the Addin
  above was added once it became clear most people wanted Desktop support,
  which a browser extension architecturally cannot provide. See
  [`extension/README.md`](extension/README.md).

Both share the exact same natural-language engine (`src/`) — the vocabulary
and what's supported is identical either way; only how the result reaches
your R session differs.

## This is one interface of several

This repo is the RStudio interface for **Ninebark** — a small family of
"type it in plain English on the real page" extensions, one repo per
interface. [Ninebark-DesmosExtension](https://github.com/dylanwinning/Ninebark-DesmosExtension)
(Desmos) is the first and is also the **canonical home of the shared
engine**: the tier-1 math vocabulary, the formal-string tokenizer, and the
underlying NL grammar this repo depends on but doesn't own. This repo
vendors those pieces in (copied, not linked — see
[`src/vendor/ninebark-engine/README.md`](src/vendor/ninebark-engine/README.md)
for what's vendored and how to re-sync). Everything else here — the
R-specific recognizers, the formal-string → R converter, the execution
client, the extension itself — is this repo's own code.

## Setup

```
npm install
npm run build     # → extension/dist/rstudio.js
npm test          # run the test suite
```

Then load `extension/` as an unpacked extension in Chrome — see
[extension/README.md](extension/README.md).

## Repo layout

- `extension/` — the Chrome extension itself: `manifest.json`, icons,
  `src/rstudio.ts` (the content script + widget), plus `src/shared/`
  (vendored widget UI — see its `VENDORED.md`). No background service
  worker — see [EXECUTION.md](EXECUTION.md) §5.
- `src/` — the natural-language pipeline, all pure logic with zero DOM
  dependency:
  - `resolveRPhrase.ts` — the resolution pipeline: raw-R pass-through →
    Console/Source-editor routing → this repo's R-native recognizers → the
    vendored shared vocabulary (tier 1) → the vendored NL engine (tier 2).
    Produces an `RCommand` (`{ target: 'console' | 'source', code }`), not a
    bare string — see EXECUTION.md §3 for why this repo needs two targets
    where every other interface needed one.
  - `formalToR.ts` — converts the shared "formal string" dialect to an R
    expression (`mean(c(1, 2, 3))`, `dnorm(1.96, 0, 1)`, `coef(lm(y ~ x))`).
    Forked from Ninebark-MATLABExtension's `formalToMatlab.ts` (the closest
    precedent — R and MATLAB are both REPL/expression languages, unlike
    Sheets' single-cell-formula or Overleaf's static-document targets) and
    retuned for R's own semantics, which turn out to be a genuinely
    **better** fit for parts of the shared vocabulary than MATLAB's
    (`cov`/`cor` return a scalar for two vectors, `which.max`/`which.min`
    are real single calls, `hist()`/`boxplot()` are complete valid R
    statements a console can just run) and a genuinely **worse** fit for
    one big thing (no base-R symbolic algebra solver) — both documented
    inline where they diverge from the MATLAB precedent.
  - `rAssignment.ts` — `let`/`set`/`define` value and function assignment
    (`x <- 5`, `f <- function(x) x^2`).
  - `rControlFlow.ts` — single-statement `for`/`if-else`/`while`/`repeat`
    loops — vocabulary with no precedent in any other interface repo.
  - `rWorkspace.ts` — session housekeeping: `rm`/`ls`, working directory,
    package install/`library()`, save/load `.RData`, `help()`.
  - `rVectorsAndDataFrames.ts` — the single biggest reason someone opens
    RStudio that no other interface has an equivalent for: `read.csv`,
    `head`/`str`/`summary`, filtering/selecting/sorting a data frame,
    built-in datasets, a `data.frame(...)` skeleton.
  - `rPlotting.ts` — base-R graphics (`plot`/`hist`/`boxplot`/`curve`) by
    default, plus a `ggplot2` form reachable only when asked for by name
    (so the default path never fails on a session without it loaded).
  - `rStrings.ts` — `paste0`/`nchar`/`gsub`/`strsplit`/`trimws` and friends
    — R's own, easy-to-forget names for ordinary text operations.
  - `rCalculus.ts` — `D()` symbolic differentiation and `integrate()`
    numeric definite integration (both base R); a symbolic antiderivative
    is rejected with the honest reason (base R has no symbolic integrator).
  - `rLinearAlgebra.ts` — named-matrix operations (`det`/`solve`/`t`/`%*%`/
    `eigen`), mirroring `matlabLinearAlgebra.ts`'s shape.
  - `rExecClient.ts` — the write path: a same-origin JSON-RPC client for
    `rpc/console_input` (+ `client_init`, `get_events`) per
    [EXECUTION.md](EXECUTION.md) §2, and a real-Ace-API DOM fallback
    (`.env.editor.insert(...)`) for the Source editor and as the Console's
    fallback when the RPC path fails.
  - `vendor/ninebark-engine/` — vendored from Ninebark-DesmosExtension; see
    its own README.
- `tests/` — the test suite for everything in `src/` (`npm test`).

## What it supports

No setup — just be on a Posit Cloud / RStudio Server / Posit Workbench tab.
In plain English:

- **The same statistics/math vocabulary as every other Ninebark interface**,
  reduced to an R expression: "mean of 1,2,3,4,5" → `mean(c(1, 2, 3, 4, 5))`,
  "standard deviation of ...", "linear regression of 1,2,3 and 2,4,6" →
  `coef(lm(...))`, "cdf of a normal distribution with mean 0 and sd 1 at
  1.96" → `pnorm(1.96, 0, 1)`, "5 choose 2" → `choose(5, 2)`. A few things R
  can do that MATLAB's converter has to reject: "the correlation between ..."
  and "covariance of ..." (R's `cor()`/`cov()` return a plain scalar for two
  vectors), "the argmax of ..." → `which.max(...)`, "shuffle 1,2,3,4,5" →
  `sample(...)`.
- **Assignment**: "let x be 5", "set A to c(1, 2, 3)", "define f of x as
  x^2", "let g of x and y be x + y".
- **Control flow**: "for i in 1 to 10 print i", "if x is greater than 5
  print big else print small", "while x is less than 10 print x and
  increment x", "repeat 5 times print hi" — single-statement bodies, the
  same one-phrase-in-one-command-out shape as everything else here; a
  genuinely multi-line loop belongs in the Source editor, typed as raw R.
- **Workspace & packages**: "clear the workspace", "clear x", "list the
  variables", "install the package ggplot2", "load the package dplyr",
  "set the working directory to ~/proj", "save the workspace to
  session.RData", "get help on mean", "session info".
- **Importing & exporting data**: "load data.csv into R", "import data.xlsx
  from the second worksheet" (needs the `readxl` package — not installed by
  default, no base-R equivalent exists for Excel at all, so this one
  errors with R's own "there is no package called 'readxl'" until you
  `install.packages("readxl")` once; same for the two below), "load
  data.rds into my environment", "import the tab-separated file data.txt"
  (also: semicolon- and pipe-separated, and bare `.tsv` detection — all
  base R, no package needed), "import data.json" (needs `jsonlite`),
  "import data.sav"/"data.dta"/"data.sas7bdat" — SPSS, Stata, SAS (needs
  `haven`), "import https://example.com/data.csv" (a URL works directly,
  any format), "load the dataset mtcars" (R's built-in teaching data, base
  R), "write df to output.csv" (base R), "save df as output.xlsx" (needs
  the `writexl` package), "export df to data.rds" (base R). A generic
  "import this tab-separated file" with no filename given still produces
  the right call shape, with a placeholder to fill in.
- **Inspecting data**: "show me the first 10 rows of df" (also: last 10,
  "the tail of df", "preview df"), "the column names of df" (also:
  "headers", "fields", "variable names"), "the dimensions of df" (also:
  "the shape of df", row/column counts separately), "the data types of
  every column of df" (also: "the structure of df", base R; "glimpse df",
  needs the `dplyr` package);
  "count the missing values in each column of df" (also: whole-data-frame
  totals, "which columns have missing values", "the percentage of missing
  values"), "a summary of df", "duplicated rows in df", "the unique values
  in column age of df", "is df a data frame". A generic reference — "my
  dataset" / "the data" / "it" — with no real variable named normalizes to
  `df`, the same convention every example elsewhere here already uses; R
  itself reports a clear error if that's not actually your data frame's name.
- **Cleaning & filtering data**: "remove rows with missing values in
  income" (also: "remove all rows that contain any missing values",
  `na.omit`), "remove duplicate rows from the dataset", "keep only
  observations where age is greater than 18" (also: "between 18 and 30",
  "and income is above 30000" — compound and/or conditions), "keep only
  the columns age, income, and education", "remove the column
  participant_id", "sort the dataset by income from highest to lowest",
  "rename educ to education", "convert gender into a categorical
  variable" (also: numeric, character, integer, Date, logical), "rename
  all column names to lowercase with underscores instead of spaces",
  "replace missing values in income with the median income" (mean or
  median), "remove observations with income more than three standard
  deviations above or below its mean".
- **Creating & transforming variables**: "create a column called
  total_score by adding math_score and reading_score" (also:
  subtracting/multiplying/dividing, "... that is x plus y"), "create a
  binary variable called passed that is 1 when score is at least 60 and 0
  otherwise", "recode M to Male and F to Female in gender", "divide age
  into groups: under 18, 18-29, 30-49, and 50 or older", "standardize
  income to have a mean of zero and standard deviation of one", "create a
  natural-log transformation of income", "square the values in score and
  save them in a new column called score_squared", "calculate the number
  of days between start_date and end_date", "extract the year and month
  from date into separate columns", "calculate the percentage change in
  sales between consecutive observations", "merge the datasets students
  and grades using student_id", "append the rows of new_data to data",
  "convert the dataset from wide format to long format using
  pivot_longer()" (also `pivot_wider()`; needs the `tidyr` package — same
  "errors until you `install.packages()`" rule as the other optional
  packages above), "rank participants by score within each treatment
  group".
- **Descriptive statistics on a data-frame column**: the same statistics
  vocabulary above, but pointed at a column instead of a literal list —
  "the mean of income" (also: median, standard deviation — "std dev"/
  "stdev"/"sd" all work — variance), "show the minimum, maximum, and range
  of income" (also each on its own), "the interquartile range of income",
  "the 10th, 25th, 50th, 75th, and 90th percentiles of score", "create a
  frequency table for education", "the percentage of observations in each
  education category" (also: "proportion", which stays 0-1 rather than
  ×100 — a genuinely different number), "create a contingency table of
  gender by treatment", "the mean, median, and standard deviation of score
  for each treatment group" (any subset of this vocabulary's own stat
  words works, not just those three), "the correlation between
  study_hours and score". Every one of these passes `na.rm = TRUE` (or
  `cor()`'s equivalent, `use = "complete.obs"`) — unlike a literal list, a
  real column is one `rDataCleaning.ts` category away from having missing
  values, and base R silently returns `NA` without it.
- **Vectors & data-frame skeletons**: "let x be a vector of 1,2,3,4,5", "a
  data frame with columns name and age".
- **Plotting**: "scatter plot of x and y", "plot y against x", "plot sin(x)
  from 0 to 2*pi", "histogram of x", "boxplot of x by group", "a bar chart
  of counts", "a line chart of y vs x", "add a title 'Results'", "label the
  x axis 'time (s)'", "add a regression line for x and y", "save the plot
  to plot.png"; the `ggplot2` forms ("a ggplot of x and y from df") only
  when explicitly asked for. "plot a normal distribution with mean 0 and
  sd 1" / "plot the cdf of a binomial distribution with 10 trials and
  probability 0.3" draws the actual curve (normal/t/chi-squared/uniform get
  a real `curve()`; binomial/poisson/geometric — discrete — get a spike or
  step plot instead, since `curve()` would misrepresent them as continuous)
  — a genuinely different thing from naming a specific point ("... at
  1.96"), which stays a plain number (see the next bullet); say which one
  you want.
- **Strings**: "concatenate 'a' and 'b'", "the length of the string
  'hello'", "convert x to uppercase", "split 'a,b,c' by comma", "replace
  'a' with 'b' in x", "trim whitespace from x", "does x contain y",
  "reverse x", "characters 2 to 5 of x".
- **Calculus**: "differentiate x^2 with respect to x" → real symbolic
  differentiation via base R's `D()`; "integral of x^2 from 0 to 1" →
  numeric definite integration via base R's `integrate()`. "the
  antiderivative of x^2" is rejected — base R has no symbolic integrator.
- **Linear algebra**: "the determinant of A", "the inverse of A", "the
  transpose of A", "multiply A by B", "the eigenvalues of A", "the rank of
  A", "the trace of A", "solve Ax = b", "the identity matrix of size 3",
  "zeros 3 by 3".
- **Raw R** you type directly (`x <- 5`, `plot(t, y)`, `summary(mtcars)`)
  is passed straight through, to either target — "in the script `for (i in
  1:10) print(i)`" inserts it into the Source editor unexecuted.
- **Two write targets**: everything above defaults to the live **Console**
  (real evaluation, real output). Lead with "in the script ..." / "insert
  ... into the script" / "add ... to the script" to insert into the
  **Source editor** instead, unexecuted — for authoring, not running.

An equation-solving formal command ("solve x^2 = 4") and a few other
constructs with no base-R equivalent (statistical mode, `range()`'s
different meaning in R, `gcd`/`lcm`) report a clear error explaining the R
gap instead of guessing — see `formalToR.ts`'s `KNOWN_UNSUPPORTED` map and
`rCalculus.ts` for the specific reasons.

## Publishing to the Chrome Web Store (optional)

Not required for personal use — "Load unpacked" is permanent. To make it
installable by others: run `npm run build`, zip the contents of
`extension/`, and upload it via the
[Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole)
(one-time \$5 fee). There is no OAuth client to keep in sync (this
extension has none), so a store-assigned extension ID changes nothing.
