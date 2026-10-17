// ── R-native: sampling, diagnostics, and research workflows ────────────────
// "set the random seed to 123", "bootstrap the median of income 1,000
// times", "calculate Cohen's d for the difference in score between
// treatment and control", "save the cleaned dataset as cleaned_data.csv"
// — the "running a study" vocabulary: reproducibility, resampling, effect
// sizes, reliability, dimensionality reduction, and saving your work.
// Base R for everything except effect size/reliability/dimensionality
// reduction, which have no base-R equivalent at all and go through
// `effsize::`/`psych::`, namespaced rather than preceded by `library()`,
// same convention as every other optional package elsewhere in this repo.

function rStr(raw: string): string {
  return `"${raw.trim().replace(/^['"]|['"]$/g, '').replace(/"/g, '\\"')}"`
}

const IDENT = String.raw`[A-Za-z][\w.]*`
const FILE = String.raw`[\w./\\ -]+?\.\w+`
// "the treatment and control groups" always refers to THIS problem set's
// own established two-level `treatment` column — same narrow, literal
// match as rStatisticalTests.ts's TREATMENT_CONTROL, not a generic "group
// A and group B" parser (duplicated here per this project's convention of
// keeping each file self-contained rather than cross-importing small
// shared fragments).
const TREATMENT_CONTROL = String.raw`(?:the\s+)?treatment\s+and\s+control(?:\s+groups?)?`

// ── 91. Setting the random seed ─────────────────────────────────────────
function trySetSeed(text: string): string | null {
  const m = text.match(/^set\s+(?:the\s+)?random\s+seed\s+to\s+(-?\d+)$/i)
  if (m) return `set.seed(${m[1]})`
  const m2 = text.match(/^set\s+(?:the\s+)?seed\s+to\s+(-?\d+)$/i)
  if (m2) return `set.seed(${m2[1]})`
  return null
}

// ── 92. Random sample of rows ───────────────────────────────────────────
function tryRandomSampleRows(text: string): string | null {
  let m = text.match(/^draw\s+a\s+random\s+sample\s+of\s+(\d+)\s+rows?\s+from\s+(?:the|my|this)\s+dataset$/i)
  if (m) return `df[sample(nrow(df), ${m[1]}), ]`
  m = text.match(/^sample\s+(\d+)\s+rows?\s+from\s+(?:the|my|this)\s+dataset$/i)
  if (m) return `df[sample(nrow(df), ${m[1]}), ]`
  m = text.match(/^a\s+random\s+sample\s+of\s+(\d+)\s+rows?\s+(?:of|from)\s+df$/i)
  if (m) return `df[sample(nrow(df), ${m[1]}), ]`
  return null
}

// ── 93. Train/test split ────────────────────────────────────────────────
function tryTrainTestSplit(text: string): string | null {
  const m = text.match(/^split\s+(?:the|my|this)\s+dataset\s+into\s+(\d+)%?\s+training\s+(?:data|set)\s+and\s+\d+%?\s+test(?:ing)?\s+(?:data|set)$/i)
  if (!m) return null
  const trainFrac = Number(m[1]) / 100
  return `train_idx <- sample(nrow(df), ${trainFrac} * nrow(df)); train_data <- df[train_idx, ]; test_data <- df[-train_idx, ]`
}

// ── 94. Bootstrapping a statistic ───────────────────────────────────────
function tryBootstrapStatistic(text: string): string | null {
  const m = text.match(new RegExp(`^bootstrap\\s+the\\s+(mean|median)\\s+of\\s+(${IDENT})\\s+([\\d,]+)\\s+times$`, 'i'))
  if (!m) return null
  const stat = m[1].toLowerCase()
  const n = m[3].replace(/,/g, '')
  return `boot_${stat}s <- replicate(${n}, ${stat}(sample(df$${m[2]}, replace = TRUE), na.rm = TRUE))`
}

// ── 95. Bootstrap confidence interval ───────────────────────────────────
// Self-contained (recomputes its own bootstrap distribution inline) rather
// than assuming item 94's boot_medians already exists — unlike
// rRegression.ts's "the existing model," this phrase doesn't say "using
// the bootstrap from before," and a fresh 1,000-replicate resample is
// cheap enough that there's no real cost to never relying on prior state.
function tryBootstrapCI(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+bootstrap\\s+95%?\\s*confidence\\s+interval\\s+for\\s+the\\s+(mean|median)\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  const stat = m[1].toLowerCase()
  return `quantile(replicate(1000, ${stat}(sample(df$${m[2]}, replace = TRUE), na.rm = TRUE)), c(0.025, 0.975))`
}

