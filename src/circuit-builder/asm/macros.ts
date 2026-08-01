import type { Token } from './lexer.ts';

/**
 * C-style token macros: `#define` bodies are pasted at every use, with a function-like
 * form whose arguments are substituted into the body. No evaluation happens here — a macro
 * is a piece of source text, so `#define ADD 0b0001` and `#define LOAD(r) 0x10 | r` both
 * work with the same machinery.
 */

export interface MacroDef {
  name: string;
  /** Parameter names, or null for an object-like macro. */
  params: string[] | null;
  body: Token[];
}

export type MacroTable = Map<string, MacroDef>;

/** A macro must not expand into itself, however indirectly. */
const MAX_EXPANSION_DEPTH = 32;

export interface ExpansionResult {
  tokens: Token[];
  error?: string;
  /** Token to blame for `error`. */
  token?: Token;
}

export function expandMacros(tokens: Token[], macros: MacroTable): ExpansionResult {
  return expand(tokens, macros, new Set<string>(), 0);
}

function expand(
  tokens: Token[], macros: MacroTable, active: ReadonlySet<string>, depth: number,
): ExpansionResult {
  if (depth > MAX_EXPANSION_DEPTH) {
    return { tokens: [], error: 'Macro expansion is too deep — is a macro using itself?', token: tokens[0] };
  }

  const out: Token[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];
    const macro = token.kind === 'ident' && !active.has(token.text) ? macros.get(token.text) : undefined;
    if (!macro) {
      out.push(token);
      i++;
      continue;
    }

    const call = readInvocation(macro, tokens, i, macros, depth);
    if (call.error) return { tokens: out, error: call.error, token };
    if (!call.body) {
      // A function-like macro's name without a following "(" is just a name.
      out.push(token);
      i++;
      continue;
    }

    const inner = expand(call.body, macros, union(active, macro.name), depth + 1);
    if (inner.error) return inner;
    // Expanded tokens keep the call site's position, not the #define's, so diagnostics
    // point at the line the player wrote.
    for (const t of inner.tokens) out.push({ ...t, line: token.line, file: token.file });
    i = call.next;
  }

  return { tokens: out };
}

interface Invocation {
  /** Substituted body, or null when this is not an invocation after all. */
  body: Token[] | null;
  next: number;
  error?: string;
}

function readInvocation(
  macro: MacroDef, tokens: Token[], start: number, macros: MacroTable, depth: number,
): Invocation {
  if (!macro.params) return { body: macro.body, next: start + 1 };

  const open = tokens[start + 1];
  if (!open || open.kind !== 'punct' || open.text !== '(') return { body: null, next: start + 1 };

  const args = readArguments(tokens, start + 1);
  if (args.error) return { body: null, next: args.next, error: args.error };
  if (args.values.length !== macro.params.length) {
    return {
      body: null, next: args.next,
      error: `${macro.name} takes ${macro.params.length} argument(s), got ${args.values.length}`,
    };
  }

  // Arguments are expanded before they are pasted in — that is what makes TWICE(TWICE(x))
  // work. The macro being called is not blocked here, only in the rescan of its own body,
  // so the depth limit is what stops a genuinely circular argument.
  const expandedArgs: Token[][] = [];
  for (const arg of args.values) {
    const expanded = expand(arg, macros, new Set(), depth + 1);
    if (expanded.error) return { body: null, next: args.next, error: expanded.error };
    expandedArgs.push(expanded.tokens);
  }

  return { body: substitute(macro, expandedArgs), next: args.next };
}

interface ArgumentList {
  values: Token[][];
  next: number;
  error?: string;
}

/** Split `( a, b )` at top-level commas, respecting nested parentheses. */
function readArguments(tokens: Token[], openIndex: number): ArgumentList {
  const values: Token[][] = [];
  let current: Token[] = [];
  let depth = 0;
  let i = openIndex;

  for (; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind === 'punct' && token.text === '(') {
      depth++;
      if (depth === 1) continue;
    } else if (token.kind === 'punct' && token.text === ')') {
      depth--;
      if (depth === 0) {
        if (current.length > 0 || values.length > 0) values.push(current);
        return { values, next: i + 1 };
      }
    } else if (token.kind === 'punct' && token.text === ',' && depth === 1) {
      values.push(current);
      current = [];
      continue;
    }
    current.push(token);
  }

  return { values, next: i, error: 'Missing ")" in macro arguments' };
}

function substitute(macro: MacroDef, args: Token[][]): Token[] {
  const params = macro.params ?? [];
  const out: Token[] = [];
  for (const token of macro.body) {
    const index = token.kind === 'ident' ? params.indexOf(token.text) : -1;
    if (index >= 0) out.push(...args[index]);
    else out.push(token);
  }
  return out;
}

function union(set: ReadonlySet<string>, name: string): Set<string> {
  const next = new Set(set);
  next.add(name);
  return next;
}
