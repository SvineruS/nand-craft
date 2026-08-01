/**
 * A tiny file system for text the player writes, kept in one localStorage entry per kind.
 *
 * Paths are slash-separated (`cpu/opcodes.asm`); folders are not stored as objects, they
 * are just the prefixes that appear in paths. That keeps a store a flat map — one read, one
 * write, nothing to keep consistent — while an explorer can still show a tree.
 *
 * The store is built per kind rather than being one shared namespace: RAM programs and test
 * suites are different sorts of document, each with its own extension, and a test called
 * `adder` should not collide with a program called `adder`.
 */

/** Anything longer is a mistake, not a path. */
const MAX_PATH_LENGTH = 120;
const MAX_SEGMENT_LENGTH = 60;

export interface StoredFile {
  path: string;
  content: string;
  /** Epoch ms of the last write, for the explorer's ordering. */
  updatedAt: number;
}

/** A file found by following a reference from another one. */
export interface ResolvedFile {
  path: string;
  content: string;
}

export interface FileStoreOptions {
  /** localStorage key holding this kind's files. */
  storageKey: string;
  /** Extension every file of this kind carries, dot included. */
  extension: string;
  /** Plural noun for error logging: "programs", "tests". */
  label: string;
}

export interface FileStore {
  extension: string;
  /** Every stored file, sorted by path so the explorer's order is stable. */
  list: () => StoredFile[];
  read: (path: string) => StoredFile | null;
  /** Each write returns null on success, or a message to show the player. */
  write: (path: string, content: string) => string | null;
  remove: (path: string) => string | null;
  rename: (from: string, to: string) => string | null;
  /** `name` with this kind's extension, added unless it is already there. */
  withExtension: (name: string) => string;
  /**
   * Resolve a reference from inside one file (an `#include`) against the file that wrote
   * it: as a sibling first, then from the root. A leading `/` means "from the root"
   * explicitly, and the extension may be left off because every file has the same one.
   */
  resolve: (spec: string, fromPath: string) => ResolvedFile | null;
}

type StoreData = Record<string, { content: string; updatedAt: number }>;

export function createFileStore(options: FileStoreOptions): FileStore {
  const { storageKey, extension, label } = options;

  const readData = (): StoreData => {
    const json = localStorage.getItem(storageKey);
    if (!json) return {};
    try {
      const parsed: unknown = JSON.parse(json);
      return isStoreData(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  const writeData = (data: StoreData): string | null => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(data));
      return null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`Failed to save ${label}:`, e);
      return message;
    }
  };

  const read = (path: string): StoredFile | null => {
    const entry = readData()[path];
    return entry ? { path, ...entry } : null;
  };

  const withExtension = (name: string): string => {
    const trimmed = name.trim();
    return trimmed.toLowerCase().endsWith(extension)
      ? trimmed.slice(0, -extension.length) + extension
      : trimmed + extension;
  };

  return {
    extension,
    read,
    withExtension,

    list: () => Object.entries(readData())
      .map(([path, entry]) => ({ path, ...entry }))
      .sort((a, b) => a.path.localeCompare(b.path)),

    write: (path, content) => {
      const invalid = pathProblem(path);
      if (invalid) return invalid;

      const data = readData();
      data[path] = { content, updatedAt: Date.now() };
      return writeData(data);
    },

    remove: (path) => {
      const data = readData();
      if (!(path in data)) return `"${path}" no longer exists`;
      delete data[path];
      return writeData(data);
    },

    rename: (from, to) => {
      const invalid = pathProblem(to);
      if (invalid) return invalid;

      const data = readData();
      const entry = data[from];
      if (!entry) return `"${from}" no longer exists`;
      if (from === to) return null;
      if (to in data) return `"${to}" already exists`;

      delete data[from];
      data[to] = { content: entry.content, updatedAt: Date.now() };
      return writeData(data);
    },

    resolve: (spec, fromPath) => {
      const cleaned = spec.trim().replace(/^\.\//, '');
      const roots = cleaned.startsWith('/')
        ? [cleaned.slice(1)]
        : [joinPath(folderOf(fromPath), cleaned), cleaned];

      for (const root of roots) {
        for (const path of [root, withExtension(root)]) {
          const file = read(path);
          if (file) return { path: file.path, content: file.content };
        }
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

/**
 * Why `path` is not usable as a file name, or null when it is fine.
 *
 * This is the system boundary — every path comes from a text field or from a reference the
 * player typed inside a file — so it is the one place that validates.
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

function isStoreData(value: unknown): value is StoreData {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every(
    entry => typeof entry === 'object' && entry !== null
      && typeof (entry as StoredFile).content === 'string',
  );
}
