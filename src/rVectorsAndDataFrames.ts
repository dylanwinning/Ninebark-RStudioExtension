// ── R-native: bare vectors and data-frame skeletons ─────────────────────────
// "a vector of 1,2,3", "a data frame with columns x and y" — building new
// vector/data-frame values from scratch. Importing data (rDataImport.ts),
// inspecting it (rDataInspection.ts), and cleaning/reshaping an existing one
// (filter/select/sort/rename — rDataCleaning.ts) are split into their own
// files; this one just owns "make me a fresh one of these."

// "a vector of 1,2,3,4" / "a vector containing 1,2,3" / "c(1,2,3) as x" —
// the plain-numeric-list case only; anything with a name or computed values
// goes through rAssignment.ts + formalToR.ts instead ("let x be a vector of
// 1,2,3" already works via that path). This recognizer exists for the
// bare, unnamed form typed straight at the console.
function tryBareVector(text: string): string | null {
  const m = text.match(/^(?:a\s+)?vector\s+(?:of|containing|with)\s+([\d.,\s-]+(?:and[\d.,\s-]+)?)$/i)
  if (!m) return null
  const nums = m[1].split(/\s*(?:,|and)\s*/i).map(s => s.trim()).filter(Boolean)
  if (nums.length === 0 || !nums.every(n => /^-?\d+\.?\d*$/.test(n))) return null
  return `c(${nums.join(', ')})`
}

// "a data frame with columns x and y" / "an empty data frame with columns
// name, age" — a ready-to-fill skeleton, same "give me the shape, I'll fill
// it in" idea as Ninebark-OverleafExtension's environment skeletons.
function tryDataFrameSkeleton(text: string): string | null {
  const m = text.match(/^(?:a\s+|an\s+empty\s+)?data\s*frame\s+with\s+columns?\s+((?:[A-Za-z]\w*)(?:\s*(?:,|and)\s*[A-Za-z]\w*)*)$/i)
  if (!m) return null
  const cols = m[1].split(/\s*(?:,|and)\s*/i).map(c => c.trim())
  return `data.frame(${cols.map(c => `${c} = c()`).join(', ')})`
}

export function recognizeVectorsAndDataFrames(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryBareVector(text) ??
    tryDataFrameSkeleton(text)
  )
}
