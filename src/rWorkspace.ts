// ── R-native: workspace, session, and packages ──────────────────────────────
// "clear the workspace", "remove x", "list the variables", "save the
// workspace to file.RData", "load file.RData", "set the working directory
// to ~/proj", "install the package ggplot2", "load the package dplyr",
// "get help on mean". Pure R session housekeeping — the MATLAB analogue
// (matlabWorkspace.ts) covers similar ground with different verbs/commands
// (clc/clear/who/format have no R equivalent; R's equivalents — rm/ls/
// options() — are spelled and behave differently enough to need their own
// recognizers, not a port).

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const RDATA_FILE = String.raw`[\w./\\ -]+?\.(?:RData|rda)`
const PKG_NAME = String.raw`[A-Za-z][\w.]*`

function tryClear(text: string): string | null {
  if (/^(?:clear(?:\s+all)?(?:\s+(?:the\s+)?variables?)?|clear\s+(?:the\s+)?workspace|remove\s+(?:all\s+)?(?:the\s+)?(?:variables?|objects?)|wipe\s+the\s+workspace|start\s+(?:with\s+)?a\s+(?:clean|fresh)\s+(?:workspace|slate|environment))$/i.test(text)) {
    return 'rm(list = ls())'
  }
  // "clear x" / "remove x and y" / "rm x, y, z" — a comma/"and"-separated
  // list of bare identifiers, anchored. The structure alone rules out
  // "clear the plot" (space, not a separator). "remove duplicates" is
  // deliberately excluded here even though it's structurally identical —
  // it's rDataCleaning.ts's "remove duplicate rows" vocabulary, and a
  // workspace variable actually named "duplicates" is a vanishingly rare
  // coincidence next to that much more common meaning.
  const m = text.match(/^(?:clear|remove|rm|delete)\s+((?:[A-Za-z][\w.]*)(?:\s*(?:,|and)\s*[A-Za-z][\w.]*)*)(?:\s+from\s+the\s+workspace)?$/i)
  if (m) {
    const names = m[1].split(/\s*(?:,|and)\s*/i).map(s => s.trim()).filter(Boolean)
    if (names.length > 0 && names.every(n => /^[A-Za-z][\w.]*$/.test(n)) && !names.some(n => /^(?:all|duplicates?)$/i.test(n))) {
      return `rm(${names.join(', ')})`
    }
  }
  return null
}

function tryConsole(text: string): string | null {
  if (/^(?:clear\s+the\s+console|clear\s+the\s+screen|cls)$/i.test(text)) return 'cat("\\014")' // clears the RStudio Console pane (Ctrl+L's own escape)
  return null
}

