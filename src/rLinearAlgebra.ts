// ── R-native: linear algebra on named matrices ──────────────────────────
// "the determinant of A", "the inverse of A", "the transpose of A",
// "multiply A by B", "the eigenvalues of A", "solve Ax = b" — mirrors
// Ninebark-MATLABExtension's matlabLinearAlgebra.ts in shape (named-matrix
// operations, not literal-matrix parsing — a `let A be ...` assignment
// names the matrix first, same as MATLAB's workflow), but R's own function
// names for these ("solve" doubles as BOTH matrix inverse and linear-system
// solve depending on argument count — genuinely different from MATLAB's
// separate inv()/mldivide — surfaced below rather than papered over).

const IDENT = String.raw`[A-Za-z]\w*`

function tryDeterminant(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?determinant\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `det(${m[1]})`
}

// R's solve(A) with ONE argument returns the matrix inverse — solve(A, b)
// with two solves the linear system Ax = b. Same function, different
// arities; both recognized, into the shape that matches the phrasing.
function tryInverse(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?inverse\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `solve(${m[1]})`
}

function tryLinearSolve(text: string): string | null {
  // "solve Ax = b" / "solve A x = b" — the system's coefficient matrix and
  // constant vector, read off directly (R's solve(A, b) IS the linear-system
  // solver, so no manual elimination is emitted).
  const m = text.match(new RegExp(`^solve\\s+(${IDENT})\\s*x\\s*=\\s*(${IDENT})$`, 'i'))
  if (!m) return null
  return `solve(${m[1]}, ${m[2]})`
}

function tryTranspose(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?transpose\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `t(${m[1]})`
}

function tryMultiply(text: string): string | null {
  const m = text.match(new RegExp(`^multiply\\s+(${IDENT})\\s+by\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `${m[1]} %*% ${m[2]}` // R's element-wise "*" is NOT matrix multiply — %*% is
}

function tryEigen(text: string): string | null {
  let m = text.match(new RegExp(`^(?:the\\s+)?eigenvalues?\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `eigen(${m[1]})$values`
  m = text.match(new RegExp(`^(?:the\\s+)?eigenvectors?\\s+of\\s+(${IDENT})$`, 'i'))
  if (m) return `eigen(${m[1]})$vectors`
  return null
}

function tryRank(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?rank\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `qr(${m[1]})$rank` // base R has no rank(); QR decomposition's rank is the documented base-R route
}

function tryTrace(text: string): string | null {
  const m = text.match(new RegExp(`^(?:the\\s+)?trace\\s+of\\s+(${IDENT})$`, 'i'))
  if (!m) return null
  return `sum(diag(${m[1]}))` // base R has no trace(); sum of the diagonal is the standard idiom
}

function tryIdentity(text: string): string | null {
  const m = text.match(/^(?:the\s+)?identity\s+matrix\s+of\s+size\s+(\d+)$/i)
  if (!m) return null
  return `diag(${m[1]})`
}

function tryZerosOnes(text: string): string | null {
  let m = text.match(/^zeros?\s+(\d+)\s+by\s+(\d+)$/i)
  if (m) return `matrix(0, nrow = ${m[1]}, ncol = ${m[2]})`
  m = text.match(/^ones?\s+(\d+)\s+by\s+(\d+)$/i)
  if (m) return `matrix(1, nrow = ${m[1]}, ncol = ${m[2]})`
  return null
}

export function recognizeLinearAlgebra(rawText: string): string | null {
  const text = rawText.trim()
  return (
    tryLinearSolve(text) ??
    tryDeterminant(text) ??
    tryInverse(text) ??
    tryTranspose(text) ??
    tryMultiply(text) ??
    tryEigen(text) ??
    tryRank(text) ??
    tryTrace(text) ??
    tryIdentity(text) ??
    tryZerosOnes(text)
  )
}
