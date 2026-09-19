# EXECUTION.md — how Ninebark for RStudio gets R code into a live RStudio session

This is the RStudio analogue of Ninebark-SheetsExtension's `OAUTH_SETUP.md`,
Ninebark-MATLABExtension's `EXECUTION.md`, and Ninebark-OverleafExtension's
`EDITOR_ACCESS.md`: the write path is the load-bearing architectural decision
for this whole repo, so it is investigated and written up here *before* any
code depends on it.

## Status (read this first)

- **Target confirmed, and the MATLAB precedent's reasoning holds — with one
  extra wrinkle worth spelling out.** "RStudio" is not one page. There are
  four ways to run it, and this project's whole model ("type it in plain
  English on the real page") only works against a **browser tab**:
  - **Posit Cloud** (`posit.cloud`) — a hosted multi-tenant service. A real
    Chrome tab, reachable.
  - **RStudio Server / Posit Workbench** (self-hosted, e.g.
    `https://your-host:8787/`) — a real Chrome tab, reachable.
  - **RStudio Desktop** — *this is the wrinkle*. Unlike desktop MATLAB
    (a genuinely different native application from MATLAB Online), RStudio
    Desktop is **not** a different app at the UI layer: since 2022.12,
    RStudio Desktop is an **Electron** shell (Qt before that) that launches a
    **local `rsession`/`rserver` process on `127.0.0.1`** and loads the
    **exact same GWT-compiled web client** Server/Workbench/Cloud serve
    remotely — confirmed from RStudio's own architecture wiki
    ("RStudio Desktop... built from the exact same sources... as existing
    RStudio Desktop and RStudio Server"). So everything this document learns
    about the DOM, the RPC protocol, and the Ace editor instances is
    *architecturally identical* on desktop. **It is still out of scope**,
    for a narrower reason than MATLAB's: a Chrome content script attaches to
    Chrome tabs, and RStudio Desktop's window is an **Electron `BrowserWindow`
    process, not a Chrome tab** — there is nothing for `manifest.json`'s
    `matches` to match. A content script cannot reach `localhost:8787` loaded
    *inside Electron*; it could only reach `localhost:8787` if the user
    happened to separately open that URL in an actual Chrome tab (running
    `rserver` standalone without the Electron shell around it) — which is a
    real, supported way to run RStudio Server locally, and this extension
    works there for free, same as it works on a remote Server/Workbench host.
    So: **target is any RStudio session reachable as a normal Chrome tab —
    Posit Cloud, RStudio Server, or Posit Workbench** — never the RStudio
    Desktop application window itself. Per the brief, this is reported rather
    than silently pivoted: if a future live pass finds the web client
    unreachable from a content script for some other reason (CSP, iframe
    sandboxing), this document says so and stops rather than trying to shell
    out to desktop RStudio.
- **Architecture established from RStudio's own open-source client (not
  reverse-engineered minified JS) and Posit's own published header/cookie
  reference.** RStudio's browser client is a single-page app compiled from
  Java by **GWT** (Google Web Toolkit); the R-executing backend (`rsession`)
  is a separate C++ process the GWT client talks to over **JSON-RPC**
  (`POST .../rpc/<method>`) plus a **long-polled `get_events` RPC** for
  anything the server needs to push (console output chief among them). Full
  detail in §2, sourced from `rstudio/rstudio`'s own `src/gwt` tree and wiki,
  and from Posit's official "Header and Cookie Dictionary."
- **Chosen write path: submit R source to the live Console via the same
  `console_input` JSON-RPC call the GWT client itself uses**, same-origin,
  authenticated by the page's own cookies — the MATLAB model (a real eval
  channel that returns output), not the Overleaf model (static source
  inserted and never run). §3 says why. A DOM-level fallback exists for both
  the Console and the Source editor, because RStudio's editor surfaces are
  **real Ace editor instances** (confirmed: RStudio's own wiki says it
  "consumes the Ace text editor" via JSNI/JSInterop — the standard `ace.js`
  library, not a reimplementation), reachable the same well-documented way
  any embedded Ace instance is: `document.querySelector('.ace_editor').env.editor`.
