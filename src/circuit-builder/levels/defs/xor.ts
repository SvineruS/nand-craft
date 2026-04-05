import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('xor'),
  name: 'XOR',
  description: 'Build an XOR (exclusive OR) gate.\n\nXOR outputs 1 when the inputs differ.',
  hints: ['XOR is 1 when at least one input is active but not both', '(A AND NOT B) OR (NOT A AND B).'],
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
  gateConstraints: { allow: ['nand', 'not', 'and', 'or'] },
  test: {
    name: 'XOR gate',
    description: 'Output 1 when inputs differ',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 0 } },
    ],
  },
  prerequisites: [lid('and'), lid('or')],
  mapPosition: { x: 20, y: 3 },
};
export default level;
