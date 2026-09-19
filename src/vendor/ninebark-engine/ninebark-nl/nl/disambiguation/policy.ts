// DECISION-29: Fixed total disambiguation order (Sprint 7 / M31).
//
// A single documented preference order collapses every parse forest to one result.
// This policy IS the determinism guarantee of the NL layer.
//
// Unresolved ambiguity (policy cannot pick a single tree) → E_NL_AMBIGUOUS.
//
// ── Ruling table ──────────────────────────────────────────────────────────────
// Token  | Reading A           | Reading B            | Fixed rule
// -------|---------------------|----------------------|-----------------------------
// AND    | addition (bare)     | list sep (in funcN)  | fnN context wins; bare→add
// OF     | fn-apply (FUNC1)    | multiply (FRAC OF)   | preceding FUNC1→apply;
//        |                     |                      | preceding FRAC→multiply
// BY     | division            | dimension            | division (matrix out of scope)
// neg+sq | ((-N)^k)            | (-(N^k))             | DECISION-29a: English reading
//        |                     |                      | (negative names the number)
//
// ── DECISION-29a ──────────────────────────────────────────────────────────────
// "negative N squared" → ((-N)^k)  NOT  (-(N^k))
// When the forest contains both neg(pow(N,k)) and pow(neg(N),k), prefer the latter.

import type { ParseNode, Forest } from '../grammar/forest'
import { NlErrorCode } from '../errors'

// Returns true if any node in the subtree is a 'list' node
function containsList(node: ParseNode): boolean {
  switch (node.t) {
    case 'list': return true
    case 'add': case 'sub': case 'mul': case 'div': case 'pow':
      return containsList(node.l) || containsList(node.r)
    case 'neg': case 'pos': return containsList(node.arg)
    case 'fn1': return containsList(node.arg)
    case 'fnN': return node.items.some(containsList)
    case 'fracmul': return containsList(node.frac) || containsList(node.arg)
    default: return false
  }
}

// Returns true if fnN has ≥2 items or a single list item (fully consumed arglist).
// A single scalar item means the fnN likely stopped short and a binary op consumed the rest.
function isCompleteFnN(node: ParseNode): boolean {
  if (node.t !== 'fnN') return false
  return node.items.length >= 2 || (node.items.length === 1 && node.items[0].t === 'list')
}

// Returns true if the subtree contains an fnN with exactly 1 scalar (non-list) item —
// a sign that the function absorbed fewer args than intended and the remainder spilled
// into a surrounding binary op.
function containsIncompleteFnN(node: ParseNode): boolean {
  switch (node.t) {
    case 'fnN': return node.items.length === 1 && node.items[0].t !== 'list'
    case 'add': case 'sub': case 'mul': case 'div': case 'pow':
      return containsIncompleteFnN(node.l) || containsIncompleteFnN(node.r)
    case 'neg': case 'pos': case 'fn1': return containsIncompleteFnN(node.arg)
    case 'fracmul': return containsIncompleteFnN(node.frac) || containsIncompleteFnN(node.arg)
    default: return false
  }
}

// Returns true if any mul/div node in the tree has an add/sub node as a DIRECT child.
// This identifies sub-trees where lower-precedence operations were incorrectly absorbed
// into a multiplication — e.g. mul(sub(x^2,9), x) = (x^2-9)*x, or mul(9, add(x,4)).
// Used by DECISION-68 to prevent wrongly-absorbed add/sub from competing with correct parses.
function hasMulWithAddArg(node: ParseNode): boolean {
  switch (node.t) {
    case 'mul': case 'div': {
      const b = node as { l: ParseNode; r: ParseNode }
      if (b.l.t === 'add' || b.l.t === 'sub') return true
      if (b.r.t === 'add' || b.r.t === 'sub') return true
      return hasMulWithAddArg(b.l) || hasMulWithAddArg(b.r)
    }
    case 'add': case 'sub': {
      const b = node as { l: ParseNode; r: ParseNode }
      return hasMulWithAddArg(b.l) || hasMulWithAddArg(b.r)
    }
    default: return false
  }
}

// Returns true if any node in the tree is pow(mul|div, ...) — i.e., the base of an
// exponentiation is a product. This indicates "implied multiplication has been mis-assigned
// higher precedence than exponentiation", e.g. "(2x)^2" instead of "2*(x^2)".
// Used by DECISION-68 to prefer mul(coeff, pow(var, exp)) over pow(mul(coeff,var), exp).
function hasPowWithMulBase(node: ParseNode): boolean {
  switch (node.t) {
    case 'pow':
      return node.l.t === 'mul' || node.l.t === 'div'
    case 'mul': case 'div': case 'add': case 'sub': {
      const b = node as { l: ParseNode; r: ParseNode }
      return hasPowWithMulBase(b.l) || hasPowWithMulBase(b.r)
    }
    default: return false
  }
}

