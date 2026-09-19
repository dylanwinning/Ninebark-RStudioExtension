# Vendored copy of Ninebark-Prototype's `nl/` engine

This directory is a **vendored snapshot** of the natural-language grammar
(`src/nl/` and the one `src/types/` file it needs) from the separate
[Ninebark-Prototype](https://github.com/dylanwinning/Ninebark-Prototype)
repo — copied in, not linked, so this app builds standalone on Vercel (or
any CI) without that sibling repo present.

Only the exact transitive closure of files `nl/index.ts` actually imports is
here — traced by following every relative import out from `nl/index.ts`,
nothing pulled in speculatively. Notably this does **not** include
`src/calculator/`, `src/ui/`, or most of `src/types/` from the source repo —
`nl/index.ts` doesn't need them.

## Provenance

Vendored 2026-08-20 from local `Ninebark-Prototype` at commit
`c6f58c4871482eafc5ef2186841bd79b2241b726`, **plus** one uncommitted local
change on top (`nl/lexicon/classes.ts` — hyperbolic reciprocal/inverse trig
+ `erf` lexicon entries) that this app's coverage already depends on. That
change should get committed in Ninebark-Prototype itself at some point; this
snapshot includes it either way so nothing regresses.

## Re-syncing after Ninebark-Prototype changes

There's no automation for this — it's a manual copy, same as any vendored
dependency without a package registry behind it. From this repo:

```bash
SRC=../Ninebark-Prototype/src
DEST=src/vendor/ninebark-nl
cp "$SRC/nl/index.ts" "$DEST/nl/index.ts"
cp "$SRC/nl/contract.ts" "$DEST/nl/contract.ts"
cp "$SRC/nl/errors.ts" "$DEST/nl/errors.ts"
cp "$SRC/nl/grammar.config.ts" "$DEST/nl/grammar.config.ts"
cp "$SRC/nl/disambiguation/policy.ts" "$DEST/nl/disambiguation/policy.ts"
cp "$SRC/nl/emit/formalString.ts" "$DEST/nl/emit/formalString.ts"
cp "$SRC/nl/framing/strip.ts" "$DEST/nl/framing/strip.ts"
cp "$SRC/nl/grammar/earley.ts" "$DEST/nl/grammar/earley.ts"
cp "$SRC/nl/grammar/forest.ts" "$DEST/nl/grammar/forest.ts"
cp "$SRC/nl/grammar/rules.ts" "$DEST/nl/grammar/rules.ts"
cp "$SRC/nl/lexicon/classes.ts" "$DEST/nl/lexicon/classes.ts"
cp "$SRC/nl/lexicon/tokenizer.ts" "$DEST/nl/lexicon/tokenizer.ts"
cp "$SRC/nl/numbers/numberPhrase.ts" "$DEST/nl/numbers/numberPhrase.ts"
cp "$SRC/types/diagnostic.ts" "$DEST/types/diagnostic.ts"
```

Then re-run `npx tsc -b --force && npx vitest run` in this repo (and update
the commit hash above) before committing the refresh. If Ninebark-Prototype
adds a NEW file to this dependency chain, re-trace it: every import inside
`nl/index.ts`'s closure is a plain relative `import` (no external packages),
so `grep -rn "^import" src/nl src/types` in the source repo will show you
what changed.

## Why not a git submodule or npm package instead?

Both were considered. This app only needs ~14 files (not all of
Ninebark-Prototype), the NL grammar changes infrequently, and a plain copy
needs no submodule tooling, no publishing pipeline, and nothing extra for
Vercel to configure — it's just source files in this repo like any other.
