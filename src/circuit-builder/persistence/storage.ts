import { Circuit } from '../simulation/circuit.ts';
import type { LevelId } from '../editor/types.ts';
import { serializeCircuit, deserializeCircuitFromJson } from './serialize.ts';
import type { Level } from "../levels/levelTypes.ts";

const PREFIX = 'nand-craft';
const SOLVED_KEY = `${PREFIX}:solved`;

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

export function isLevelUnlocked(level: Level, solvedIds: Set<LevelId>): boolean {
  return level.prerequisites.every(id => solvedIds.has(id));
}
