// ── Ninebark for RStudio — background service worker ───────────────────
// Posit Cloud / rstudio.cloud get the widget automatically, declared in
// manifest.json's own content_scripts entry — no click needed, per the
// README's "no setup" promise.
//
// RStudio Server and Posit Workbench are self-hosted on whatever domain
// the customer put them on (https://your-host:8787/, https://workbench.
// internal/, ...) — there's no fixed hostname pattern to list in
// manifest.json, and listing <all_urls>/http(s)://*/* to cover every
// possible one would ask for "read and change all your data on all
// websites" at install time, a Chrome Web Store review flag this
// extension has no reason to trigger. activeTab + chrome.scripting is
// the standard alternative for exactly this shape of problem: no host
// permission is granted ahead of time, and clicking the toolbar icon
// grants this one tab, for this one click, just long enough to inject
// the same content script bundle Posit Cloud gets automatically.
//
// __ninebarkRStudioMounted (checked inside rstudio.ts itself — see that
// file) makes this idempotent: clicking the icon again on a tab that's
// already active (including a Posit Cloud tab, which didn't need the
// click at all) is a no-op instead of mounting a second widget.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ['dist/rstudio.js'],
  })
})
