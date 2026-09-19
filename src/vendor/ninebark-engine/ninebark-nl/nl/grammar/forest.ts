// Parse-forest AST node types (Stage D output / emitter input).
// Each node carries enough info for the emitter to produce a fully-parenthesized
// formal string without any further evaluation.

export type ParseNode =
  | { t: 'num';      v: string }                         // digit literal
  | { t: 'frac';     n: number; d: number }              // (n/d)
  | { t: 'const';    name: string }                      // pi | e
  | { t: 'add';      l: ParseNode; r: ParseNode }        // (l + r)
  | { t: 'sub';      l: ParseNode; r: ParseNode }        // (l - r)
  | { t: 'mul';      l: ParseNode; r: ParseNode }        // (l * r)
  | { t: 'div';      l: ParseNode; r: ParseNode }        // (l / r)
  | { t: 'pow';      l: ParseNode; r: ParseNode }        // (l ^ r)
  | { t: 'neg';      arg: ParseNode }                    // (-arg)
  | { t: 'pos';      arg: ParseNode }                    // (+arg) unary plus (identity, Sprint 7.4/F)
  | { t: 'fn1';      fn: string;   arg: ParseNode }      // fn(arg)
  | { t: 'fnN';      fn: string;   items: ParseNode[] }  // fn({a, b, …})
  | { t: 'list';     items: ParseNode[] }                // {a, b, …}
  | { t: 'fracmul';  frac: ParseNode; arg: ParseNode }   // ((n/d) * arg)
  // Sprint 8 nodes:
  | { t: 'angleMark'; expr: ParseNode; unit: 'degrees' | 'radians' | 'gradians' } // 90° / 90rad
  | { t: 'var';      name: string }                      // algebraic variable: x, y, t
  | { t: 'mref';     name: string }                      // matrix register: [A]..[J]
  | { t: 'graph';    expr: ParseNode }                   // graph intent: "graph x^2"
  | { t: 'fnN2';     fn: string; xs: ParseNode[]; ys: ParseNode[] } // two-list regression: fn({x…}, {y…})
  // Sprint 10.1 M130 / DECISION-60: unit-conversion sugar → arithmetic expression
  | { t: 'unitConv'; value: ParseNode; factor: ParseNode }  // (value * factor)

// A parse forest: multiple competing roots for the same input span
export type Forest = ParseNode[]