- **Not yet verified on a live session — needs a live pass.** Same posture,
  and the same reason, as MATLAB's EXECUTION.md: no browser automation was
  available in this environment, and every RStudio web edition sits behind a
  login (or, for a local Server, isn't running in this sandbox at all). Every
  point below marked **⚠️ LIVE** is collected into a copy-paste test plan in
  §6, with a per-outcome build table in §7. Running §6 is the gate on
  building `rExecClient.ts` against anything but the documented contract.
  `rExecClient.ts` and the content script are written defensively against
  that contract in the meantime — they fail loud with a specific,
  §-numbered message when a step doesn't behave as documented, and the
  widget always shows the resolved R source so it can be pasted into the
  Console by hand regardless of how the live pass comes out.

## 1. What was actually done here

- Read the three precedents end to end: Ninebark-SheetsExtension (killed a
  DOM-typing approach after live testing, moved to a real REST API + OAuth),
  Ninebark-MATLABExtension (same-origin JSON envelope POST to a documented
  connector, no OAuth, no live pass possible in-session — the closest
  precedent here), and Ninebark-OverleafExtension (a documented
  extension-point hook into a real CodeMirror 6 instance, dispatching a real
  editor transaction rather than synthetic keystrokes).
- Read RStudio's own architecture documentation: the `rstudio/rstudio` GitHub
  wiki pages "GWT (Google Web Toolkit)" and "A Beginner's Guide to Writing
  RStudio IDE Features," and DeepWiki's "Console and Terminal" page (a
  structured index over the same source tree).
- Read RStudio's actual GWT source for the RPC transport and the console
  submission call: `src/gwt/src/org/rstudio/core/client/jsonrpc/RpcRequest.java`
  (request/response shape, headers) and
  `src/gwt/src/org/rstudio/studio/client/server/remote/RemoteServer.java`
  (`consoleInput()`, `clientInit()`, the `RPC_SCOPE` base path, the
  hold-until-`client_init` behaviour).
- Read Posit's official, first-party **Header and Cookie Dictionary**
  (`docs.posit.co/ide/server-pro/reference/header_cookie_dictionary.pdf`),
  which names the exact CSRF cookie/header pair (`rs-csrf-token` /
  `X-RS-CSRF-Token`) and confirms it's the double-submit pattern (client JS
  reads the cookie and echoes it as a header) rather than a server secret.
- Confirmed, from RStudio's own wiki, that RStudio Desktop (2022.12+) is an
  Electron shell around the *identical* GWT web client, and traced what that
  does and doesn't mean for this extension (see Status, above).
- Did **not** run anything against a live RStudio session (see Status).

## 2. How RStudio's web client talks to the R session

### 2.1 The shape: GWT client ↔ JSON-RPC ↔ rsession

RStudio's browser UI — identical whether served by RStudio Server, Posit
Workbench, or Posit Cloud — is a GWT single-page app. It never talks to R
directly; it talks to `rsession` (a per-user C++ process) via:

- **Synchronous RPC calls**, `POST` requests to a `rpc/`-scoped path
  (`RemoteServer.RPC_SCOPE = "rpc/"`, and `getApplicationURL(scope)` returns
  `GWT.getHostPageBaseURL() + scope` — i.e. same-origin, relative to
  whatever base path the session is served under). Confirmed from
  `RemoteServer.java`.
- **One long-polled RPC, `get_events`**, for everything the *server* needs to
  push to the client rather than the other way around — console output text
  chief among it. Per RStudio's own wiki: "The rsession can send messages to
  the page; this is done via long-polling by the page via the `get_events`
  RPC call." (Not a WebSocket for this particular channel — RStudio does use
  a real WebSocket elsewhere, for the Terminal pane's PTY, which is out of
  scope here since Ninebark targets the R Console, not the shell terminal.)

### 2.2 The request/response envelope (from `RpcRequest.java`)

Every RPC call, `console_input` and `get_events` included, is:

