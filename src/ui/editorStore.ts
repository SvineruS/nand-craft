import { signal } from '@preact/signals';
import type { EditorState } from '../circuit-builder/editor/EditorState.ts';
import type { LevelId } from '../circuit-builder/editor/types.ts';
import { getSolvedLevelIds } from '../circuit-builder/persistence/storage.ts';
import { getEditor } from '../circuit-builder/editorInstance.ts';

// ---------------------------------------------------------------------------
// Signals – reactive app-level state consumed by Preact components
// ---------------------------------------------------------------------------

/** Incremented every time mutable state changes. Components read this to re-render. */
export const stateVersion = signal(0);

/** Whether the level-intro dialog is visible. */
export const levelDialogVisible = signal(false);

/** Current view mode. */
export type ViewMode = 'mainMenu' | 'levelSelect' | 'editor' | 'factory' | 'settings';
export const viewMode = signal<ViewMode>('mainMenu');

/** Set of solved level IDs (persisted in localStorage). */
export const solvedLevelIds = signal<Set<LevelId>>(getSolvedLevelIds());

// ---------------------------------------------------------------------------
// State bridge – lets Preact read the mutable EditorState on demand
// ---------------------------------------------------------------------------

/** Bump the version counter so any component reading stateVersion re-renders. */
export function notifyStateChange(): void {
  stateVersion.value++;
}

/**
 * Read the current mutable EditorState.
 *
 * Accessing `stateVersion.value` inside this call subscribes the calling
 * component to future `notifyStateChange()` bumps.
 */
export function useEditorState(): EditorState {
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  stateVersion.value;
  return getEditor().getState();
}
