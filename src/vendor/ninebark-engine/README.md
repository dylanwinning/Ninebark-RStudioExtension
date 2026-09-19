# Vendored copy of Ninebark-DesmosExtension's shared engine

This directory is a **vendored snapshot** of the pieces of
[Ninebark-DesmosExtension](https://github.com/dylanwinning/Ninebark-DesmosExtension)
that this RStudio extension needs but doesn't own: the shared tier-1 math
vocabulary, the formal-string tokenizer both converters build on, the
anonymous input-logging helper, and (nested one level deeper, itself a
vendored copy inside that repo) the underlying Ninebark NL grammar engine.
Copied in, not linked — same reasoning as every other interface repo's
vendoring: this app builds standalone on any CI without a sibling repo
present, at the cost of a manual re-sync step when the upstream engine
changes.

Ninebark-DesmosExtension is the canonical home of this engine. Each
interface repo (Sheets, Excel, Overleaf, MATLAB, now RStudio) vendors the
same files from there, the same way.

## What's here and why

- `desmosNlVocab.ts` — the shared tier-1 math vocabulary (distributions,
  calculus, geometry, piecewise, regression, number theory, …) this
  interface draws from for literal-value commands ("mean of 1,2,3,4,5" →
  `mean(c(1, 2, 3, 4, 5))`, via `formalToR.ts`). Named for its origin, not
  its scope — despite the name, this is genuinely interface-agnostic
  recognition logic with no Desmos rendering in it.
- `formalStringTokenizer.ts` — the lexer (`tokenize()`/`Token`) for
  Ninebark's "formal string" dialect, plus the `UnsupportedFormalError`
  class this repo's own `formalToR.ts` parser throws.
- `inputLogger.ts` — the same fire-and-forget anonymous usage logging every
  interface uses, unchanged.
- `ninebark-nl/` — Ninebark-DesmosExtension's own vendored copy of the
  [Ninebark-Prototype](https://github.com/dylanwinning/Ninebark-Prototype)
  NL grammar engine, copied straight across (a vendor of a vendor) — see its
  own README for that layer's provenance.

**Not vendored**, because this repo owns them outright (RStudio-specific,
not shared with any other interface): `resolveRPhrase.ts`, `formalToR.ts`,
`rExecClient.ts`, `rAssignment.ts`, `rWorkspace.ts`, `rVectorsAndDataFrames.ts`,
`rPlotting.ts`, `rPackagesAndData.ts`, `rControlFlow.ts`, `rStrings.ts`, and
`extension/src/rstudio.ts` all live directly under this repo's own
`src/`/`extension/`.

Also vendored, but kept at `extension/src/shared/` rather than here (same
relative path `rstudio.ts` already expects, so its imports needed no
changes): `widget.ts` and `interfaces.ts`, the shared floating-widget UI.
See that folder's own `VENDORED.md` for their provenance.

## Provenance

Vendored 2026-09-19 from local `Ninebark-DesmosExtension` at commit
`3c00632` (main).

## Re-syncing after Ninebark-DesmosExtension changes

There's no automation for this — it's a manual copy, same as every other
interface repo. From this repo:

```bash
SRC=../Ninebark-DesmosExtension/src
DEST=src/vendor/ninebark-engine
cp "$SRC/desmosNlVocab.ts" "$DEST/desmosNlVocab.ts"
cp "$SRC/formalStringTokenizer.ts" "$DEST/formalStringTokenizer.ts"
cp "$SRC/inputLogger.ts" "$DEST/inputLogger.ts"
rm -rf "$DEST/ninebark-nl"
cp -R "$SRC/vendor/ninebark-nl" "$DEST/ninebark-nl"
cp "../Ninebark-DesmosExtension/extension/src/shared/widget.ts" extension/src/shared/widget.ts
cp "../Ninebark-DesmosExtension/extension/src/shared/interfaces.ts" extension/src/shared/interfaces.ts
```

Then re-run `npx tsc -b --force && npx vitest run` in this repo (and update
the commit hash above) before committing the refresh. `interfaces.ts` needs
its `rstudio` entry re-added after copying over the upstream file (the copy
overwrites this repo's own addition) — check the diff before committing. If
Ninebark-DesmosExtension renames an export these files use, or a vendored
file starts importing something new, that new file needs vendoring too —
check each vendored file's own imports the same way this snapshot was
originally traced.
