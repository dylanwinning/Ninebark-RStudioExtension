// ── R-native: inspecting data ───────────────────────────────────────────────
// "Show me the first 10 rows", "the column names", "the number of rows and
// columns", "the data types of every column", "count the missing values in
// each column" — the second half of "get data into R and look at it,"
// split out from rVectorsAndDataFrames.ts (which still owns filter/select/
// sort/rename — manipulating a data frame once it's already in R, a
// different concern from inspecting its shape) for the same one-file-per-
// domain reason rDataImport.ts is its own file.
//
// Every recognizer here accepts either a real variable name OR a generic
// placeholder — "my dataset" / "the dataset" / "my data" / "the data" /
// "it" — that most people reach for before they've mentioned a specific
// name. normalizeDataRef() below maps any of those to the literal `df`,
// the SAME conventional name every example elsewhere in this project
// already uses (the README, the widget's example chips, EXECUTION.md).
// This is a documented convention, not a silent guess: if the user's real
// data frame isn't actually called `df`, R itself reports a clear "object
// 'df' not found" at execution — exactly the fail-loud behavior
// formalToR.ts's parseIdentifier already relies on for free variables
// elsewhere, not a new kind of guessing.

const IDENT = String.raw`[A-Za-z][\w.]*`
// Either a real identifier, or one of the generic placeholder phrases —
// used as the subject of nearly every pattern in this file.
const DATA_REF = String.raw`(?:${IDENT}|my\s+dataset|the\s+dataset|this\s+dataset|my\s+data|the\s+data|this\s+data|it)`

function normalizeDataRef(raw: string): string {
  const t = raw.trim()
  // "it" is checked BEFORE the general identifier-shape test below, not
  // after: "it" is itself a syntactically valid R identifier, so without
  // this it would be treated as a real variable name someone actually
  // chose — the wrong read almost every time ("the first 5 rows of it"
  // means the pronoun, not a variable literally named `it`, which is rare
  // enough in real R code that this one placeholder word is worth special-
  // casing rather than leaving ambiguous).
  if (/^it$/i.test(t)) return 'df'
  return /^[A-Za-z][\w.]*$/.test(t) ? t : 'df'
}

// The "show me"/"display"/"what are"/… wrapper a LOT of these commands get
// typed with. Stripped as an optional leading phrase everywhere below,
// rather than duplicated into every individual pattern.
const SHOW_LEAD = String.raw`(?:(?:show|display|print|view)(?:\s+me)?|give\s+me|let\s+me\s+see|what\s+(?:is|are)|tell\s+me)\s+`

function stripShowLead(text: string): string {
  return text.replace(new RegExp(`^${SHOW_LEAD}`, 'i'), '')
}

