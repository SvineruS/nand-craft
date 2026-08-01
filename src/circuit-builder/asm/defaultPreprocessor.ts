import type { AsmDiagnostic, AsmSymbol, AssembleRequest, AssembleResult, Preprocessor } from './types.ts';
import { tokenizeLine, type Token } from './lexer.ts';
import { evaluateExpression, parseExpression, type ExprNode } from './expr.ts';
import { expandMacros, type MacroDef, type MacroTable } from './macros.ts';

/**
 * The built-in program syntax: a sequence of byte values, with C-style `#define` macros,
 * `#include`, `#org` and labels on top.
 *
 * It deliberately has no instruction set of its own. The player's CPU decides what a byte
 * means, so the opcodes are whatever they `#define` them to be:
 *
 *   #define ADD 0b0000_0001
 *   #define LOADI(r, v) 0x10 | r, v
 *   start:  LOADI(0, 42)  ADD  start
 *
 * Assembly runs in two passes because a label may be used above its definition: the first
 * pass expands macros and counts bytes to place every label, the second evaluates.
 */

/** How deep `#include` may nest before it is treated as a mistake. */
const MAX_INCLUDE_DEPTH = 16;

const MIN_BYTE = -128;
const MAX_BYTE = 255;

export const defaultPreprocessor: Preprocessor = {
  id: 'default',
  label: 'Default',
  description: 'Bytes, #define macros, #include, #org and labels',
  assemble,
};

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

function assemble(request: AssembleRequest): AssembleResult {
  const errors: AsmDiagnostic[] = [];
  const lines = flattenSource(request, errors);
  const pass = buildChunks(lines, request.memorySize, errors);
  const bytes = emitBytes(pass, request.memorySize, errors);

  return { bytes, errors, symbols: collectSymbols(pass) };
}

/** One logical line of source, after includes and `\` continuations are resolved. */
interface SourceLine {
  text: string;
  line: number;
  file: string;
}

/** A run of bytes waiting for a final address and, for expressions, a value. */
type Chunk =
  | { kind: 'expr'; address: number; node: ExprNode; line: number; file: string }
  | { kind: 'bytes'; address: number; values: number[]; line: number; file: string };

interface PassResult {
  chunks: Chunk[];
  labels: Map<string, number>;
  macros: MacroTable;
}

// ---------------------------------------------------------------------------
// Pass 0 — includes and line continuations
// ---------------------------------------------------------------------------

function flattenSource(request: AssembleRequest, errors: AsmDiagnostic[]): SourceLine[] {
  const out: SourceLine[] = [];
  readFileInto(request.source, request.path || '(unsaved)', request, out, errors, [], 0);
  return out;
}

function readFileInto(
  content: string,
  path: string,
  request: AssembleRequest,
  out: SourceLine[],
  errors: AsmDiagnostic[],
  stack: string[],
  depth: number,
): void {
  const rawLines = content.split('\n');

  for (let i = 0; i < rawLines.length; i++) {
    const startLine = i + 1;
    let text = rawLines[i];
    // A trailing backslash glues the next line on, so a macro body can span lines.
    while (text.trimEnd().endsWith('\\') && i + 1 < rawLines.length) {
      text = text.trimEnd().slice(0, -1) + ' ' + rawLines[++i];
    }

    const spec = includeSpec(text);
    if (spec === null) {
      out.push({ text, line: startLine, file: path });
      continue;
    }
    includeFile(spec, path, startLine, request, out, errors, stack, depth);
  }
}

