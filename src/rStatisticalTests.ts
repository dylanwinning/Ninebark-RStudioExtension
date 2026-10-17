// ── R-native: statistical tests and inference ───────────────────────────
// "test whether the mean score differs from 50 using a one-sample
// t-test", "compare the mean score between the treatment and control
// groups using an independent-samples t-test", "test whether treatment
// and outcome are associated using a chi-squared test" — the classical
// hypothesis-testing vocabulary, all base R (t.test/wilcox.test/
// prop.test/chisq.test/fisher.test/aov/TukeyHSD/kruskal.test — no package
// needed for any of it, genuinely rare for a stats vocabulary this wide).
//
// Several of this category's literal examples name a grouping variable
// only abstractly ("two independent groups", "the group means following
// the ANOVA") with no actual column in the sentence — unlike every other
// category so far, there is no df/DATA_REF to fall back to here, because
// there's no sensible default for "which column is the group" the way
// "df" is a sensible default for "which data frame." Guessing a column
// name would risk a silent wrong test; declining outright would lose a
// real, common request. The resolution, consistent with
// rDataImport.ts's tryGenericDelimitedNoFilename and rPlotting.ts's
// trySaveDevice: emit the correct call SHAPE with an obviously-fake
// placeholder identifier and a trailing comment naming exactly what to
// replace. Phrasings that DO name a real grouping variable ("between the
// treatment and control groups", naming this problem set's own
// established `treatment` column) get the fully-resolved call with no
// placeholder at all.

const IDENT = String.raw`[A-Za-z][\w.]*`

const GROUP_PH = 'group_column'
const GROUP_NOTE = `  # replace "${GROUP_PH}" with your actual grouping column`
const SUCCESS_PH = 'success_column'
const SUCCESS_NOTE = `  # replace "${SUCCESS_PH}" with your actual success/failure column`

// "treatment and control groups" always refers to THIS problem set's own
// established two-level `treatment` column (already the grouping
// variable in several earlier categories' examples) — a narrow, literal
// match for that one recurring phrase, not a generic "group A and group
// B" parser (which would have no reliable way to turn two arbitrary level
// names into a column name for any other pair of words).
const TREATMENT_CONTROL = String.raw`(?:the\s+)?treatment\s+and\s+control\s+groups?`

// ── 66. One-sample t-test ───────────────────────────────────────────────
function tryOneSampleTTest(text: string): string | null {
  let m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+differs?\\s+from\\s+(-?[\\d.]+)\\s+using\\s+a\\s+one[\\s-]sample\\s+t[\\s-]?test$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[2]})`
  m = text.match(new RegExp(`^(?:a\\s+)?one[\\s-]sample\\s+t[\\s-]?test\\s+(?:for|of)\\s+(${IDENT})\\s+against\\s+(-?[\\d.]+)$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[2]})`
  return null
}

// ── Shapiro-Wilk normality test ─────────────────────────────────────────
// "test whether score is normally distributed" / "a shapiro-wilk test
// for score" / "check if income is normally distributed" — not part of
// the original 14-item category, but normality checking is one of the
// most common things taught right alongside t-tests/ANOVA (both assume
// it), so a t-test vocabulary this wide having no way to actually test
// that assumption was the gap.
function tryShapiroTest(text: string): string | null {
  let m = text.match(new RegExp(`^(?:test|check)\\s+(?:whether|if)\\s+(${IDENT})\\s+is\\s+normally\\s+distributed$`, 'i'))
  if (m) return `shapiro.test(df$${m[1]})`
  m = text.match(new RegExp(`^(?:a\\s+)?shapiro-?wilk\\s+test\\s+(?:for|of|on)\\s+(${IDENT})$`, 'i'))
  if (m) return `shapiro.test(df$${m[1]})`
  return null
}

// ── 67. Independent-samples t-test (Student's — equal variance) ────────
function tryIndependentTTest(text: string): string | null {
  let m = text.match(new RegExp(`^compare\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+between\\s+${TREATMENT_CONTROL}\\s+using\\s+an?\\s+independent[\\s-]samples?\\s+t[\\s-]?test$`, 'i'))
  if (m) return `t.test(${m[1]} ~ treatment, data = df, var.equal = TRUE)`
  m = text.match(new RegExp(`^compare\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+between\\s+two\\s+independent\\s+groups?\\s+using\\s+an?\\s+independent[\\s-]samples?\\s+t[\\s-]?test$`, 'i'))
  if (m) return `t.test(${m[1]} ~ ${GROUP_PH}, data = df, var.equal = TRUE)${GROUP_NOTE}`
  return null
}

// ── 68. Welch's t-test (unequal variance — R's own default, spelled out explicitly) ─
function tryWelchTTest(text: string): string | null {
  let m = text.match(new RegExp(`^compare\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+between\\s+${TREATMENT_CONTROL}\\s+using\\s+welch'?s?\\s+t[\\s-]?test$`, 'i'))
  if (m) return `t.test(${m[1]} ~ treatment, data = df, var.equal = FALSE)`
  m = text.match(new RegExp(`^compare\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+between\\s+two\\s+independent\\s+groups?\\s+using\\s+welch'?s?\\s+t[\\s-]?test$`, 'i'))
  if (m) return `t.test(${m[1]} ~ ${GROUP_PH}, data = df, var.equal = FALSE)${GROUP_NOTE}`
  return null
}