// Preference score: lower = more preferred. The policy picks the lowest-score tree.
function score(node: ParseNode): number {
  // DECISION-29a: pow(neg(N), k) preferred over neg(pow(N, k))
  // We prefer fnN with multiple items over fnN with single add-result (AND-as-add inside funcN)
  return scoreNode(node, 0)
}

function scoreNode(node: ParseNode, depth: number): number {
  switch (node.t) {
    // DECISION-29a: pow(neg(N), k) is the PREFERRED reading → lower score
    case 'pow':
      if (node.l.t === 'neg') return depth       // preferred: neg is the base
      if (node.l.t === 'num' || node.l.t === 'frac') return depth + 1
      return depth + scoreNode(node.l, depth + 1) + scoreNode(node.r, depth + 1)
    case 'neg':
      // neg(pow(...)) is the LESS preferred reading of "negative N squared" → higher score
      if (node.arg.t === 'pow') return depth + 100
      return depth + scoreNode(node.arg, depth + 1)
    case 'pos':
      return depth + scoreNode(node.arg, depth + 1)
    case 'fnN':
      // Prefer fnN with ≥2 scalar items (AND-as-separator) over fnN with 1 add-result
      if (node.items.length === 1 && node.items[0].t === 'add') return depth + 50
      // Penalize fnN with mixed list+scalar items (pathological parse)
      if (node.items.some(i => i.t === 'list') && node.items.some(i => i.t !== 'list')) return depth + 200
      return depth
    case 'fn1':
      // fn1 with complex (non-atom) arg is preferred over "fn1 + binary" (handled below)
      return scoreNode(node.arg, depth + 1) > 0 ? scoreNode(node.arg, depth + 1) : 1
    case 'fracmul':   return scoreNode(node.arg, depth + 1)
    case 'angleMark': return scoreNode(node.expr, depth)
    case 'graph':     return scoreNode(node.expr, depth)
    case 'fnN2':      return depth
    case 'list': {
      // Prefer list with multiple scalar items (AND=separator) over list with a single add-result
      // This disambiguates "the list 3 and 4" = {3,4} vs {(3+4)}
      const hasOpItem = node.items.some(
        i => i.t === 'add' || i.t === 'sub' || i.t === 'mul' || i.t === 'div' || i.t === 'pow'
      )
      if (hasOpItem) return depth + 50
      return depth
    }
    case 'add':
    case 'sub': {
      const bin = node as { l: ParseNode; r: ParseNode }
      // fn1 or incomplete fnN (1 scalar item) directly on the left is an "accidental split":
      //   "sqrt of X plus Y" → prefer sqrt(X+Y) over (sqrt(X)+Y)
      //   "mean of X" then "+Y" → prefer mean({X,...}) absorbing Y
      // Complete fnN (≥2 items) on the left IS natural:
      //   "X more than sum(A,B)" → add(sum(A,B), X) is correct, not penalized
      if (bin.l.t === 'fn1' || (bin.l.t === 'fnN' && !isCompleteFnN(bin.l)) || bin.l.t === 'list') return depth + 200
      if (bin.r.t === 'list') return depth + 200
      if (containsList(bin.l) || containsList(bin.r)) return depth + 200
      // Penalize nested structure where an incomplete fnN spilled into this binary chain
      // e.g. add(add(fnN([x]),y),z) is worse than add(fnN([x,y]),z)
      if (containsIncompleteFnN(bin.l) || containsIncompleteFnN(bin.r)) return depth + 150
      // DECISION-67: prefer left-associative chains for add/sub.
      // "5 plus 6 plus 7" → add(add(5,6),7) not add(5,add(6,7)).
      if (bin.r.t === 'add' || bin.r.t === 'sub') return depth + 1
      // DECISION-68: prefer trees where pow has a variable base (not a product base),
      // and where mul operands don't wrongly absorb lower-precedence add/sub sub-trees.
      if (hasPowWithMulBase(bin.l) || hasPowWithMulBase(bin.r)) return depth + 1
      if (hasMulWithAddArg(bin.l) || hasMulWithAddArg(bin.r)) return depth + 1
      return depth
    }
    case 'mul':
    case 'div': {
      const bin = node as { l: ParseNode; r: ParseNode }
      if (bin.l.t === 'fn1' || (bin.l.t === 'fnN' && !isCompleteFnN(bin.l)) || bin.l.t === 'list') return depth + 200
      if (bin.r.t === 'list') return depth + 200
      if (containsList(bin.l) || containsList(bin.r)) return depth + 200
      if (containsIncompleteFnN(bin.l) || containsIncompleteFnN(bin.r)) return depth + 150
      // Prefer mul/div where a lower-precedence op (add/sub) is NOT an immediate operand.
      // "five more than three times four" → add(mul(3,4),5) not mul(add(3,5),4)
      if (bin.l.t === 'add' || bin.l.t === 'sub' || bin.r.t === 'add' || bin.r.t === 'sub') return depth + 10
      // DECISION-38: prefer left-associative chain over mul-with-inner-div.
      // "multiply 2 by 3 by 4" → ((2*3)*4) not (2*(3/4)).
      // Penalty is intentionally small so it only resolves ties without overriding
      // explicit parens (which produce unambiguous single parses).
      // DECISION-38 (continued): penalize div(mul(X,Y),Z) — this parse arises when the
      // binary BY extension extends a CMD_MUL result (treating BY as ÷ one step late).
      // mul(mul(X,Y),Z) (the CMD_MUL chain) wins over div(mul(X,Y),Z) at the same span.
      if (node.t === 'mul' && bin.r.t === 'div') return depth + 3
      if (node.t === 'div' && bin.l.t === 'mul') return depth + 3
      // DECISION-67: prefer left-associative chains for mul/div.
      // "2 times 3 times 4" → mul(mul(2,3),4) not mul(2,mul(3,4)).
      if (bin.r.t === 'mul' || bin.r.t === 'div') return depth + 1
      // DECISION-68: prefer trees where pow has a variable base (not a product base).
      if (hasPowWithMulBase(bin.l) || hasPowWithMulBase(bin.r)) return depth + 1
      return depth
    }
    default: return depth
  }
}

