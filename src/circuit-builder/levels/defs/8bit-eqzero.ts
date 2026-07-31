import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-eqzero'),
  name: '8-bit EqZero',
  description: 'Build a zero detector.\n\nOutput 1 when the 8-bit input A equals 0, output 0 otherwise.',
  hints: ['If any bit is 1, the result is 0.', 'NOR all 8 bits together — use a splitter and chain OR/NOR gates.'],
  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Z' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: -15, y: -1 }, label: 'A', canRemove: false },
    { type: 'output', pos: { x: 12, y: -1 }, label: 'Z', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'xor', 'xnor', '3bit-or', '3bit-and', 'splitter', 'joiner', 'constant'] },
  test: {
    name: '8-bit EqZero',
    description: 'Detect if input is zero',
    cases: [
      { inputs: { A: 0 }, expected: { Z: 1 } },
      { inputs: { A: 1 }, expected: { Z: 0 } },
      { inputs: { A: 2 }, expected: { Z: 0 } },
      { inputs: { A: 128 }, expected: { Z: 0 } },
      { inputs: { A: 255 }, expected: { Z: 0 } },
      { inputs: { A: 64 }, expected: { Z: 0 } },
      { inputs: { A: 42 }, expected: { Z: 0 } },
    ],
  },
  prerequisites: [lid('8bit-constant')],
  mapPosition: { x: 32, y: 7 },
};
export default level;
