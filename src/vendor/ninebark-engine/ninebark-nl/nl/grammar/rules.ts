import type { NlToken } from '../lexicon/classes'
import type { ParseNode, Forest } from './forest'
import { NlErrorCode } from '../errors'

// ── Stage D: Compositional grammar + recursive all-parses parser ──────────────
//
// Implements an all-parses recursive descent parser (semantically equivalent to
// an Earley chart parser for this grammar — same O(n³) complexity, same forest).
// Memoization prevents exponential blowup.
//
// Grammar productions (T1 + T4 per §3.3):
//
//   Expr  → Atom
//          | NEGATIVE Expr                           neg(E)         [DECISION-29a: also squared]
//          | Expr SQUARED                            pow(E,2)
//          | Expr CUBED                              pow(E,3)
//          | Expr ADD  Expr                          (E+E)
//          | Expr AND  Expr                          (E+E)          bare AND = add
//          | Expr SUB  Expr                          (E-E)
//          | Expr MUL  Expr                          (E*E)
//          | Expr DIV  Expr                          (E/E)
//          | Expr BY   Expr                          (E/E)          BY = divide
//          | Expr POW  Expr                          (E^E)
//          | MORE Expr THAN Expr                     (E2+E1)        order-inverting
//          | LESS Expr THAN Expr                     (E2-E1)        order-inverting
//          | FUNC1 OF  Expr                          fn(E)
//          | FUNC1     Expr                          fn(E)          OF optional
//          | FUNC1 LPAREN Expr RPAREN                fn(E)          formal: sqrt(16)
//          | FRAC  OF  Expr                          ((n/d)*E)      "half of X"
//          | FUNCN OF  ArgList                       fn({…})
//          | FUNCN     ArgList                       fn({…})        OF optional
//          | FUNCN OF  List                          fn(List)
//          | FUNCN     List                          fn(List)
//          | LPAREN Expr RPAREN                      (E)
//          | List
//
//   ArgList → Expr (AND Expr)*                       [AND as sep in funcn context]
//
//   List    → LBRACE  ListItems RBRACE               {items}
//           | LIST_FRAME ListItems                   {items}
//
//   ListItems → Expr (COMMA|AND Expr)*              [AND as sep inside list context]
//
//   Atom    → NUM | FRAC | CONST

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParseResult { node: ParseNode; end: number }

// Memo key: "nonTerminal:start"
type Memo = Map<string, ParseResult[]>

// ── Token helpers ─────────────────────────────────────────────────────────────

function peek(toks: NlToken[], i: number): NlToken | undefined { return toks[i] }

// ── Main exported parse function ──────────────────────────────────────────────

/**
 * Parse a (framing-stripped, number-resolved) token array.
 * Returns the Forest (all valid Expr parse trees spanning the full input).
 * An empty forest means E_NL_COVERAGE.
 * More than one tree means ambiguity — the policy (disambiguation/policy.ts) picks one.
 */
