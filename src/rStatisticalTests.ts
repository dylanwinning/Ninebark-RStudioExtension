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
// "groups?" is OPTIONAL — "between treatment and control" (no "groups"
// at all) is just as natural as "between the treatment and control
// groups," and rResearchWorkflow.ts's own later copy of this same
// constant already had to make it optional for exactly that reason
// (Cohen's d's own literal example omits "groups"); carried back here
// so this file's phrasings accept the same range.
const TREATMENT_CONTROL = String.raw`(?:the\s+)?treatment\s+and\s+control(?:\s+groups?)?`

// "greater"/"less" — the ONE decision every one-tailed test problem
// actually hinges on, and the single most common place an intro-stats
// student gets stuck: which tail to put the whole test's p-value in.
const GT_LT = String.raw`(greater|less)\s+than`
function directionWord(word: string): string {
  return /^greater$/i.test(word) ? 'greater' : 'less'
}

// ── 66. One-sample t-test ───────────────────────────────────────────────
// Two-sided ("differs from") and one-sided ("is greater/less than" — the
// classic one-tailed-vs-two-tailed fork) both covered, including the
// textbook "test the claim that..." framing for the directional form.
function tryOneSampleTTest(text: string): string | null {
  let m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+differs?\\s+from\\s+(-?[\\d.]+)(?:\\s+using\\s+a\\s+one[\\s-]sample\\s+t[\\s-]?test)?$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[2]})`
  m = text.match(new RegExp(`^(?:a\\s+)?one[\\s-]sample\\s+t[\\s-]?test\\s+(?:for|of)\\s+(${IDENT})\\s+against\\s+(-?[\\d.]+)$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[2]})`
  m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+is\\s+${GT_LT}\\s+(-?[\\d.]+)(?:\\s+using\\s+a\\s+one[\\s-](?:sample|tailed)\\s+t[\\s-]?test)?$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[3]}, alternative = "${directionWord(m[2])}")`
  m = text.match(new RegExp(`^test\\s+the\\s+claim\\s+that\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+is\\s+${GT_LT}\\s+(-?[\\d.]+)$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[3]}, alternative = "${directionWord(m[2])}")`
  m = text.match(new RegExp(`^is\\s+the\\s+mean\\s+(${IDENT})\\s+${GT_LT}\\s+(-?[\\d.]+)\\??$`, 'i'))
  if (m) return `t.test(df$${m[1]}, mu = ${m[3]}, alternative = "${directionWord(m[2])}")`
  // "test whether the mean age IS 30" — the same two-sided null
  // hypothesis as "differs from 30" (is H0: mu = 30 true?), just phrased
  // as a direct equality rather than its negation.
  m = text.match(new RegExp(`^test\\s+(?:whether|if)\\s+(?:the\\s+)?mean\\s+(${IDENT})\\s+is\\s+(-?[\\d.]+)$`, 'i'))
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

// "test whether before_score and after_score are different" / "is there a
// difference between before_score and after_score" — these never SAY
// "paired," the common source of paired-vs-independent confusion, but a
// `before_X`/`after_X` naming pair is as strong and narrow a signal as
// this project's own `treatment` column convention elsewhere in this
// file: only fires when both identifiers share the exact same suffix
// after their prefix, never a generic "are X and Y different" guess.
function tryBeforeAfterPaired(text: string): string | null {
  let m = text.match(/^test\s+(?:whether|if)\s+before_(\w+)\s+and\s+after_(\w+)\s+(?:are\s+different|differ)$/i)
  if (!m) m = text.match(/^is\s+there\s+a\s+difference\s+between\s+before_(\w+)\s+and\s+after_(\w+)$/i)
  if (!m || m[1].toLowerCase() !== m[2].toLowerCase()) return null
  return `t.test(df$before_${m[1]}, df$after_${m[2]}, paired = TRUE)`
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

// t.test()'s own default conf.level IS 0.95, so the 95% case omits the
// argument entirely (cleaner, still exactly correct) — everyone ASSUMES
// 95% is the only option a stats tool offers; every other level needs
// the argument spelled out explicitly.
function confLevelArg(level: number): string {
  return level === 95 ? '' : `, conf.level = ${level / 100}`
}

// ── 71. Confidence interval for a mean (any level, not just 95%) ───────
function tryCIForMean(text: string): string | null {
  let m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+(\\d+)%?\\s*confidence\\s+interval\\s+for\\s+the\\s+mean\\s+(${IDENT})$`, 'i'))
  if (m) return `t.test(df$${m[2]}${confLevelArg(Number(m[1]))})$conf.int`
  // "the mean" dropped entirely — "a 90% confidence interval for income"
  // (context alone implies the mean; nothing else a bare CI request
  // could mean for a single numeric column).
  m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+(\\d+)%?\\s*confidence\\s+interval\\s+for\\s+(${IDENT})$`, 'i'))
  if (m) return `t.test(df$${m[2]}${confLevelArg(Number(m[1]))})$conf.int`
  return null
}

// ── 72. Confidence interval for a difference in means (any level) ──────
function tryCIForDiffMeans(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+(\\d+)%?\\s*confidence\\s+interval\\s+for\\s+the\\s+difference\\s+in\\s+mean\\s+(${IDENT})\\s+between\\s+treatment\\s+and\\s+control$`, 'i'))
  if (!m) return null
  return `t.test(${m[2]} ~ treatment, data = df${confLevelArg(Number(m[1]))})$conf.int`
}

// ── Confidence interval for a proportion (not a test — just the interval) ─
// prop.test()'s own conf.level default is ALSO 0.95.
function tryCIForProportion(text: string): string | null {
  let m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+(\\d+)%?\\s*confidence\\s+interval\\s+for\\s+a\\s+proportion\\s+of\\s+([\\d.]+)\\s+from\\s+a\\s+sample\\s+of\\s+(\\d+)$`, 'i'))
  if (m) return `prop.test(round(${m[2]} * ${m[3]}), ${m[3]}${confLevelArg(Number(m[1]))})$conf.int`
  m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+(\\d+)%?\\s*confidence\\s+interval\\s+for\\s+the\\s+proportion\\s+of\\s+success(?:es)?$`, 'i'))
  if (m) return `prop.test(sum(df$${SUCCESS_PH}), nrow(df)${confLevelArg(Number(m[1]))})$conf.int${SUCCESS_NOTE}`
  return null
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

// Confidence interval for the DIFFERENCE in proportions — rounds out the
// "CI for X" family (mean, difference in means, a single proportion)
// with the one combination of "difference" and "proportion" together
// that was still missing. prop.test() on a 2x2 table ALREADY reports
// $conf.int for p1 - p2 by default (confirmed against real R, not
// assumed), so this reuses the exact same table() call as the two-
// proportion TEST above and just reads a different field off it.
function tryCIForDiffProportions(text: string): string | null {
  const m = text.match(new RegExp(`^(?:calculate\\s+)?a\\s+(\\d+)%?\\s*confidence\\s+interval\\s+for\\s+the\\s+difference\\s+in\\s+(?:proportions|success\\s+rates)\\s+between\\s+${TREATMENT_CONTROL}$`, 'i'))
  if (!m) return null
  return `prop.test(table(df$treatment, df$${SUCCESS_PH})${confLevelArg(Number(m[1]))})$conf.int${SUCCESS_NOTE}`
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

// Textbook/homework problems are rarely phrased as cleanly as this
// file's own patterns — "AT THE 0.05 SIGNIFICANCE LEVEL, is there
// SUFFICIENT EVIDENCE TO CONCLUDE THAT the mean differs from 50" says
// the exact same thing as "test whether the mean differs from 50," just
// wrapped in the surrounding words a problem statement actually uses.
// The significance-level clause is discarded, not parsed — it's not an
// argument to t.test() at all, just the threshold the student compares
// the reported p-value to afterward, by hand, once R has it.
function stripTextbookWrapper(text: string): string {
  let t = text
  t = t.replace(/^at\s+the\s+(?:\d+(?:\.\d+)?%|0?\.\d+)\s+(?:significance\s+)?level,?\s+/i, '')
  t = t.replace(/,?\s+at\s+the\s+(?:\d+(?:\.\d+)?%|0?\.\d+)\s+(?:significance\s+)?level$/i, '')
  t = t.replace(/^is\s+there\s+(?:sufficient|enough)\s+evidence\s+to\s+conclude\s+that\s+/i, 'test whether ')
  t = t.replace(/^conduct\s+a\s+hypothesis\s+test\s+to\s+determine\s+whether\s+/i, 'test whether ')
  return t.trim()
}

function tryAllStatisticalTests(text: string): string | null {
  return (
    tryOneSampleTTest(text) ??
    tryShapiroTest(text) ??
    tryIndependentTTest(text) ??
    tryWelchTTest(text) ??
    tryPairedTTest(text) ??
    tryBeforeAfterPaired(text) ??
    tryWilcoxonRankSum(text) ??
    tryCIForMean(text) ??
    tryCIForDiffMeans(text) ??
    tryCIForProportion(text) ??
    tryOneSampleProp(text) ??
    tryTwoProportionTest(text) ??
    tryCIForDiffProportions(text) ??
    tryChiSquared(text) ??
    tryFisherExact(text) ??
    tryOneWayAnova(text) ??
    tryTukeyHSD(text) ??
    tryKruskalWallis(text)
  )
}

export function recognizeStatisticalTests(rawText: string): string | null {
  const text = rawText.trim()
  return tryAllStatisticalTests(text) ?? tryAllStatisticalTests(stripTextbookWrapper(text))
}
