import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('nor'),
  name: 'NOR',
  description: 'Build a NOR gate.\n\nNOR outputs 1 only when both inputs are 0. It is the complement of OR.',
  hints: ['OR then NOT.'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false },
    { type: 'output', pos: { x: 17, y: 3 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'or'] },
  test: {
    name: 'NOR gate',
    description: 'Output 1 only when both inputs are 0',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 0 } },
    ],
  },
  prerequisites: [lid('or'), lid('not')],
  mapPosition: { x: 20, y: 7 },
};
export default level;
