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
   (rm/ls/setwd/library/save/load/help), `rVectorsAndDataFrames`
   (read.csv/head/str/filter/select/sort), `rPlotting` (plot/hist/boxplot/
   ggplot2), `rStrings` (paste/nchar/gsub/strsplit), `rCalculus`
   (D()/integrate()), `rLinearAlgebra` (det/solve/t/%*%/eigen),
   `rAssignment` (`let x be …`). Recognizers that need to resolve a
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
