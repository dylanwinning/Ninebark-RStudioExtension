// ── R-native: regression and modeling ───────────────────────────────────
// "regress score on study_hours using linear regression", "add age as an
// additional predictor to the existing regression model", "fit a logistic
// regression predicting outcome from age, income, and treatment" — base R
// modeling (lm/glm/predict/confint/update/plot.lm), plus `car::vif()` for
// variance inflation factors (no base-R equivalent).
//
// Several of this category's phrasings ("the EXISTING regression model",
// "the logistic regression model") only make sense as a continuation of
// an EARLIER command — but every recognizer in this project is stateless,
// resolving one phrase at a time with no memory of what ran before (same
// constraint rPlotting.ts's trySaveDevice already lives with: "re-run
// your plot command here" rather than pretending to remember it). Rather
// than decline every follow-on request, this file adopts a fixed,
// predictable variable name for exactly what each phrasing implies it's
// building on — `model` for the ordinary linear fit (lm), `logit_model`
// for the logistic one (glm) — the same idea as this project's
// established `df` convention for "my dataset"/"it", just for a model
// object instead of a data frame. A command that builds on "the existing
// regression model" (update(), confint(), predict(), plot(model, ...))
// assumes `model` already exists in the session from an earlier command
// in THIS file's own vocabulary (item 80/81) — same honest "you still
// have to have run the setup" posture as every other follow-on command
// elsewhere in this project.

const IDENT = String.raw`[A-Za-z][\w.]*`
const LIST_SEP = String.raw`\s*,\s*(?:and\s+)?|\s+and\s+`
const IDENT_LIST = String.raw`${IDENT}(?:(?:${LIST_SEP})${IDENT})*`

function splitIdentList(raw: string): string[] {
  return raw.split(new RegExp(LIST_SEP, 'i')).map(s => s.trim()).filter(Boolean)
}

// ── 80. Simple linear regression ────────────────────────────────────────
function trySimpleLinearRegression(text: string): string | null {
  let m = text.match(new RegExp(`^regress\\s+(${IDENT})\\s+on\\s+(${IDENT})(?:\\s+using\\s+(?:a\\s+)?linear\\s+regression)?$`, 'i'))
  if (m) return `model <- lm(${m[1]} ~ ${m[2]}, data = df)`
  m = text.match(new RegExp(`^(?:fit\\s+)?a\\s+linear\\s+regression\\s+(?:of|predicting)\\s+(${IDENT})\\s+(?:on|from)\\s+(${IDENT})$`, 'i'))
  if (m) return `model <- lm(${m[1]} ~ ${m[2]}, data = df)`
  // "fit a model predicting Y from X" — "a model" alone, no "linear
  // regression" qualifier at all (lm() IS the obvious, only reasonable
  // reading of a bare "model" for two numeric columns here).
  m = text.match(new RegExp(`^fit\\s+a\\s+model\\s+predicting\\s+(${IDENT})\\s+(?:on|from)\\s+(${IDENT})$`, 'i'))
  if (m) return `model <- lm(${m[1]} ~ ${m[2]}, data = df)`
  return null
}

// ── 81. Multiple linear regression ──────────────────────────────────────
function tryMultipleLinearRegression(text: string): string | null {
  let m = text.match(new RegExp(`^predict\\s+(${IDENT})\\s+using\\s+(${IDENT_LIST})\\s+in\\s+a\\s+multiple\\s+linear\\s+regression$`, 'i'))
  if (!m) m = text.match(new RegExp(`^predict\\s+(${IDENT})\\s+using\\s+(${IDENT_LIST})$`, 'i'))
  if (!m) m = text.match(new RegExp(`^regress\\s+(${IDENT})\\s+on\\s+(${IDENT_LIST})$`, 'i'))
  if (!m) m = text.match(new RegExp(`^(?:fit\\s+)?a\\s+multiple\\s+(?:linear\\s+)?regression\\s+(?:of|predicting)\\s+(${IDENT})\\s+(?:on|from|using)\\s+(${IDENT_LIST})$`, 'i'))
  if (!m) return null
  return `model <- lm(${m[1]} ~ ${splitIdentList(m[2]).join(' + ')}, data = df)`
}

// ── 82. Adding a predictor to the existing model ────────────────────────
function tryAddPredictor(text: string): string | null {
  let m = text.match(new RegExp(`^add\\s+(${IDENT})\\s+as\\s+an?\\s+(?:additional\\s+)?predictor\\s+to\\s+the\\s+(?:existing\\s+)?(?:regression\\s+)?model$`, 'i'))
  if (m) return `model <- update(model, . ~ . + ${m[1]})`
  m = text.match(new RegExp(`^(?:add|include)\\s+(${IDENT})\\s+(?:to|in)\\s+the\\s+(?:existing\\s+)?regression\\s+model$`, 'i'))
  if (m) return `model <- update(model, . ~ . + ${m[1]})`
  return null
}

// ── 83. Adding an interaction term ──────────────────────────────────────
// Uses "*" (not just ":") so the two main effects are also guaranteed
// present — R's formula algebra de-duplicates automatically if either is
// already in the model, and this phrase never actually confirms both
// main effects were added first.
function tryAddInteraction(text: string): string | null {
  const m = text.match(new RegExp(`^(?:add|include)\\s+an?\\s+interaction(?:\\s+term)?\\s+between\\s+(${IDENT})\\s+and\\s+(${IDENT})\\s+(?:to|in)\\s+the\\s+(?:regression\\s+)?model$`, 'i'))
  if (!m) return null
  return `model <- update(model, . ~ . + ${m[1]}*${m[2]})`
}

