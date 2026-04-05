// Level definition
import type { LevelId, Vec2 } from "../editor/types.ts";
import type { Gate } from "../editor/gates.ts";
import type { GateType } from "../simulation/gateTypes.ts";

export interface TestDefinition {
  name: string;
  description: string;
  cases?: TestCase[];
}

// Testing types
export interface TestCase {
  inputs: Record<string, number>;
  expected: Record<string, number>;
}

export interface TestResult {
  passed: boolean;
  message: string;
  caseIndex: number;
  actuals?: Record<string, number | null>;
}

export type QueueCommandStatus = 'pending' | 'running' | 'passed' | 'failed';

export interface QueueCommandResult {
  type: 'write' | 'read';
  label: string;
  expected: number;
  status: QueueCommandStatus;
  actual?: number | null;
  error?: string;
  /** True for the first command in a @case group. */
  caseStart?: boolean;
  caseName?: string;
}

/** Gate spec in a level definition — same fields as Gate minus runtime-only ones (id, pins). */
export type LevelGate =
  Pick<Gate, 'type' | 'pos'> &
  Partial<Pick<Gate, 'rotation' | 'label' | 'canRemove' | 'canMove'>>;

export interface GateConstraints {
  /** If set, only these gate types can be placed (whitelist). */
  allow?: GateType[];
  /** If set, these gate types cannot be placed (blacklist). Ignored if `allow` is set. */
  block?: GateType[];
  /** Max number of gates per type. e.g. { nand: 3 } means at most 3 NAND gates. */
  maxCount?: Partial<Record<GateType, number>>;
}

export interface Level {
  id: LevelId;
  name: string;
  description: string;
  inputs: { name: string }[];
  outputs: { name: string }[];
  test: TestDefinition;
  predefinedGates?: LevelGate[];
  gateConstraints?: GateConstraints;
  prerequisites: LevelId[];
  mapPosition: Vec2;
  /** Allow user to edit tests via the test editor. */
  customTests?: boolean;
}

// ---------------------------------------------------------------------------
// Gate constraint helpers
// ---------------------------------------------------------------------------

export function isGateAllowed(type: GateType, constraints: GateConstraints | undefined): boolean {
  if (!constraints) return true;
  if (constraints.allow) return constraints.allow.includes(type);
  if (constraints.block) return !constraints.block.includes(type);
  return true;
}

export function getGateCount(type: GateType, gates: Iterable<{ type: GateType }>): number {
  let count = 0;
  for (const gate of gates) {
    if (gate.type === type) count++;
  }
  return count;
}
