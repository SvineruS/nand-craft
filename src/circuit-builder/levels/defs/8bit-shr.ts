import type { LevelId } from '../../editor/types.ts';
import type { Level } from '../levelTypes.ts';
const lid = (s: string) => s as LevelId;

const level: Level = {
  id: lid('8bit-shr'),
  name: '8-bit Shift Right',
  description: 'Build an 8-bit shift right.\n\n'
    + 'Shift A right by B places, filling the vacated top bits with 0. '
    + 'A shift of 8 or more pushes every bit out, so the output is 0.',
  hints: [
    'Shifting by a fixed amount is pure rewiring: split A, rejoin it one bit lower, and feed 0 into the top bit.',
    'Chain three stages that shift by 1, 2 and 4. Bits 0, 1 and 2 of B each switch one stage on with a MUX.',
    'Or decode B\'s low three bits into eight lines and let each one enable a fixed shift onto a shared bus.',
    'If any of B\'s upper 5 bits is set, the amount is 8 or more — force the output to 0.',
  ],
  inputs: [
    { name: 'A' },
    { name: 'B' },
  ],
  outputs: [{ name: 'Out' }],
  predefinedGates: [
    { type: 'input-8bit', pos: { x: -15, y: -3 }, label: 'A', canRemove: false },
    { type: 'input-8bit', pos: { x: -15, y: 1 }, label: 'B', canRemove: false },
    { type: 'output-8bit', pos: { x: 12, y: -1 }, label: 'Out', canRemove: false },
  ],
  gateConstraints: {
    allow: [
      'nand', 'not', 'and', 'or', 'nor', 'xor', '3bit-or',
      '8bit-and', '8bit-or', '8bit-not', 'mux', '8bit-mux', '3bit-decoder',
      'tristate', '8bit-tristate', 'constant', 'constant-8bit', 'splitter', 'joiner',
    ],
  },
  test: {
    name: '8-bit Shift Right',
    description: 'Shift A right by B places',
    cases: [
      { inputs: { A: 0b10110011, B: 0 }, expected: { Out: 0b10110011 } },
      { inputs: { A: 0b10110011, B: 1 }, expected: { Out: 0b01011001 } },
      { inputs: { A: 0b10110011, B: 3 }, expected: { Out: 0b00010110 } },
      { inputs: { A: 0b10110011, B: 6 }, expected: { Out: 0b00000010 } },
      { inputs: { A: 0b01010101, B: 2 }, expected: { Out: 0b00010101 } },
      { inputs: { A: 0b11111111, B: 4 }, expected: { Out: 0b00001111 } },
      { inputs: { A: 0b11111111, B: 5 }, expected: { Out: 0b00000111 } },
      { inputs: { A: 0b10000000, B: 7 }, expected: { Out: 0b00000001 } },
      { inputs: { A: 0b00000000, B: 3 }, expected: { Out: 0b00000000 } },
      // 8 and above shifts everything out, whatever the upper bits of B say
      { inputs: { A: 0b11111111, B: 8 }, expected: { Out: 0b00000000 } },
      { inputs: { A: 0b11111111, B: 100 }, expected: { Out: 0b00000000 } },
      { inputs: { A: 0b11111111, B: 255 }, expected: { Out: 0b00000000 } },
    ],
  },
  prerequisites: [lid('8bit-mux')],
  mapPosition: { x: 52, y: 5 },
};
export default level;
