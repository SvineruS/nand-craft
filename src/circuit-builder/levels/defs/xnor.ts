import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('xnor'),
  name: 'XNOR',
  description: 'Build an XNOR gate.\n\nXNOR outputs 1 when both inputs are the same.',
  hints: ['XNOR stands for "NOT XOR".'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false },
    { type: 'output', pos: { x: 19, y: 3 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor'] },
  test: {
    name: 'XNOR gate',
    description: 'Output 1 when inputs are the same',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('not')],
  mapPosition: { x: 28, y: 3 },
};
export default level;
