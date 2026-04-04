import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('3bit-or'),
  name: '3-bit OR',
  description: 'Build a 3-input OR gate.\n\nOutput 1 if any of the three inputs is 1.\n\nHint: Chain two OR gates.',
  inputs: [
    { name: 'A' },
    { name: 'B' },
    { name: 'C' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: 2, y: 1 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: 2, y: 4 }, label: 'B', canRemove: false },
    { type: 'input', pos: { x: 2, y: 7 }, label: 'C', canRemove: false },
    { type: 'output', pos: { x: 19, y: 4 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'or'] },
  mode: 'combinational',
  test: {
    name: '3-bit OR',
    description: 'Output 1 if any input is 1',
    mode: 'combinational',
    cases: [
      { inputs: { A: 0, B: 0, C: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 0, C: 1 }, expected: { Out: 1 } },
      { inputs: { A: 0, B: 1, C: 0 }, expected: { Out: 1 } },
      { inputs: { A: 0, B: 1, C: 1 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 0, C: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 0, C: 1 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 1, C: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 1, C: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('or')],
  mapPosition: { x: 36, y: 7 },
};
export default level;
