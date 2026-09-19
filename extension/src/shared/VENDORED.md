# `widget.ts` / `interfaces.ts` are vendored

Both files in this folder are a vendored copy from
[Ninebark-DesmosExtension](https://github.com/dylanwinning/Ninebark-DesmosExtension)'s
`extension/src/shared/` — the same floating-widget UI (shadow-DOM panel,
input bar, example chips, log) every Ninebark interface's content script
uses, and the small registry (`interfaces.ts`) its header dropdown is built
from. Kept at this same relative path (`./shared/widget` /
`./shared/interfaces`) specifically so `extension/src/rstudio.ts`'s imports
match what every other interface's content script uses — a straight port.

- **`widget.ts`** is copied **unmodified** — it has no interface-specific
  logic; `rstudio.ts` supplies its own example phrases and submit handler.
  The widget renders reliably here because `rstudio.ts` runs in the content
  script's **isolated world**, which is exempt from the host page's CSP /
  Trusted Types (see `../../../EXECUTION.md` §4).
- **`interfaces.ts`** is the one vendored file this repo **edits**: it adds
  a `{ id: 'rstudio', label: 'RStudio' }` entry to the registry (and carries
  forward the `matlab` entry, shipped since this repo was vendored). Every
  interface repo does this for its own entry — see Ninebark-DesmosExtension's
  `CLAUDE.md` step 5. The other entries are left as-is so the "open X to use
  it there" messaging stays accurate.

Vendored 2026-09-19 from local `Ninebark-DesmosExtension` at commit
`3c00632` (main). Re-sync steps are documented alongside the rest of this
repo's vendored engine — see
[`../../../src/vendor/ninebark-engine/README.md`](../../../src/vendor/ninebark-engine/README.md).
