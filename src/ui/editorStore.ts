import { effect, signal } from '@preact/signals';
import type { EditorState } from '../circuit-builder/editor/EditorState.ts';
import type { ComponentId, GateId, LevelId } from '../circuit-builder/editor/types.ts';
import {
  getSolvedLevelIds, getBackgroundGrid, saveBackgroundGrid, getPaletteId, savePaletteId,
  getSoundVolume, saveSoundVolume, getMusicVolume, saveMusicVolume,
  getSoundtrackId, saveSoundtrackId,
} from '../circuit-builder/persistence/storage.ts';
import type { SoundtrackId } from '../engine/music/themes.ts';
// Renamed on import: `musicVolume` here is the setting, and the audio layer's is the bus gain.
import { setSfxVolume, setMusicVolume as setAudioMusicVolume } from '../engine/audio.ts';
import type { GridPatternId } from '../circuit-builder/editor/render/backgroundPattern.ts';
import type { PaletteId } from '../circuit-builder/editor/palettes.ts';
import { applyPalette } from './theme.ts';
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

/**
 * RAM gate whose memory / program window is open, or null when that window is closed.
 *
 * Gate ids rather than booleans, because a window belongs to one particular chip; two
 * signals rather than a tab, because reading the bytes while editing the program that
 * fills them is the normal way to debug a CPU.
 */
export const memoryWindowGateId = signal<GateId | null>(null);
export const programWindowGateId = signal<GateId | null>(null);

/** Open the window a gate's on-body button asks for. */
export function openGateWindow(button: { gateId: GateId; kind: 'memory' | 'program' }): void {
  const target = button.kind === 'memory' ? memoryWindowGateId : programWindowGateId;
  target.value = button.gateId;
}

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

/** Active colour palette (persisted in localStorage). */
export const paletteId = signal<PaletteId>(getPaletteId());

export function setPaletteId(id: PaletteId): void {
  paletteId.value = id;
  savePaletteId(id);
}

/** Sound volume, 0…1 (persisted in localStorage). 0 is how the sounds are turned off. */
export const soundVolume = signal(getSoundVolume());

export function setSoundVolume(volume: number): void {
  soundVolume.value = volume;
  saveSoundVolume(volume);
}

/** Music volume, 0…1 (persisted). 0 stops the generator, rather than muting it — see music.ts. */
export const musicVolume = signal(getMusicVolume());

export function setMusicVolume(volume: number): void {
  musicVolume.value = volume;
  saveMusicVolume(volume);
}

/** Which soundtrack plays (persisted). The director hands over without a break. */
export const soundtrackId = signal(getSoundtrackId());

export function setSoundtrackId(id: SoundtrackId): void {
  soundtrackId.value = id;
  saveSoundtrackId(id);
}

// Applies the stored volumes at startup and every change after, so the audio layer never has to
// be asked what the settings are.
effect(() => { setSfxVolume(soundVolume.value); });
effect(() => { setAudioMusicVolume(musicVolume.value); });

// Applies the stored palette at startup and every change after. Canvases watch the same
// signal to mark themselves dirty (see useCanvasEditor); the version bump covers the Preact
// side, where panels like the Sidebar draw gate icons in the palette's colours.
effect(() => {
  applyPalette(paletteId.value);
  notifyStateChange();
});

// ---------------------------------------------------------------------------
// State bridge – lets Preact read the mutable EditorState on demand
// ---------------------------------------------------------------------------

/**
 * Bump the version counter so any component reading stateVersion re-renders.
 *
 * Reads through `peek` because `stateVersion.value++` would *subscribe* to the signal it is
 * about to write — called from inside an effect, that is a self-dependency and the signals
 * runtime throws "Cycle detected".
 */
export function notifyStateChange(): void {
  stateVersion.value = stateVersion.peek() + 1;
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
