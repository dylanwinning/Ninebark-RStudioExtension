# Ninebark for RStudio — Chrome extension

Type R commands in plain English right on a Posit Cloud / RStudio Server /
Posit Workbench tab you already have open. No separate site — the content
script runs directly on the page and drives the session through the same
JSON-RPC call RStudio's own browser client uses.

**Status:** the write path is built against RStudio's documented GWT-client
RPC contract but not yet confirmed against a live session — see
[../EXECUTION.md](../EXECUTION.md) §6 for the exact checks and what each
result means. Until then, every command still resolves to real R and that R
is shown in the widget log so you can paste it into the Console yourself.
There is **no OAuth / API key / setup** — the content script runs on the
RStudio host itself, so your logged-in session is the credential.

## Load it (development / personal use)

1. From the repo root: `npm install && npm run build`. This produces
   `extension/dist/rstudio.js`.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select this `extension/` folder (not the repo
   root — this folder specifically, the one with `manifest.json` in it).
5. Go to [posit.cloud](https://posit.cloud) and sign in (or open your own
   RStudio Server / Posit Workbench host — see **Self-hosted RStudio
   Server / Posit Workbench**, below, since that needs one extra click the
   first time). Once RStudio has loaded, a small green circular button
   appears in the bottom-right corner of the PAGE — click it to open the
   input bar. (This is unrelated to the extension's own toolbar icon next
   to Chrome's address bar, which only matters for self-hosted hosts —
   see below.)

After editing source, re-run `npm run build` (or `npm run watch:rstudio`
from the repo root to rebuild on every save) and click the refresh icon on
the extension's card at `chrome://extensions` to pick up the new bundle.

## Self-hosted RStudio Server / Posit Workbench

Posit Cloud is a fixed domain (`posit.cloud`), so it works out of the box.
RStudio Server and Posit Workbench are **self-hosted at whatever hostname
your organization or institution chose** — there's no single domain
`manifest.json` can list in advance. Two ways to handle that, pick
whichever fits:

**Click to activate, no editing (works for a Chrome Web Store install
too, not just "Load unpacked").** The extension has `activeTab` +
`scripting` permission and a background service worker
([`background.js`](background.js)) for exactly this: open your host in a
tab, click the Ninebark icon in Chrome's own toolbar (next to the address
bar — not the green in-page button from step 5 above), and the same
`dist/rstudio.js` Posit Cloud gets automatically is injected into that one
tab. No standing host permission is requested at install time — this is
the standard Chrome extension pattern for "works on any domain" without
asking for "read and change all your data on all websites" up front. It's
per-tab: a fresh tab (or a reload) on the same host needs one more click.

**Or, hand-edit the manifest for a permanently automatic Load-unpacked
install on your one known host** (the same one-time, hand-edited step
Ninebark-SheetsExtension's OAuth client ID and Ninebark-MATLABExtension's
manifest each have) — only available if you're loading this extension
unpacked from source, since a Chrome Web Store install's manifest can't be
edited:

1. Open [`manifest.json`](manifest.json).
2. Add your host to **both** the `content_scripts[0].matches` array and
   `host_permissions`, e.g. for `https://rstudio.mycompany.edu`:
   ```json
   "matches": [
     "https://posit.cloud/*",
     "https://rstudio.cloud/*",
     "https://rstudio.mycompany.edu/*"
   ],
   ```
   (and the matching entry under `host_permissions`.)
3. Go to `chrome://extensions` and click the refresh icon on Ninebark's card
   to reload it with the new manifest. No more clicking needed afterward —
   same zero-setup behavior Posit Cloud gets.

## How it works

- **`rstudio.js`**, running in the default **isolated world** — deliberately,
  not MAIN world, for the same reason Ninebark-SheetsExtension's and
  Ninebark-MATLABExtension's content scripts do: an isolated-world content
  script is exempt from the host page's CSP / Trusted Types, so the shared
  widget's `.innerHTML`-based rendering is reliable, and it still has
  same-origin `fetch` with the page's cookies (which is the entire write
  path) and full DOM access (which is how the Ace-editor fallback reaches
  the Console/Source editor instances).
- `extension/src/shared/widget.ts` is the floating-widget UI — a shadow-DOM
  panel with the input bar, log, and an "interface" dropdown (informational
  only). Vendored from Ninebark-DesmosExtension, not authored here — see
  its `VENDORED.md`.
- **`rstudio.ts`** (via `../../src/resolveRPhrase.ts`) turns the typed
  phrase into an `RCommand` — R source, plus which of two targets it's
  headed for — then hands it to `../../src/rExecClient.ts`, which either
  POSTs a `console_input` RPC to the live R session (the Console target) or
  inserts it via the Source editor's real Ace API (the Source target). See
  [../EXECUTION.md](../EXECUTION.md) for the full write-path design and
  what's confirmed vs. still pending a live check.
- **`background.js`** is intentionally tiny — not an OAuth broker like
  Ninebark-SheetsExtension's (this extension calls a same-origin endpoint
  with the session cookie, plus a CSRF token read from a page cookie, so
  there's no token to broker). Its only job is `chrome.action.onClicked`:
  on a self-hosted Server/Workbench tab with no standing host permission,
  inject `dist/rstudio.js` into the clicked tab via `chrome.scripting`
  (`activeTab`). Posit Cloud/rstudio.cloud never need this — they're
  injected declaratively by `manifest.json`'s own `content_scripts` entry,
  same as before.

## The trade-offs, honestly

**The write path is the open question, and it's documented as one.** The
Sheets extension's architecture pivot came from a live test proving
synthetic keystrokes can't commit into Google Sheets; Ninebark-MATLABExtension
had to defer its own equivalent live test for the same reason this repo
does — no browser automation was available while building it, and the web
editions of RStudio all sit behind a login. So this repo does the same
honest thing: the resolution half (English → R, and which target it's
headed for) is complete, tested, and always runs; the execution half is
built to RStudio's documented open-source RPC contract, fails loudly with a
specific message when it can't reach the session, and always surfaces the
resolved R so nothing is lost. [../EXECUTION.md](../EXECUTION.md) §6 is the
checklist to close it, and §7 maps each possible result to a concrete
change.

Synthetic typing into the Console's input line was considered as a fallback
(RStudio's Console, unlike MATLAB's Command Window, is confirmed to be a
real Ace editor instance, so it's a stronger candidate than MATLAB's was) —
but the real Ace API (`editor.insert(...)`) is available and strictly
better: it fires the exact same `change` event a keystroke would (so
RStudio's own GWT listener sees it as a genuine edit) without any keystroke
choreography, and for the Console case specifically, the direct RPC call is
better still — it returns the actual evaluated output, not just "something
got typed."

## Publishing to the Chrome Web Store (optional)

Not required for personal use — "Load unpacked" is permanent. To make it
installable by others without developer mode:

1. Zip the contents of this `extension/` folder (after `npm run build` so
   `dist/` is current).
2. Register as a Chrome Web Store developer (one-time $5 fee) at
   [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole).
3. Upload the zip and fill out the listing. Store icons/screenshots aren't
   included here — you'd add those as part of the listing.
