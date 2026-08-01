/**
 * Line tokenizer shared by the default preprocessor's directive, macro and expression
 * stages. Tokens carry their origin so a diagnostic raised three macro expansions deep
 * still points at a line the player can see.
 */

export type TokenKind = 'ident' | 'number' | 'string' | 'punct';

export interface Token {
  kind: TokenKind;
  /** Source spelling, or the decoded body for a string. */
  text: string;
  /** Numeric value. Set for `number` tokens only. */
  value?: number;
  line: number;
  file: string;
}

export interface TokenizeResult {
  tokens: Token[];
  error?: string;
}

/** Two-character operators, tested before their single-character prefixes. */
const LONG_PUNCT = ['<<', '>>'];
const PUNCT = '()[],:+-*/%&|^~';

const IDENT_START = /[A-Za-z_.]/;
const IDENT_BODY = /[A-Za-z0-9_.]/;

/** Comment openers. `#` is not one — it starts a directive. */
function commentAt(text: string, i: number): boolean {
  return text[i] === ';' || (text[i] === '/' && text[i + 1] === '/');
}

export function tokenizeLine(text: string, line: number, file: string): TokenizeResult {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const c = text[i];
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (commentAt(text, i)) break;

    const at = { line, file };
    if (c === '"' || c === "'") {
      const quoted = readQuoted(text, i);
      if (quoted.error) return { tokens, error: quoted.error };
      tokens.push(c === '"'
        ? { kind: 'string', text: quoted.body, ...at }
        : charToken(quoted.body, at));
      i = quoted.next;
      continue;
    }

    if (c >= '0' && c <= '9') {
      const num = readNumber(text, i);
      if (num.error) return { tokens, error: num.error };
      tokens.push({ kind: 'number', text: text.slice(i, num.next), value: num.value, ...at });
      i = num.next;
      continue;
    }

    if (IDENT_START.test(c)) {
      let j = i + 1;
      while (j < text.length && IDENT_BODY.test(text[j])) j++;
      tokens.push({ kind: 'ident', text: text.slice(i, j), ...at });
      i = j;
      continue;
    }

    const long = LONG_PUNCT.find(op => text.startsWith(op, i));
    if (long) {
      tokens.push({ kind: 'punct', text: long, ...at });
      i += long.length;
      continue;
    }
    if (PUNCT.includes(c)) {
      tokens.push({ kind: 'punct', text: c, ...at });
      i++;
      continue;
    }

    return { tokens, error: `Unexpected character "${c}"` };
  }

  return { tokens };
}

/** A char literal is just a number written as a glyph. */
function charToken(body: string, at: { line: number; file: string }): Token {
  return { kind: 'number', text: `'${body}'`, value: body.charCodeAt(0) & 0xFF, ...at };
}

interface ReadResult {
  next: number;
  error?: string;
}

interface QuotedResult extends ReadResult {
  body: string;
}

const ESCAPES: Record<string, string> = {
  n: '\n', r: '\r', t: '\t', '0': '\0', '\\': '\\', '"': '"', "'": "'",
};

function readQuoted(text: string, start: number): QuotedResult {
  const quote = text[start];
  let body = '';
  let i = start + 1;

  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\' && i + 1 < text.length) {
      const escaped = ESCAPES[text[i + 1]];
      if (escaped === undefined) return { body, next: i, error: `Unknown escape "\\${text[i + 1]}"` };
      body += escaped;
      i += 2;
      continue;
    }
    body += text[i++];
  }

  if (i >= text.length) return { body, next: i, error: 'Unterminated string' };
  if (quote === "'" && body.length !== 1) {
    return { body, next: i + 1, error: 'A char literal holds exactly one character' };
  }
  return { body, next: i + 1 };
}

interface NumberResult extends ReadResult {
  value: number;
}

/** Radix prefixes, plus plain decimal. Digits may be grouped with `_`. */
const RADIX_PREFIXES: { prefix: string; radix: number; digits: RegExp }[] = [
  { prefix: '0x', radix: 16, digits: /[0-9a-fA-F_]/ },
  { prefix: '0b', radix: 2, digits: /[01_]/ },
  { prefix: '0o', radix: 8, digits: /[0-7_]/ },
];

function readNumber(text: string, start: number): NumberResult {
  const lower = text.slice(start, start + 2).toLowerCase();
  const prefixed = RADIX_PREFIXES.find(p => p.prefix === lower);

  if (prefixed) {
    let i = start + 2;
    while (i < text.length && prefixed.digits.test(text[i])) i++;
    const digits = text.slice(start + 2, i).replace(/_/g, '');
    if (!digits) return { value: 0, next: i, error: `"${text.slice(start, i)}" has no digits` };
    return { value: parseInt(digits, prefixed.radix), next: i };
  }

  let i = start;
  while (i < text.length && /[0-9_]/.test(text[i])) i++;
  return { value: parseInt(text.slice(start, i).replace(/_/g, ''), 10), next: i };
}