/** The path an `#include` line asks for, or null when the line is not an include. */
function includeSpec(text: string): string | null {
  const match = text.trim().match(/^#include\s+(?:"([^"]+)"|'([^']+)'|<([^>]+)>|(\S+))/);
  if (!match) return null;
  return (match[1] ?? match[2] ?? match[3] ?? match[4]).trim();
}

function includeFile(
  spec: string,
  fromPath: string,
  line: number,
  request: AssembleRequest,
  out: SourceLine[],
  errors: AsmDiagnostic[],
  stack: string[],
  depth: number,
): void {
  if (depth >= MAX_INCLUDE_DEPTH) {
    errors.push({ line, file: fromPath, message: `#include nests deeper than ${MAX_INCLUDE_DEPTH} files` });
    return;
  }

  const file = request.readFile(spec, fromPath);
  if (!file) {
    errors.push({ line, file: fromPath, message: `Cannot find "${spec}"` });
    return;
  }
  if (stack.includes(file.path) || file.path === fromPath) {
    errors.push({ line, file: fromPath, message: `"${spec}" includes itself` });
    return;
  }

  readFileInto(file.content, file.path, request, out, errors, [...stack, fromPath], depth + 1);
}

// ---------------------------------------------------------------------------
// Pass 1 — directives, macros, labels, byte placement
// ---------------------------------------------------------------------------

function buildChunks(lines: SourceLine[], memorySize: number, errors: AsmDiagnostic[]): PassResult {
  const pass: PassResult = { chunks: [], labels: new Map(), macros: new Map() };
  let address = 0;

  for (const source of lines) {
    const trimmed = source.text.trim();
    if (trimmed === '' || trimmed.startsWith(';') || trimmed.startsWith('//')) continue;

    if (trimmed.startsWith('#')) {
      address = applyDirective(trimmed, source, pass, address, memorySize, errors);
      continue;
    }

    const tokens = tokensOf(source, errors);
    if (!tokens) continue;

    const expanded = expandMacros(tokens, pass.macros);
    if (expanded.error) {
      errors.push(diagnostic(expanded.token ?? tokens[0], expanded.error));
      continue;
    }
    address = placeLine(expanded.tokens, pass, address, errors);
  }

  return pass;
}

/** Tokenize a line, reporting a lexical error against it. */
function tokensOf(source: SourceLine, errors: AsmDiagnostic[]): Token[] | null {
  const result = tokenizeLine(source.text, source.line, source.file);
  if (result.error) {
    errors.push({ line: source.line, file: source.file, message: result.error });
    return null;
  }
  return result.tokens.length > 0 ? result.tokens : null;
}

/** Consume leading `label:` definitions, then queue one chunk per value. Returns the next address. */
function placeLine(
  tokens: Token[], pass: PassResult, address: number, errors: AsmDiagnostic[],
): number {
  let i = 0;
  while (tokens[i + 1]?.text === ':' && tokens[i].kind === 'ident') {
    const name = tokens[i].text;
    if (pass.labels.has(name)) {
      errors.push(diagnostic(tokens[i], `Label "${name}" is already defined`));
    }
    pass.labels.set(name, address);
    i += 2;
  }

  let next = address;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind === 'punct' && token.text === ',') { i++; continue; }

    if (token.kind === 'string') {
      const values = [...token.text].map(ch => ch.charCodeAt(0) & 0xFF);
      pass.chunks.push({ kind: 'bytes', address: next, values, line: token.line, file: token.file });
      next += values.length;
      i++;
      continue;
    }

    const parsed = parseExpression(tokens, i);
    if (parsed.error || !parsed.node) {
      errors.push(diagnostic(token, parsed.error ?? `Unexpected "${token.text}"`));
      break;
    }
    pass.chunks.push({ kind: 'expr', address: next, node: parsed.node, line: token.line, file: token.file });
    next++;
    i = parsed.next;
  }

  return next;
}

// ---------------------------------------------------------------------------
// Directives
// ---------------------------------------------------------------------------

