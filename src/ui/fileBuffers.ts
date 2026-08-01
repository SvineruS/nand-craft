import { signal, type Signal } from '@preact/signals';

/**
 * What a file-backed editor is editing, kept outside the component tree.
 *
 * These editors are unmounted every time their window closes — and the RAM one also when
 * the player flips to the memory window — and typed-but-unsaved text must survive that.
 * Holding it in signals also means the "unsaved" marker in the file list and the editor
 * itself read the same value.
 */
export interface FileBuffer {
  /** Path of the open file, or null when the buffer has never been saved. */
  openPath: Signal<string | null>;
  /** Current contents — the editor's document mirrored out. */
  source: Signal<string>;
  /** Whether the buffer differs from what is stored under `openPath`. */
  dirty: Signal<boolean>;
  /** Whether the file list is shown beside the editor. */
  explorerVisible: Signal<boolean>;
  open: (path: string | null, content: string) => void;
}

export function createFileBuffer(): FileBuffer {
  const openPath = signal<string | null>(null);
  const source = signal('');
  const dirty = signal(false);
  const explorerVisible = signal(true);

  return {
    openPath,
    source,
    dirty,
    explorerVisible,
    open(path, content) {
      openPath.value = path;
      source.value = content;
      dirty.value = false;
    },
  };
}

/** The RAM program editor's buffer. */
export const programBuffer = createFileBuffer();

/** The test editor's buffer. */
export const testBuffer = createFileBuffer();
