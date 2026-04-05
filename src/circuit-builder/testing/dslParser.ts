export type TestMode = 'basic' | 'table' | 'queue' | 'code';

export type TestCommand =
  | { type: 'set'; label: string; value: number }
  | { type: 'expect'; label: string; value: number }
  | { type: 'write'; label: string; value: number }
  | { type: 'read'; label: string; value: number };

export interface DslTestCase {
  description?: string;
  commands: TestCommand[];
}

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  mode: TestMode;
  cases: DslTestCase[];
  errors: ParseError[];
  inputLabels?: string[];
  outputLabels?: string[];
  codeBody?: string;
}

interface ParseContext {
  lines: string[];
  errors: ParseError[];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseDsl(source: string): ParseResult {
  const lines = source.split('\n');
  const errors: ParseError[] = [];
  const ctx: ParseContext = { lines, errors };

  // Extract mode and find where directives end / content begins
  const { mode, contentStart, inputLabels, outputLabels } = parseDirectives(ctx);

  switch (mode) {
    case 'basic':
    case 'queue':
      return { mode, errors, ...parseCommands(ctx, mode, contentStart) };
    case 'table':
      return { mode, errors, inputLabels, outputLabels, ...parseTable(ctx, inputLabels, outputLabels, contentStart) };
    case 'code':
      return { mode, errors, inputLabels, outputLabels, ...parseCode(ctx, lines, inputLabels, outputLabels, contentStart) };
  }
}

// ---------------------------------------------------------------------------
// Directive parsing (shared across all modes)
// ---------------------------------------------------------------------------

interface DirectiveResult {
  mode: TestMode;
  contentStart: number;
  inputLabels: string[];
  outputLabels: string[];
}

function parseDirectives(ctx: ParseContext): DirectiveResult {
  let mode: TestMode = 'basic';
  let modeSet = false;
  let inputLabels: string[] = [];
  let outputLabels: string[] = [];

  for (let i = 0; i < ctx.lines.length; i++) {
    const stripped = stripComment(ctx.lines[i]);
    if (!stripped) continue;
    if (!stripped.startsWith('@')) return { mode, contentStart: i, inputLabels, outputLabels };

    const lineNum = i + 1;

    if (stripped.startsWith('@mode')) {
      if (modeSet) {
        ctx.errors.push({ line: lineNum, message: '@mode can only be declared once' });
        continue;
      }
      const modeName = stripped.slice(5).trim().toLowerCase();
      if (modeName === 'basic' || modeName === 'table' || modeName === 'queue' || modeName === 'code') {
        mode = modeName;
        modeSet = true;
      } else {
        ctx.errors.push({ line: lineNum, message: `Unknown mode: "${modeName}". Use "basic", "table", "queue", or "code"` });
      }
      continue;
    }

    if (stripped.startsWith('@inputs')) {
      if (mode !== 'table' && mode !== 'code') {
        ctx.errors.push({ line: lineNum, message: '@inputs is only available in table and code modes' });
        continue;
      }
      inputLabels = stripped.slice(7).trim().split(/\s+/).filter(Boolean);
      if (inputLabels.length === 0) {
        ctx.errors.push({ line: lineNum, message: '@inputs requires at least one label' });
      }
      continue;
    }

    if (stripped.startsWith('@outputs')) {
      if (mode !== 'table' && mode !== 'code') {
        ctx.errors.push({ line: lineNum, message: '@outputs is only available in table and code modes' });
        continue;
      }
      outputLabels = stripped.slice(8).trim().split(/\s+/).filter(Boolean);
      if (outputLabels.length === 0) {
        ctx.errors.push({ line: lineNum, message: '@outputs requires at least one label' });
      }
      continue;
    }

    // @case is not a header directive — it's content
    if (stripped.startsWith('@case')) {
      return { mode, contentStart: i, inputLabels, outputLabels };
    }

    ctx.errors.push({ line: lineNum, message: `Unknown directive: ${stripped.split(/\s/)[0]}` });
  }

  return { mode, contentStart: ctx.lines.length, inputLabels, outputLabels };
}

// ---------------------------------------------------------------------------
// Basic / queue mode: set/expect or write/read commands with @case
// ---------------------------------------------------------------------------

const BASIC_COMMANDS = new Set(['set', 'expect']);
const QUEUE_COMMANDS = new Set(['write', 'read']);

function parseCommands(ctx: ParseContext, mode: 'basic' | 'queue', startLine: number): { cases: DslTestCase[] } {
  const allowed = mode === 'basic' ? BASIC_COMMANDS : QUEUE_COMMANDS;
  const cases: DslTestCase[] = [];
  let currentCase: DslTestCase | null = null;

  for (let i = startLine; i < ctx.lines.length; i++) {
    const stripped = stripComment(ctx.lines[i]);
    if (!stripped) continue;
    const lineNum = i + 1;

    if (stripped.startsWith('@case')) {
      const desc = stripped.slice(5).trim() || undefined;
      currentCase = { description: desc, commands: [] };
      cases.push(currentCase);
      continue;
    }

    if (!currentCase) {
      currentCase = { commands: [] };
      cases.push(currentCase);
    }

    const tokens = stripped.split(/\s+/);
    const cmd = tokens[0].toLowerCase();

    if (!allowed.has(cmd)) {
      if (BASIC_COMMANDS.has(cmd) || QUEUE_COMMANDS.has(cmd)) {
        ctx.errors.push({ line: lineNum, message: `"${cmd}" is not available in ${mode} mode` });
      } else {
        ctx.errors.push({ line: lineNum, message: `Unknown command: ${cmd}` });
      }
      continue;
    }

    if (tokens.length < 3) {
      ctx.errors.push({ line: lineNum, message: `${cmd} requires a label and a value` });
      continue;
    }

    const value = parseNumber(tokens[2]);
    if (value === null) {
      ctx.errors.push({ line: lineNum, message: `Invalid number: ${tokens[2]}` });
      continue;
    }

    currentCase.commands.push({ type: cmd as TestCommand['type'], label: tokens[1], value });
  }

  return { cases };
}

// ---------------------------------------------------------------------------
// Table mode: @inputs/@outputs headers + value rows
// ---------------------------------------------------------------------------

function parseTable(
  ctx: ParseContext,
  inputLabels: string[],
  outputLabels: string[],
  startLine: number,
): { cases: DslTestCase[] } {
  const cases: DslTestCase[] = [];

  for (let i = startLine; i < ctx.lines.length; i++) {
    const stripped = stripComment(ctx.lines[i]);
    if (!stripped) continue;
    const lineNum = i + 1;

    if (stripped.startsWith('@')) {
      ctx.errors.push({ line: lineNum, message: `Unexpected directive in table mode: ${stripped.split(/\s/)[0]}` });
      continue;
    }

    if (inputLabels.length === 0 || outputLabels.length === 0) {
      ctx.errors.push({ line: lineNum, message: 'sjoDeclare @inputs and @outputs before data rows' });
      continue;
    }

    const parts = stripped.split('|');
    if (parts.length !== 2) {
      ctx.errors.push({ line: lineNum, message: 'Table row must have inputs | outputs' });
      continue;
    }

    const inVals = parts[0].trim().split(/\s+/).filter(Boolean);
    const outVals = parts[1].trim().split(/\s+/).filter(Boolean);

    if (inVals.length !== inputLabels.length) {
      ctx.errors.push({ line: lineNum, message: `Expected ${inputLabels.length} input values, got ${inVals.length}` });
      continue;
    }
    if (outVals.length !== outputLabels.length) {
      ctx.errors.push({ line: lineNum, message: `Expected ${outputLabels.length} output values, got ${outVals.length}` });
      continue;
    }

    const commands: TestCommand[] = [];
    let valid = true;
    for (let j = 0; j < inputLabels.length; j++) {
      const v = parseNumber(inVals[j]);
      if (v === null) { ctx.errors.push({ line: lineNum, message: `Invalid number: ${inVals[j]}` }); valid = false; break; }
      commands.push({ type: 'set', label: inputLabels[j], value: v });
    }
    if (!valid) continue;
    for (let j = 0; j < outputLabels.length; j++) {
      const v = parseNumber(outVals[j]);
      if (v === null) { ctx.errors.push({ line: lineNum, message: `Invalid number: ${outVals[j]}` }); valid = false; break; }
      commands.push({ type: 'expect', label: outputLabels[j], value: v });
    }
    if (!valid) continue;

    cases.push({ commands });
  }

  return { cases };
}

// ---------------------------------------------------------------------------
// Code mode: @inputs/@outputs headers + JS function body
// ---------------------------------------------------------------------------

function parseCode(
  ctx: ParseContext,
  lines: string[],
  inputLabels: string[],
  outputLabels: string[],
  startLine: number,
): { cases: DslTestCase[]; codeBody?: string } {
  if (inputLabels.length === 0 || outputLabels.length === 0) {
    if (startLine < lines.length) {
      ctx.errors.push({ line: startLine + 1, message: 'Declare @inputs and @outputs before function body' });
    }
    return { cases: [] };
  }

  // Capture from startLine to end, trim trailing blanks
  const bodyLines = lines.slice(startLine);
  while (bodyLines.length > 0 && bodyLines[bodyLines.length - 1].trim() === '') {
    bodyLines.pop();
  }

  if (bodyLines.length === 0) {
    return { cases: [] };
  }

  return { cases: [], codeBody: bodyLines.join('\n') };
}

// ---------------------------------------------------------------------------
// Converter: ParseResult → TestCase[]
// ---------------------------------------------------------------------------

import type { TestCase } from '../levels/levelTypes.ts';

/** Convert parsed DSL cases (basic/table) into TestCase[] for the test runner. */
export function convertToTestCases(result: ParseResult): TestCase[] {
  return result.cases.map(dslCase => {
    const inputs: Record<string, number> = {};
    const expected: Record<string, number> = {};
    for (const cmd of dslCase.commands) {
      if (cmd.type === 'set' || cmd.type === 'write') {
        inputs[cmd.label] = cmd.value;
      } else if (cmd.type === 'expect' || cmd.type === 'read') {
        expected[cmd.label] = cmd.value;
      }
    }
    return { inputs, expected };
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripComment(line: string): string {
  return line.replace(/#.*$/, '').trim();
}

function parseNumber(s: string): number | null {
  if (s.startsWith('0x') || s.startsWith('0X')) {
    const v = parseInt(s, 16);
    return isNaN(v) ? null : v;
  }
  if (s.startsWith('0b') || s.startsWith('0B')) {
    const v = parseInt(s.slice(2), 2);
    return isNaN(v) ? null : v;
  }
  const v = parseInt(s, 10);
  return isNaN(v) ? null : v;
}