/**
 * Collapse a parse forest to exactly one ParseNode.
 * Throws E_NL_AMBIGUOUS if the forest is unresolvable to a unique best parse.
 * Throws E_NL_COVERAGE if the forest is empty.
 */
export function disambiguate(forest: Forest): ParseNode {
  if (forest.length === 0) throw { code: NlErrorCode.COVERAGE }

  if (forest.length === 1) return forest[0]

  // Score all candidates and pick the lowest
  const scored = forest.map(n => ({ node: n, s: score(n) }))
  scored.sort((a, b) => a.s - b.s)

  const best = scored[0]
  const tied = scored.filter(x => x.s === best.s)

  // If multiple trees have the same score AND are structurally different → ambiguous
  if (tied.length > 1) {
    // Last-resort: check if they are structurally identical (duplicates)
    // This can happen if two rule paths produce the same AST
    const unique = deduplicateForest(tied.map(x => x.node))
    // Sprint 15 DECISION-81: carry competing parses so diagnostic can articulate the ambiguity.
    if (unique.length > 1) throw { code: NlErrorCode.AMBIGUOUS, competingParses: unique }
  }

  return best.node
}

function deduplicateForest(forest: Forest): Forest {
  const result: ParseNode[] = []
  for (const n of forest) {
    if (!result.some(r => structEq(r, n))) result.push(n)
  }
  return result
}

function structEq(a: ParseNode, b: ParseNode): boolean {
  if (a.t !== b.t) return false
  switch (a.t) {
    case 'num':   return (b as typeof a).v === a.v
    case 'frac':  return (b as typeof a).n === a.n && (b as typeof a).d === a.d
    case 'const': return (b as typeof a).name === a.name
    case 'neg':   return structEq(a.arg, (b as typeof a).arg)
    case 'pos':   return structEq(a.arg, (b as typeof a).arg)
    case 'fn1':   return a.fn === (b as typeof a).fn && structEq(a.arg, (b as typeof a).arg)
    case 'fnN':
      return a.fn === (b as typeof a).fn &&
             a.items.length === (b as typeof a).items.length &&
             a.items.every((x, i) => structEq(x, (b as typeof a).items[i]))
    case 'list':
      return a.items.length === (b as typeof a).items.length &&
             a.items.every((x, i) => structEq(x, (b as typeof a).items[i]))
    case 'fracmul':
      return structEq(a.frac, (b as typeof a).frac) && structEq(a.arg, (b as typeof a).arg)
    case 'angleMark':
      return a.unit === (b as typeof a).unit && structEq(a.expr, (b as typeof a).expr)
    case 'var':   return a.name === (b as typeof a).name
    case 'mref':  return a.name === (b as typeof a).name
    case 'graph': return structEq(a.expr, (b as typeof a).expr)
    case 'fnN2': {
      const bb = b as typeof a
      return a.fn === bb.fn &&
             a.xs.length === bb.xs.length && a.xs.every((x, i) => structEq(x, bb.xs[i])) &&
             a.ys.length === bb.ys.length && a.ys.every((y, i) => structEq(y, bb.ys[i]))
    }
    default: {
      const ab = a as { l: ParseNode; r: ParseNode }
      const bb = b as { l: ParseNode; r: ParseNode }
      return structEq(ab.l, bb.l) && structEq(ab.r, bb.r)
    }
  }
}
