// ── Shared floating widget UI ────────────────────────────────────────────────
// One implementation used by every interface's content script (content.ts
// for Desmos, sheets.ts for Google Sheets, and whatever comes next) — the
// widget itself has zero interface-specific logic; each content script
// supplies its own example phrases and its own submit handling.
//
// The "interface" dropdown in the header reflects reality rather than
// controlling it: a content script only ever runs on the site its
// manifest.json entry matches, so there's no way for, say, the Desmos
// content script to actually operate on a Sheets tab. Picking a DIFFERENT
// interface in the dropdown reverts the selection and explains that,
// instead of pretending to switch.

export interface InterfaceInfo {
  id: string
  label: string
}

export interface ExampleGroup {
  title: string
  examples: string[]
}

export interface OverlayHandles {
  form: HTMLFormElement
  input: HTMLInputElement
  setExamplesOpen: (open: boolean) => void
  logEntry: (rawInput: string, statusText: string, ok: boolean, details?: string) => void
}

const STYLES = `
  :host { all: initial; }
  * { box-sizing: border-box; font-family: system-ui, sans-serif; }
  .nb-root { position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }

  .nb-fab {
    width: 52px; height: 52px; border-radius: 50%; border: none; cursor: pointer;
    background: #2f7a4f; box-shadow: 0 4px 14px rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: center; padding: 0;
  }
  .nb-fab img { width: 28px; height: 28px; display: block; }
  .nb-fab:hover { background: #235c3b; }

  .nb-panel {
    width: 360px; max-width: calc(100vw - 40px); max-height: 70vh;
    background: #fafaf8; border: 1px solid #dde3df; border-radius: 12px;
    box-shadow: 0 8px 28px rgba(0,0,0,0.22); display: flex; flex-direction: column; overflow: hidden;
  }
  .nb-panel[hidden] { display: none; }

  .nb-header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fff; border-bottom: 1px solid #dde3df; }
  .nb-header a { display: flex; align-items: center; gap: 6px; text-decoration: none; color: #1f2a24; flex-shrink: 0; }
  .nb-header img { width: 20px; height: 20px; display: block; }
  .nb-header .nb-word { font-weight: 700; font-size: 13.5px; }
  .nb-header-spacer { flex: 1; }
  .nb-interface-select {
    font-size: 11.5px; color: #235c3b; background: #e8f5ec; border: 1px solid #cfe6d6;
    border-radius: 6px; padding: 3px 6px; cursor: pointer; max-width: 110px;
  }
  .nb-close { background: none; border: none; color: #5b675f; font-size: 16px; cursor: pointer; padding: 2px 6px; border-radius: 6px; line-height: 1; }
  .nb-close:hover { background: #e8f5ec; color: #235c3b; }

  .nb-form { display: flex; gap: 6px; padding: 10px 12px; }
  .nb-input {
    flex: 1; min-width: 0; font-size: 14px; padding: 8px 10px;
    border: 1.5px solid #dde3df; border-radius: 8px; color: #1f2a24;
  }
  .nb-input:focus { outline: none; border-color: #2f7a4f; box-shadow: 0 0 0 3px #e8f5ec; }
  .nb-form button[type="submit"] {
    flex-shrink: 0; font-size: 13.5px; font-weight: 600; padding: 8px 14px;
    border: none; border-radius: 8px; background: #2f7a4f; color: #fff; cursor: pointer;
  }
  .nb-form button[type="submit"]:hover { background: #235c3b; }

  .nb-examples-toggle {
    margin: 0 12px 8px; align-self: flex-start; background: none; border: none; color: #5b675f;
    font-size: 12px; cursor: pointer; padding: 2px 4px; text-decoration: underline;
  }
  .nb-examples-panel[hidden] { display: none; }
  .nb-examples-panel { padding: 0 12px 10px; max-height: 220px; overflow-y: auto; border-bottom: 1px solid #dde3df; }
  .nb-example-group h4 { margin: 6px 0 4px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.04em; color: #5b675f; }
  .nb-example-chip {
    display: block; width: 100%; text-align: left; box-sizing: border-box;
    background: #fff; border: 1px solid #dde3df; border-radius: 6px;
    padding: 6px 8px; margin: 0 0 5px; font-size: 12px; font-family: ui-monospace, monospace;
    color: #1f2a24; cursor: pointer;
  }
  .nb-example-chip:hover { background: #e8f5ec; border-color: #2f7a4f; }

  .nb-log { flex: 1; min-height: 60px; max-height: 260px; overflow-y: auto; padding: 6px 12px; font-size: 12.5px; }
  .nb-log-entry { border-bottom: 1px solid #f0f0ee; }
  .nb-log-entry:last-child { border-bottom: none; }
  .nb-log-row { display: flex; align-items: flex-start; gap: 6px; padding: 5px 2px; color: #1f2a24; }
  .nb-log-row.nb-log-error { color: #b3261e; background: #fdecea; border-radius: 5px; padding-left: 5px; padding-right: 5px; }
  .nb-log-row.nb-log-info { color: #5b675f; }
  .nb-log-icon { flex-shrink: 0; font-size: 11px; line-height: 1.4; }
  .nb-log-arrow { opacity: 0.5; flex-shrink: 0; }
  .nb-log-input { font-weight: 600; flex-shrink: 0; max-width: 34%; overflow-wrap: break-word; }
  .nb-log-status { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .nb-log-toggle { flex-shrink: 0; background: none; border: none; color: #5b675f; font-size: 10.5px; text-decoration: underline; cursor: pointer; padding: 0 2px; }
  .nb-log-details { display: block; margin: 0 2px 6px 20px; padding: 4px 8px; font-family: ui-monospace, monospace; font-size: 11px; color: #5b675f; background: #f2f2ee; border-radius: 5px; overflow-wrap: anywhere; }
`