function tryList(text: string): string | null {
  if (/^(?:list\s+(?:the\s+)?variables?|list\s+the\s+workspace|what\s+variables\s+(?:are\s+)?(?:defined|in\s+the\s+workspace)|show\s+(?:me\s+)?the\s+variables?|show\s+the\s+workspace|what'?s\s+in\s+the\s+(?:workspace|environment))$/i.test(text)) {
    return 'ls()'
  }
  if (/^(?:describe\s+the\s+workspace|show\s+the\s+workspace\s+in\s+detail|list\s+(?:the\s+)?variables?\s+with\s+(?:details|structure))$/i.test(text)) {
    return 'ls.str()'
  }
  return null
}

function tryWd(text: string): string | null {
  // Written to match after stripFiller has already dropped a leading
  // "what is the"/"the" (see rControlFlow.ts's translateBody comment on the
  // same effect) — so "working directory" alone is matched too, not just
  // the full "what is the working directory" a person actually typed.
  if (/^(?:(?:what\s+is\s+|show\s+|print\s+)?(?:the\s+)?working\s+directory|current\s+directory)\??$/i.test(text)) return 'getwd()'
  const m = text.match(/^set\s+the\s+working\s+directory\s+to\s+(.+)$/i) ?? text.match(/^(?:change|switch)\s+(?:the\s+)?(?:working\s+)?directory\s+to\s+(.+)$/i)
  if (m) return `setwd(${rStr(m[1])})`
  return null
}

function tryPackages(text: string): string | null {
  // "install the package ggplot2" / "install ggplot2 and dplyr" / "install.packages('ggplot2')" (raw passthrough handled upstream)
  let m = text.match(new RegExp(`^install\\s+(?:the\\s+packages?\\s+)?((?:${PKG_NAME})(?:\\s*(?:,|and)\\s*${PKG_NAME})*)$`, 'i'))
  if (m) {
    const pkgs = m[1].split(/\s*(?:,|and)\s*/i).map(s => s.trim()).filter(Boolean)
    return pkgs.length === 1 ? `install.packages(${rStr(pkgs[0])})` : `install.packages(c(${pkgs.map(rStr).join(', ')}))`
  }
  // "load the package dplyr" / "library dplyr" / "use the tidyverse package" / "require ggplot2"
  m = text.match(new RegExp(`^(?:load\\s+the\\s+package|library|use\\s+the\\s+package|require\\s+the\\s+package|require|use)\\s+(${PKG_NAME})(?:\\s+package)?$`, 'i'))
  if (m) return `library(${m[1]})`
  // "is the package dplyr installed" / "check if ggplot2 is installed"
  m = text.match(new RegExp(`^(?:is\\s+the\\s+package\\s+(${PKG_NAME})\\s+installed|check\\s+if\\s+(${PKG_NAME})\\s+is\\s+installed)\\??$`, 'i'))
  if (m) return `requireNamespace(${rStr(m[1] ?? m[2])}, quietly = TRUE)`
  // "update all packages" / "update my packages"
  if (/^update\s+(?:all\s+)?(?:my\s+|the\s+)?packages$/i.test(text)) return 'update.packages(ask = FALSE)'
  // "list the loaded packages" / "what packages are loaded"
  if (/^(?:list\s+the\s+loaded\s+packages|what\s+packages\s+are\s+loaded|show\s+(?:me\s+)?(?:the\s+)?loaded\s+packages)$/i.test(text)) {
    return '(.packages())'
  }
  return null
}

function trySave(text: string): string | null {
  // "save x and y to vars.RData"
  let m = text.match(new RegExp(`^save\\s+((?:[A-Za-z][\\w.]*)(?:\\s*(?:,|and)\\s*[A-Za-z][\\w.]*)*)\\s+(?:to|as|in|into)\\s+(${RDATA_FILE})$`, 'i'))
  if (m) {
    const names = m[1].split(/\s*(?:,|and)\s*/i).map(s => s.trim()).filter(Boolean)
    if (names.length > 0 && names.every(n => /^[A-Za-z][\w.]*$/.test(n)) && !/^(?:the|everything|all|workspace)$/i.test(names[0])) {
      return `save(${names.join(', ')}, file = ${rStr(m[2])})`
    }
  }
  // "save the workspace to file.RData" / "save everything as data.RData"
  m = text.match(new RegExp(`^save\\s+(?:the\\s+workspace|everything|all(?:\\s+variables?)?|the\\s+environment)\\s+(?:to|as|in|into)\\s+(${RDATA_FILE})$`, 'i'))
  if (m) return `save.image(file = ${rStr(m[1])})`
  // "save to file.RData"
  m = text.match(new RegExp(`^save\\s+(?:to|as|in|into)\\s+(${RDATA_FILE})$`, 'i'))
  if (m) return `save.image(file = ${rStr(m[1])})`
  return null
}

function tryLoad(text: string): string | null {
  const m = text.match(new RegExp(`^load\\s+(?:(?:the\\s+)?(?:data|workspace)\\s+from\\s+)?(${RDATA_FILE})$`, 'i'))
  if (m) return `load(${rStr(m[1])})`
  return null
}

function tryHelp(text: string): string | null {
  // "get help on mean" / "help with mean" / "what does mean do" / "show the documentation for mean"
  const m = text.match(/^(?:get\s+help\s+(?:on|with|for)|help\s+(?:on|with|for)|show\s+(?:the\s+)?(?:documentation|docs|help)\s+for|what\s+does)\s+([A-Za-z][\w.]*)(?:\s+do)?\??$/i)
  if (m) return `help(${m[1]})`
  return null
}

function trySessionInfo(text: string): string | null {
  if (/^(?:session\s+info|what\s+version\s+of\s+r\s+am\s+i\s+running|show\s+(?:the\s+)?session\s+info(?:rmation)?)\??$/i.test(text)) return 'sessionInfo()'
  if (/^(?:what\s+version\s+of\s+r\s+is\s+this|r\s+version)\??$/i.test(text)) return 'R.version.string'
  return null
}

export function recognizeWorkspace(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryConsole(text) ??
    tryClear(text) ??
    tryList(text) ??
    tryWd(text) ??
    tryPackages(text) ??
    trySave(text) ??
    tryLoad(text) ??
    tryHelp(text) ??
    trySessionInfo(text)
  )
}
