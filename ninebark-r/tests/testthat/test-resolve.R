# These tests exist to catch problems in the R <-> V8 <-> bundled-JS bridge
# itself (does the bundle load, does the call marshal arguments/results
# correctly, does the ok/target/code/error shape survive the round trip) —
# NOT to re-verify the natural-language vocabulary, which already has 157
# passing tests in the parent TypeScript repo (../../tests/) against the
# exact same engine this package embeds unchanged. A representative phrase
# from each category is enough here; a new vocabulary rule belongs in the
# TypeScript tests, not duplicated here.

test_that("a basic math phrase resolves to R, targeting the console", {
  r <- ninebark_resolve("mean of 1,2,3,4,5")
  expect_true(r$ok)
  expect_equal(r$target, "console")
  expect_equal(r$code, "mean(c(1, 2, 3, 4, 5))")
})

test_that("assignment resolves", {
  r <- ninebark_resolve("let x be 5")
  expect_true(r$ok)
  expect_equal(r$code, "x <- 5")
})

test_that("control flow resolves", {
  r <- ninebark_resolve("for i in 1 to 10 print i")
  expect_true(r$ok)
  expect_equal(r$code, "for (i in 1:10) { print(i) }")
})

test_that("data-frame verbs resolve", {
  r <- ninebark_resolve("the first 5 rows of df")
  expect_true(r$ok)
  expect_equal(r$code, "head(df, 5)")
})

test_that("raw R passes straight through", {
  r <- ninebark_resolve("x <- 5")
  expect_true(r$ok)
  expect_equal(r$code, "x <- 5")
})

test_that("the source-editor routing phrase flips the target, not the code", {
  r <- ninebark_resolve("in the script let x be 5")
  expect_true(r$ok)
  expect_equal(r$target, "source")
  expect_equal(r$code, "x <- 5")
})

test_that("an R construct with no base-R equivalent fails loud with a specific reason", {
  r <- ninebark_resolve("solve x^2 = 4")
  expect_false(r$ok)
  expect_match(r$error, "no symbolic algebra solver")
})

test_that("gibberish fails loud rather than guessing", {
  r <- ninebark_resolve("asdkjhaskjdhaskjdh")
  expect_false(r$ok)
  expect_true(nzchar(r$error))
})

test_that("ninebark_resolve validates its argument type up front", {
  expect_error(ninebark_resolve(42))
  expect_error(ninebark_resolve(c("a", "b")))
})

test_that("the V8 context is reused across calls (module-level cache), not rebuilt each time", {
  # Calling twice should not error and should give consistent results —
  # exercises the .ninebark_ctx() memoization in R/resolve.R.
  r1 <- ninebark_resolve("let y be 1")
  r2 <- ninebark_resolve("let z be 2")
  expect_true(r1$ok && r2$ok)
  expect_equal(r1$code, "y <- 1")
  expect_equal(r2$code, "z <- 2")
})
