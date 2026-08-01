import { signal } from '@preact/signals';

/**
 * What the RAM program editor is editing, kept outside the component tree.
 *
 * The editor is unmounted every time the player flips to the memory tab or closes the RAM
 * window, and typed-but-unsaved text must survive that. Holding it in signals also means
 * the "unsaved" marker in the explorer and the editor itself read the same value.
 */

/** Path of the open file, or null when the buffer has never been saved. */
export const openProgramPath = signal<string | null>(null);

/** Current buffer contents — the CodeMirror document mirrored out. */
export const programSource = signal<string>('');

/** Whether the buffer differs from what is stored under `openProgramPath`. */
export const programDirty = signal(false);

/**
 * Whether the file list is shown beside the editor. Here rather than in the component for
 * the same reason as the buffer: a collapsed sidebar should stay collapsed when the window
 * is closed and reopened.
 */
export const explorerVisible = signal(true);

export function openProgramBuffer(path: string | null, content: string): void {
  openProgramPath.value = path;
  programSource.value = content;
  programDirty.value = false;
}
