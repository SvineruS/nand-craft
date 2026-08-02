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

function circuitKey(levelId: LevelId): string {
  return `${PREFIX}:circuit:${levelId}`;
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
