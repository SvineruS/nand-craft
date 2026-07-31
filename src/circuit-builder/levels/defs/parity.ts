import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('parity'),
  name: 'Parity',
  description: 'Build a parity checker.\n\nOutput 1 if an odd number of the four inputs are active (1). Output 0 if an even number are active (including zero).',
  hints: ['XOR outputs 1 when inputs differ — it already checks parity of 2 bits.', 'Chain XOR gates: XOR(XOR(A, B), XOR(C, D)).'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
    { name: 'D' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: -10, y: -6 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: -10, y: -3 }, label: 'B', canRemove: false },
    { type: 'input', pos: { x: -10, y: 0 }, label: 'C', canRemove: false },
    { type: 'input', pos: { x: -10, y: 3 }, label: 'D', canRemove: false },
    { type: 'output', pos: { x: 8, y: -2 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['xor'] },
  test: {
    name: 'Parity',
    description: 'Odd parity of 4 inputs',
    cases: (() => {
      const cases = [];
      for (let i = 0; i < 16; i++) {
        const a = (i >> 3) & 1;
        const b = (i >> 2) & 1;
        const c = (i >> 1) & 1;
        const d = i & 1;
        const parity = a ^ b ^ c ^ d;
        cases.push({ inputs: { A: a, B: b, C: c, D: d }, expected: { Out: parity } });
      }
      return cases;
    })(),
  },
  prerequisites: [lid('xor')],
  mapPosition: { x: 28, y: -1 },
};
export default level;
