# Ninebark-RStudioExtension

This repo is the **RStudio** interface for **Ninebark** — the family of
"type it in plain English on the real page" tools, one repo per interface.
Read `README.md` first for the architecture and what's supported; read
`EXECUTION.md` before touching the write path. This file is the orientation
for a session working *in* this repo.

**This repo ships two independent things**, not one — see the root
README's "Two ways to use this": `extension/` (a Chrome extension, web
editions of RStudio only — everything below in this section describes it)
and `ninebark-r/` (an RStudio Addin / R package, works in Desktop too — see
`ninebark-r/README.md` for that one's own orientation). They share
`src/`'s natural-language engine; `ninebark-r/` reaches it via a separate
bundle entry point (`src/ninebarkBundle.ts`, built by `npm run build:r`)
embedded in R through the `V8` package, not by depending on `extension/`'s
DOM-shaped code.

## What this is

A Chrome MV3 extension. Its content script runs on Posit Cloud / RStudio
Server / Posit Workbench tabs (**never** RStudio Desktop — see EXECUTION.md
Status for why), shows the shared Ninebark floating widget, takes a plain-
English command, resolves it to an `RCommand` (R source + which of two
targets it's headed for), and either runs it in the live R **Console** via
the same JSON-RPC call RStudio's own browser client uses
(`rpc/console_input`) or inserts it into an open **Source** file via the
real Ace editor API — never synthetic keystrokes, for the same reason
Ninebark-OverleafExtension dispatches a real CodeMirror transaction instead
of simulating typing.

The lineage: `Ninebark-DesmosExtension` (Desmos, first, and the canonical
home of the shared engine) → `Ninebark-SheetsExtension` (Google Sheets REST
API + OAuth broker) → `Ninebark-ExcelExtension` (Office.js, no auth) →
`Ninebark-MATLABExtension` (connector message service, no auth) →
`Ninebark-OverleafExtension` (CodeMirror 6 extension hook, no auth) → this
repo. Only the NL-pipeline shape transfers between them; each interface's
write path is its own thing. This repo's closest precedent is
Ninebark-MATLABExtension (same-origin RPC, no OAuth, R and MATLAB are both
REPL/expression languages) — `formalToR.ts` is a direct fork of
`formalToMatlab.ts` — but it also needed Ninebark-OverleafExtension's
"insert real source via the real editor API" model for its Source-editor
target, since RStudio (unlike MATLAB) genuinely has both a live console AND
a document-editing surface worth targeting separately. See EXECUTION.md §3.

## The one open question: the write path

Same shape as every prior interface's open question, and explicitly not
skipped over: `EXECUTION.md`:

- §2 documents RStudio's GWT-client ↔ `rsession` RPC architecture, the
  `console_input`/`client_init`/`get_events` calls, and the CSRF cookie/
  header pair — taken from RStudio's own open-source `RemoteServer.java`/
  `RpcRequest.java` and Posit's published Header and Cookie Dictionary, not
  reverse-engineered page JS.
- §3 is the reasoning for Console-execution-by-default +
  Source-editor-on-request, not one or the other.
- §6 is a copy-paste DevTools checklist to run on a real Posit Cloud /
  RStudio Server / Posit Workbench tab.
- §7 maps each possible §6 outcome to a concrete change to
  `src/rExecClient.ts`.

**If you're here to wire up execution:** run §6 first (or get the user to),
then tighten `readCsrfToken` / `parseGetEventsResponse` / the Ace
classification heuristic in `src/rExecClient.ts` to match what §6 found, and
record the results in EXECUTION.md. Do **not** pivot to RStudio Desktop —
that's out of scope (it's not reachable by a content script even though it
runs the same web client — see EXECUTION.md Status); if the content-script
route is dead, report it.

Until then: resolution (English → `RCommand`) is complete and fully tested
and always runs; `rExecClient.ts` is written to the documented contract,
fails loud with a specific message when it can't reach the session, and the
content script always shows the resolved R so it can be pasted by hand.

## Pipeline (`src/resolveRPhrase.ts`)

`resolveToRCommand(raw)` → `{ target: 'console' | 'source', code }`, in this
order:

1. **Raw R pass-through** — `x <- 5`, `plot(t, y)`, `c(1,2,3)`, and
   expressions the tier-2 NL engine would misparse (`df$col`, `x[2]`, `x %%
   n`). Heuristic is on the regexes in that file and in the README.
2. **Source-editor routing** — a leading "in the script"/"insert ... into
   the script"/"add ... to the script" strips itself off and flips the
   result's `target` to `'source'`; every recognizer below runs on the
   REST of the text with no knowledge this routing exists.
3. **R-native recognizers** — one file each, no Desmos/Sheets/MATLAB
   equivalent: `rControlFlow` (for/if-else/while/repeat), `rWorkspace`
   (rm/ls/setwd/library/save/load/help), `rDataImport`
   (read.csv/readxl/readRDS/jsonlite/haven — getting data INTO R, every
   format with no base-R reader namespaced rather than preceded by
   `library()`, so it works whether or not that package happens to be
   loaded), `rDataInspection` (head/tail/colnames/dim/dtypes/missing
   values — a `DATA_REF` placeholder convention maps "my dataset"/"the
   data"/"it" to the literal `df` when no real name is given, same
   convention the README's examples already use — STRICTLY read-only;
   anything that actually drops/replaces data lives in rDataCleaning.ts,
   not here), `rDataCleaning` (filter/keep-only rows including compound
   and/or and "between" conditions, remove-missing/remove-duplicate rows,
   select/remove columns, sort, rename, type conversion, bulk column-name
   cleanup, missing-value imputation, outlier removal — reuses the same
   `DATA_REF` convention; see its own header comment for the safety
   convention around which operations auto-assign back to `df` and which
   stay a bare, non-mutating expression), `rDataTransform` (deriving NEW
   columns/datasets from existing ones once they're already clean —
   arithmetic combinations, binary/indicator variables via the SAME
   condition grammar `rDataCleaning.ts` exports, recoding, binning into
   named groups, standardizing, log transforms, date-part extraction,
   percent change, merge/append, pivot_longer/pivot_wider skeletons, rank
   within group), `rDescriptiveStats` (the same statistics vocabulary
   every other Ninebark interface already has for literal lists — "mean
   of 1,2,3,4,5" — pointed at a data-frame COLUMN instead: mean/median/sd/
   var/min/max/range/IQR/percentiles/frequency & contingency tables/
   grouped stats/correlation, every one with `na.rm = TRUE` since a real
   column can have missing values where a literal list can't; runs FIRST
   in the native chain so a bare identifier like "income" is claimed here
   before a literal list ever reaches tier-1/tier-2, which still handle
   that case exactly as before), `rVectorsAndDataFrames` (bare vector/data-frame-skeleton
   construction only — "a vector of 1,2,3", "a data frame with columns x
   and y" — NOT wrangling an existing one, that moved to
   rDataCleaning.ts), `rPlotting` (plot/hist/boxplot/ggplot2),
   `rStrings` (paste/nchar/gsub/strsplit), `rCalculus` (D()/integrate()),
   `rLinearAlgebra` (det/solve/t/%*%/eigen), `rAssignment` (`let x be …`).
   Recognizers that need to resolve a
   sub-expression take a `ValueResolver` callback (the value tiers only —
   no recursion back into the command grammar); `rControlFlow.ts`'s
   `resolveBodyValue` additionally short-circuits a BARE identifier
   ("print i", "print big") straight through rather than routing it into
   the math-NL pipeline — a real bug caught during development (a loop
   variable or bare word isn't a math phrase, and tier-2 correctly refuses
   to guess one), see that file's comment and `tests/rControlFlow.test.ts`.
4. **Tier 1** — vendored `recognizeDesmosPhrase` → `formalToR.ts`.
5. **`looksLikeRawExpr` guard** — a last check before tier 2: if the text is
   already an R expression tier 2 would mangle, return it verbatim.
6. **Tier 2** — vendored `nlToFormal` → `formalToR.ts`.
7. Otherwise → `RNlFailure` with a specific message. Never a wrong guess.

`formalToR.ts` mirrors `formalToMatlab.ts`'s precedence-climbing parser.
Key difference: R's own semantics make it a BETTER fit than MATLAB's for
parts of the shared vocabulary (`cov`/`cor` scalar for two vectors,
`which.max`/`which.min`, `sample()` shuffle, `hist()`/`boxplot()` as
complete valid R statements — R's console runs any statement, not just
value-producing ones) and a WORSE fit for one big thing (no base-R symbolic
algebra solver — `solve(...)` is rejected with the honest reason and the
two real base-R alternatives, `uniroot()`/`polyroot()`). Every divergence
from the MATLAB precedent is commented inline at the point it diverges —
that's the file to read to understand R vs. MATLAB as Ninebark targets, not
this summary.

**Filler-stripping gotcha** (bit every native recognizer at least once
during development — see the regexes in `rWorkspace.ts`/`rCalculus.ts` for
the fix): `stripFiller()` (vendored, tuned for math phrases) runs BEFORE any
native recognizer sees the text, and aggressively drops a LEADING "what is
the"/"the"/etc. — so "what is the working directory" arrives as "working
directory", and "the derivative of x^2..." arrives as "derivative of
x^2...". Every recognizer's regex has to match the POST-strip form, not the
sentence a person actually typed — when adding a new recognizer, run it
through the real pipeline (not a hand-rolled resolveValue stub) before
trusting a regex that assumes a full leading phrase survives.

**Bare-identifier-fallback gotcha** (a direct consequence of the
filler-stripping one above, specific enough to burn a second time if not
called out separately — see `rDataInspection.ts`'s `tryHead` for the fix
and `tests/rDataInspection.test.ts`'s "through the FULL pipeline" test for
the regression it pins): because `stripFiller()` eats a leading "show
me"/"what is" before any recognizer sees the text, a recognizer that adds
a bare "just a single identifier, nothing else" fallback pattern — to
catch "show me df" arriving pre-stripped as plain "df" — CANNOT tell that
apart from a single nonsense word typed alone ("asdkjhaskjdhaskjdh" is
also just one identifier-shaped token). An earlier version of
`tryHead`'s bare fallback had no guard against this and silently turned
gibberish into `head(<gibberish>)` — caught by this project's own
canonical "gibberish fails loud" tests, including (the one that actually
caught it) the R package's `R CMD check`, not the TS suite, since the TS
gibberish test phrase happens to be two words. The fix: gate any such bare
fallback on `t !== text` (did THIS function's own lead-stripping find and
remove something, as opposed to the text having arrived pre-stripped) —
accept that "show me X" specifically becomes an unsupported phrasing
rather than risk a silent wrong guess. When adding a new "bare X" fallback
anywhere in this codebase, test it against a bare nonsense word, not just
the phrasing it's meant to catch.

**Cross-file generic-pattern collision gotcha** (the data-cleaning category's
version of the filename-swallowing bug above, one file apart instead of one
regex apart): `rWorkspace.ts`'s bare `remove <identifier list>` -> `rm(...)`
pattern runs BEFORE `rDataCleaning.ts` in `resolveRPhrase.ts`'s chain, and
structurally "remove duplicates" is indistinguishable from "remove x" — a
single bare identifier after a removal verb. Without an explicit exclusion,
`rWorkspace` claimed "remove duplicates" first and produced `rm(duplicates)`
instead of `rDataCleaning.ts`'s intended `unique(df)`. Caught by the probe
script, not a false sense of safety from the regex looking "obviously fine"
in isolation — it only breaks once a SECOND file's vocabulary collides with
a word the first file's permissive pattern already accepts. The fix:
excluded `duplicates`/`duplicate` by name from `rWorkspace.ts`'s identifier
list (same spot as its pre-existing `all` exclusion), rather than
reordering the whole chain (which would risk the opposite problem — a real
workspace variable actually named e.g. `df_filtered` getting caught by a
later file's broader pattern instead). When adding vocabulary to any new
file, re-probe common short, generic-sounding phrases ("remove X", "clear
X") against the FULL pipeline, not just the new file's own recognizer in
isolation — a collision shows up only in `resolveToRStatement()`, never in
a bare `recognizeDataCleaning()` call.

**Base-R-subsetting-has-no-NSE gotcha** (a correctness bug, not just an
unsupported phrasing — found while building the transforms category,
inherited unnoticed through two earlier categories): `df[cond, ]` in BASE R
does **not** do dplyr-style non-standard evaluation on `cond` — a bare
column name like `age` in `df[age > 18, ]` throws `object 'age' not found`
unless `age` also happens to exist as a free-standing vector, confirmed with
a real `Rscript`, not assumed from memory. `rDataCleaning.ts`'s condition
builder (`translateCondition`/`translateSingleCondition`) originally built
conditions from bare column identifiers (`age>18`) — carried over verbatim
from the ORIGINAL `rVectorsAndDataFrames.ts` `tryFilter`, which had the same
bug from day one, just never caught because no test ever ran the output
through a real R session. Every test that exists only pins the STRING the
recognizer returns; none of them execute it. The fix: both functions now
take the target data frame's name explicitly and qualify every column
reference as `${dfName}$column`. The durable lesson: a string-matching test
suite proves the recognizer's regex, never the resulting R's correctness —
spot-check genuinely novel R *shapes* (not just novel phrasings of already-
proven shapes) in a real `Rscript -e`, especially anything using `[`,
`$`, or NSE-flavored semantics, before trusting the generated code.

## Vendored code — do not edit (mostly)

`src/vendor/ninebark-engine/` (`desmosNlVocab.ts`, `formalStringTokenizer.ts`,
`inputLogger.ts`, `ninebark-nl/`) and `extension/src/shared/widget.ts` are
vendored snapshots from `Ninebark-DesmosExtension` — see
`src/vendor/ninebark-engine/README.md` for provenance + re-sync steps. The
one vendored file this repo edits is `extension/src/shared/interfaces.ts`
(adds the `rstudio` registry entry, and carries the `matlab` one forward).
If a bug is in a vendored file it's an upstream bug — fix it in
Ninebark-DesmosExtension and re-sync, don't patch the copy.

## Working conventions

- **Never modify the sibling repos** (`../Ninebark-*`) — except the one
  documented, one-directional exception: adding this repo's entry to each
  sibling's `extension/src/shared/interfaces.ts` (see
  `Ninebark-DesmosExtension/CLAUDE.md` step 5). Otherwise, read-only.
- **Empirical audit before permanent tests** (the methodology this whole
  project uses): a temp script importing recognizers directly, run via
  `npx tsx`, eyeball real phrasings across every recognizer file, fix,
  re-run, *then* write `tests/*.test.ts`, then delete the script. This
  repo's own audit pass (73 phrasings) found and fixed three real bugs this
  way — the filler-stripping gotcha above, `plot ... from A to B`'s bounds
  being numbers-only instead of arbitrary R expressions, and a precedence
  bug in a couple of `formalToR.ts` formulas — before any test was written
  to pin the fix. No audit script remains in the repo; it's gone.
- Before done: `npx tsc -b`, `npm test` (must pass), `npm run build` (must
  produce `extension/dist/rstudio.js`).
- Commit only when asked. Commit messages end with:
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`
- Match the Ninebark voice in docs and comments: explain the architecture and
  its trade-offs honestly, including approaches tried and rejected and things
  not yet verified.
