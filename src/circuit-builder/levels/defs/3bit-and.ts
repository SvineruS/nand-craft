import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('3bit-and'),
  name: '3-bit AND',
  description: 'Build a 3-input AND gate.\n\nOutput 1 only when all three inputs are 1.\n\nHint: Chain two AND gates.',
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
  gateConstraints: { allow: ['nand', 'not', 'and'] },
  test: {
    name: '3-bit AND',
    description: 'Output 1 only when all inputs are 1',
    cases: [
      { inputs: { A: 0, B: 0, C: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 0, C: 1 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 1, C: 0 }, expected: { Out: 0 } },
      { inputs: { A: 0, B: 1, C: 1 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 0, C: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 0, C: 1 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 1, C: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1, B: 1, C: 1 }, expected: { Out: 1 } },
    ],
  },
  prerequisites: [lid('and')],
  mapPosition: { x: 36, y: 9 },
};
export default level;
