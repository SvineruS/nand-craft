import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('nand'),
  name: 'NAND',
  description: 'Build a NAND gate using only a NAND gate.\n\nNAND outputs 0 only when both inputs are 1. It is the universal gate — every other gate can be built from NAND.',
  hints: ['Just place a NAND gate and wire it up.'],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input', pos: { x: -6, y: -3 }, label: 'A', canRemove: false },
    { type: 'input', pos: { x: -6, y: 0 }, label: 'B', canRemove: false },
    { type: 'output', pos: { x: 4, y: -2 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand'] },
  test: {
    name: 'NAND gate',
    description: 'Output 0 only when both inputs are 1',
    cases: [
      { inputs: { A: 0, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 0, B: 1 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 0 }, expected: { Out: 1 } },
      { inputs: { A: 1, B: 1 }, expected: { Out: 0 } },
    ],
  },
  prerequisites: [lid('wire')],
  mapPosition: { x: 2, y: 5 },
};
export default level;
