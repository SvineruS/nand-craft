import { signal } from '@preact/signals';
import type { EditorState } from '../editor/EditorState.ts';
import type { Level, LevelId, TestResult } from '../types.ts';
import { getSolvedLevelIds } from '../persistence/storage.ts';

// ---------------------------------------------------------------------------
// Signals – reactive app-level state consumed by Preact components
// ---------------------------------------------------------------------------

/** Incremented every time the mutable EditorState changes structurally. */
export const stateVersion = signal(0);

/** The level definition currently being played. */
export const currentLevel = signal<Level | null>(null);

/** Index into LEVELS[]. */
export const currentLevelIndex = signal(0);

/** Results for each test case (sparse array keyed by case index). */
export const testResults = signal<TestResult[]>([]);

/** Which test case is "current" (-1 = none). */
export const testCaseIndex = signal(-1);

/** Warning text (short-circuit / contention), or null when clean. */
export const warningText = signal<string | null>(null);

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

let getStateFn: (() => EditorState) | null = null;

/** Register the getter so useEditorState() works. Called once from App. */
export function setStateGetter(fn: () => EditorState): void {
  getStateFn = fn;
}

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
export function useEditorState(): EditorState | null {
  // Subscribe to version changes so Preact knows to re-render.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  stateVersion.value;
  return getStateFn ? getStateFn() : null;
}
