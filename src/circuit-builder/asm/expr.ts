import type { Token } from './lexer.ts';

/**
 * Integer expressions over numbers and symbol names.
 *
 * Parsing and evaluation are separate steps because a label may be used before it is
 * defined: the first pass parses every line into a tree and counts the bytes it will
 * produce, and only the second pass — once every label has an address — evaluates.
 */

export type ExprNode =
  | { kind: 'num'; value: number }
  | { kind: 'sym'; name: string; token: Token }
  | { kind: 'unary'; op: string; operand: ExprNode }
  | { kind: 'binary'; op: string; left: ExprNode; right: ExprNode; token: Token };

export interface ParseResult {
  node: ExprNode | null;
  /** Index of the first token the expression did not consume. */
  next: number;
  error?: string;
}

/**
 * Binding power per binary operator, loosest first. Mirrors C so `1 << 2 | 1` reads the
 * way a player expects when spelling out opcode bit fields.
 */
const PRECEDENCE: Record<string, number> = {
  '|': 1, '^': 2, '&': 3,
  '<<': 4, '>>': 4,
  '+': 5, '-': 5,
  '*': 6, '/': 6, '%': 6,
};

/**
 * Parse one expression starting at `start`.
 *
 * Stops at the first token that cannot continue it, which is also how a data line is split
 * into separate bytes: `1 2` parses as `1` then `2`, while `1 + 2` is a single value.
 */
export function parseExpression(tokens: Token[], start: number): ParseResult {
  return parseBinary(tokens, start, 1);
}

function parseBinary(tokens: Token[], start: number, minPrecedence: number): ParseResult {
  const left = parseUnary(tokens, start);
  if (!left.node || left.error) return left;

  let node = left.node;
  let i = left.next;

  while (i < tokens.length) {
    const op = tokens[i];
    if (op.kind !== 'punct') break;
    const precedence = PRECEDENCE[op.text];
    if (precedence === undefined || precedence < minPrecedence) break;

    const right = parseBinary(tokens, i + 1, precedence + 1);
    if (right.error) return right;
    if (!right.node) return { node, next: i, error: `Missing right operand for "${op.text}"` };

    node = { kind: 'binary', op: op.text, left: node, right: right.node, token: op };
    i = right.next;
  }

  return { node, next: i };
}

function parseUnary(tokens: Token[], start: number): ParseResult {
  const token = tokens[start];
  if (!token) return { node: null, next: start };

  if (token.kind === 'punct' && (token.text === '-' || token.text === '~' || token.text === '+')) {
    const operand = parseUnary(tokens, start + 1);
    if (operand.error) return operand;
    if (!operand.node) return { node: null, next: start, error: `Missing operand for "${token.text}"` };
    if (token.text === '+') return operand;
    return { node: { kind: 'unary', op: token.text, operand: operand.node }, next: operand.next };
  }

  return parseAtom(tokens, start);
}

function parseAtom(tokens: Token[], start: number): ParseResult {
  const token = tokens[start];
  if (!token) return { node: null, next: start };

  if (token.kind === 'number') {
    return { node: { kind: 'num', value: token.value ?? 0 }, next: start + 1 };
  }
  if (token.kind === 'ident') {
    return { node: { kind: 'sym', name: token.text, token }, next: start + 1 };
  }
  if (token.kind === 'punct' && token.text === '(') {
    const inner = parseBinary(tokens, start + 1, 1);
    if (inner.error) return inner;
    if (!inner.node) return { node: null, next: start, error: 'Empty parentheses' };
    const close = tokens[inner.next];
    if (!close || close.text !== ')') return { node: inner.node, next: inner.next, error: 'Missing ")"' };
    return { node: inner.node, next: inner.next + 1 };
  }

  return { node: null, next: start };
}

export interface EvalResult {
  value: number;
  error?: string;
  /** Token to blame for `error`, so the diagnostic lands on the right line. */
  token?: Token;
}

/** Resolve a name to its value, or undefined when nothing defines it. */
export type SymbolResolver = (name: string) => number | undefined;

export function evaluateExpression(node: ExprNode, resolve: SymbolResolver): EvalResult {
  switch (node.kind) {
    case 'num':
      return { value: node.value };

    case 'sym': {
      const value = resolve(node.name);
      if (value === undefined) {
        return { value: 0, error: `Unknown name "${node.name}"`, token: node.token };
      }
      return { value };
    }

    case 'unary': {
      const operand = evaluateExpression(node.operand, resolve);
      if (operand.error) return operand;
      return { value: node.op === '-' ? -operand.value : ~operand.value };
    }

    case 'binary': {
      const left = evaluateExpression(node.left, resolve);
      if (left.error) return left;
      const right = evaluateExpression(node.right, resolve);
      if (right.error) return right;
      return applyBinary(node, left.value, right.value);
    }
  }
}

function applyBinary(node: Extract<ExprNode, { kind: 'binary' }>, a: number, b: number): EvalResult {
  switch (node.op) {
    case '+': return { value: a + b };
    case '-': return { value: a - b };
    case '*': return { value: a * b };
    case '/':
      if (b === 0) return { value: 0, error: 'Division by zero', token: node.token };
      return { value: Math.trunc(a / b) };
    case '%':
      if (b === 0) return { value: 0, error: 'Division by zero', token: node.token };
      return { value: a % b };
    case '&': return { value: a & b };
    case '|': return { value: a | b };
    case '^': return { value: a ^ b };
    case '<<': return { value: a << b };
    case '>>': return { value: a >> b };
    default: return { value: 0, error: `Unknown operator "${node.op}"`, token: node.token };
  }
}
