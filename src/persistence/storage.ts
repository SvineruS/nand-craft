import type { Circuit } from '../editor/circuit.ts';
import type { LevelId } from '../editor/types.ts';
import { serializeCircuit, deserializeCircuit } from './serialize.ts';
import type { Level } from "../levels/levelTypes.ts";

const PREFIX = 'nand-craft';
const SOLVED_KEY = `${PREFIX}:solved`;

function circuitKey(levelId: LevelId): string {
  return `${PREFIX}:circuit:${levelId}`;
}

export function saveCircuit(levelId: LevelId, circuit: Circuit): void {
  localStorage.setItem(circuitKey(levelId), serializeCircuit(circuit));
}

export function loadCircuit(levelId: LevelId): Circuit | null {
  const json = localStorage.getItem(circuitKey(levelId));
  if (!json) return null;
  try {
    return deserializeCircuit(json);
  } catch {
    return null;
  }
}

export function getSolvedLevelIds(): Set<LevelId> {
  const json = localStorage.getItem(SOLVED_KEY);
  if (!json) return new Set();
  try {
    const arr: string[] = JSON.parse(json);
    return new Set(arr as LevelId[]);
  } catch {
    return new Set();
  }
}

export function markLevelSolved(levelId: LevelId): void {
  const solved = getSolvedLevelIds();
  solved.add(levelId);
  localStorage.setItem(SOLVED_KEY, JSON.stringify([...solved]));
}

export function isLevelUnlocked(level: Level, solvedIds: Set<LevelId>): boolean {
  return level.prerequisites.every(id => solvedIds.has(id));
}