export function parseForest(tokens: NlToken[]): Forest {
  const memo: Memo = new Map()

  function memoKey(nt: string, start: number) { return `${nt}:${start}` }

  function memo_get(nt: string, start: number): ParseResult[] | undefined {
    return memo.get(memoKey(nt, start))
  }
  function memo_set(nt: string, start: number, results: ParseResult[]) {
    memo.set(memoKey(nt, start), results)
  }

  // ── Atom ─────────────────────────────────────────────────────────────────────
  function parseAtom(start: number): ParseResult[] {
    const cached = memo_get('Atom', start)
    if (cached) return cached
    const results: ParseResult[] = []
    const tok = peek(tokens, start)
    if (!tok) return []
    if (tok.cls === 'NUM' && tok.numVal !== undefined) {
      const numNode: ParseNode = { t: 'num', v: tok.numVal }
      // Sprint 8 E-NL: NUM followed by ANGLE_UNIT → angle-marked expression (DECISION-48)
      const nextTok = peek(tokens, start + 1)
      if (nextTok?.cls === 'ANGLE_UNIT' && nextTok.angleUnit) {
        results.push({ node: { t: 'angleMark', expr: numNode, unit: nextTok.angleUnit }, end: start + 2 })
      }
      results.push({ node: numNode, end: start + 1 })
    } else if (tok.cls === 'FRAC' && tok.fracNum !== undefined && tok.fracDen !== undefined) {
      results.push({ node: { t: 'frac', n: tok.fracNum, d: tok.fracDen }, end: start + 1 })
    } else if (tok.cls === 'CONST' && tok.constName) {
      const constNode: ParseNode = { t: 'const', name: tok.constName }
      // Sprint 8 E-NL: CONST followed by ANGLE_UNIT → angle-marked expression
      const nextTok = peek(tokens, start + 1)
      if (nextTok?.cls === 'ANGLE_UNIT' && nextTok.angleUnit) {
        results.push({ node: { t: 'angleMark', expr: constNode, unit: nextTok.angleUnit }, end: start + 2 })
      }
      results.push({ node: constNode, end: start + 1 })
    } else if (tok.cls === 'VARIABLE' && tok.varName) {
      // Sprint 8 A-NL: algebraic variable reference (for graph expressions)
      results.push({ node: { t: 'var', name: tok.varName }, end: start + 1 })
    } else if (tok.cls === 'MREF' && tok.mrefName) {
      // Sprint 8 B-NL: matrix register reference
      results.push({ node: { t: 'mref', name: tok.mrefName }, end: start + 1 })
    }
    memo_set('Atom', start, results)
    return results
  }

  // ── ListItems ─────────────────────────────────────────────────────────────────
  // ListItems: Expr (COMMA|AND Expr)*  (AND = separator in list context)
  function parseListItems(start: number): Array<{ items: ParseNode[]; end: number }> {
    const cached = memo.get(`LI:${start}`)
    if (cached !== undefined) return cached as unknown as Array<{ items: ParseNode[]; end: number }>

    const results: Array<{ items: ParseNode[]; end: number }> = []

    // Base: single Expr
    for (const e1 of parseExpr(start)) {
      results.push({ items: [e1.node], end: e1.end })

      // Extend with COMMA, AND, or juxtaposed atoms (Sprint 7.5 §Q DECISION-40)
      // Juxtaposition (whitespace between numbers) is allowed inside list framing only.
      // Scoped to atomic next items (NUM/FRAC/CONST) to prevent ambiguity with expressions.
      let queue: Array<{ items: ParseNode[]; end: number }> = [{ items: [e1.node], end: e1.end }]
      while (queue.length > 0) {
        const next: typeof queue = []
        for (const cur of queue) {
          const sep = peek(tokens, cur.end)
          if (sep && (sep.cls === 'COMMA' || sep.cls === 'AND')) {
            let nextStart = cur.end + 1
            // Oxford comma: skip "and" immediately after ","
            if (sep.cls === 'COMMA' && tokens[nextStart]?.cls === 'AND') nextStart++
            for (const en of parseExpr(nextStart)) {
              const extended = { items: [...cur.items, en.node], end: en.end }
              results.push(extended)
              next.push(extended)
            }
          }
          // Juxtaposition: consecutive numeric atom → treat as list separator
          if (sep && (sep.cls === 'NUM' || sep.cls === 'FRAC' || sep.cls === 'CONST')) {
            for (const en of parseAtom(cur.end)) {
              const extended = { items: [...cur.items, en.node], end: en.end }
              results.push(extended)
              next.push(extended)
            }
          }
        }
        queue = next
      }
    }

    memo.set(`LI:${start}`, results as unknown as ParseResult[])
    return results
  }

  // ── List ─────────────────────────────────────────────────────────────────────
  function parseList(start: number): ParseResult[] {
    const cached = memo_get('List', start)
    if (cached) return cached
    const results: ParseResult[] = []
    const tok = peek(tokens, start)
    if (!tok) { memo_set('List', start, []); return [] }

    // {ListItems}
    if (tok.cls === 'LBRACE') {
      for (const li of parseListItems(start + 1)) {
        const close = peek(tokens, li.end)
        if (close?.cls === 'RBRACE') {
          results.push({ node: { t: 'list', items: li.items }, end: li.end + 1 })
        }
      }
    }

    // LIST_FRAME ListItems
    if (tok.cls === 'LIST_FRAME') {
      for (const li of parseListItems(start + 1)) {
        results.push({ node: { t: 'list', items: li.items }, end: li.end })
      }
    }

    memo_set('List', start, results)
    return results
  }

  // ── ArgList ───────────────────────────────────────────────────────────────────
  // ArgList: Expr (AND Expr)*  — AND = separator in FUNCN context (DECISION-29)
  function parseArgList(start: number): Array<{ items: ParseNode[]; end: number }> {
    const cached = memo.get(`AL:${start}`)
    if (cached !== undefined) return cached as unknown as Array<{ items: ParseNode[]; end: number }>

    const results: Array<{ items: ParseNode[]; end: number }> = []
    for (const e1 of parseExpr(start)) {
      results.push({ items: [e1.node], end: e1.end })
      // Extend with AND
      let queue: Array<{ items: ParseNode[]; end: number }> = [{ items: [e1.node], end: e1.end }]
      while (queue.length > 0) {
        const next: typeof queue = []
        for (const cur of queue) {
          const sep = peek(tokens, cur.end)
          if (sep?.cls === 'AND' || sep?.cls === 'COMMA') {
            let nextStart = cur.end + 1
            // Oxford comma: skip "and" immediately after ","
            if (sep.cls === 'COMMA' && tokens[nextStart]?.cls === 'AND') nextStart++
            for (const en of parseExpr(nextStart)) {
              const extended = { items: [...cur.items, en.node], end: en.end }
              results.push(extended)
              next.push(extended)
            }
          }
        }
        queue = next
      }
    }

    memo.set(`AL:${start}`, results as unknown as ParseResult[])
    return results
  }

  // ── Primary ───────────────────────────────────────────────────────────────────
  // Atoms plus parenthesized expressions — used as the RHS of binary POW.
  // Restricting the exponent to a primary prevents the all-parses engine from
  // generating trees like pow(x, sub(2, ...)) when the tail of the token stream
  // is logically at the same precedence level as the base expression.
  // This matches standard infix-^ convention: "x^2-9x+4" = "(x^2)-(9x)+4",
  // not "x^(2-9x+4)". Explicit parentheses still work: "x^(y+1)" is valid.
  function parsePrimaryExpr(start: number): ParseResult[] {
    const cached = memo_get('Primary', start)
    if (cached) return cached
    const results: ParseResult[] = [...parseAtom(start)]
    if (peek(tokens, start)?.cls === 'LPAREN') {
      for (const inner of parseExpr(start + 1)) {
        if (peek(tokens, inner.end)?.cls === 'RPAREN') {
          results.push({ node: inner.node, end: inner.end + 1 })
        }
      }
    }
    memo_set('Primary', start, results)
    return results
  }

  // ── Expr ──────────────────────────────────────────────────────────────────────
  function parseExpr(start: number): ParseResult[] {
    const cached = memo_get('Expr', start)
    if (cached) return cached

    // Sentinel to prevent infinite left-recursion on first call for this position
    memo_set('Expr', start, [])

    const results: ParseResult[] = []

    // Atom
    for (const a of parseAtom(start)) results.push(a)

    // List
    for (const l of parseList(start)) results.push(l)

    // LPAREN Expr RPAREN
    if (peek(tokens, start)?.cls === 'LPAREN') {
      for (const inner of parseExpr(start + 1)) {
        if (peek(tokens, inner.end)?.cls === 'RPAREN') {
          results.push({ node: inner.node, end: inner.end + 1 })
        }
      }
    }

    // NEGATIVE Expr  (DECISION-29a: negative applies to nearest atom)
    if (peek(tokens, start)?.cls === 'NEGATIVE') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'neg', arg: e.node }, end: e.end })
      }
    }

    // ── Sprint 7.4: Unary sign forms (§F / DECISION-38) ──────────────────────
    // ADD in prefix position → unary plus (identity; emits (+X) so the formal
    // string is explicit, but evaluates as X). Non-sign doubled ops reject (§J).
    if (peek(tokens, start)?.cls === 'ADD') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'pos', arg: e.node }, end: e.end })
      }
    }
    // SUB in prefix position → unary minus (same semantic as NEGATIVE, different word)
    if (peek(tokens, start)?.cls === 'SUB') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'neg', arg: e.node }, end: e.end })
      }
    }

    // ── Sprint 7.4: Command-verb forms §A (DECISION-38) ──────────────────────
    // CMD_ADD Expr (AND|COMMA) Expr → add(X,Y)   "add X and Y"
    // CMD_ADD Expr Expr            → add(X,Y)   "add X to Y" (where "to" is FRAMING-stripped)
    if (peek(tokens, start)?.cls === 'CMD_ADD') {
      for (const e1 of parseExpr(start + 1)) {
        const sep = peek(tokens, e1.end)
        if (sep && (sep.cls === 'AND' || sep.cls === 'COMMA' || sep.cls === 'ADD')) {
          for (const e2 of parseExpr(e1.end + 1)) {
            results.push({ node: { t: 'add', l: e1.node, r: e2.node }, end: e2.end })
          }
        } else {
          // Juxtaposition: "to" was FRAMING-stripped, leaving adjacent expressions
          for (const e2 of parseExpr(e1.end)) {
            if (e2.end > e1.end) {
              results.push({ node: { t: 'add', l: e1.node, r: e2.node }, end: e2.end })
            }
          }
        }
      }
    }

    // CMD_SUB Expr FROM Expr → sub(Y, X)   "subtract X from Y" (INVERTS)
    // Also handles "take X from Y" (CMD_SUB = both "subtract" and "take")
    if (peek(tokens, start)?.cls === 'CMD_SUB') {
      for (const e1 of parseExpr(start + 1)) {
        const sep = peek(tokens, e1.end)
        if (sep?.cls === 'FROM') {
          for (const e2 of parseExpr(e1.end + 1)) {
            results.push({ node: { t: 'sub', l: e2.node, r: e1.node }, end: e2.end })
          }
        }
      }
    }

    // CMD_MUL Expr (BY|AND|MUL) Expr → mul(X,Y), chains left-assoc (DECISION-38)
    // "multiply 2 by 3 by 4" → ((2*3)*4)
    if (peek(tokens, start)?.cls === 'CMD_MUL') {
      // Collect initial results: CMD_MUL e1 (sep) e2
      // e1 must NOT be a binary op — if it is, it means BY was consumed as division
      // inside the first operand (e.g. "multiply 2 by 3" → e1=div(2,3)), which is wrong.
      // The CMD_MUL chain extension handles repeated BY as multiplication.
      const isBinaryTop = (n: ParseNode) =>
        n.t === 'add' || n.t === 'sub' || n.t === 'mul' || n.t === 'div' || n.t === 'pow'
      let chain: ParseResult[] = []
      for (const e1 of parseExpr(start + 1)) {
        if (isBinaryTop(e1.node)) continue  // skip; BY in e1 would be treated as ÷ (wrong)
        const sep = peek(tokens, e1.end)
        if (sep && (sep.cls === 'BY' || sep.cls === 'AND' || sep.cls === 'MUL')) {
          for (const e2 of parseExpr(e1.end + 1)) {
            const r: ParseResult = { node: { t: 'mul', l: e1.node, r: e2.node }, end: e2.end }
            chain.push(r)
            results.push(r)
          }
        }
      }
      // Extend chain left-assoc: look for additional BY/AND/MUL after each candidate
      let changed2 = true
      while (changed2) {
        changed2 = false
        const next: ParseResult[] = []
        for (const c of chain) {
          const sep2 = peek(tokens, c.end)
          if (sep2 && (sep2.cls === 'BY' || sep2.cls === 'AND' || sep2.cls === 'MUL')) {
            for (const en of parseExpr(c.end + 1)) {
              const r: ParseResult = { node: { t: 'mul', l: c.node, r: en.node }, end: en.end }
              const exists = results.some(x => x.end === r.end && nodeEq(x.node, r.node))
              if (!exists) { next.push(r); results.push(r); changed2 = true }
            }
          }
        }
        chain = next
      }
    }

    // CMD_DIV Expr BY Expr → div(X,Y)   "divide X by Y"
    if (peek(tokens, start)?.cls === 'CMD_DIV') {
      for (const e1 of parseExpr(start + 1)) {
        const sep = peek(tokens, e1.end)
        if (sep?.cls === 'BY') {
          for (const e2 of parseExpr(e1.end + 1)) {
            results.push({ node: { t: 'div', l: e1.node, r: e2.node }, end: e2.end })
          }
        }
      }
    }

    // CMD_POW Expr POW Expr → pow(X,Y)   "raise X to the power of Y"
    if (peek(tokens, start)?.cls === 'CMD_POW') {
      for (const e1 of parseExpr(start + 1)) {
        const sep = peek(tokens, e1.end)
        if (sep?.cls === 'POW') {
          for (const e2 of parseExpr(e1.end + 1)) {
            results.push({ node: { t: 'pow', l: e1.node, r: e2.node }, end: e2.end })
          }
        }
      }
    }

    // CMD_SQ Expr → pow(Expr, 2)   "square X" → (X^2)
    if (peek(tokens, start)?.cls === 'CMD_SQ') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'pow', l: e.node, r: { t: 'num', v: '2' } }, end: e.end })
      }
    }

    // CMD_CB Expr → pow(Expr, 3)   "cube X" → (X^3)
    if (peek(tokens, start)?.cls === 'CMD_CB') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'pow', l: e.node, r: { t: 'num', v: '3' } }, end: e.end })
      }
    }

    // CMD_NEG Expr → neg(Expr)   "negate X" → (-X)
    if (peek(tokens, start)?.cls === 'CMD_NEG') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'neg', arg: e.node }, end: e.end })
      }
    }

    // NOTE: "X more than Y" and "X less than Y" are INFIX patterns handled in the
    // binary extension section below (Expr MORE THAN Expr, Expr LESS THAN Expr).

    // FUNC1 OF? Expr  and  FUNC1 LPAREN Expr RPAREN
    if (peek(tokens, start)?.cls === 'FUNC1') {
      const fn = tokens[start].fn1Name!
      // FUNC1 OF Expr
      if (peek(tokens, start + 1)?.cls === 'OF') {
        for (const e of parseExpr(start + 2)) {
          results.push({ node: { t: 'fn1', fn, arg: e.node }, end: e.end })
        }
      }
      // FUNC1 Expr  (OF optional — allows "sqrt 16")
      for (const e of parseExpr(start + 1)) {
        // Only if next token is not OF (we already handled that above)
        results.push({ node: { t: 'fn1', fn, arg: e.node }, end: e.end })
      }
      // FUNC1 LPAREN Expr RPAREN  — formal syntax "sqrt(16)"
      if (peek(tokens, start + 1)?.cls === 'LPAREN') {
        for (const e of parseExpr(start + 2)) {
          if (peek(tokens, e.end)?.cls === 'RPAREN') {
            results.push({ node: { t: 'fn1', fn, arg: e.node }, end: e.end + 1 })
          }
        }
      }
    }

    // FRAC [OF] Expr  → ((n/d) * Expr)  (OF optional so "half the sum of X and Y" works)
    if (peek(tokens, start)?.cls === 'FRAC') {
      const ftok = tokens[start]
      const frac: ParseNode = { t: 'frac', n: ftok.fracNum!, d: ftok.fracDen! }
      const withOf = peek(tokens, start + 1)?.cls === 'OF'
      const fracExprStart = withOf ? start + 2 : start + 1
      for (const e of parseExpr(fracExprStart)) {
        results.push({ node: { t: 'fracmul', frac, arg: e.node }, end: e.end })
      }
    }

    // Sprint 7.5: Derived/reciprocal trig (DECISION-41 §M) — NL sugar only.
    // The engine has no sec/csc/cot; the grammar expands them to (1/cos(X)) etc.
    // Both "secant X" and "secant of X" produce SECANT token (of consumed in LEXICON entry).
    if (peek(tokens, start)?.cls === 'SECANT') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'div', l: { t: 'num', v: '1' }, r: { t: 'fn1', fn: 'cos', arg: e.node } }, end: e.end })
      }
    }
    if (peek(tokens, start)?.cls === 'COSECANT') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'div', l: { t: 'num', v: '1' }, r: { t: 'fn1', fn: 'sin', arg: e.node } }, end: e.end })
      }
    }
    if (peek(tokens, start)?.cls === 'COTANGENT') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'div', l: { t: 'num', v: '1' }, r: { t: 'fn1', fn: 'tan', arg: e.node } }, end: e.end })
      }
    }

    // Sprint 7.5: LOG_BASE Expr OF Expr → fnN('logbase', [val, base]) (§N DECISION-40)
    // "log base B of X" → logbase(X, B) [engine arg order: value first, base second]
    if (peek(tokens, start)?.cls === 'LOG_BASE') {
      for (const base of parseExpr(start + 1)) {
        if (peek(tokens, base.end)?.cls === 'OF') {
          for (const val of parseExpr(base.end + 1)) {
            results.push({ node: { t: 'fnN', fn: 'logbase', items: [val.node, base.node] }, end: val.end })
          }
        }
      }
    }

    // Sprint 7.5: QUADRUPLE Expr → (X * 4)  HALVE Expr → (X / 2)  (§P DECISION-40)
    if (peek(tokens, start)?.cls === 'QUADRUPLE') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'mul', l: e.node, r: { t: 'num', v: '4' } }, end: e.end })
      }
    }
    if (peek(tokens, start)?.cls === 'HALVE') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'div', l: e.node, r: { t: 'num', v: '2' } }, end: e.end })
      }
    }

    // TWICE Expr → (2 * Expr)   TRIPLE Expr → (3 * Expr)
    if (peek(tokens, start)?.cls === 'TWICE') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'mul', l: { t: 'num', v: '2' }, r: e.node }, end: e.end })
      }
    }
    if (peek(tokens, start)?.cls === 'TRIPLE') {
      for (const e of parseExpr(start + 1)) {
        results.push({ node: { t: 'mul', l: { t: 'num', v: '3' }, r: e.node }, end: e.end })
      }
    }

    // FUNCN [OF] (ArgList | List)
    if (peek(tokens, start)?.cls === 'FUNCN') {
      const fn = tokens[start].fnNName!
      const afterFn = start + 1
      const ofNext = peek(tokens, afterFn)?.cls === 'OF'
      const argsStart = ofNext ? afterFn + 1 : afterFn

      // FUNCN [OF] List
      for (const l of parseList(argsStart)) {
        results.push({ node: { t: 'fnN', fn, items: (l.node as { items: ParseNode[] }).items }, end: l.end })
      }
      // FUNCN [OF] ArgList (AND/COMMA separated)
      for (const al of parseArgList(argsStart)) {
        if (al.items.length === 1 && al.items[0].t === 'list') {
          // Already a list node — use directly
          results.push({ node: { t: 'fnN', fn, items: (al.items[0] as { items: ParseNode[] }).items }, end: al.end })
        } else {
          results.push({ node: { t: 'fnN', fn, items: al.items }, end: al.end })
        }
      }
      // FUNCN [OF] parseListItems — function-framed bare lists (Sprint 7.6 §T / DECISION-42).
      // The function word itself establishes list framing; whitespace/juxtaposition is a separator.
      // "median 1 2 3 4 5" → median({1, 2, 3, 4, 5}). Scoped to parseListItems (not global parseExpr)
      // so that bare "1 2 3" without a function frame still rejects (RISK-34 preserved).
      // Guard: skip when argsStart points to LIST_FRAME — parseList already covers that case and
      // calling parseListItems here would produce a {list-node} wrapper creating spurious ambiguity.
      {
        const firstTok = peek(tokens, argsStart)
        if (firstTok && firstTok.cls !== 'LIST_FRAME') {
          for (const li of parseListItems(argsStart)) {
            results.push({ node: { t: 'fnN', fn, items: li.items }, end: li.end })
          }
        }
      }
    }

    memo_set('Expr', start, results)

    // ── Binary left-recursive operators (iterative to avoid infinite recursion) ──
    // We seed from the results collected above, then grow left-to-right.
    let changed = true
    while (changed) {
      changed = false
      const current = [...(memo_get('Expr', start) ?? [])]
      const newResults: ParseResult[] = []

      for (const lhs of current) {
        const opTok = peek(tokens, lhs.end)
        if (!opTok) continue

        if (opTok.cls === 'ADD' || opTok.cls === 'AND') {
          for (const rhs of parseExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'add', l: lhs.node, r: rhs.node }, end: rhs.end })
          }
        }
        if (opTok.cls === 'SUB') {
          for (const rhs of parseExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'sub', l: lhs.node, r: rhs.node }, end: rhs.end })
          }
        }
        if (opTok.cls === 'MUL') {
          for (const rhs of parseExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'mul', l: lhs.node, r: rhs.node }, end: rhs.end })
          }
        }
        if (opTok.cls === 'DIV' || opTok.cls === 'BY') {
          for (const rhs of parseExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'div', l: lhs.node, r: rhs.node }, end: rhs.end })
          }
        }
        if (opTok.cls === 'POW') {
          // DECISION-68: exponent RHS is a primary (atom or parenthesized expression),
          // not a full Expr. This prevents "x^2-9x+4" from generating pow(x, sub(2,...)).
          for (const rhs of parsePrimaryExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'pow', l: lhs.node, r: rhs.node }, end: rhs.end })
          }
        }
        if (opTok.cls === 'SQUARED') {
          newResults.push({ node: { t: 'pow', l: lhs.node, r: { t: 'num', v: '2' } }, end: lhs.end + 1 })
        }
        if (opTok.cls === 'CUBED') {
          newResults.push({ node: { t: 'pow', l: lhs.node, r: { t: 'num', v: '3' } }, end: lhs.end + 1 })
        }
        // Sprint 7.5: ordinal/elliptical power postfix (§O DECISION-40)
        // "2 to the third" → (2 ^ 3); "5 to the fourth power" → (5 ^ 4)
        if (opTok.cls === 'POW_N' && opTok.powVal) {
          newResults.push({ node: { t: 'pow', l: lhs.node, r: { t: 'num', v: opTok.powVal } }, end: lhs.end + 1 })
        }
        // Sprint 7.5: Nth-root via FRAC ROOT_OF Expr binary extension (§N DECISION-40)
        // "the third root of 27" → FRAC(1,3) ROOT_OF NUM(27) → pow(27, frac(1,3)) = 27^(1/3)
        if (opTok.cls === 'ROOT_OF' && lhs.node.t === 'frac') {
          for (const rhs of parseExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'pow', l: rhs.node, r: lhs.node }, end: rhs.end })
          }
        }
        // Sprint 7.5: postfix multiplier participles (§P DECISION-40)
        if (opTok.cls === 'DOUBLED') {
          newResults.push({ node: { t: 'mul', l: lhs.node, r: { t: 'num', v: '2' } }, end: lhs.end + 1 })
        }
        if (opTok.cls === 'TRIPLED') {
          newResults.push({ node: { t: 'mul', l: lhs.node, r: { t: 'num', v: '3' } }, end: lhs.end + 1 })
        }
        if (opTok.cls === 'QUADRUPLED') {
          newResults.push({ node: { t: 'mul', l: lhs.node, r: { t: 'num', v: '4' } }, end: lhs.end + 1 })
        }
        if (opTok.cls === 'HALVED') {
          newResults.push({ node: { t: 'div', l: lhs.node, r: { t: 'num', v: '2' } }, end: lhs.end + 1 })
        }
        // Percent: "X percent" → (X/100); "X percent of Y" → ((X/100)*Y)
        if (opTok.cls === 'PERCENT') {
          const pctNode: ParseNode = { t: 'div', l: lhs.node, r: { t: 'num', v: '100' } }
          newResults.push({ node: pctNode, end: lhs.end + 1 })
          const afterPct = peek(tokens, lhs.end + 1)
          if (afterPct?.cls === 'OF') {
            for (const rhs of parseExpr(lhs.end + 2)) {
              newResults.push({ node: { t: 'mul', l: pctNode, r: rhs.node }, end: rhs.end })
            }
          }
        }
        // Sprint 7.6: Postfix / verb-final operator forms (§X / DECISION-42).
        // "Expr AND Expr add/added" → (A+B). "Expr AND Expr multiply/multiplied" → (A*B).
        // The trailing CMD_VERB names the operation; when lhs is already a binary node
        // (built by AND-joiner or other binary), the verb confirms or overrides the operator.
        // This only fires when CMD_VERB appears after a complete lhs — CMD_VERB as PREFIX
        // requires a right operand (which is absent here), so no ambiguity on full-span inputs.
        if (opTok.cls === 'CMD_ADD') {
          // Postfix ADD: lhs must already be a binary expression.
          // "2 and 2 add" → add(2,2)+1. Trailing add is a no-op (verb confirms).
          if (lhs.node.t === 'add' || lhs.node.t === 'sub' || lhs.node.t === 'mul' || lhs.node.t === 'div') {
            newResults.push({ node: lhs.node, end: lhs.end + 1 })
          }
        }
        if (opTok.cls === 'CMD_MUL') {
          // Postfix MUL: "X and Y multiply" → mul(X,Y). Reinterprets lhs add(X,Y) as mul(X,Y).
          if (lhs.node.t === 'add') {
            const bin = lhs.node as { l: ParseNode; r: ParseNode }
            newResults.push({ node: { t: 'mul', l: bin.l, r: bin.r }, end: lhs.end + 1 })
          }
          if (lhs.node.t === 'mul') {
            newResults.push({ node: lhs.node, end: lhs.end + 1 })
          }
        }
        if (opTok.cls === 'CMD_SUB') {
          // Postfix SUB: "X from Y subtract" → sub(Y,X). lhs sub already inverted by SUBFROM.
          if (lhs.node.t === 'sub') {
            newResults.push({ node: lhs.node, end: lhs.end + 1 })
          }
          // "X and Y subtract" → sub(X,Y) (no inversion since AND used, not FROM).
          if (lhs.node.t === 'add') {
            const bin = lhs.node as { l: ParseNode; r: ParseNode }
            newResults.push({ node: { t: 'sub', l: bin.l, r: bin.r }, end: lhs.end + 1 })
          }
        }
        if (opTok.cls === 'CMD_DIV') {
          // Postfix DIV: "X and Y divide" → div(X,Y).
          if (lhs.node.t === 'add') {
            const bin = lhs.node as { l: ParseNode; r: ParseNode }
            newResults.push({ node: { t: 'div', l: bin.l, r: bin.r }, end: lhs.end + 1 })
          }
          if (lhs.node.t === 'div') {
            newResults.push({ node: lhs.node, end: lhs.end + 1 })
          }
        }
        // INFIX "X more than Y" → (Y + X)  [order-inverting: Y is base, X is amount]
        if (opTok.cls === 'MORE' && peek(tokens, lhs.end + 1)?.cls === 'THAN') {
          for (const rhs of parseExpr(lhs.end + 2)) {
            newResults.push({ node: { t: 'add', l: rhs.node, r: lhs.node }, end: rhs.end })
          }
        }
        // INFIX "X less than Y" → (Y - X)  [order-inverting]
        if (opTok.cls === 'LESS' && peek(tokens, lhs.end + 1)?.cls === 'THAN') {
          for (const rhs of parseExpr(lhs.end + 2)) {
            newResults.push({ node: { t: 'sub', l: rhs.node, r: lhs.node }, end: rhs.end })
          }
        }
        // INFIX "X subtracted from Y" → (Y - X)  [order-inverting, DECISION-34]
        if (opTok.cls === 'SUBFROM') {
          for (const rhs of parseExpr(lhs.end + 1)) {
            newResults.push({ node: { t: 'sub', l: rhs.node, r: lhs.node }, end: rhs.end })
          }
        }
      }

      // Add new results that aren't already present
      for (const nr of newResults) {
        const exists = current.some(c => c.end === nr.end && nodeEq(c.node, nr.node))
        if (!exists) {
          current.push(nr)
          changed = true
        }
      }

      memo_set('Expr', start, current)
    }

    return memo_get('Expr', start) ?? []
  }

  const allParses = parseExpr(0)
  // Keep only parses that consume ALL tokens
  const forest = allParses.filter(p => p.end === tokens.length).map(p => p.node)

  // Sprint 8 A-NL: "graph/plot/sketch <expr>" → graph intent node (DECISION-44)
  if (tokens.length > 0 && tokens[0].cls === 'GRAPH_INTENT') {
    const graphParses = parseExpr(1).filter(p => p.end === tokens.length)
    for (const gp of graphParses) {
      forest.push({ t: 'graph', expr: gp.node })
    }
  }

  // Sprint 8.1 #8: Count-noun production — "1 variable statistics of …" / "one var stats …"
  // 'one'/'1' are consumed as NUM before tryLexicon so they never appear in FUNCN entries.
  // If tokens[0] is NUM('1') and tokens[1] is FUNCN, treat the leading '1' as a count noun
  // (the "1-variable" adjective) and parse the expression starting from the FUNCN.
  if (tokens.length > 1 && tokens[0].cls === 'NUM' && tokens[0].numVal === '1' &&
      tokens[1].cls === 'FUNCN') {
    const countParses = parseExpr(1).filter(p => p.end === tokens.length)
    for (const cp of countParses) {
      if (!forest.some(f => nodeEq(f, cp.node))) forest.push(cp.node)
    }
  }

  // Sprint 8 D-NL / Sprint 8.1 #9: two-list and coordinate-pair regression (DECISION-50)
  // REG2 token at position 0; data follows in one of two forms:
  //   a) Two-list: "<xs> and <ys>" — AND acts as x/y delimiter
  //   b) Coordinate pairs: "(x,y) (x,y) ..." — parsed by parsePairList
  if (tokens.length > 0 && tokens[0].cls === 'REG2' && tokens[0].reg2Name) {
    const fn = tokens[0].reg2Name

    // Attempt a) — coordinate pairs: (x,y) (x,y) ...
    const pairResult = parsePairList(1)
    if (pairResult && pairResult.end === tokens.length) {
      forest.push({ t: 'fnN2', fn, xs: pairResult.xs, ys: pairResult.ys })
    }

    // Attempt b) — AND-separated two lists
    let foundTwoList = false
    for (const xi of parseListItems(1)) {
      if (tokens[xi.end]?.cls !== 'AND') continue
      for (const yi of parseListItems(xi.end + 1)) {
        if (yi.end !== tokens.length) continue
        forest.push({ t: 'fnN2', fn, xs: xi.items, ys: yi.items })
        foundTwoList = true
      }
    }

    // Sprint 8.1 #10: single flat list → clear error (never guess the missing axis)
    if (!foundTwoList && !pairResult) {
      // Check if there IS any list data (non-zero number of list items from pos 1)
      const singleItems = parseListItems(1)
      const hasItems = singleItems.some(r => r.items.length > 0 && r.end === tokens.length)
      if (hasItems) {
        throw { code: NlErrorCode.REGRESSION_NEEDS_PAIRS }
      }
    }
  }

  // Sprint 10.1 M130 / DECISION-60: unit-conversion sugar → arithmetic.
  // Pattern: <value-atom> <UNIT_CONV> (the UNIT_CONV token encodes both fromUnit and toUnit).
  // Output: { t: 'unitConv', value, factor } → emitter folds to (value * factor).
  // 'convert' is in IGNORE_VOCAB so "convert 90 degrees to radians" reaches here as-is.
  if (tokens.length === 2 && tokens[1].cls === 'UNIT_CONV') {
    const ct = tokens[1]
    if (ct.convFrom && ct.convTo) {
      const factor = unitConvFactor(ct.convFrom, ct.convTo)
      for (const ap of parseAtom(0)) {
        if (ap.end === 1) {
          forest.push({ t: 'unitConv', value: ap.node, factor })
        }
      }
    }
  }

  // ── parsePairList: parse "(x,y) (x,y) ..." starting at pos ──────────────────
  function parsePairList(start: number): { xs: ParseNode[]; ys: ParseNode[]; end: number } | null {
    const xs: ParseNode[] = []
    const ys: ParseNode[] = []
    let pos = start
    while (pos < tokens.length) {
      // Expect LPAREN
      if (tokens[pos]?.cls !== 'LPAREN') break
      // Parse x value from pos+1
      const xParses = parseAtom(pos + 1)
      const xp = xParses.find(r => tokens[r.end]?.cls === 'COMMA')
      if (!xp) break
      // Parse y value after comma
      const yParses = parseAtom(xp.end + 1)
      const yp = yParses.find(r => tokens[r.end]?.cls === 'RPAREN')
      if (!yp) break
      xs.push(xp.node)
      ys.push(yp.node)
      pos = yp.end + 1 // move past RPAREN
    }
    if (xs.length < 2) return null
    return { xs, ys, end: pos }
  }

  return forest
}