```
POST <origin>/<base-path>/rpc/<method>
Content-Type: application/json
Accept: application/json
X-RS-CSRF-Token: <value of the "rs-csrf-token" cookie>
X-RS-RID: <a request id GWT generates per call>

{
  "method": "<method>",
  "params": [ ... positional args ... ],
  "kwparams": { ... },
  "clientId": "<clientId from client_init>",
  "clientVersion": "<clientVersion from client_init>",
  "sourceWnd": "<window id, if any>"
}
```

Response: `200` with a JSON body whose result lives under `"result"` (the
field name is itself configurable per-call in the GWT client, but defaults to
`result`); an RPC-level failure comes back as an `"error"` object rather than
an HTTP error status.

**⚠️ LIVE — the CSRF header.** Posit's own **Header and Cookie Dictionary**
(first-party, `docs.posit.co`) documents the pair precisely:

| Cookie | Header | Usage |
|---|---|---|
| `rs-csrf-token` | `X-RS-CSRF-Token` | CSRF attack prevention |

This is the standard **double-submit cookie** pattern — the whole point is
that page JS reads its own cookie and echoes it back as a header, so (unlike
MATLAB's connector nonce, which was a total unknown) there is a named,
documented mechanism here, not a guess. What's unverified is mechanical, not
architectural: that the cookie is not `HttpOnly` (so `document.cookie` can
read it — expected, since the GWT client itself has to read it the same way,
but confirmed in §6.2), and its exact current name/casing on whichever
RStudio version is live (older deployments predating 2022.09 used a plain
`csrf-token` / `X-CSRF-Token` pair instead, per the same dictionary — both are
worth trying).

### 2.3 `client_init` — the handshake a request needs first

`RemoteServer.clientInit()` calls `RPC_SCOPE + CLIENT_INIT` and reads a
`clientId` (and `clientVersion`) off the returned `SessionInfo`. Every other
RPC call carries that `clientId` in its body. Critically, per the RStudio
source comments around this: **"Before `client_init` completes, the client
has no client id, and the session answers any other request with
`INVALID_CLIENT_ID`."** — i.e. `console_input` cannot be called cold; a
`clientId` has to come from somewhere first.

**⚠️ LIVE — two ways to get a `clientId`, with different risk profiles:**

1. **Read it off the live page's own already-initialized client.** The page
   that's already open has already done its own `client_init` and is holding
   a `clientId` somewhere reachable from an isolated-world content script —
   most likely a GWT-internal JS object, not a `window` global (GWT doesn't
   export application state to `window` by default — confirmed absence from
   the wiki's own JS-interop section, which only documents GWT *calling out*
   to JS libraries like Ace, not exposing itself). If it isn't reachable this
   way, the fallback is to sniff it off a real RPC request the page has
   already made — visible in DevTools' Network tab (request body), unlike
   MATLAB's connector prefix, which was visible in Resource Timing (URLs
   only). A content script can't read another request's body after the fact,
   only its own `fetch`/`XHR` calls — so this means either intercepting via
   a `fetch`/`XHR` monkey-patch installed early (MAIN-world territory) or
   falling to option 2.
2. **Call `client_init` ourselves.** Since it's exempted from the
   `clientId`-hold (`client_init`, `auth_status`, and `abort` "go straight
   out"), this endpoint doesn't need one to call — it's how you get one. The
   open question is the **side effect**: does a second `client_init` on the
   same session's cookies register a *second* logical client (harmless,
   RStudio supports multiple browser tabs on one session), or does it
   disturb the visible tab's own connection (e.g. if the server treats the
   newest `client_init` as authoritative for `get_events` delivery)? This is
   exactly the kind of thing that needs a live check before being built on —
   §6.3.

### 2.4 `console_input` — submitting a line of R

```java
consoleInput(String consoleInput, String consoleId, int flags,
             ServerRequestCallback<VoidResponse> requestCallback)
```

