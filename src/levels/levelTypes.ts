// Level definition
import type { LevelId, Vec2 } from "../editor/types.ts";
import type { Gate } from "../editor/gates.ts";

export interface TestDefinition {
  name: string;
  description: string;
  mode: 'combinational' | 'sequential';
  cases?: TestCase[];
  steps?: TestSequentialStep[];
}

// Testing types
export interface TestCase {
  inputs: Record<string, number>;
  expected: Record<string, number>;
}

export type TestSequentialStep = TestWrite | TestRead | (TestWrite | TestRead)[];

export interface TestWrite {
  type: 'write';
  pin: string;
  value: number;
}

export interface TestRead {
  type: 'read';
  pin: string;
  expected: number;
}

export interface TestResult {
  passed: boolean;
  message: string;
  caseIndex: number;
  actuals?: Record<string, number | null>;
}

/** Gate spec in a level definition — same fields as Gate minus runtime-only ones (id, pins). */
export type LevelGate =
  Pick<Gate, 'type' | 'pos'> &
  Partial<Pick<Gate, 'rotation' | 'label' | 'canRemove' | 'canMove'>> &
  { bitWidth?: number };

export interface Level {
  id: LevelId;
  name: string;
  description: string;
  inputs: { name: string; bitWidth: number }[];
  outputs: { name: string; bitWidth: number }[];
  mode: 'combinational' | 'sequential';
  test: TestDefinition;
  predefinedGates?: LevelGate[];
  prerequisites: LevelId[];
  mapPosition: Vec2;
}