export function buildOverlay(opts: {
  currentInterface: InterfaceInfo
  allInterfaces: InterfaceInfo[]
  exampleGroups: ExampleGroup[]
  logoDataUri: string
  widgetKeyPrefix: string // localStorage key namespace — distinct per interface, so open/closed state doesn't leak between Desmos and Sheets tabs
}): OverlayHandles {
  const { currentInterface, allInterfaces, exampleGroups, logoDataUri, widgetKeyPrefix } = opts
  const openStorageKey = `${widgetKeyPrefix}-open`

  const host = document.createElement('div')
  host.id = 'ninebark-overlay-host'
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = STYLES
  shadow.appendChild(style)

  const root = document.createElement('div')
  root.className = 'nb-root'
  shadow.appendChild(root)

  // The host page (Desmos, Sheets, whatever's next) almost certainly has its
  // own GLOBAL keyboard shortcuts wired up at the document level — Desmos's
  // in particular calls preventDefault() on Space (pans the graph) and Enter
  // regardless of what element actually has focus, since its own code has no
  // reason to expect a focused, editable input that isn't one of its own.
  // A real KeyboardEvent bubbles out through the shadow boundary into the
  // page by default, so without this, typing a space or pressing Enter while
  // this widget's input is focused gets silently eaten by the host page
  // before the browser's native "insert this character"/"submit this form"
  // behavior ever runs — confirmed empirically: defaultPrevented flips from
  // false to true for those two keys specifically, exactly at the point a
  // document-level bubble listener outside this shadow tree would run.
  // Stopping propagation here, still inside the shadow tree (before it ever
  // reaches the host element/document), keeps every keystroke this widget's
  // own inputs need working, without touching the host page's own shortcuts
  // for anything happening outside this widget.
  for (const type of ['keydown', 'keypress', 'keyup']) {
    root.addEventListener(type, (e) => e.stopPropagation())
  }

  const fab = document.createElement('button')
  fab.type = 'button'
  fab.className = 'nb-fab'
  fab.setAttribute('aria-label', 'Open Ninebark')
  fab.innerHTML = `<img src="${logoDataUri}" alt="" />`
  root.appendChild(fab)

  const panel = document.createElement('div')
  panel.className = 'nb-panel'
  panel.hidden = true
  root.appendChild(panel)

  const interfaceOptionsHtml = allInterfaces
    .map(i => `<option value="${i.id}"${i.id === currentInterface.id ? ' selected' : ''}>${i.label}</option>`)
    .join('')

  panel.innerHTML = `
    <div class="nb-header">
      <a href="https://ninebark.us" target="_blank" rel="noopener noreferrer">
        <img src="${logoDataUri}" alt="" />
        <span class="nb-word">Ninebark</span>
      </a>
      <div class="nb-header-spacer"></div>
      <select class="nb-interface-select" aria-label="Interface">${interfaceOptionsHtml}</select>
      <button type="button" class="nb-close" aria-label="Close">&times;</button>
    </div>
    <form class="nb-form">
      <input class="nb-input" type="text" autocomplete="off" placeholder="Ask Ninebark to do anything…" />
      <button type="submit">Enter</button>
    </form>
    <button type="button" class="nb-examples-toggle">Examples ▾</button>
    <div class="nb-examples-panel" hidden></div>
    <div class="nb-log"></div>
  `

  const closeBtn = panel.querySelector<HTMLButtonElement>('.nb-close')!
  const form = panel.querySelector<HTMLFormElement>('.nb-form')!
  const input = panel.querySelector<HTMLInputElement>('.nb-input')!
  const interfaceSelect = panel.querySelector<HTMLSelectElement>('.nb-interface-select')!
  const examplesToggle = panel.querySelector<HTMLButtonElement>('.nb-examples-toggle')!
  const examplesPanel = panel.querySelector<HTMLDivElement>('.nb-examples-panel')!
  const log = panel.querySelector<HTMLDivElement>('.nb-log')!

  for (const group of exampleGroups) {
    const groupEl = document.createElement('div')
    groupEl.className = 'nb-example-group'
    const h4 = document.createElement('h4')
    h4.textContent = group.title
    groupEl.appendChild(h4)
    for (const example of group.examples) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'nb-example-chip'
      chip.textContent = example
      chip.addEventListener('click', () => {
        input.value = example
        form.requestSubmit()
      })
      groupEl.appendChild(chip)
    }
    examplesPanel.appendChild(groupEl)
  }

  function setOpen(open: boolean): void {
    panel.hidden = !open
    fab.setAttribute('aria-label', open ? 'Close Ninebark' : 'Open Ninebark')
    try { localStorage.setItem(openStorageKey, open ? '1' : '0') } catch { /* ignore */ }
    if (open) input.focus()
  }
  fab.addEventListener('click', () => setOpen(panel.hidden))
  closeBtn.addEventListener('click', () => setOpen(false))

  function escapeHtml(s: string): string {
    const div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
  }

  function logEntry(rawInput: string, statusText: string, ok: boolean, details?: string): void {
    const entry = document.createElement('div')
    entry.className = 'nb-log-entry'

    const row = document.createElement('div')
    row.className = 'nb-log-row' + (ok ? '' : ' nb-log-error')
    const icon = ok ? '✓' : '⚠'
    row.innerHTML =
      `<span class="nb-log-icon" aria-hidden="true">${icon}</span>` +
      `<span class="nb-log-input">${escapeHtml(rawInput)}</span>` +
      `<span class="nb-log-arrow">→</span>` +
      `<span class="nb-log-status">${escapeHtml(statusText)}</span>`
    entry.appendChild(row)

    if (details) {
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'nb-log-toggle'
      toggle.textContent = 'Show formula'
      const detailsEl = document.createElement('code')
      detailsEl.className = 'nb-log-details'
      detailsEl.textContent = details
      detailsEl.style.display = 'none'
      toggle.addEventListener('click', () => {
        const showing = detailsEl.style.display !== 'none'
        detailsEl.style.display = showing ? 'none' : 'block'
        toggle.textContent = showing ? 'Show formula' : 'Hide formula'
      })
      row.appendChild(toggle)
      entry.appendChild(detailsEl)
    }
    log.prepend(entry)
  }

  // Picking a DIFFERENT interface than the one this content script actually
  // runs on can't do anything real — there's no cross-tab reach here — so
  // it reverts the selection and explains, via the same log a real command
  // would use, rather than a silent no-op or a fake mode switch.
  interfaceSelect.addEventListener('change', () => {
    if (interfaceSelect.value === currentInterface.id) return
    const picked = allInterfaces.find(i => i.id === interfaceSelect.value)
    const row = document.createElement('div')
    row.className = 'nb-log-entry'
    row.innerHTML = `<div class="nb-log-row nb-log-info"><span class="nb-log-icon" aria-hidden="true">ℹ</span><span class="nb-log-status">This tab is ${escapeHtml(currentInterface.label)} — open ${escapeHtml(picked?.label ?? 'that interface')} to use it there.</span></div>`
    log.prepend(row)
    interfaceSelect.value = currentInterface.id
  })

  function setExamplesOpen(open: boolean): void {
    examplesPanel.hidden = !open
    if (open) { setOpen(true); examplesPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }) }
  }
  examplesToggle.addEventListener('click', () => setExamplesOpen(examplesPanel.hidden))

  document.body.appendChild(host)

  let startOpen = false
  try { startOpen = localStorage.getItem(openStorageKey) === '1' } catch { /* ignore */ }
  if (startOpen) setOpen(true)

  return { form, input, setExamplesOpen, logEntry }
}
