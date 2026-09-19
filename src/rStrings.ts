// ── R-native: string / text operations ──────────────────────────────────
// "concatenate 'a' and 'b'", "the length of the string 'hello'", "convert x
// to uppercase", "split 'a,b,c' by comma", "replace 'a' with 'b' in x",
// "trim whitespace from x" — R's string functions have their own, easy to
// forget names (nchar not length, paste0 not concat, gsub not replace) that
// are exactly the kind of "how do I type this" gap Ninebark-OverleafExtension
// leans into for LaTeX; this is the R analogue.

const QUOTED = /['"“”](.*?)['"“”]/

function rStr(raw: string): string {
  return `"${raw.replace(/"/g, '\\"')}"`
}

// Either a quoted literal ("the string 'hello'") or a bare identifier
// (a variable already holding a string) — used throughout this file so both
// "the length of the string 'hello'" and "the length of x" work.
function operand(raw: string): string | null {
  const q = QUOTED.exec(raw)
  if (q) return rStr(q[1])
  const bare = raw.trim()
  if (/^[A-Za-z][\w.]*$/.test(bare)) return bare
  return null
}

function tryConcat(text: string): string | null {
  const m = text.match(/^concatenate\s+(.+?)\s+and\s+(.+)$/i)
  if (!m) return null
  const a = operand(m[1]), b = operand(m[2])
  if (!a || !b) return null
  return `paste0(${a}, ${b})`
}

function tryJoinWith(text: string): string | null {
  // "join 'a','b','c' with a comma" / "join a and b with a space"
  const m = text.match(/^join\s+(.+?)\s+with\s+(?:a\s+)?(.+)$/i)
  if (!m) return null
  const parts = m[1].split(/\s*,\s*|\s+and\s+/i).map(operand)
  if (parts.some(p => p === null)) return null
  const sepWord = m[2].trim().toLowerCase()
  const sep = sepWord === 'comma' ? ', ' : sepWord === 'space' ? ' ' : sepWord === 'a newline' || sepWord === 'newline' ? '\\n'
    : QUOTED.exec(m[2])?.[1] ?? m[2].trim()
  return `paste(${parts.join(', ')}, sep = ${rStr(sep)})`
}

function tryLength(text: string): string | null {
  const m = text.match(/^(?:the\s+)?length\s+of\s+(?:the\s+string\s+)?(.+)$/i)
  if (!m) return null
  const s = operand(m[1])
  if (!s) return null
  return `nchar(${s})`
}

function tryCase(text: string): string | null {
  let m = text.match(/^(?:convert|change|make)\s+(.+?)\s+(?:to\s+|into\s+)?uppercase$/i)
  if (m) { const s = operand(m[1]); return s ? `toupper(${s})` : null }
  m = text.match(/^(?:convert|change|make)\s+(.+?)\s+(?:to\s+|into\s+)?lowercase$/i)
  if (m) { const s = operand(m[1]); return s ? `tolower(${s})` : null }
  m = text.match(/^capitalize\s+(.+)$/i)
  if (m) {
    const s = operand(m[1])
    if (!s) return null
    return `paste0(toupper(substring(${s}, 1, 1)), substring(${s}, 2))`
  }
  return null
}

function trySplit(text: string): string | null {
  const m = text.match(/^split\s+(.+?)\s+by\s+(.+)$/i)
  if (!m) return null
  const s = operand(m[1])
  if (!s) return null
  const sepWord = m[2].trim().toLowerCase()
  const sep = sepWord === 'comma' || sepWord === 'commas' ? ',' : sepWord === 'space' || sepWord === 'spaces' ? ' '
    : QUOTED.exec(m[2])?.[1] ?? m[2].trim()
  return `strsplit(${s}, ${rStr(sep)})`
}

function tryReplace(text: string): string | null {
  const m = text.match(/^replace\s+(.+?)\s+with\s+(.+?)\s+in\s+(.+)$/i)
  if (!m) return null
  const from = operand(m[1]), to = operand(m[2]), s = operand(m[3])
  if (!from || !to || !s) return null
  return `gsub(${from}, ${to}, ${s}, fixed = TRUE)`
}

function tryTrim(text: string): string | null {
  const m = text.match(/^trim\s+(?:the\s+)?(?:whitespace\s+from\s+)?(.+?)$/i)
  if (!m) return null
  const s = operand(m[1])
  if (!s) return null
  return `trimws(${s})`
}

function trySubstring(text: string): string | null {
  // "characters 2 to 5 of 'hello world'" / "the substring of x from 2 to 5"
  let m = text.match(/^characters?\s+(\d+)\s+(?:to|through)\s+(\d+)\s+of\s+(.+)$/i)
  if (m) { const s = operand(m[3]); return s ? `substring(${s}, ${m[1]}, ${m[2]})` : null }
  m = text.match(/^(?:the\s+)?substring\s+of\s+(.+?)\s+from\s+(\d+)\s+to\s+(\d+)$/i)
  if (m) { const s = operand(m[1]); return s ? `substring(${s}, ${m[2]}, ${m[3]})` : null }
  return null
}

function tryContains(text: string): string | null {
  const m = text.match(/^does\s+(.+?)\s+contain\s+(.+?)\??$/i)
  if (!m) return null
  const s = operand(m[1]), needle = operand(m[2])
  if (!s || !needle) return null
  return `grepl(${needle}, ${s}, fixed = TRUE)`
}

function tryReverse(text: string): string | null {
  const m = text.match(/^reverse\s+(?:the\s+string\s+)?(.+)$/i)
  if (!m) return null
  const s = operand(m[1])
  if (!s) return null
  return `paste(rev(strsplit(${s}, "")[[1]]), collapse = "")`
}

export function recognizeStrings(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryConcat(text) ??
    tryJoinWith(text) ??
    tryLength(text) ??
    tryCase(text) ??
    trySplit(text) ??
    tryReplace(text) ??
    tryTrim(text) ??
    trySubstring(text) ??
    tryContains(text) ??
    tryReverse(text)
  )
}
