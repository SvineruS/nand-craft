import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-negative'),
  name: '8-bit Negate',
  description: "Negate an 8-bit number using two's complement.\n\nGiven an unsigned 8-bit input, output its negation (mod 256).",
  hints: ["-A = NOT(A) + 1. Use a splitter, joiner, and a chain of adder logic, or use the constant gate for +1."],
  inputs: [{ name: 'A' }],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: 2, y: 5 }, label: 'A', canRemove: false },
    { type: 'output-8bit', pos: { x: 35, y: 5 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '8bit-not', 'constant', 'splitter', 'joiner'] },
  test: {
    name: '8-bit Negate',
    description: "Two's complement negation",
    cases: [
      { inputs: { A: 0 }, expected: { Out: 0 } },
      { inputs: { A: 1 }, expected: { Out: 255 } },
      { inputs: { A: 2 }, expected: { Out: 254 } },
      { inputs: { A: 127 }, expected: { Out: 129 } },
      { inputs: { A: 128 }, expected: { Out: 128 } },
      { inputs: { A: 255 }, expected: { Out: 1 } },
      { inputs: { A: 42 }, expected: { Out: 214 } },
    ],
  },
  prerequisites: [lid('8bit-not'), lid('2bit-adder'), lid('always-on')],
  mapPosition: { x: 44, y: 1 },
};
export default level;