// ── 69. Paired t-test ────────────────────────────────────────────────────
function tryPairedTTest(text: string): string | null {
  const m = text.match(new RegExp(`^compare\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+using\\s+a\\s+paired\\s+t[\\s-]?test$`, 'i'))
  if (!m) return null
  return `t.test(df$${m[1]}, df$${m[2]}, paired = TRUE)`
}

// ── 70. Wilcoxon rank-sum test (= Mann-Whitney U) ──────────────────────
function tryWilcoxonRankSum(text: string): string | null {
  let m = text.match(new RegExp(`^compare\\s+(${IDENT})\\s+between\\s+${TREATMENT_CONTROL}\\s+using\\s+an?\\s+wilcoxon\\s+rank[\\s-]sum\\s+test$`, 'i'))
  if (m) return `wilcox.test(${m[1]} ~ treatment, data = df)`
  m = text.match(new RegExp(`^compare\\s+(${IDENT})\\s+between\\s+two\\s+independent\\s+groups?\\s+using\\s+an?\\s+wilcoxon\\s+rank[\\s-]sum\\s+test$`, 'i'))
  if (m) return `wilcox.test(${m[1]} ~ ${GROUP_PH}, data = df)${GROUP_NOTE}`
  m = text.match(new RegExp(`^compare\\s+(${IDENT})\\s+between\\s+two\\s+independent\\s+groups?\\s+using\\s+(?:a\\s+|the\\s+)?mann[\\s-]whitney\\s+(?:u\\s+)?test$`, 'i'))
  if (m) return `wilcox.test(${m[1]} ~ ${GROUP_PH}, data = df)${GROUP_NOTE}`
  return null
}

// ── 71. 95% CI for a mean ───────────────────────────────────────────────
function tryCIForMean(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+95%?\\s*confidence\\s+interval\\s+for\\s+the\\s+mean\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `t.test(df$${m[1]})$conf.int`
}

// ── 72. 95% CI for a difference in means ────────────────────────────────
function tryCIForDiffMeans(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+95%?\\s*confidence\\s+interval\\s+for\\s+the\\s+difference\\s+in\\s+mean\\s+(${IDENT})\\s+between\\s+treatment\\s+and\\s+control$`, 'i'))
  if (!m) return null
  return `t.test(${m[1]} ~ treatment, data = df)$conf.int`
}

// ── 73. One-sample proportion test ──────────────────────────────────────
function tryOneSampleProp(text: string): string | null {
  const m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(?:the\\s+)?proportion\\s+of\\s+success(?:es)?\\s+(?:differs?\\s+from|equals?)\\s+([\\d.]+)$`, 'i'))
  if (!m) return null
  return `prop.test(sum(df$${SUCCESS_PH}), nrow(df), p = ${m[1]})${SUCCESS_NOTE}`
}