// ── Unit conversion factor node builder (Sprint 10.1 M130 / DECISION-60) ─────
// Returns a ParseNode representing the conversion multiplier (purely arithmetic).
// deg→rad:  (pi / 180)   rad→deg: (180 / pi)
// grad→rad: (pi / 200)   rad→grad: (200 / pi)
// deg→grad: (200 / 180)  grad→deg: (180 / 200)
// Uses ASCII 'pi' (not 'π') — the calc tokenizer recognizes 'pi' as a named constant.
function unitConvFactor(from: string, to: string): ParseNode {
  const PI: ParseNode  = { t: 'const', name: 'pi' }
  const N180: ParseNode = { t: 'num', v: '180' }
  const N200: ParseNode = { t: 'num', v: '200' }
  if (from === 'degrees'  && to === 'radians')  return { t: 'div', l: PI,   r: N180 }
  if (from === 'radians'  && to === 'degrees')  return { t: 'div', l: N180, r: PI   }
  if (from === 'gradians' && to === 'radians')  return { t: 'div', l: PI,   r: N200 }
  if (from === 'radians'  && to === 'gradians') return { t: 'div', l: N200, r: PI   }
  if (from === 'degrees'  && to === 'gradians') return { t: 'div', l: N200, r: N180 }
  if (from === 'gradians' && to === 'degrees')  return { t: 'div', l: N180, r: N200 }
  // same unit: factor = 1 (identity, shouldn't normally be called)
  return { t: 'num', v: '1' }
}

