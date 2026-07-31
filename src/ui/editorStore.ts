import { signal } from '@preact/signals';
import type { EditorState } from '../circuit-builder/editor/EditorState.ts';
import type { ComponentId, LevelId } from '../circuit-builder/editor/types.ts';
import { getSolvedLevelIds, getBackgroundGrid, saveBackgroundGrid } from '../circuit-builder/persistence/storage.ts';
import type { GridPatternId } from '../circuit-builder/editor/render/backgroundPattern.ts';
import { useEditor } from './editorContext.ts';

// ---------------------------------------------------------------------------
// Signals – reactive app-level state consumed by Preact components
// ---------------------------------------------------------------------------

/** Incremented every time mutable state changes. Components read this to re-render. */
export const stateVersion = signal(0);

/** Whether the level-intro dialog is visible. */
export const levelDialogVisible = signal(false);

/** Whether the test editor dialog is visible. */
export const testEditorVisible = signal(false);

/** Current view mode. */
export type ViewMode = 'mainMenu' | 'levelSelect' | 'levelMapEditor' | 'editor' | 'componentEditor' | 'factory' | 'settings';
export const viewMode = signal<ViewMode>('mainMenu');

// ---------------------------------------------------------------------------
// What the editor screens should open
//
// Navigation states what to open; the screen builds the Editor for it. This replaces
// "construct an Editor into a global, then navigate and hope the screen finds it".
// ---------------------------------------------------------------------------

/** Index into LEVELS for the circuit editor to open. */
export const openLevelIndex = signal<number | null>(null);

/** Component for the component editor to open. null = start a new component. */
export const openComponentId = signal<ComponentId | null>(null);

/** Set of solved level IDs (persisted in localStorage). */
export const solvedLevelIds = signal<Set<LevelId>>(getSolvedLevelIds());

/** Message from the last failed save (e.g. storage quota), or null when saving works. */
export const saveError = signal<string | null>(null);

/**
 * Snapping grid drawn behind every canvas (persisted in localStorage). The decorative
 * ornament layered under it is not a setting — each screen derives it from what it is
 * showing, via `ornamentForId`.
 */
export const backgroundGrid = signal<GridPatternId>(getBackgroundGrid());

export function setBackgroundGrid(grid: GridPatternId): void {
  backgroundGrid.value = grid;
  saveBackgroundGrid(grid);
}

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
  return useEditor().getState();
}