Sent as `POST rpc/console_input` with `params = [consoleInput, consoleId,
flags]`. `consoleInput` is the R source text (this is exactly the line a
human would have typed and hit Enter on — multi-statement input separated by
`\n` works the same as pasting multiple lines into the Console). `consoleId`
identifies *which* console when a session has more than one (the R Markdown
notebook chunk console, a Python/reticulate console, etc.) — **⚠️ LIVE
(§6.4)**: the default/main R console's id needs reading off the page (most
likely empty string or a fixed sentinel; RStudio's source wasn't reachable
far enough in this pass to confirm the exact value — the DOM fallback in §3
sidesteps needing it at all, since the visible Console's Ace instance already
knows which console it is). `flags` is an undocumented bitmask in the
excerpt read here — **⚠️ LIVE (§6.4)**: the safe default is `0` (plain
input, no special echo/history suppression), confirmed by observing a real
`console_input` call's `flags` value in the Network tab.

The response itself is just an ack (`VoidResponse`) — **the actual output
does not come back in the RPC response.** It arrives later, asynchronously,
as one or more `console_output` (etc.) events delivered through the
`get_events` long-poll (§2.1), the same as it does for the human typing at
the keyboard. This is the one place RStudio's model is *harder* than
MATLAB's `Eval`/`EvalResponse` (which is a single synchronous round trip):
**two behaviours are available, not one**, and which one this extension gets
depends on which `clientId` the call carries (§2.3):

- **Submit with the *live page's own* `clientId`** (if reachable) → RStudio's
  own already-running `get_events` loop receives the output and renders it in
  the visible Console pane, **exactly as if the user had typed it and pressed
  Enter**. Ninebark doesn't need to parse anything — the human sees the real
  result in the real Console. This is the best outcome and the one this repo
  is built toward by default.
- **Submit with a *freshly self-issued* `clientId`** (§2.3 option 2) → this
  extension's own `get_events` long-poll (which it would then also have to
  run) receives the events instead, needing to parse `console_output`/
  `console_write_output`/`console_error`/`console_prompt` events itself to
  extract text — closer to MATLAB's `EvalResponse` parsing, and it's an open
  question whether the visible Console pane shows anything at all in this
  case (it might: RStudio may deliver output to *every* registered client for
  a session, or only the most-recently-initialized one — **⚠️ LIVE §6.3**).

### 2.5 Ace: the Source editor, and the Console input line, are the same library

