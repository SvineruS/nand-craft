import type { Level, LevelId } from '../types.ts';

// Cast helper for level IDs
const lid = (s: string) => s as LevelId;

export const LEVELS: Level[] = [
  {
    id: lid('not'),
    name: 'NOT',
    description:
      'Build a NOT gate using only NAND gates.\n\nA NOT gate inverts the input: 0 becomes 1, 1 becomes 0.\n\nHint: What happens when you connect both inputs of a NAND gate together?',
    inputs: [{ name: 'A', bitWidth: 1 }],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    mode: 'combinational',
    test: {
      name: 'NOT gate',
      description: 'Invert the input signal',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0 }, expected: { Out: 1 } },
        { inputs: { A: 1 }, expected: { Out: 0 } },
      ],
    },
  },
  {
    id: lid('and'),
    name: 'AND',
    description:
      'Build an AND gate using only NAND gates.\n\nAND outputs 1 only when both inputs are 1.\n\nHint: NAND is the opposite of AND...',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    mode: 'combinational',
    test: {
      name: 'AND gate',
      description: 'Output 1 only when both inputs are 1',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
        { inputs: { A: 0, B: 1 }, expected: { Out: 0 } },
        { inputs: { A: 1, B: 0 }, expected: { Out: 0 } },
        { inputs: { A: 1, B: 1 }, expected: { Out: 1 } },
      ],
    },
  },
  {
    id: lid('or'),
    name: 'OR',
    description:
      "Build an OR gate using only NAND gates.\n\nOR outputs 1 when at least one input is 1.\n\nHint: De Morgan's law — you'll need three NAND gates.",
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    mode: 'combinational',
    test: {
      name: 'OR gate',
      description: 'Output 1 when at least one input is 1',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
        { inputs: { A: 0, B: 1 }, expected: { Out: 1 } },
        { inputs: { A: 1, B: 0 }, expected: { Out: 1 } },
        { inputs: { A: 1, B: 1 }, expected: { Out: 1 } },
      ],
    },
  },
];