// ── 74. Two-proportion test ──────────────────────────────────────────────
function tryTwoProportionTest(text: string): string | null {
  const m = text.match(new RegExp(`^compare\\s+success\\s+rates?\\s+between\\s+${TREATMENT_CONTROL}\\s+using\\s+a\\s+two[\\s-]proportion\\s+test$`, 'i'))
  if (!m) return null
  return `prop.test(table(df$treatment, df$${SUCCESS_PH}))${SUCCESS_NOTE}`
}

// ── 75. Chi-squared test of association ─────────────────────────────────
function tryChiSquared(text: string): string | null {
  const m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+are\\s+associated\\s+using\\s+a\\s+chi[\\s-]?squared?\\s+test$`, 'i'))
  if (!m) return null
  return `chisq.test(table(df$${m[1]}, df$${m[2]}))`
}

// ── 76. Fisher's exact test ──────────────────────────────────────────────
function tryFisherExact(text: string): string | null {
  const m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+are\\s+associated\\s+using\\s+fisher'?s?\\s+exact\\s+test$`, 'i'))
  if (!m) return null
  return `fisher.test(table(df$${m[1]}, df$${m[2]}))`
}

// ── 77. One-way ANOVA ────────────────────────────────────────────────────
function tryOneWayAnova(text: string): string | null {
  let m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+mean\\s+(${IDENT})\\s+differs?\\s+across\\s+(${IDENT})\\s+groups?\\s+using\\s+a\\s+one[\\s-]way\\s+anova$`, 'i'))
  if (m) return `summary(aov(${m[1]} ~ ${m[2]}, data = df))`
  m = text.match(new RegExp(`^(?:a\\s+)?one[\\s-]way\\s+anova\\s+(?:for|of)\\s+(${IDENT})\\s+(?:by|across)\\s+(${IDENT})(?:\\s+groups?)?$`, 'i'))
  if (m) return `summary(aov(${m[1]} ~ ${m[2]}, data = df))`
  return null
}

// ── 78. Tukey's HSD post-hoc test ───────────────────────────────────────
function tryTukeyHSD(text: string): string | null {
  let m = text.match(new RegExp(`^(?:perform\\s+)?tukey'?s?\\s+hsd\\s+(?:post[\\s-]hoc\\s+)?test\\s+(?:for|of)\\s+(${IDENT})\\s+(?:by|across)\\s+(${IDENT})(?:\\s+groups?)?$`, 'i'))
  if (m) return `TukeyHSD(aov(${m[1]} ~ ${m[2]}, data = df))`
  if (/^perform\s+tukey'?s?\s+hsd\s+post[\s-]hoc\s+test\s+to\s+compare\s+the\s+group\s+means\s+following\s+the\s+anova$/i.test(text)) {
    return `TukeyHSD(aov(y_column ~ ${GROUP_PH}, data = df))  # replace "y_column" and "${GROUP_PH}" with the outcome/grouping columns from your ANOVA`
  }
  return null
}

// ── 79. Kruskal-Wallis test ──────────────────────────────────────────────
function tryKruskalWallis(text: string): string | null {
  let m = text.match(new RegExp(`^compare\\s+(${IDENT})\\s+across\\s+(${IDENT})\\s+groups?\\s+using\\s+the\\s+kruskal[\\s-–]wallis\\s+test$`, 'i'))
  if (m) return `kruskal.test(${m[1]} ~ ${m[2]}, data = df)`
  m = text.match(new RegExp(`^(?:a\\s+)?kruskal[\\s-–]wallis\\s+test\\s+(?:for|of)\\s+(${IDENT})\\s+(?:by|across)\\s+(${IDENT})(?:\\s+groups?)?$`, 'i'))
  if (m) return `kruskal.test(${m[1]} ~ ${m[2]}, data = df)`
  return null
}

export function recognizeStatisticalTests(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryOneSampleTTest(text) ??
    tryShapiroTest(text) ??
    tryIndependentTTest(text) ??
    tryWelchTTest(text) ??
    tryPairedTTest(text) ??
    tryWilcoxonRankSum(text) ??
    tryCIForMean(text) ??
    tryCIForDiffMeans(text) ??
    tryOneSampleProp(text) ??
    tryTwoProportionTest(text) ??
    tryChiSquared(text) ??
    tryFisherExact(text) ??
    tryOneWayAnova(text) ??
    tryTukeyHSD(text) ??
    tryKruskalWallis(text)
  )
}
