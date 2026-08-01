import { useEffect, useState } from 'preact/hooks';
import type { FileStore, StoredFile } from '../circuit-builder/persistence/fileStore.ts';
import { pathProblem } from '../circuit-builder/persistence/fileStore.ts';
import type { FileBuffer } from './fileBuffers.ts';

/**
 * The file half of a file-backed text editor: the list, the open buffer, and new / open /
 * rename / delete / save.
 *
 * Shared by the RAM program editor and the test editor, which differ only in what their
 * text means — the store they read, the syntax they highlight and what a button does with
 * the result. Everything about *files* is the same, so it lives here once.
 */

export interface FileEditorStatus {
  kind: 'info' | 'error';
  text: string;
}

export interface FileEditorOptions {
  store: FileStore;
  buffer: FileBuffer;
  /** Replace the visible document. The editor widget itself lives in the component. */
  loadDocument: (content: string) => void;
  /** Contents of a brand-new file. */
  template: string;
  /** Base name for suggestions: `program` → `program.asm`, `program2.asm`, … */
  namePrefix: string;
  /** Report what just happened, for the editor's status line. */
  onStatus: (status: FileEditorStatus | null) => void;
}

export interface FileEditor {
  files: StoredFile[];
  path: string | null;
  dirty: boolean;
  showExplorer: boolean;
  toggleExplorer: () => void;
  /**
   * Pick what to edit when the editor first opens in a session: the file touched most
   * recently, or the template. Call before building the editor widget, so its document
   * starts out right.
   */
  initialise: () => void;
  open: (path: string) => void;
  /** Returns false when nothing was created — a cancelled prompt or a bad name. */
  create: () => boolean;
  rename: (from: string) => void;
  remove: (path: string) => void;
  /** Save the buffer, asking for a name when it has none. */
  save: () => boolean;
}

export function useFileEditor(options: FileEditorOptions): FileEditor {
  const { store, buffer, loadDocument, template, namePrefix, onStatus } = options;
  const [files, setFiles] = useState<StoredFile[]>(() => store.list());

  const path = buffer.openPath.value;
  const dirty = buffer.dirty.value;

  const fail = (text: string) => onStatus({ kind: 'error', text });
  const report = (text: string) => onStatus({ kind: 'info', text });
  const refresh = () => setFiles(store.list());

  const save = (): boolean => {
    const target = buffer.openPath.peek();
    if (target === null) return create();

    const error = store.write(target, buffer.source.peek());
    if (error) {
      fail(error);
      return false;
    }
    buffer.dirty.value = false;
    refresh();
    report(`Saved ${target}`);
    return true;
  };

  /** Write the open file before moving away from it, so nothing typed is lost. */
  const saveIfDirty = () => {
    if (buffer.dirty.peek() && buffer.openPath.peek() !== null) save();
  };

  const create = (): boolean => {
    const name = askForPath(store, 'New file', suggestName(store, files, namePrefix));
    if (!name) return false;
    if (store.read(name)) {
      fail(`"${name}" already exists`);
      return false;
    }

    // An untitled buffer is being named; a saved one is being left behind for a fresh file.
    const untitled = buffer.openPath.peek() === null;
    if (!untitled) saveIfDirty();
    const typed = buffer.source.peek();
    const content = untitled && typed.trim() !== '' ? typed : template;

    const error = store.write(name, content);
    if (error) {
      fail(error);
      return false;
    }
    buffer.open(name, content);
    loadDocument(content);
    refresh();
    report(`Created ${name}`);
    return true;
  };

  const open = (next: string) => {
    if (next === buffer.openPath.peek()) return;
    saveIfDirty();

    const file = store.read(next);
    if (!file) {
      refresh();
      return;
    }
    buffer.open(file.path, file.content);
    loadDocument(file.content);
    onStatus(null);
  };

  const rename = (from: string) => {
    const to = askForPath(store, `Rename "${from}" to`, from);
    if (!to || to === from) return;

    const error = store.rename(from, to);
    if (error) {
      fail(error);
      return;
    }
    if (buffer.openPath.peek() === from) buffer.openPath.value = to;
    refresh();
    report(`Renamed to ${to}`);
  };

  const remove = (target: string) => {
    if (!confirm(`Delete "${target}"? This cannot be undone.`)) return;

    const error = store.remove(target);
    if (error) {
      fail(error);
      return;
    }
    if (buffer.openPath.peek() === target) {
      // The text stays in the buffer — deleting a file should not eat what is on screen.
      buffer.openPath.value = null;
      buffer.dirty.value = true;
    }
    refresh();
    report(`Deleted ${target}`);
  };

  const initialise = () => {
    if (buffer.openPath.peek() !== null || buffer.source.peek() !== '') return;

    const recent = store.list().sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (recent) buffer.open(recent.path, recent.content);
    else buffer.open(null, template);
  };

  // An unsaved buffer would otherwise be lost when the window closes.
  useEffect(() => () => {
    if (buffer.dirty.peek() && buffer.openPath.peek() !== null) {
      store.write(buffer.openPath.peek() as string, buffer.source.peek());
      buffer.dirty.value = false;
    }
  }, []);

  return {
    files,
    path,
    dirty,
    showExplorer: buffer.explorerVisible.value,
    toggleExplorer: () => { buffer.explorerVisible.value = !buffer.explorerVisible.peek(); },
    initialise,
    open,
    create,
    rename,
    remove,
    save,
  };
}

/**
 * Ask for a path, validating it here so the store never sees a bad one.
 *
 * The extension is applied to whatever is typed rather than left to the player: a name
 * without one, or with the wrong one, is a file that reads as a different kind of thing in
 * the list and in a reference. The prompt says nothing about it — not having to think about
 * it is the point of enforcing it.
 */
function askForPath(store: FileStore, title: string, suggestion: string): string | null {
  const raw = prompt(`${title} (folders allowed: cpu/ops)`, suggestion);
  if (raw === null) return null;

  const problem = pathProblem(raw.trim());
  if (problem) {
    alert(problem);
    return null;
  }
  return store.withExtension(raw);
}

function suggestName(store: FileStore, files: StoredFile[], prefix: string): string {
  const taken = new Set(files.map(file => file.path));
  for (let i = 1; ; i++) {
    const name = store.withExtension(`${prefix}${i > 1 ? i : ''}`);
    if (!taken.has(name)) return name;
  }
}
