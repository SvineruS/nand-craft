import { Circuit } from '../simulation/circuit.ts';
import type { LevelId } from '../editor/types.ts';
import { serializeCircuit, deserializeCircuitFromJson } from './serialize.ts';
import type { Level } from "../levels/levelTypes.ts";
import {
  type GridPatternId, DEFAULT_GRID_PATTERN, isGridPatternId,
} from '../editor/render/backgroundPattern.ts';
import { type PaletteId, DEFAULT_PALETTE_ID, isPaletteId } from '../editor/palettes.ts';

/** How often an editor screen writes the player's work back to storage. */
export const AUTOSAVE_INTERVAL_MS = 30_000;

const PREFIX = 'nand-craft';
const SOLVED_KEY = `${PREFIX}:solved`;
const BACKGROUND_GRID_KEY = `${PREFIX}:backgroundGrid`;
const PALETTE_KEY = `${PREFIX}:palette`;
const SOUND_VOLUME_KEY = `${PREFIX}:soundVolume`;
const MUSIC_VOLUME_KEY = `${PREFIX}:musicVolume`;

function circuitKey(levelId: LevelId): string {
  return `${PREFIX}:circuit:${levelId}`;
}

function testsKey(levelId: LevelId): string {
  return `${PREFIX}:tests:${levelId}`;
}

/**
 * Persist a circuit. Returns null on success, or a message describing the failure.
 *
 * Autosave runs from an interval, `visibilitychange`, and `beforeunload`, so a thrown
 * QuotaExceededError here would disappear into a handler and silently stop saving —
 * the caller surfaces the message instead.
 */
export function saveCircuit(levelId: LevelId, circuit: Circuit): string | null {
  try {
    localStorage.setItem(circuitKey(levelId), serializeCircuit(circuit));
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`Failed to save circuit for level ${levelId}:`, e);
    return message;
  }
}

export function loadCircuit(levelId: LevelId): Circuit | null {
  const json = localStorage.getItem(circuitKey(levelId));
  if (!json) return null;
  try {
    return deserializeCircuitFromJson(json);
  } catch {
    return null;
  }
}

/**
 * The `.test` document last applied in a level, beside that level's circuit.
 *
 * The text rather than the cases it produced: it is what the player wrote, it re-derives to the
 * same definition through the one apply path, and a mode or a label list can never fall out of
 * step with the source it came from. A component keeps its own inside its definition, since a
 * component's tests belong to the component and travel with it.
 *
 * Quiet on failure, unlike `saveCircuit`: losing the tests is a re-Apply, losing the circuit is
 * the player's work, so only one of the two is worth interrupting them about.
 */
export function saveAppliedTests(levelId: LevelId, source: string): void {
  try {
    localStorage.setItem(testsKey(levelId), source);
  } catch (e) {
    console.error(`Failed to save tests for level ${levelId}:`, e);
  }
}

export function loadAppliedTests(levelId: LevelId): string | null {
  return localStorage.getItem(testsKey(levelId));
}

export function getSolvedLevelIds(): Set<LevelId> {
  const json = localStorage.getItem(SOLVED_KEY);
  const set = new Set<LevelId>(['sandbox' as LevelId]);
  if (!json) return set;
  try {
    const arr: string[] = JSON.parse(json);
    for (const id of arr) set.add(id as LevelId);
    return set;
  } catch {
    return set;
  }
}

export function markLevelSolved(levelId: LevelId): void {
  const solved = getSolvedLevelIds();
  solved.add(levelId);
  try {
    localStorage.setItem(SOLVED_KEY, JSON.stringify([...solved]));
  } catch (e) {
    console.error('Failed to persist solved levels:', e);
  }
}

/**
 * Stored background grid, falling back when absent or no longer a known id.
 *
 * Only the grid is a setting — the ornament is derived from the level id, so there is
 * nothing to persist for it.
 */
export function getBackgroundGrid(): GridPatternId {
  const stored = localStorage.getItem(BACKGROUND_GRID_KEY);
  if (stored && isGridPatternId(stored)) return stored;
  return DEFAULT_GRID_PATTERN;
}

export function saveBackgroundGrid(grid: GridPatternId): void {
  try {
    localStorage.setItem(BACKGROUND_GRID_KEY, grid);
  } catch (e) {
    console.error('Failed to persist background grid:', e);
  }
}

/** Stored sound volume, 0…1. */
export function getSoundVolume(): number {
  return getVolume(SOUND_VOLUME_KEY, 0.6);
}

export function saveSoundVolume(volume: number): void {
  saveVolume(SOUND_VOLUME_KEY, volume);
}

/** Stored music volume, 0…1. */
export function getMusicVolume(): number {
  return getVolume(MUSIC_VOLUME_KEY, 0.2);
}

export function saveMusicVolume(volume: number): void {
  saveVolume(MUSIC_VOLUME_KEY, volume);
}

function getVolume(key: string, fallback: number): number {
  const raw = localStorage.getItem(key);
  const stored = Number(raw);
  if (raw === null || !isFinite(stored)) return fallback;
  return Math.min(1, Math.max(0, stored));
}

function saveVolume(key: string, volume: number): void {
  try {
    localStorage.setItem(key, String(volume));
  } catch (e) {
    console.error(`Failed to persist ${key}:`, e);
  }
}

/** Stored colour palette, falling back when absent or no longer a known id. */
export function getPaletteId(): PaletteId {
  const stored = localStorage.getItem(PALETTE_KEY);
  if (stored && isPaletteId(stored)) return stored;
  return DEFAULT_PALETTE_ID;
}

export function savePaletteId(id: PaletteId): void {
  try {
    localStorage.setItem(PALETTE_KEY, id);
  } catch (e) {
    console.error('Failed to persist palette:', e);
  }
}

export function isLevelUnlocked(level: Level, solvedIds: Set<LevelId>): boolean {
  return level.prerequisites.every(id => solvedIds.has(id));
}
