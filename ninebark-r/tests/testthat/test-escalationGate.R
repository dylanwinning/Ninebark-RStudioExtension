# R/escalationGate.R -- a 1:1 port of the parent repo's src/escalationGate.ts.
# Same three labeled phrase buckets that file's own tests (and the temp
# audit script that preceded them, per the project's established
# audit-then-test convention) were tuned against, so the R and TS gates
# stay provably in sync rather than silently drifting apart.

test_that("nb_word_count / nb_sentence_count count correctly", {
  expect_equal(nb_word_count("one two three"), 3)
  expect_equal(nb_word_count("  one   two  "), 2)
  expect_equal(nb_sentence_count("Help. Please."), 2)
  expect_equal(nb_sentence_count("no punctuation here"), 0)
})

test_that("nb_decide_escalation: must reject (pure noise, no cost)", {
  for (phrase in c("hiiiii", "asdf", "lol", "test", "xyz", "ok thanks", "random words here no math")) {
    d <- nb_decide_escalation(NULL, character(0), phrase)
    expect_false(d$escalate, info = phrase)
  }
})

test_that("nb_decide_escalation: must escalate to the cheap formal tier (signal A -- recognized features)", {
  d <- nb_decide_escalation("out-of-coverage", "mean", "mean of")
  expect_true(d$escalate)
  expect_equal(d$tier, "formal")
  expect_equal(d$reason, "recognized-features")
})

test_that("nb_decide_escalation: must escalate to the formal tier (signal B -- short near-miss, nothing recognized)", {
  d <- nb_decide_escalation(NULL, character(0), "create a boxplot of my data with the main as xyz")
  expect_true(d$escalate)
  expect_equal(d$tier, "formal")
})

test_that("nb_decide_escalation: must escalate to the pricier raw-code tier for long multi-sentence requests", {
  phrases <- c(
    "I have a dataset with sales by region and month and I want a plot showing trend over time for each region, what's the R code for that",
    "I have three test scores, 85, 90, and 78. Can you write the R code to find the average? Also tell me the standard deviation.",
    "what should the R code be for a linear regression model predicting price from square footage and number of bedrooms in my housing dataset"
  )
  for (phrase in phrases) {
    d <- nb_decide_escalation(NULL, character(0), phrase)
    expect_true(d$escalate, info = phrase)
    expect_equal(d$tier, "raw-code", info = phrase)
  }
})

test_that("nb_looks_like_deliberate_request: the three sub-signals are independently sufficient", {
  expect_true(nb_looks_like_deliberate_request("one two three four five six seven eight nine ten"))
  expect_true(nb_looks_like_deliberate_request("Help. Please."))
  expect_true(nb_looks_like_deliberate_request("can you help"))
  expect_false(nb_looks_like_deliberate_request("short phrase here"))
})
