import type { ParseNode } from '../grammar/forest'
import { NlErrorCode } from '../errors'

// ── Stage D output: fully-parenthesized formal string emitter ─────────────────
//
// Every binary operation is wrapped in parens so the emitted string is invariant
// under the Pratt parser's EOS table. EOS still lives solely in the Pratt parser;
// on NL-sourced input it has nothing to decide (DECISION-31).

export function emit(node: ParseNode): string {
  switch (node.t) {
    case 'num':
      // Normalize leading-decimal form: ".25" → "0.25" (Sprint 8.1 #6)
      return node.v.startsWith('.') ? '0' + node.v : node.v

    case 'frac':
      // "(n/d)" — parenthesized so it always groups correctly
      return `(${node.n}/${node.d})`

    case 'const':
      return node.name  // 'pi' or 'e'

    case 'neg':
      // Inner arg wrapped in parens so "((-4) ^ 2)" works as expected (DECISION-29a)
      return `(-${emit(node.arg)})`

    case 'pos':
      // Unary plus (identity). Explicit (+X) form so the formal string is unambiguous.
      // The Pratt parser supports unary + and evaluates it as identity (Sprint 7.4/F).
      return `(+${emit(node.arg)})`

    case 'add':
      return `(${emit(node.l)} + ${emit(node.r)})`

    case 'sub':
      return `(${emit(node.l)} - ${emit(node.r)})`

    case 'mul':
      return `(${emit(node.l)} * ${emit(node.r)})`

    case 'div':
      return `(${emit(node.l)} / ${emit(node.r)})`

    case 'pow':
      return `(${emit(node.l)} ^ ${emit(node.r)})`

    case 'fn1':
      return `${node.fn}(${emit(node.arg)})`

    case 'fnN': {
      // "sum of X and Y" with exactly 2 scalars → binary addition (DECISION-34)
      if (node.fn === 'sum' && node.items.length === 2 &&
          node.items[0].t !== 'list' && node.items[1].t !== 'list') {
        return `(${emit(node.items[0])} + ${emit(node.items[1])})`
      }
      // "product of X and Y" with exactly 2 scalars → binary multiplication (DECISION-34)
      if (node.fn === 'prod' && node.items.length === 2 &&
          node.items[0].t !== 'list' && node.items[1].t !== 'list') {
        return `(${emit(node.items[0])} * ${emit(node.items[1])})`
      }
      // "difference of X and Y" → (X − Y), arity must be exactly 2 (DECISION-34)
      if (node.fn === 'difference') {
        if (node.items.length !== 2) throw { code: NlErrorCode.ARITY }
        return `(${emit(node.items[0])} - ${emit(node.items[1])})`
      }
      // "quotient of X and Y" → (X / Y), arity must be exactly 2 (DECISION-34)
      if (node.fn === 'quotient') {
        if (node.items.length !== 2) throw { code: NlErrorCode.ARITY }
        return `(${emit(node.items[0])} / ${emit(node.items[1])})`
      }
      const args = node.items.map(emit).join(', ')
      return `${node.fn}({${args}})`
    }

    case 'list': {
      const items = node.items.map(emit).join(', ')
      return `{${items}}`
    }

    case 'fracmul':
      // ((n/d) * arg) — "half of 20" → ((1/2) * 20)
      return `(${emit(node.frac)} * ${emit(node.arg)})`

    // Sprint 8 nodes (DECISION-44/48):

    case 'angleMark': {
      const inner = emit(node.expr)
      const marker = node.unit === 'degrees' ? '°' : node.unit === 'radians' ? 'rad' : 'grad'
      // Space before word markers (rad/grad) when inner ends in a letter, to prevent
      // alphabetic run fusion (e.g. 'pi'+'rad' → 'pirad', an unknown token).
      const sep = marker === '°' || !/[a-zA-Z]$/.test(inner) ? '' : ' '
      return `${inner}${sep}${marker}`
    }

    case 'var':
      return node.name  // algebraic variable: 'x', 'y', 't'

    case 'mref':
      return `[${node.name}]`  // matrix register: [A]..[J]

    case 'graph':
      // Graph intent: index.ts detects the 'graph' node and routes to action:'graph'
      return emit(node.expr)

    case 'fnN2': {
      // Two-list regression: fn({x1, x2, …}, {y1, y2, …})
      const xs = node.xs.map(emit).join(', ')
      const ys = node.ys.map(emit).join(', ')
      return `${node.fn}({${xs}}, {${ys}})`
    }
    // Sprint 10.1 M130 / DECISION-60: unit conversion → (value * factor).
    // emit(factor) already produces a fully-parenthesized string (e.g. "(π / 180)").
    case 'unitConv':
      return `(${emit(node.value)} * ${emit(node.factor)})`
  }
}