// ── 96. Cohen's d ────────────────────────────────────────────────────────
function tryCohensD(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?cohen'?s?\\s+d\\s+for\\s+the\\s+difference\\s+in\\s+(${IDENT})\\s+between\\s+${TREATMENT_CONTROL}$`, 'i'))
  if (!m) return null
  return `effsize::cohen.d(df$${m[1]}[df$treatment == "treatment"], df$${m[1]}[df$treatment == "control"])`
}

// ── 97. Cronbach's alpha ─────────────────────────────────────────────────
// "q1 through q10" -> a shared prefix ("q") plus a numeric range, built
// into paste0(prefix, lo:hi) rather than spelling out all ten column names
// — the same "don't force the user to type a 10-item list when the
// pattern is obvious" reasoning as rDataCleaning.ts's bulk column-name
// standardization.
function tryCronbachAlpha(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?cronbach'?s?\\s+alpha\\s+for\\s+(?:questionnaire\\s+)?items?\\s+(${IDENT})\\s+(?:through|to)\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  const lo = m[1].match(/^([A-Za-z_]+)(\d+)$/)
  const hi = m[2].match(/^([A-Za-z_]+)(\d+)$/)
  if (!lo || !hi || lo[1].toLowerCase() !== hi[1].toLowerCase()) return null
  return `psych::alpha(df[, paste0(${rStr(lo[1])}, ${lo[2]}:${hi[2]})])`
}

// ── 98. Principal component analysis ────────────────────────────────────
// prcomp()'s own `scale. = TRUE` IS "standardizing them" — centering AND
// scaling to unit variance before the PCA, exactly what the trailing
// clause asks for, not a separate step.
function tryPCA(text: string): string | null {
  // "run " is stripped by resolveRPhrase.ts's stripRLeadVerb() before this
  // ever sees the text (same gotcha class as stripFiller, different
  // function — see CLAUDE.md), so the lead has to be optional here too.
  if (/^(?:run\s+)?(?:a\s+)?(?:principal\s+component\s+analysis|pca)\s+on\s+all\s+numeric\s+variables(?:\s+after\s+standardizing\s+them)?$/i.test(text)) {
    return 'prcomp(df[sapply(df, is.numeric)], scale. = TRUE)'
  }
  return null
}

// ── 99. Saving the cleaned dataset ──────────────────────────────────────
// Distinct from rDataImport.ts's tryWriteFile ("write df to output.csv"),
// which requires a bare variable name right after the verb — "the cleaned
// dataset" isn't one, so the two patterns don't collide; this one reuses
// the DATA_REF-style "a generic dataset reference defaults to df"
// convention instead.
function trySaveCleanedDataset(text: string): string | null {
  const m = text.match(new RegExp(`^save\\s+(?:the\\s+|my\\s+|this\\s+)?(?:cleaned\\s+|current\\s+)?dataset\\s+as\\s+(${FILE})$`, 'i'))
  if (!m) return null
  const ext = m[1].split('.').pop()!.toLowerCase()
  if (ext === 'rds') return `saveRDS(df, ${rStr(m[1])})`
  return `write.csv(df, ${rStr(m[1])}, row.names = FALSE)`
}

// ── 100. Saving the session's commands as a script ──────────────────────
// savehistory() is the honest base-R equivalent of "save everything I
// typed so far" — it writes the actual Console command history, not a
// reconstruction this stateless pipeline has no way to assemble (it never
// sees more than one phrase at a time; see rRegression.ts's header for
// the same constraint).
function trySaveHistory(text: string): string | null {
  const m = text.match(/^save\s+(?:all\s+)?(?:the\s+)?analysis\s+steps\s+(?:performed\s+)?so\s+far\s+(?:in|as|to)\s+an?\s+R\s+script\s+called\s+([\w.]+)$/i)
  if (!m) return null
  return `savehistory(${rStr(m[1])})`
}

export function recognizeResearchWorkflow(rawText: string): string | null {
  const text = rawText.trim()
  return (
    trySetSeed(text) ??
    tryRandomSampleRows(text) ??
    tryTrainTestSplit(text) ??
    tryBootstrapStatistic(text) ??
    tryBootstrapCI(text) ??
    tryCohensD(text) ??
    tryCronbachAlpha(text) ??
    tryPCA(text) ??
    trySaveCleanedDataset(text) ??
    trySaveHistory(text)
  )
}
