import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('and'),
  name: 'AND',
  description: 'Build an AND gate using NAND and NOT gates.\n\nAND outputs 1 only when both inputs are 1.',
  hints: ['NAND is the opposite of AND...'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: -9, y: -3 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: -9, y: 0 }, label: 'B', canRemove: false },
    { type: 'output', pos: { x: 6, y: -2 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not'] },
  test: {
    name: 'AND gate',
    description: 'Output 1 only when both inputs are 1',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 12, y: 3 },
};
export default level;
