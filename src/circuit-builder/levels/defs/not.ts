import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('not'),
  name: 'NOT',
  description: 'Build a NOT gate using only NAND gates.\n\nA NOT gate inverts the input: 0 becomes 1, 1 becomes 0.',
  hints: ['What happens when you connect both inputs of a NAND gate together?'],
  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false },
    { type: 'output', pos: { x: 17, y: 3 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand'] },
  test: {
    name: 'NOT gate',
    description: 'Invert the input signal',
    cases: [
      { inputs: { A: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1 }, expected: { Out: 0 } },
    ],
  },
  prerequisites: [lid('nand')],
  mapPosition: { x: 4, y: 5 },
};
export default level;
