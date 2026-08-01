import type { ResolvedFile } from '../asm/types.ts';

/**
 * A tiny file system for RAM programs, kept in one localStorage entry.
 *
 * Paths are slash-separated (`cpu/opcodes.asm`); folders are not stored as objects, they
 * are just the prefixes that appear in paths. That keeps the whole store a flat map — one
 * read, one write, nothing to keep consistent — while the explorer can still show a tree.
 */

const STORAGE_KEY = 'nand-craft:programs';

/** Anything longer is a mistake, not a path. */
const MAX_PATH_LENGTH = 120;
const MAX_SEGMENT_LENGTH = 60;

export interface ProgramFile {
  path: string;
  content: string;
  /** Epoch ms of the last write, for the explorer's ordering. */
  updatedAt: number;
}

type ProgramStore = Record<string, { content: string; updatedAt: number }>;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** Every stored file, sorted by path so the explorer's order is stable. */
export function listPrograms(): ProgramFile[] {
  const store = readStore();
  return Object.entries(store)
    .map(([path, entry]) => ({ path, ...entry }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

export function readProgram(path: string): ProgramFile | null {
  const entry = readStore()[path];
  return entry ? { path, ...entry } : null;
}

export function programExists(path: string): boolean {
  return readProgram(path) !== null;
}

// ---------------------------------------------------------------------------
// Writes
//
// Each returns null on success or a message to show the player — localStorage can be full,
// and a name typed into a dialog can be anything.
// ---------------------------------------------------------------------------

export function writeProgram(path: string, content: string): string | null {
  const invalid = pathProblem(path);
  if (invalid) return invalid;

  const store = readStore();
  store[path] = { content, updatedAt: Date.now() };
  return writeStore(store);
}

export function deleteProgram(path: string): string | null {
  const store = readStore();
  if (!(path in store)) return `"${path}" no longer exists`;
  delete store[path];
  return writeStore(store);
}

export function renameProgram(from: string, to: string): string | null {
  const invalid = pathProblem(to);
  if (invalid) return invalid;

  const store = readStore();
  const entry = store[from];
  if (!entry) return `"${from}" no longer exists`;
  if (from === to) return null;
  if (to in store) return `"${to}" already exists`;

  delete store[from];
  store[to] = { content: entry.content, updatedAt: Date.now() };
  return writeStore(store);
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Why `path` is not usable as a file name, or null when it is fine.
 *
 * This is the system boundary — every path comes from a text field or from an `#include`
 * line the player typed — so it is the one place that validates.
 */
export function pathProblem(path: string): string | null {
  if (path.trim() === '') return 'Enter a name';
  if (path.length > MAX_PATH_LENGTH) return `Names are limited to ${MAX_PATH_LENGTH} characters`;
  if (path !== path.trim()) return 'Names cannot start or end with a space';

  const segments = path.split('/');
  for (const segment of segments) {
    if (segment === '') return 'Names cannot contain an empty folder';
    if (segment === '.' || segment === '..') return '"." and ".." are not allowed';
    if (segment.length > MAX_SEGMENT_LENGTH) return `Names are limited to ${MAX_SEGMENT_LENGTH} characters`;
    if (!/^[A-Za-z0-9 ._-]+$/.test(segment)) return 'Use letters, digits, spaces, ".", "_" and "-"';
  }
  return null;
}

/**
 * The extension every program file carries.
 *
 * Enforced rather than suggested: the player never has to think about it, every file in the
 * list looks like the same kind of thing, and an `#include` can be typed exactly as the name
 * reads in the explorer.
 */
export const PROGRAM_EXTENSION = '.asm';

/** `name` with the program extension, added unless it is already there. */
export function withProgramExtension(name: string): string {
  const trimmed = name.trim();
  return trimmed.toLowerCase().endsWith(PROGRAM_EXTENSION)
    ? trimmed.slice(0, -PROGRAM_EXTENSION.length) + PROGRAM_EXTENSION
    : trimmed + PROGRAM_EXTENSION;
}

/** The folder part of a path (`cpu/lib/ops.asm` → `cpu/lib`), or '' at the root. */
export function folderOf(path: string): string {
  const cut = path.lastIndexOf('/');
  return cut < 0 ? '' : path.slice(0, cut);
}

/** The file name part of a path (`cpu/lib/ops.asm` → `ops.asm`). */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function joinPath(folder: string, name: string): string {
  return folder === '' ? name : `${folder}/${name}`;
}

/**
 * Resolve an `#include` spec against the file that wrote it: first as a sibling, then from
 * the root. Leading `/` means "from the root" explicitly.
 *
 * The extension is optional in an include, because every file has the same one: `"ops"`
 * and `"ops.asm"` both find `ops.asm`.
 *
 * Passed to the preprocessor as its `readFile`, so no preprocessor has to know how this
 * file system spells paths.
 */
export function resolveInclude(spec: string, fromPath: string): ResolvedFile | null {
  const cleaned = spec.trim().replace(/^\.\//, '');
  const roots = cleaned.startsWith('/')
    ? [cleaned.slice(1)]
    : [joinPath(folderOf(fromPath), cleaned), cleaned];

  for (const root of roots) {
    for (const path of [root, withProgramExtension(root)]) {
      const file = readProgram(path);
      if (file) return { path: file.path, content: file.content };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

function readStore(): ProgramStore {
  const json = localStorage.getItem(STORAGE_KEY);
  if (!json) return {};
  try {
    const parsed: unknown = JSON.parse(json);
    return isProgramStore(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: ProgramStore): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('Failed to save programs:', e);
    return message;
  }
}

function isProgramStore(value: unknown): value is ProgramStore {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    entry => typeof entry === 'object' && entry !== null && typeof (entry as ProgramFile).content === 'string',
  );
}