/** Apply one `#…` line. Returns the address the next line starts at. */
function applyDirective(
  text: string,
  source: SourceLine,
  pass: PassResult,
  address: number,
  memorySize: number,
  errors: AsmDiagnostic[],
): number {
  const match = text.match(/^#([A-Za-z_][A-Za-z0-9_]*)\s*(.*)$/);
  if (!match) {
    errors.push({ line: source.line, file: source.file, message: 'Expected a directive name after "#"' });
    return address;
  }
  const [, name, rest] = match;

  switch (name) {
    case 'define':
      defineMacro(rest, source, pass, errors);
      return address;

    case 'undef':
      pass.macros.delete(rest.trim().split(/[\s(]/)[0]);
      return address;

    case 'include':
      // Already inlined by flattenSource; reaching here means the line was malformed.
      errors.push({ line: source.line, file: source.file, message: '#include expects a quoted path' });
      return address;

    case 'org':
      return applyOrg(rest, source, pass, address, memorySize, errors);

    default:
      errors.push({ line: source.line, file: source.file, message: `Unknown directive "#${name}"` });
      return address;
  }
}

function applyOrg(
  rest: string,
  source: SourceLine,
  pass: PassResult,
  address: number,
  memorySize: number,
  errors: AsmDiagnostic[],
): number {
  const tokens = tokensOf({ ...source, text: rest }, errors);
  if (!tokens) {
    errors.push({ line: source.line, file: source.file, message: '#org expects an address' });
    return address;
  }

  const expanded = expandMacros(tokens, pass.macros);
  if (expanded.error) {
    errors.push(diagnostic(expanded.token ?? tokens[0], expanded.error));
    return address;
  }

  const parsed = parseExpression(expanded.tokens, 0);
  if (!parsed.node) {
    errors.push({ line: source.line, file: source.file, message: '#org expects an address' });
    return address;
  }

  // Evaluated now, against the labels seen so far — an #org cannot depend on a label
  // below it, because that label's address is what the #org decides.
  const value = evaluateExpression(parsed.node, name => pass.labels.get(name));
  if (value.error) {
    errors.push({ line: source.line, file: source.file, message: value.error });
    return address;
  }
  if (value.value < 0 || value.value >= memorySize) {
    errors.push({
      line: source.line, file: source.file,
      message: `#org ${value.value} is outside memory (0…${memorySize - 1})`,
    });
    return address;
  }
  return value.value;
}

function defineMacro(rest: string, source: SourceLine, pass: PassResult, errors: AsmDiagnostic[]): void {
  const match = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)(\()?/);
  if (!match) {
    errors.push({ line: source.line, file: source.file, message: '#define expects a name' });
    return;
  }
  const name = match[1];

  const bodyStart = match[2] ? rest.indexOf(')', match[0].length - 1) + 1 : match[0].length;
  if (match[2] && bodyStart === 0) {
    errors.push({ line: source.line, file: source.file, message: `Missing ")" in #define ${name}(…)` });
    return;
  }

  const params = match[2]
    ? rest.slice(match[0].length, bodyStart - 1).split(',').map(p => p.trim()).filter(p => p !== '')
    : null;

  const body = tokenizeLine(rest.slice(bodyStart), source.line, source.file);
  if (body.error) {
    errors.push({ line: source.line, file: source.file, message: body.error });
    return;
  }

  const macro: MacroDef = { name, params, body: body.tokens };
  pass.macros.set(name, macro);
}

// ---------------------------------------------------------------------------
// Pass 2 — evaluate and place bytes
// ---------------------------------------------------------------------------

function emitBytes(pass: PassResult, memorySize: number, errors: AsmDiagnostic[]): number[] {
  const image = new Array<number>(memorySize).fill(0);
  let highest = -1;
  let overflowReported = false;

  for (const chunk of pass.chunks) {
    const values = chunk.kind === 'bytes'
      ? chunk.values
      : evaluateChunk(chunk, pass, errors);
    if (!values) continue;

    for (let i = 0; i < values.length; i++) {
      const address = chunk.address + i;
      if (address >= memorySize) {
        if (!overflowReported) {
          overflowReported = true;
          errors.push({
            line: chunk.line, file: chunk.file,
            message: `Program does not fit in ${memorySize} bytes`,
          });
        }
        continue;
      }
      image[address] = values[i] & 0xFF;
      if (address > highest) highest = address;
    }
  }

  return image.slice(0, highest + 1);
}

function evaluateChunk(
  chunk: Extract<Chunk, { kind: 'expr' }>, pass: PassResult, errors: AsmDiagnostic[],
): number[] | null {
  const result = evaluateExpression(chunk.node, name => pass.labels.get(name));
  if (result.error) {
    errors.push({ line: chunk.line, file: chunk.file, message: result.error });
    return null;
  }
  if (result.value < MIN_BYTE || result.value > MAX_BYTE) {
    errors.push({
      line: chunk.line, file: chunk.file,
      message: `${result.value} does not fit in a byte (${MIN_BYTE}…${MAX_BYTE})`,
    });
    return null;
  }
  return [result.value];
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

/**
 * Labels, plus the `#define`s that turned out to be plain constants — the ones worth
 * listing next to the memory view. A define with parameters or a multi-value body is a
 * code template, not a number, and is left out.
 */
function collectSymbols(pass: PassResult): AsmSymbol[] {
  const symbols: AsmSymbol[] = [];
  for (const [name, value] of pass.labels) symbols.push({ name, value, kind: 'label' });

  for (const macro of pass.macros.values()) {
    if (macro.params || macro.body.length === 0) continue;
    const expanded = expandMacros(macro.body, pass.macros);
    if (expanded.error) continue;
    const parsed = parseExpression(expanded.tokens, 0);
    if (!parsed.node || parsed.next !== expanded.tokens.length) continue;
    const result = evaluateExpression(parsed.node, name => pass.labels.get(name));
    if (result.error) continue;
    symbols.push({ name: macro.name, value: result.value, kind: 'define' });
  }

  return symbols;
}

function diagnostic(token: Token, message: string): AsmDiagnostic {
  return { line: token.line, file: token.file, message };
}