// ── 84. Confidence intervals for the coefficients ───────────────────────
function tryCIForCoefficients(text: string): string | null {
  if (/^(?:calculate\s+)?95%?\s*confidence\s+intervals?\s+for\s+(?:all\s+)?(?:the\s+)?(?:regression\s+)?(?:model\s+)?coefficients$/i.test(text)) return 'confint(model)'
  if (/^(?:calculate\s+)?(?:the\s+)?confidence\s+intervals?\s+for\s+the\s+(?:regression\s+)?(?:model\s+)?coefficients$/i.test(text)) return 'confint(model)'
  return null
}

// ── 85. Predicted values from the fitted model ──────────────────────────
function tryPredictedValues(text: string): string | null {
  const m = text.match(new RegExp(`^generate\\s+predicted\\s+(?:${IDENT}\\s+)?values\\s+for\\s+observations\\s+in\\s+(?:my|the|this)\\s+dataset$`, 'i'))
  if (m) return 'predict(model)'
  if (/^(?:the\s+)?predicted\s+values\s+(?:from|for)\s+the\s+regression\s+model$/i.test(text)) return 'predict(model)'
  if (/^(?:the\s+)?fitted\s+values\s+(?:from|of|for)\s+the\s+(?:regression\s+)?model$/i.test(text)) return 'fitted(model)'
  return null
}

// ── 86. Diagnostic plots ────────────────────────────────────────────────
// plot.lm()'s which = 1 (residuals vs. fitted) and which = 2 (normal
// Q-Q) — the two diagnostics this phrase names, not the full
// default-4-plot set plot(model) alone would produce.
function tryDiagnosticPlots(text: string): string | null {
  if (/^create\s+residuals?[\s-]+(?:versus|vs\.?)[\s-]+fitted\s+and\s+q-?q\s+plots\s+for\s+the\s+regression\s+model$/i.test(text)) {
    return 'plot(model, which = 1); plot(model, which = 2)'
  }
  if (/^(?:create\s+)?diagnostic\s+plots\s+for\s+the\s+regression\s+model$/i.test(text)) {
    return 'plot(model, which = 1); plot(model, which = 2)'
  }
  return null
}

// ── 87. Logistic regression ─────────────────────────────────────────────
function tryLogisticRegression(text: string): string | null {
  let m = text.match(new RegExp(`^fit\\s+a\\s+logistic\\s+regression\\s+predicting\\s+(${IDENT})\\s+from\\s+(${IDENT_LIST})$`, 'i'))
  if (!m) m = text.match(new RegExp(`^(?:fit\\s+)?a\\s+logistic\\s+regression\\s+(?:of|predicting)\\s+(${IDENT})\\s+(?:on|from)\\s+(${IDENT_LIST})$`, 'i'))
  if (!m) m = text.match(new RegExp(`^logistic\\s+regression\\s+of\\s+(${IDENT})\\s+on\\s+(${IDENT_LIST})$`, 'i'))
  if (!m) return null
  return `logit_model <- glm(${m[1]} ~ ${splitIdentList(m[2]).join(' + ')}, data = df, family = binomial)`
}

// ── 88. Odds ratios from the logistic coefficients ──────────────────────
function tryOddsRatios(text: string): string | null {
  if (/^convert\s+the\s+logistic\s+regression\s+coefficients?\s+(?:into|to)\s+odds\s+ratios?$/i.test(text)) return 'exp(coef(logit_model))'
  if (/^(?:the\s+)?odds\s+ratios?\s+for\s+the\s+logistic\s+(?:regression\s+)?model$/i.test(text)) return 'exp(coef(logit_model))'
  if (/^(?:calculate\s+)?odds\s+ratios?\s+from\s+the\s+logistic\s+regression$/i.test(text)) return 'exp(coef(logit_model))'
  return null
}

// ── 89. Predicted probabilities from the logistic model ─────────────────
function tryPredictedProbabilities(text: string): string | null {
  if (/^(?:calculate\s+)?predicted\s+probabilit(?:y|ies)\s+for\s+each\s+observation\s+using\s+the\s+logistic\s+regression\s+model$/i.test(text)) {
    return 'predict(logit_model, type = "response")'
  }
  if (/^(?:calculate\s+)?(?:the\s+)?predicted\s+probabilit(?:y|ies)\s+(?:from|for)\s+the\s+logistic\s+(?:regression\s+)?model$/i.test(text)) {
    return 'predict(logit_model, type = "response")'
  }
  return null
}

// ── 90. Variance inflation factors ──────────────────────────────────────
function tryVIF(text: string): string | null {
  if (/^(?:calculate\s+)?variance\s+inflation\s+factors?\s+for\s+the\s+predictors?\s+in\s+(?:my|the|this)\s+regression\s+model$/i.test(text)) return 'car::vif(model)'
  if (/^(?:calculate\s+)?(?:the\s+)?(?:variance\s+inflation\s+factors?|VIF)\s+for\s+the\s+(?:regression\s+)?model$/i.test(text)) return 'car::vif(model)'
  return null
}

export function recognizeRegression(rawText: string): string | null {
  const text = rawText.trim()
  return (
    trySimpleLinearRegression(text) ??
    tryMultipleLinearRegression(text) ??
    tryAddPredictor(text) ??
    tryAddInteraction(text) ??
    tryCIForCoefficients(text) ??
    tryPredictedValues(text) ??
    tryDiagnosticPlots(text) ??
    tryLogisticRegression(text) ??
    tryOddsRatios(text) ??
    tryPredictedProbabilities(text) ??
    tryVIF(text)
  )
}