// ── Structural equality (for deduplication) ───────────────────────────────────

function nodeEq(a: ParseNode, b: ParseNode): boolean {
  if (a.t !== b.t) return false
  switch (a.t) {
    case 'num':   return (b as typeof a).v === a.v
    case 'frac':  return (b as typeof a).n === a.n && (b as typeof a).d === a.d
    case 'const': return (b as typeof a).name === a.name
    case 'neg':   return nodeEq(a.arg, (b as typeof a).arg)
    case 'pos':   return nodeEq(a.arg, (b as typeof a).arg)
    case 'fn1':   return a.fn === (b as typeof a).fn && nodeEq(a.arg, (b as typeof a).arg)
    case 'fnN':   return a.fn === (b as typeof a).fn && a.items.length === (b as typeof a).items.length && a.items.every((x, i) => nodeEq(x, (b as typeof a).items[i]))
    case 'list':  return a.items.length === (b as typeof a).items.length && a.items.every((x, i) => nodeEq(x, (b as typeof a).items[i]))
    case 'fracmul': return nodeEq(a.frac, (b as typeof a).frac) && nodeEq(a.arg, (b as typeof a).arg)
    case 'angleMark': return (b as typeof a).unit === a.unit && nodeEq(a.expr, (b as typeof a).expr)
    case 'var':  return (b as typeof a).name === a.name
    case 'mref': return (b as typeof a).name === a.name
    case 'graph': return nodeEq(a.expr, (b as typeof a).expr)
    case 'fnN2': return a.fn === (b as typeof a).fn && a.xs.length === (b as typeof a).xs.length && a.ys.length === (b as typeof a).ys.length && a.xs.every((x, i) => nodeEq(x, (b as typeof a).xs[i])) && a.ys.every((y, i) => nodeEq(y, (b as typeof a).ys[i]))
    case 'unitConv': return nodeEq(a.value, (b as typeof a).value) && nodeEq(a.factor, (b as typeof a).factor)
    default: {
      const bin = a as { l: ParseNode; r: ParseNode }
      const bbin = b as { l: ParseNode; r: ParseNode }
      return nodeEq(bin.l, bbin.l) && nodeEq(bin.r, bbin.r)
    }
  }
}