RStudio's Console input line, and every open Source file, are genuine **Ace
editor** instances (`edu.ycp...`/`org.rstudio...AceEditor.java` wraps the
real `ace.js`, per RStudio's own wiki: "RStudio consumes the Ace text editor
... using JSNI ... or JSInterop"). Ace's own, stable, public convention is
that `ace.edit(domNode)` stashes the live `Editor` instance on the DOM node
it was created from: `domNode.env.editor`. This is not an RStudio-specific
API and has been the same across Ace versions for years — the standard way
any web app embedding Ace exposes its editor instances to outside code, used
by browser extensions and userscripts against many unrelated Ace-based sites.
**⚠️ LIVE (§6.5)** confirms this holds for RStudio's specific bundling of
Ace (RStudio vendors it under `src/gwt/lib/ace3` — a possible, if unlikely,
place for a modified `ace.edit()` that skips the `.env` stash).

Calling the *real* Ace API — `editor.insert(text)` / `editor.session.insert(pos,
text)` — rather than synthetic keystrokes matters for exactly the reason it
mattered for Overleaf's CodeMirror and didn't matter (in the end) for
Sheets: **RStudio's GWT wrapper listens to the same Ace instance's own
`change` event** (that's how AceEditor.java's GWT wrapper stays in sync with
its own Java-side model, marks a document dirty, drives autosave, etc.), so
a real Ace API call fires the identical event a keystroke would, and GWT's
own listener — not a synthetic-DOM approximation of one — is what notices
the edit. This is the load-bearing reason the DOM path is a legitimate
fallback here, not a repeat of Sheets' dead end.

## 3. Console execution vs. Source-editor insertion — the decision

Two write models exist among the precedents:
- **Overleaf's model:** insert real source text into a document editor, at
  the cursor, **never executed for you** — appropriate because a `.tex` file
  is a document, not a program; there's nothing to "run."
- **MATLAB's model:** submit a statement to a **live eval channel**, get a
  real result/error back — appropriate because MATLAB commands are
  computations the user wants the *answer* to, not source they're filing away.

RStudio is squarely the second case. Nearly every Ninebark-style phrase this
project handles for R ("mean of 1,2,3,4,5", "read the file data.csv",
"filter rows where age is greater than 30", "install the package ggplot2",
"summary of the data frame df") is something a person would type at the R
**Console** to get an immediate answer — not source they're drafting into a
script for later. And unlike Overleaf (no documented execution hook was ever
in scope — Overleaf doesn't run LaTeX for you either), RStudio's whole reason
for existing is a live R session sitting right there, reachable over a
documented, same-origin, cookie-authenticated RPC call (§2.4).

**So: the primary write path is Console execution** — `console_input` via
`rExecClient.ts`, same posture as `matlabExecClient.ts` (§2.4's two-tier
behaviour is handled by preferring the live page's own `clientId` and falling
back to a self-issued one only if that's unreachable, mirroring
`matlab.ts`'s frame-bridging fallback chain). It is not the Overleaf model
transplanted, because R commands aren't LaTeX source — they're meant to run.

**A secondary, source-insertion command exists for the Source editor**
specifically because RStudio also has one (open `.R` script files), and some
Ninebark phrasing is naturally about *authoring* rather than *running*
("insert a for loop", "add a function definition for square root"). For
that case, the DOM-level Ace `.env.editor` handle from §2.5 is used directly
— Overleaf's model, transplanted correctly this time, because a Source
script genuinely is a document being edited, not a value being computed. The
resolver defaults to Console execution; a leading phrase like "in the script"
/ "in the source editor" / "insert into the file" routes to the Source
editor instead (see `resolveRPhrase.ts`).

Synthetic keystrokes (typing into the Console's contenteditable/Ace surface
via fake `keydown`/`beforeinput` events) were considered and rejected as a
primary path, same reasoning as MATLAB and Overleaf: it races the editor's
own input model and gives nothing back. Unlike MATLAB's Command Window
(genuinely unknown whether synthetic typing commits at all), RStudio's is a
real Ace instance, so it's *more* likely to "work" in a narrow sense — but
the real Ace API (§2.5) is available and strictly better (fires the same
event, needs no keystroke choreography, and for the Console case the direct
RPC call is better still (returns a clean success/failure instead of nothing).

## 4. CSP / Trusted Types

**⚠️ LIVE (§6.6).** No specific evidence either way was found for RStudio
Server/Workbench/Cloud's CSP posture. Safe default, unconditional on the
answer, same reasoning as MATLAB and Sheets: build the widget in the
**isolated world**. The isolated world is exempt from the host page's CSP for
extension-authored DOM (`.innerHTML` on the widget's own shadow-DOM panel),
still has `chrome.*`, and can still do a same-origin `fetch()` carrying the
page's cookies — which is the entire write path (§2.2). No MAIN-world bridge
is needed for the RPC path. If §6.3 finds that reading the live page's
`clientId` genuinely requires a MAIN-world handle (not just Network-tab
sniffing, which an isolated-world script can also do via its own
instrumented requests), add one the same way Overleaf's `overleafBridge.ts`
and MATLAB's frame-bridging do — inject a minimal MAIN-world script,
`postMessage` the value back, no DOM rendering in it (so Trusted Types on
`.innerHTML` never touches it either way).

## 5. Auth / token brokering

**None needed**, same shape as MATLAB, for the same reason: the content
script runs **on the RStudio host itself** (`posit.cloud`, or whatever
`https://<host>:8787` a Server/Workbench deployment uses), so a same-origin
`fetch` to its own `rpc/console_input` automatically carries the session's
own cookies — `persist-auth`, `user-id`, etc. (Posit's Header and Cookie
Dictionary, §2.2). **No background service worker, no OAuth, no `identity`
permission.** The one credential-shaped thing to attach by hand is the CSRF
header (§2.2) — reading a cookie and echoing it back is not "brokering" any
more than MATLAB's nonce extraction was; there's no user setup step, no
`OAUTH_SETUP.md` equivalent.

## 6. The live test plan (run before trusting anything beyond §2's documented contract)

Open a logged-in RStudio session in a real Chrome tab — Posit Cloud
(`posit.cloud`, open or create a project) or an RStudio Server/Workbench
instance you have access to — with the R Console visible and idle. Open
DevTools, in the **top frame** (RStudio does not appear to run inside an
iframe on any of these hosts, unlike MATLAB Online — confirm this first;
if it does, the MATLAB extension's frame-bridging approach in `matlab.ts` is
the template to follow instead of what's below). Record every result back
into this file.

**6.1 — Confirm the RPC shape and base path.**
```js
// Network tab → filter "rpc" → click any request the page made on its own
// (opening/switching a file, hovering a pane, etc. triggers several).
// Note: the exact request URL (confirms the base path / whether it's under
// a per-session prefix like Posit Cloud's project-scoped path), the request
// headers (X-RS-CSRF-Token present? X-RS-RID?), and the request body
// (method / params / clientId / clientVersion field names, confirming or
// correcting §2.2).
```

**6.2 — CSRF cookie readability.**
```js
document.cookie.split('; ').filter(c => /csrf/i.test(c))
// Expect to see "rs-csrf-token=..." (or "csrf-token=..." on an older
// deployment). If this is EMPTY despite a csrf header appearing in 6.1's
// captured request, the cookie is HttpOnly and unreadable from any content
// script world — record this; it would force falling back to the DOM path
// (§3's Source-editor / Console-Ace insertion) for everything, since no
// world could authenticate a same-origin RPC POST.
```

**6.3 — `clientId` reachability and `client_init` side effects.**
```js
// (a) Can the live page's own clientId be read without calling client_init
//     again? Try instrumenting BEFORE any RPC fires (a fresh reload), e.g.
//     wrapping window.fetch / XMLHttpRequest.prototype.open in a MAIN-world
//     script injected at document_start, and logging the body of the first
//     "rpc/client_init" call's RESPONSE (not just request) as it passes
//     through. Record whether this is feasible from an isolated-world
//     content script alone, or needs the MAIN-world bridge from §4.
// (b) If (a) isn't practical quickly, call client_init cold instead:
const r = await fetch(location.origin + '/rpc/client_init', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json',
             'X-RS-CSRF-Token': document.cookie.match(/rs-csrf-token=([^;]+)/)?.[1] ?? '' },
  body: JSON.stringify({ method: 'client_init', params: [], kwparams: {} }),
})
console.log(r.status, await r.json())
// Record: does this succeed? What clientId comes back? Does the ORIGINAL
// tab's own Console/UI show ANY disruption (a reload prompt, a "session in
// use elsewhere" warning, a stall)? This determines whether self-issuing a
// clientId (§2.3 option 2) is safe to build on, or whether reaching the
// page's OWN clientId (option 1) is required.
```

**6.4 — `console_input` end to end (the key test).**
```js
// Using whichever clientId 6.3 produced:
const CSRF = document.cookie.match(/rs-csrf-token=([^;]+)/)?.[1] ?? ''
const CLIENT_ID = '<from 6.3>'
const r = await fetch(location.origin + '/rpc/console_input', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-RS-CSRF-Token': CSRF },
  body: JSON.stringify({
    method: 'console_input',
    params: ['6*7', '', 0],
    kwparams: {},
    clientId: CLIENT_ID,
  }),
})
console.log(r.status, await r.json())
// Record: HTTP status; RPC-level error (an "error" field) vs a plain ack;
// and — the important part — does "42" (or ">" prompt + echoed input +
// "[1] 42") appear in the VISIBLE Console pane on screen, without this
// script doing anything else? If yes with the page's own clientId: this is
// the whole write path, done. If it silently succeeds but nothing appears
// on screen, this extension also needs to run get_events itself — see 6.4b.
```
```js
// 6.4b — only if 6.4 acked but nothing appeared on screen: what do this
// session's OWN get_events look like?
const r2 = await fetch(location.origin + '/rpc/get_events', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type': 'application/json', 'X-RS-CSRF-Token': CSRF },
  body: JSON.stringify({ method: 'get_events', params: [-1], kwparams: {}, clientId: CLIENT_ID }),
})
console.log(r2.status, await r2.json())
// Record the shape of the returned events array — field names for the event
// type (kConsoleWriteOutput etc.) and its payload (which key holds the text).
```

**6.5 — Ace editor DOM handle (the Source-insertion / fallback path).**
```js
[...document.querySelectorAll('.ace_editor')].map(el => ({
  id: el.id, hasEnv: !!el.env, hasEditor: !!el.env?.editor,
  isConsole: el.closest('#rstudio_console_input') != null || /console/i.test(el.id || ''),
}))
// Click into the Console input line first, then re-run. Then click into an
// open Source (.R) file's editor and re-run. Record: does .env.editor exist
// on each? For one of them, try a real insert and watch for it to appear
// AND for the tab title to gain the "unsaved changes" dot (Source) or for
// it to behave like a typed character (Console):
const ed = document.querySelector('.ace_editor').env.editor
ed.insert('1 + 1')
```

**6.6 — CSP / Trusted Types.**
```js
document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || 'no CSP meta'
try { const d = document.createElement('div'); d.innerHTML = '<b>x</b>'; console.log('innerHTML OK') }
catch (e) { console.log('innerHTML BLOCKED', e.message) }
window.trustedTypes ? 'Trusted Types present' : 'no Trusted Types'
```

**6.7 — Confirm no iframe.**
```js
window.top === window   // expect true on all three web editions
```

## 7. Recommendation, and what each outcome means for the build

| §6 result | `rExecClient.ts` | Widget world | Background worker | manifest |
|---|---|---|---|---|
| 6.4 acks AND output appears in the visible Console using a self-issued `clientId` (no disruption in 6.3b) | same-origin `fetch` POST `console_input` with a self-issued `clientId`; no need to parse `get_events` at all | isolated | none | `matches` on the deployment's host(s); see below |
| 6.4 acks but output only appears using the PAGE's own `clientId` (6.3a required) | as above, but `clientId` must be read via the MAIN-world instrumentation from §6.3a | isolated widget + MAIN bridge (read-only, no rendering) | none | + MAIN-world entry |
| 6.4 acks with a self-issued `clientId`, but nothing appears anywhere (needs 6.4b) | POST `console_input`, then poll `get_events` ourselves and parse `kConsoleWriteOutput`/`kConsoleWriteError`/`kConsolePrompt`, correlating by order (matches MATLAB's parse-defensively posture) | isolated | none | as above |
| 6.2 shows the CSRF cookie is `HttpOnly` (unreadable) | RPC path is dead — fall to **Ace `.env.editor` insert** into the Console line as the primary path (real API call, not synthetic keys — §2.5); it can insert but not reliably auto-submit, so the widget shows a "press Enter to run" nudge, same fail-loud posture as MATLAB's Command-Window fallback row | isolated (+ MAIN if `.env` needs a MAIN-world read) | none | as above |
| 6.5 shows `.ace_editor` elements have no `.env.editor` (RStudio patched Ace's bundling) | the DOM fallback (and thus the Source-insertion command, §3) is dead too; Console execution via RPC (rows above) becomes the *only* path — still fine if 6.4 works | as above | none | as above |
| 6.7 shows RStudio runs inside an iframe on some host | adapt MATLAB's frame-discovery/bridging approach (`all_frames`, `postMessage` relay) rather than assuming top-frame | as above | none | `all_frames: true` |
| nothing in §6 works from a content script (RPC dead, cookie unreadable, Ace unreachable) | **stop. Report it.** Do not fall back to trying to drive RStudio Desktop instead — see Status. | — | — | — |

Default assumption going in, to be confirmed: **row 1 or row 2** — isolated-
world widget, no background worker, `rExecClient.ts` is a thin `fetch`
client around `rpc/console_input` (+ a one-time `client_init` if the page's
own `clientId` isn't reachable), unrecognized/failed submissions surface a
clear error in the widget log (fail-loud, never a silent wrong result), same
as every other Ninebark interface. `manifest.json`'s `matches` covers
`https://posit.cloud/*` plus a generic RStudio Server/Workbench pattern —
these are self-hosted at operator-chosen hostnames, so (like Sheets' and
MATLAB's host lists, which are each a single fixed vendor domain) this is the
one part of the manifest a self-hosted user may need to widen for their own
host; documented in `extension/README.md`.

## Sources

- RStudio (Posit), `rstudio/rstudio` — GWT client source:
  - `src/gwt/src/org/rstudio/core/client/jsonrpc/RpcRequest.java` (request/
    response envelope, headers):
    <https://github.com/rstudio/rstudio/blob/master/src/gwt/src/org/rstudio/core/client/jsonrpc/RpcRequest.java>
  - `src/gwt/src/org/rstudio/studio/client/server/remote/RemoteServer.java`
    (`consoleInput`, `clientInit`, `RPC_SCOPE`, the `client_init` hold):
    <https://github.com/rstudio/rstudio/blob/main/src/gwt/src/org/rstudio/studio/client/server/remote/RemoteServer.java>
    (mirror used for full-text read: javatips.net/api/rstudio-master)
  - PR discussion confirming the `client_init`/`clientId` hold-until-ready
    behaviour: <https://github.com/rstudio/rstudio/pull/18802>
- RStudio wiki — architecture:
  - "GWT (Google Web Toolkit)": RPC via `RemoteServer.java`, server-pushed
    events via long-polled `get_events`, JSNI/JSInterop as the *only*
    direction RStudio's JS interop goes (GWT calling Ace/xterm.js, not the
    reverse):
    <https://github.com/rstudio/rstudio/wiki/GWT-(Google-Web-Toolkit)>
  - "A Beginner's Guide to Writing RStudio IDE Features":
    <https://github.com/rstudio/rstudio/wiki/A-Beginner's-Guide-to-Writing-RStudio-IDE-Features>
  - "Electron Desktop" (RStudio Desktop 2022.12+ ships the same GWT sources
    as Server, in an Electron shell around a local `rsession`):
    <https://github.com/rstudio/rstudio/wiki/Electron-Desktop>
- DeepWiki structured index over `rstudio/rstudio` — "Console and Terminal"
  (`ConsolePane`/`Shell`/`ShellWidget`/`VirtualConsole`, the Console input
  line as an `AceEditor` instance, `kConsoleWriteInput`/`kConsoleWriteOutput`/
  `kConsoleWriteError`/`kConsolePrompt` event names):
  <https://deepwiki.com/rstudio/rstudio/7.2-console-and-terminal>
- Posit — **Header and Cookie Dictionary** (first-party, authoritative on the
  `rs-csrf-token` / `X-RS-CSRF-Token` pair and the legacy `csrf-token` /
  `X-CSRF-Token` pair for pre-2022.09 deployments):
  <https://docs.posit.co/ide/server-pro/reference/header_cookie_dictionary.pdf>
- Posit Support — product differences (RStudio Desktop / RStudio Server /
  Posit Workbench / Posit Cloud):
  <https://support.posit.co/hc/en-us/articles/217799198-What-is-the-difference-between-RStudio-Desktop-RStudio-Posit-Workbench-RStudio-Server-and-Posit-Cloud>
- Ace editor — the `ace.edit(el)` → `el.env.editor` convention (stable public
  API, not RStudio-specific): <https://ace.c9.io/>,
  <https://github.com/ajaxorg/ace>
- Ninebark-MATLABExtension's `EXECUTION.md` and Ninebark-OverleafExtension's
  `EDITOR_ACCESS.md` — the two structural precedents this document follows.