// "the first 10 rows of df" / "show me the first 10 rows of my dataset" /
// "the top 10 rows of df" / "df's first 10 observations" / "head of df" /
// "preview df" / bare "show df" (defaults to head()'s own default of 6).
function tryHead(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?(?:first|top)\\s+(\\d+)\\s+(?:rows?|observations?|records?)\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `head(${normalizeDataRef(m[2])}, ${m[1]})`
  // Same, but no data frame named at all — "the top 10 rows." / "top 5
  // rows" — defaults to df, same convention as every other unnamed form
  // in this file (tryDimensions, tryRowOrColCount, tryMissingValues).
  m = t.match(/^(?:the\s+)?(?:first|top)\s+(\d+)\s+(?:rows?|observations?|records?)$/i)
  if (m) return `head(df, ${m[1]})`
  m = t.match(new RegExp(`^(${DATA_REF})(?:'s)?\\s+first\\s+(\\d+)\\s+(?:rows?|observations?|records?)$`, 'i'))
  if (m) return `head(${normalizeDataRef(m[1])}, ${m[2]})`
  m = t.match(new RegExp(`^(?:the\\s+)?head\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `head(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(${DATA_REF})\\s+head$`, 'i'))
  if (m) return `head(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?(?:beginning|start)\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `head(${normalizeDataRef(m[1])})`
  // "the first few rows (of df)" — no explicit count at all, head()'s
  // own default of 6 is exactly what "a few" means here.
  m = t.match(new RegExp(`^(?:the\\s+)?first\\s+few\\s+(?:rows?|observations?|records?)(?:\\s+of\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `head(${normalizeDataRef(m[1] ?? 'df')})`
  m = t.match(new RegExp(`^preview\\s+(?:the\\s+first\\s+(\\d+)\\s+rows?\\s+of\\s+)?(${DATA_REF})$`, 'i'))
  if (m) return m[1] ? `head(${normalizeDataRef(m[2])}, ${m[1]})` : `head(${normalizeDataRef(m[2])})`
  m = t.match(new RegExp(`^(?:look\\s+at|peek\\s+at)\\s+(?:the\\s+first\\s+(\\d+)\\s+rows?\\s+of\\s+)?(${DATA_REF})$`, 'i'))
  if (m) return m[1] ? `head(${normalizeDataRef(m[2])}, ${m[1]})` : `head(${normalizeDataRef(m[2])})`
  // A bare data reference with nothing else — "show df" / "view df" — but
  // ONLY when THIS function's own stripShowLead() actually found and
  // removed a lead verb (t !== text below). A real regression, caught by
  // this project's canonical "gibberish fails loud" tests (both here and
  // in the R package), is why that guard exists: an EARLIER version of
  // this pattern had no such guard, reasoning that stripFiller() upstream
  // (see resolveRPhrase.ts) already strips "show me"/"what is" before this
  // file ever sees the text, so there was supposedly nothing left to
  // distinguish "show me X" from bare "X". That reasoning broke down for
  // gibberish specifically: a single nonsense word like
  // "asdkjhaskjdhaskjdh" is ALSO just one bare identifier-shaped token, and
  // the ungated pattern matched it the same way, silently turning it into
  // `head(asdkjhaskjdhaskjdh)` instead of failing loud — exactly the kind
  // of wrong guess this whole project refuses to make. The guard means
  // "show me df" specifically (where upstream stripFiller erased the only
  // evidence a lead verb was ever there) no longer resolves via this bare
  // path — a real, narrow gap, but every other explicit phrasing ("show
  // df", "view df", "the first 5 rows of df", …) still works, and that
  // trade is the right one: a phrase failing to resolve is recoverable
  // (the user rephrases); a wrong guess silently succeeding is not.
  if (t !== text) {
    m = t.match(new RegExp(`^(${DATA_REF})$`, 'i'))
    if (m) return `head(${normalizeDataRef(m[1])})`
  }
  return null
}

// "the last 10 rows of df" / "the bottom 10 rows of df" / "the tail of df"
// / "df's last 10 observations" / "the end of df".
function tryTail(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?(?:last|bottom)\\s+(\\d+)\\s+(?:rows?|observations?|records?)\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `tail(${normalizeDataRef(m[2])}, ${m[1]})`
  // No data frame named at all — "the last 10 rows." / "bottom 5 rows" —
  // defaults to df, same convention as tryHead's own bare form above.
  m = t.match(/^(?:the\s+)?(?:last|bottom)\s+(\d+)\s+(?:rows?|observations?|records?)$/i)
  if (m) return `tail(df, ${m[1]})`
  m = t.match(new RegExp(`^(${DATA_REF})(?:'s)?\\s+last\\s+(\\d+)\\s+(?:rows?|observations?|records?)$`, 'i'))
  if (m) return `tail(${normalizeDataRef(m[1])}, ${m[2]})`
  m = t.match(new RegExp(`^(?:the\\s+)?tail\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `tail(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(${DATA_REF})\\s+tail$`, 'i'))
  if (m) return `tail(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?end\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `tail(${normalizeDataRef(m[1])})`
  // "the last few rows (of df)" — no explicit count, tail()'s own
  // default of 6 is exactly what "a few" means here.
  m = t.match(new RegExp(`^(?:the\\s+)?last\\s+few\\s+(?:rows?|observations?|records?)(?:\\s+of\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `tail(${normalizeDataRef(m[1] ?? 'df')})`
  return null
}

// "all the column names" / "the column names of df" / "the columns in df"
// / "what columns does df have" / "list the columns of df" / "the headers
// of df" (Excel-user terminology) / "what fields are in df" (database
// terminology) / "the variable names in df" (stats terminology — a
// data.frame's columns are "variables" in that vocabulary) / "the names of
// the columns in df" (reversed word order) / a bare "show me all the
// column names" with NO data frame named at all (defaults to df, same
// convention as every generic/unnamed form elsewhere in this file).
function tryColumnNames(text: string): string | null {
  const t = stripShowLead(text)
  // "all"/"the" are each independently optional — "all the column names of
  // df", "the column names of df", and "all column names of df" all need
  // to match, not just the combination "all the ...".
  let m = t.match(new RegExp(`^(?:all\\s+)?(?:the\\s+)?(?:column|variable)\\s+names?\\s+(?:of|in|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:all\\s+)?(?:the\\s+)?columns?\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?names?\\s+of\\s+(?:the\\s+)?columns?\\s+(?:in|of)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  // No data frame named anywhere — "all the column names." / "the column
  // names" on their own.
  if (/^(?:all\s+)?(?:the\s+)?(?:column|variable)\s+names?$/i.test(t)) return 'colnames(df)'
  m = t.match(new RegExp(`^what\\s+columns?\\s+does\\s+(${DATA_REF})\\s+have\\??$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^list\\s+(?:the\\s+)?columns?\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?headers?\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^what\\s+fields?\\s+(?:are|is)\\s+in\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(${DATA_REF})(?:'s)?\\s+column\\s+names?$`, 'i'))
  if (m) return `colnames(${normalizeDataRef(m[1])})`
  return null
}

// "the number of rows and columns" / "the dimensions of df" / "how many
// rows and columns does df have" / "the shape of df" (numpy/pandas
// terminology) / "how big is df" / "the size of df" / "df's dimensions".
function tryDimensions(text: string): string | null {
  const t = stripShowLead(text)
  // No data frame named at all — "the number of rows and columns." on its
  // own — defaults to df, same convention as every other unnamed form here.
  if (/^(?:the\s+)?(?:number|count)\s+of\s+rows?\s+and\s+columns?$/i.test(t)) return 'dim(df)'
  let m = t.match(new RegExp(`^(?:the\\s+)?(?:number|count)\\s+of\\s+rows?\\s+and\\s+columns?\\s+(?:of|in|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?dimensions?\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(${DATA_REF})(?:'s)?\\s+dimensions?$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^how\\s+many\\s+rows?\\s+and\\s+columns?\\s+does\\s+(${DATA_REF})\\s+have\\??$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?shape\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^how\\s+big\\s+is\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?size\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `dim(${normalizeDataRef(m[1])})`
  return null
}

// Row/column counts asked SEPARATELY — "the number of rows in df", "how
// many columns does df have", "df's row count", "the number of
// observations/variables in df" (stats terminology for rows/columns).
function tryRowOrColCount(text: string): string | null {
  const t = stripShowLead(text)
  // No data frame named at all — "the number of rows." / "how many rows
  // are there?" on its own — defaults to df, same convention as
  // tryDimensions' own bare "the number of rows and columns" above.
  if (/^(?:the\s+)?(?:total\s+)?(?:number|count)\s+of\s+(?:rows?|observations?|records?)$/i.test(t)) return 'nrow(df)'
  if (/^how\s+many\s+(?:rows?|observations?|records?)\s+(?:are|is)\s+there\??$/i.test(t)) return 'nrow(df)'
  // Terser still — "count rows" with no article/preposition at all.
  if (/^count\s+(?:rows?|observations?|records?)$/i.test(t)) return 'nrow(df)'
  if (/^count\s+(?:columns?|variables?|fields?)$/i.test(t)) return 'ncol(df)'
  let m = t.match(new RegExp(`^(?:the\\s+)?(?:total\\s+)?(?:number|count)\\s+of\\s+(?:rows?|observations?|records?)\\s+(?:of|in|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `nrow(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?row\\s+count\\s+(?:of|in|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `nrow(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(${DATA_REF})(?:'s)?\\s+row\\s+count$`, 'i'))
  if (m) return `nrow(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^how\\s+many\\s+(?:rows?|observations?|records?)\\s+(?:does\\s+(${DATA_REF})\\s+have|(?:are|is)\\s+(?:in|there\\s+in)\\s+(${DATA_REF}))\\??$`, 'i'))
  if (m) return `nrow(${normalizeDataRef(m[1] ?? m[2])})`

  if (/^(?:the\s+)?(?:total\s+)?(?:number|count)\s+of\s+(?:columns?|variables?|fields?)$/i.test(t)) return 'ncol(df)'
  if (/^how\s+many\s+(?:columns?|variables?|fields?)\s+(?:are|is)\s+there\??$/i.test(t)) return 'ncol(df)'
  m = t.match(new RegExp(`^(?:the\\s+)?(?:total\\s+)?(?:number|count)\\s+of\\s+(?:columns?|variables?|fields?)\\s+(?:of|in|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `ncol(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?column\\s+count\\s+(?:of|in|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `ncol(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(${DATA_REF})(?:'s)?\\s+column\\s+count$`, 'i'))
  if (m) return `ncol(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^how\\s+many\\s+(?:columns?|variables?|fields?)\\s+(?:does\\s+(${DATA_REF})\\s+have|(?:are|is)\\s+(?:in|there\\s+in)\\s+(${DATA_REF}))\\??$`, 'i'))
  if (m) return `ncol(${normalizeDataRef(m[1] ?? m[2])})`
  return null
}

// "the data types of every column" / "the data types of each column in
// df" / "what type is each column in df" / "the column types of df" /
// "the class of each column in df" / "what kind of data is in each column
// of df" — sapply(df, class), a clean named vector of just the types,
// more precisely answering "what type is each column" than str(df) does
// (str() mixes in sample values and nesting most people didn't ask for
// here — it's still there below as its own command, "the structure of
// df", for when that fuller picture IS what's wanted).
function tryColumnTypes(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?data\\s+types?\\s+of\\s+(?:every|each|all(?:\\s+the)?)\\s+column\\s+(?:in|of)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  m = t.match(new RegExp(`^(?:the\\s+)?data\\s+types?\\s+of\\s+(?:every|each|all(?:\\s+the)?)\\s+columns?$`, 'i'))
  if (m) return `sapply(df, class)`
  m = t.match(new RegExp(`^what\\s+type\\s+is\\s+each\\s+column\\s+(?:in|of)\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  // "what DATA TYPE IS every column of df" — singular noun, "is" instead
  // of "of", the other common way to ask the same question.
  m = t.match(new RegExp(`^what\\s+data\\s+types?\\s+is\\s+every\\s+column\\s+of\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  m = t.match(new RegExp(`^(?:the\\s+)?column\\s+types?\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  m = t.match(new RegExp(`^(?:the\\s+)?variable\\s+types?\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  m = t.match(new RegExp(`^(?:the\\s+)?class(?:es)?\\s+of\\s+each\\s+column\\s+(?:in|of)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  m = t.match(new RegExp(`^what\\s+kind\\s+of\\s+data\\s+is\\s+in\\s+each\\s+column\\s+(?:in|of)\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `sapply(${normalizeDataRef(m[1])}, class)`
  return null
}

// "the structure of df" / "the types of the columns of df" (kept distinct
// from tryColumnTypes above — str() gives the fuller nested/preview
// picture, sapply(df, class) gives just the clean type-per-column vector;
// both are real, different, common asks) / "glimpse df" (tidyverse
// terminology — dplyr::glimpse() is its own, differently-formatted
// output, so mapped to the real function rather than approximated with
// str(), namespaced the same way readxl/jsonlite/haven calls are
// elsewhere since dplyr has no base-R equivalent for this specific view).
function tryStructure(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?structure\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `str(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?types?\\s+of\\s+(?:the\\s+)?columns?\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `str(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^glimpse\\s+(?:at\\s+)?(${DATA_REF})$`, 'i'))
  if (m) return `dplyr::glimpse(${normalizeDataRef(m[1])})`
  return null
}

// "a summary of df" / "summarize df" / "summary statistics for df" /
// "describe df" (pandas-user terminology — df.describe()'s closest base-R
// equivalent is summary(), not a literal port, since R has no dedicated
// describe() in base and summary() already gives the same per-column
// quartile/mean breakdown pandas users expect from the word).
function trySummary(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:a\\s+)?summary\\s+(?:statistics\\s+)?(?:of|for)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `summary(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^summarize\\s+(${DATA_REF})$`, 'i'))
  if (m) return `summary(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^describe\\s+(${DATA_REF})$`, 'i'))
  if (m) return `summary(${normalizeDataRef(m[1])})`
  // "what's in my dataset" — the shared stripFiller() upstream already
  // strips "what's" before this file ever sees the text (confirmed
  // empirically, same gotcha class as tryHead's own bare-fallback
  // comment above), so this matches the POST-strip "in my dataset" form
  // directly rather than the sentence as literally typed.
  if (/^in\s+(?:my|the|this)\s+(?:data|dataset)$/i.test(t)) return 'summary(df)'
  return null
}

// Missing-value inspection — the real gap the prior version of this file
// had: anyNA()/sum(is.na()) existed (whole-data-frame only), but nothing
// broke it down PER COLUMN, which is the much more commonly useful
// question ("count the missing values in each column").
function tryMissingValues(text: string): string | null {
  const t = stripShowLead(text)

  // A SINGLE named column's own missing count: sum(is.na(df$income)) —
  // distinct from the per-column BREAKDOWN below (colSums over the
  // whole data frame) and from the whole-DATA-FRAME total further down
  // (which assumes its bare identifier is a data frame's own name, not
  // a column inside one — see the whole-data-frame block's own comment).
  // Checked first so "each column" (two words) never matches this
  // single-IDENT pattern by accident.
  let m = t.match(new RegExp(`^(?:the\\s+)?(?:number|count)\\s+of\\s+missing\\s+values?\\s+in\\s+(${IDENT})$`, 'i'))
  if (m) return `sum(is.na(df$${m[1]}))`

  // Per-column count: colSums(is.na(df)) — a named vector, one count per
  // column. The headline command this category was missing.
  m = t.match(new RegExp(`^count\\s+(?:the\\s+)?missing\\s+values?\\s+(?:in|for)\\s+each\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `colSums(is.na(${normalizeDataRef(m[1] ?? 'df')}))`
  m = t.match(new RegExp(`^(?:the\\s+)?(?:number|count)\\s+of\\s+missing\\s+values?\\s+per\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `colSums(is.na(${normalizeDataRef(m[1] ?? 'df')}))`
  m = t.match(new RegExp(`^how\\s+many\\s+(?:missing\\s+values?|nas?)\\s+(?:are\\s+)?in\\s+each\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?\\??$`, 'i'))
  if (m) return `colSums(is.na(${normalizeDataRef(m[1] ?? 'df')}))`
  m = t.match(new RegExp(`^missing\\s+values?\\s+by\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `colSums(is.na(${normalizeDataRef(m[1] ?? 'df')}))`
  m = t.match(new RegExp(`^(?:count|the\\s+number\\s+of)\\s+nas?\\s+per\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `colSums(is.na(${normalizeDataRef(m[1] ?? 'df')}))`
  m = t.match(new RegExp(`^(?:the\\s+)?percentage\\s+of\\s+missing\\s+values?\\s+(?:in|for)\\s+each\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) { const d = normalizeDataRef(m[1] ?? 'df'); return `colMeans(is.na(${d})) * 100` }
  // The bare statement form, no "count"/"how many"/"number of" verb at
  // all — "(the) missing values in each column (of df)" — just as common
  // a way to ask for this as any of the question forms above.
  m = t.match(new RegExp(`^(?:the\\s+)?missing\\s+values?\\s+in\\s+each\\s+column(?:\\s+(?:in|of)\\s+(${DATA_REF}))?$`, 'i'))
  if (m) return `colSums(is.na(${normalizeDataRef(m[1] ?? 'df')}))`

  // Which columns/rows have missing data at all.
  m = t.match(new RegExp(`^which\\s+columns?\\s+(?:have|has|contains?)\\s+missing\\s+(?:values?|data)(?:\\s+(?:in|of)\\s+(${DATA_REF}))?\\??$`, 'i'))
  if (m) { const d = normalizeDataRef(m[1] ?? 'df'); return `colnames(${d})[colSums(is.na(${d})) > 0]` }
  m = t.match(new RegExp(`^which\\s+rows?\\s+(?:have|has|contains?)\\s+missing\\s+(?:values?|data)(?:\\s+(?:in|of)\\s+(${DATA_REF}))?\\??$`, 'i'))
  if (m) return `${normalizeDataRef(m[1] ?? 'df')}[!complete.cases(${normalizeDataRef(m[1] ?? 'df')}), ]`

  // Whole-data-frame total — the pre-existing commands, carried over
  // unchanged from rVectorsAndDataFrames.ts.
  m = t.match(new RegExp(`^(?:is\\s+there\\s+any\\s+)?missing\\s+(?:data|values?)\\s+in\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `anyNA(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:count|how\\s+many)\\s+missing\\s+values?\\s+(?:in|are\\s+in)\\s+(${DATA_REF})\\??$`, 'i'))
  if (m) return `sum(is.na(${normalizeDataRef(m[1])}))`
  m = t.match(new RegExp(`^how\\s+many\\s+missing\\s+values?\\s+does\\s+(${DATA_REF})\\s+have\\??$`, 'i'))
  if (m) return `sum(is.na(${normalizeDataRef(m[1])}))`
  // No data frame named at all — "are there any missing values?" / "how
  // many missing values are there?" / "are there any NAs?" ("NA" is R's
  // own term for a missing value, as common a way to ask this as
  // "missing values" itself) — defaults to df, same convention as every
  // other unnamed form in this file.
  if (/^(?:is\s+there\s+any\s+)?missing\s+(?:data|values?)\??$/i.test(t)) return 'anyNA(df)'
  if (/^are\s+there\s+any\s+(?:missing\s+values?|nas?)\??$/i.test(t)) return 'anyNA(df)'
  if (/^how\s+many\s+(?:missing\s+values?|nas?)\s+(?:are|is)\s+there\??$/i.test(t)) return 'sum(is.na(df))'

  // NOTE: actually REMOVING rows with missing values ("remove rows with
  // missing values in income", "remove all rows that contain any missing
  // values") lives in rDataCleaning.ts, not here — this file is read-only
  // inspection; dropping rows is a cleaning action, a different concern
  // (see that file's own header comment).

  return null
}

// "duplicated rows in df" / "the number of duplicate rows in df" /
// "the unique values in column age of df" / "the number of unique values
// in column age of df" — rounds out "inspect the data" with the other
// most common data-cleanliness questions, past just missing values.
// NOTE: actually REMOVING duplicate rows ("remove duplicate rows from the
// dataset") lives in rDataCleaning.ts — this file stays read-only.
function tryDuplicatesAndUnique(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?(?:number|count)\\s+of\\s+duplicate\\s+rows?\\s+(?:in|of)\\s+(${DATA_REF})$`, 'i'))
  if (m) { const d = normalizeDataRef(m[1]); return `sum(duplicated(${d}))` }
  m = t.match(new RegExp(`^duplicated?\\s+rows?\\s+(?:in|of)\\s+(${DATA_REF})$`, 'i'))
  if (m) { const d = normalizeDataRef(m[1]); return `${d}[duplicated(${d}), ]` }
  // No data frame named at all — "are there any duplicates?" / "how many
  // duplicate rows are there?" — defaults to df, same convention as every
  // other unnamed form in this file.
  if (/^are\s+there\s+any\s+duplicates?\??$/i.test(t)) return 'anyDuplicated(df) > 0'
  if (/^how\s+many\s+duplicate\s+rows?\s+(?:are|is)\s+there\??$/i.test(t)) return 'sum(duplicated(df))'

  m = t.match(new RegExp(`^(?:the\\s+)?(?:number|count)\\s+of\\s+unique\\s+values?\\s+in\\s+column\\s+(${IDENT})\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `length(unique(${normalizeDataRef(m[2])}$${m[1]}))`
  m = t.match(new RegExp(`^(?:the\\s+)?unique\\s+values?\\s+in\\s+column\\s+(${IDENT})\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `unique(${normalizeDataRef(m[2])}$${m[1]})`
  // Shorter forms, no "in column"/"of df" at all — "unique values of
  // gender" / "the number of unique values of gender" / bare "unique
  // gender" — the full, original "unique values IN COLUMN X OF df"
  // phrasing turned out to be the ONLY one supported, far more verbose
  // than anyone actually types; defaults to df like every other unnamed
  // form in this file.
  // Guards against a truncated phrase ("unique of", "the levels of")
  // leaking a common English preposition through as if it were a real
  // column name — the same false-positive risk rDescriptiveStats.ts's
  // bare noun-noun stat pattern hit and fixed with this identical
  // exclusion set (defined once, below, and used by tryMode too).
  m = t.match(new RegExp(`^(?:the\\s+)?(?:number|count)\\s+of\\s+unique\\s+values?\\s+(?:of|in|for)\\s+(${IDENT})$`, 'i'))
  if (m && !INSPECTION_STOPWORDS.has(m[1].toLowerCase())) return `length(unique(df$${m[1]}))`
  m = t.match(new RegExp(`^(?:the\\s+)?unique\\s+values?\\s+(?:of|in|for)\\s+(${IDENT})$`, 'i'))
  if (m && !INSPECTION_STOPWORDS.has(m[1].toLowerCase())) return `unique(df$${m[1]})`
  m = t.match(new RegExp(`^unique\\s+(${IDENT})$`, 'i'))
  if (m && !INSPECTION_STOPWORDS.has(m[1].toLowerCase())) return `unique(df$${m[1]})`
  m = t.match(new RegExp(`^(?:the\\s+)?levels?\\s+of\\s+column\\s+(${IDENT})\\s+(?:of|in)\\s+(${DATA_REF})$`, 'i'))
  if (m) return `levels(factor(${normalizeDataRef(m[2])}$${m[1]}))`
  m = t.match(new RegExp(`^(?:the\\s+)?levels?\\s+of\\s+(${IDENT})$`, 'i'))
  if (m && !INSPECTION_STOPWORDS.has(m[1].toLowerCase())) return `levels(factor(df$${m[1]}))`
  return null
}

// "the mode of education" / "the most common value of education" — R has
// no built-in statistical mode() (that name is already taken by a
// variable's storage mode, e.g. "numeric"/"character"), so this is the
// standard base-R workaround: the name of whichever table() entry sorts
// highest.
// Guards against a truncated phrase ("the mode of the") leaking a common
// English preposition/article through as if it were a real column name —
// "the"/"of"/etc. are themselves syntactically valid identifiers, the
// same false-positive risk rDescriptiveStats.ts's bare noun-noun stat
// pattern hit and fixed with this identical exclusion set.
const INSPECTION_STOPWORDS = new Set(['of', 'the', 'a', 'an', 'in', 'on', 'for', 'to', 'from', 'by', 'with', 'and', 'or', 'is', 'are'])

function tryMode(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?mode\\s+of\\s+(${IDENT})$`, 'i'))
  if (m && !INSPECTION_STOPWORDS.has(m[1].toLowerCase())) return `names(sort(table(df$${m[1]}), decreasing = TRUE))[1]`
  m = t.match(new RegExp(`^(?:the\\s+)?most\\s+common\\s+value\\s+(?:of|in)\\s+(${IDENT})$`, 'i'))
  if (m && !INSPECTION_STOPWORDS.has(m[1].toLowerCase())) return `names(sort(table(df$${m[1]}), decreasing = TRUE))[1]`
  return null
}

// "the class of df" / "is df a data frame" / "the row names of df" / "the
// variable names of df" (rownames, kept distinct from column names above)
// / "is df empty".
function tryMisc(text: string): string | null {
  const t = stripShowLead(text)
  let m = t.match(new RegExp(`^(?:the\\s+)?class\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `class(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^is\\s+(${DATA_REF})\\s+a\\s+data\\s*frame\\??$`, 'i'))
  if (m) return `is.data.frame(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^(?:the\\s+)?row\\s+names?\\s+of\\s+(${DATA_REF})$`, 'i'))
  if (m) return `rownames(${normalizeDataRef(m[1])})`
  m = t.match(new RegExp(`^is\\s+(${DATA_REF})\\s+empty\\??$`, 'i'))
  if (m) return `nrow(${normalizeDataRef(m[1])}) == 0`
  return null
}

export function recognizeDataInspection(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryHead(text) ??
    tryTail(text) ??
    tryColumnNames(text) ??
    tryDimensions(text) ??
    tryRowOrColCount(text) ??
    tryColumnTypes(text) ??
    tryStructure(text) ??
    trySummary(text) ??
    tryMissingValues(text) ??
    tryDuplicatesAndUnique(text) ??
    tryMode(text) ??
    tryMisc(text)
  )
}
