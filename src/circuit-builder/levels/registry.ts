import type { LevelId } from '../editor/types.ts';
import type { Level } from "./levelTypes.ts";

// Cast helper for level IDs
const lid = (s: string) => s as LevelId;

export const LEVELS: Level[] = [
  // =========================================================================
  // Tier 1: Basic Gates
  // =========================================================================
  {
    id: lid('not'),
    name: 'NOT',
    description:
      'Build a NOT gate using only NAND gates.\n\nA NOT gate inverts the input: 0 becomes 1, 1 becomes 0.\n\nHint: What happens when you connect both inputs of a NAND gate together?',
    inputs: [{ name: 'A', bitWidth: 1 }],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand'] },
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
    prerequisites: [],
    mapPosition: { x: 4, y: 5 },
  },
  {
    id: lid('and'),
    name: 'AND',
    description:
      'Build an AND gate using NAND and NOT gates.\n\nAND outputs 1 only when both inputs are 1.\n\nHint: NAND is the opposite of AND...',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not'] },
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
    prerequisites: [lid('not')],
    mapPosition: { x: 12, y: 3 },
  },
  {
    id: lid('or'),
    name: 'OR',
    description:
      "Build an OR gate using NAND and NOT gates.\n\nOR outputs 1 when at least one input is 1.\n\nHint: De Morgan's law — you'll need three NAND gates.",
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not'] },
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
    prerequisites: [lid('not')],
    mapPosition: { x: 12, y: 7 },
  },

  // =========================================================================
  // Tier 2: Derived Gates
  // =========================================================================
  {
    id: lid('always-on'),
    name: 'Always On',
    description:
      'Build a circuit that always outputs 1, with no inputs.\n\nHint: What does a NAND gate output when both inputs have no signal?',
    inputs: [],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'output', pos: { x: 8, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not'] },
    mode: 'combinational',
    test: {
      name: 'Always On',
      description: 'Output must always be 1',
      mode: 'combinational',
      cases: [
        { inputs: {}, expected: { Out: 1 } },
      ],
    },
    prerequisites: [lid('not')],
    mapPosition: { x: 20, y: 11 },
  },
  {
    id: lid('nor'),
    name: 'NOR',
    description:
      'Build a NOR gate.\n\nNOR outputs 1 only when both inputs are 0. It is the complement of OR.\n\nHint: OR then NOT.',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'or'] },
    mode: 'combinational',
    test: {
      name: 'NOR gate',
      description: 'Output 1 only when both inputs are 0',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0 }, expected: { Out: 1 } },
        { inputs: { A: 0, B: 1 }, expected: { Out: 0 } },
        { inputs: { A: 1, B: 0 }, expected: { Out: 0 } },
        { inputs: { A: 1, B: 1 }, expected: { Out: 0 } },
      ],
    },
    prerequisites: [lid('or'), lid('not')],
    mapPosition: { x: 20, y: 7 },
  },
  {
    id: lid('xor'),
    name: 'XOR',
    description:
      'Build an XOR (exclusive OR) gate.\n\nXOR outputs 1 when the inputs differ.\n\nHint: (A AND NOT B) OR (NOT A AND B).',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or'] },
    mode: 'combinational',
    test: {
      name: 'XOR gate',
      description: 'Output 1 when inputs differ',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0 }, expected: { Out: 0 } },
        { inputs: { A: 0, B: 1 }, expected: { Out: 1 } },
        { inputs: { A: 1, B: 0 }, expected: { Out: 1 } },
        { inputs: { A: 1, B: 1 }, expected: { Out: 0 } },
      ],
    },
    prerequisites: [lid('and'), lid('or')],
    mapPosition: { x: 20, y: 3 },
  },
  {
    id: lid('xnor'),
    name: 'XNOR',
    description:
      'Build an XNOR gate.\n\nXNOR outputs 1 when both inputs are the same.\n\nHint: Just invert XOR.',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor'] },
    mode: 'combinational',
    test: {
      name: 'XNOR gate',
      description: 'Output 1 when inputs are the same',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0 }, expected: { Out: 1 } },
        { inputs: { A: 0, B: 1 }, expected: { Out: 0 } },
        { inputs: { A: 1, B: 0 }, expected: { Out: 0 } },
        { inputs: { A: 1, B: 1 }, expected: { Out: 1 } },
      ],
    },
    prerequisites: [lid('xor'), lid('not')],
    mapPosition: { x: 28, y: 3 },
  },

  // =========================================================================
  // Tier 3: Multi-Input Gates
  // =========================================================================
  {
    id: lid('3bit-or'),
    name: '3-bit OR',
    description:
      'Build a 3-input OR gate.\n\nOutput 1 if any of the three inputs is 1.\n\nHint: Chain two OR gates.',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
      { name: 'C', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 1 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 4 }, label: 'B', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 7 }, label: 'C', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 4 }, label: 'Out', canRemove: false, canMove: false },
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
  },
  {
    id: lid('3bit-and'),
    name: '3-bit AND',
    description:
      'Build a 3-input AND gate.\n\nOutput 1 only when all three inputs are 1.\n\nHint: Chain two AND gates.',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
      { name: 'C', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 1 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 4 }, label: 'B', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 7 }, label: 'C', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 4 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and'] },
    mode: 'combinational',
    test: {
      name: '3-bit AND',
      description: 'Output 1 only when all inputs are 1',
      mode: 'combinational',
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
  },

  // =========================================================================
  // Tier 4: 8-bit Operations
  // =========================================================================
  {
    id: lid('8bit-not'),
    name: '8-bit NOT',
    description:
      'Build an 8-bit NOT gate.\n\nInvert all 8 bits of the input.\n\nHint: A single NOT gate works on any bit width.',
    inputs: [{ name: 'A', bitWidth: 8 }],
    outputs: [{ name: 'Out', bitWidth: 8 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not'] },
    mode: 'combinational',
    test: {
      name: '8-bit NOT',
      description: 'Invert all 8 bits',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0b00000000 }, expected: { Out: 0b11111111 } },
        { inputs: { A: 0b11111111 }, expected: { Out: 0b00000000 } },
        { inputs: { A: 0b10101010 }, expected: { Out: 0b01010101 } },
        { inputs: { A: 0b00001111 }, expected: { Out: 0b11110000 } },
      ],
    },
    prerequisites: [lid('not')],
    mapPosition: { x: 36, y: 1 },
  },
  {
    id: lid('8bit-or'),
    name: '8-bit OR',
    description:
      'Build an 8-bit OR gate.\n\nPerform bitwise OR on two 8-bit inputs.\n\nHint: OR gates work on any bit width.',
    inputs: [
      { name: 'A', bitWidth: 8 },
      { name: 'B', bitWidth: 8 },
    ],
    outputs: [{ name: 'Out', bitWidth: 8 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not', 'or'] },
    mode: 'combinational',
    test: {
      name: '8-bit OR',
      description: 'Bitwise OR on two 8-bit values',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0b00000000, B: 0b00000000 }, expected: { Out: 0b00000000 } },
        { inputs: { A: 0b11111111, B: 0b00000000 }, expected: { Out: 0b11111111 } },
        { inputs: { A: 0b10101010, B: 0b01010101 }, expected: { Out: 0b11111111 } },
        { inputs: { A: 0b11001100, B: 0b00110011 }, expected: { Out: 0b11111111 } },
        { inputs: { A: 0b11000000, B: 0b00001111 }, expected: { Out: 0b11001111 } },
      ],
    },
    prerequisites: [lid('or')],
    mapPosition: { x: 36, y: 3 },
  },
  {
    id: lid('8bit-nor'),
    name: '8-bit NOR',
    description:
      'Build an 8-bit NOR gate.\n\nPerform bitwise NOR on two 8-bit inputs.\n\nHint: OR then NOT, or use a NOR gate directly.',
    inputs: [
      { name: 'A', bitWidth: 8 },
      { name: 'B', bitWidth: 8 },
    ],
    outputs: [{ name: 'Out', bitWidth: 8 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not', 'or', 'nor'] },
    mode: 'combinational',
    test: {
      name: '8-bit NOR',
      description: 'Bitwise NOR on two 8-bit values',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0b00000000, B: 0b00000000 }, expected: { Out: 0b11111111 } },
        { inputs: { A: 0b11111111, B: 0b00000000 }, expected: { Out: 0b00000000 } },
        { inputs: { A: 0b10101010, B: 0b01010101 }, expected: { Out: 0b00000000 } },
        { inputs: { A: 0b11000000, B: 0b00001111 }, expected: { Out: 0b00110000 } },
      ],
    },
    prerequisites: [lid('nor')],
    mapPosition: { x: 36, y: 5 },
  },

  // =========================================================================
  // Tier 5: Arithmetic
  // =========================================================================
  {
    id: lid('2bit-adder'),
    name: 'Half Adder',
    description:
      'Build a half adder.\n\nAdd two 1-bit numbers A and B. Output the sum S and carry C.\n\nHint: S = A XOR B, C = A AND B.',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [
      { name: 'S', bitWidth: 1 },
      { name: 'C', bitWidth: 1 },
    ],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 2 }, label: 'S', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 5 }, label: 'C', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor'] },
    mode: 'combinational',
    test: {
      name: 'Half Adder',
      description: 'Add two 1-bit numbers',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0 }, expected: { S: 0, C: 0 } },
        { inputs: { A: 0, B: 1 }, expected: { S: 1, C: 0 } },
        { inputs: { A: 1, B: 0 }, expected: { S: 1, C: 0 } },
        { inputs: { A: 1, B: 1 }, expected: { S: 0, C: 1 } },
      ],
    },
    prerequisites: [lid('xor'), lid('and'), lid('or')],
    mapPosition: { x: 44, y: 3 },
  },
  {
    id: lid('3bit-adder'),
    name: 'Full Adder',
    description:
      'Build a full adder.\n\nAdd three 1-bit numbers A, B, and Cin (carry in). Output the sum S and carry Cout.\n\nHint: Use two half adders and an OR gate for the carry.',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
      { name: 'Cin', bitWidth: 1 },
    ],
    outputs: [
      { name: 'S', bitWidth: 1 },
      { name: 'Cout', bitWidth: 1 },
    ],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 5 }, label: 'B', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 8 }, label: 'Cin', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 18, y: 3 }, label: 'S', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 18, y: 6 }, label: 'Cout', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '2bit-adder'] },
    mode: 'combinational',
    test: {
      name: 'Full Adder',
      description: 'Add three 1-bit numbers',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0, B: 0, Cin: 0 }, expected: { S: 0, Cout: 0 } },
        { inputs: { A: 0, B: 0, Cin: 1 }, expected: { S: 1, Cout: 0 } },
        { inputs: { A: 0, B: 1, Cin: 0 }, expected: { S: 1, Cout: 0 } },
        { inputs: { A: 0, B: 1, Cin: 1 }, expected: { S: 0, Cout: 1 } },
        { inputs: { A: 1, B: 0, Cin: 0 }, expected: { S: 1, Cout: 0 } },
        { inputs: { A: 1, B: 0, Cin: 1 }, expected: { S: 0, Cout: 1 } },
        { inputs: { A: 1, B: 1, Cin: 0 }, expected: { S: 0, Cout: 1 } },
        { inputs: { A: 1, B: 1, Cin: 1 }, expected: { S: 1, Cout: 1 } },
      ],
    },
    prerequisites: [lid('2bit-adder')],
    mapPosition: { x: 52, y: 3 },
  },

  // =========================================================================
  // Tier 6: Combinational Utility
  // =========================================================================
  {
    id: lid('switch'),
    name: 'Switch',
    description:
      'Build a 2-to-1 multiplexer (switch) using tri-state buffers.\n\nWhen S=0, output A. When S=1, output B.\n\nHint: Use two tri-state buffers — enable one with S, the other with NOT S. Connect both outputs to the same wire.',
    inputs: [
      { name: 'S', bitWidth: 1 },
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
    ],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 1 }, label: 'S', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 4 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 7 }, label: 'B', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 14, y: 4 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'tristate'] },
    mode: 'combinational',
    test: {
      name: 'Switch (Mux)',
      description: 'S=0 selects A, S=1 selects B',
      mode: 'combinational',
      cases: [
        { inputs: { S: 0, A: 0, B: 0 }, expected: { Out: 0 } },
        { inputs: { S: 0, A: 0, B: 1 }, expected: { Out: 0 } },
        { inputs: { S: 0, A: 1, B: 0 }, expected: { Out: 1 } },
        { inputs: { S: 0, A: 1, B: 1 }, expected: { Out: 1 } },
        { inputs: { S: 1, A: 0, B: 0 }, expected: { Out: 0 } },
        { inputs: { S: 1, A: 0, B: 1 }, expected: { Out: 1 } },
        { inputs: { S: 1, A: 1, B: 0 }, expected: { Out: 0 } },
        { inputs: { S: 1, A: 1, B: 1 }, expected: { Out: 1 } },
      ],
    },
    prerequisites: [lid('and'), lid('not'), lid('or')],
    mapPosition: { x: 28, y: 5 },
  },
  {
    id: lid('1bit-decoder'),
    name: '1-bit Decoder',
    description:
      'Build a 1-to-2 decoder.\n\nWhen A=0, O0=1 and O1=0. When A=1, O0=0 and O1=1.\n\nHint: O0 is NOT A, O1 is A.',
    inputs: [{ name: 'A', bitWidth: 1 }],
    outputs: [
      { name: 'O0', bitWidth: 1 },
      { name: 'O1', bitWidth: 1 },
    ],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 2 }, label: 'O0', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 5 }, label: 'O1', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not'] },
    mode: 'combinational',
    test: {
      name: '1-bit Decoder',
      description: 'Decode 1 bit to 2 one-hot outputs',
      mode: 'combinational',
      cases: [
        { inputs: { A: 0 }, expected: { O0: 1, O1: 0 } },
        { inputs: { A: 1 }, expected: { O0: 0, O1: 1 } },
      ],
    },
    prerequisites: [lid('not')],
    mapPosition: { x: 44, y: 7 },
  },
  {
    id: lid('3bit-decoder'),
    name: '3-bit Decoder',
    description:
      'Build a 3-to-8 decoder.\n\nGiven 3-bit input (A, B, C), set exactly one of 8 outputs (O0–O7) to 1.\n\nO0=1 when ABC=000, O1=1 when ABC=001, ..., O7=1 when ABC=111.\n\nHint: Each output is an AND of three signals (each input or its inverse).',
    inputs: [
      { name: 'A', bitWidth: 1 },
      { name: 'B', bitWidth: 1 },
      { name: 'C', bitWidth: 1 },
    ],
    outputs: [
      { name: 'O0', bitWidth: 1 },
      { name: 'O1', bitWidth: 1 },
      { name: 'O2', bitWidth: 1 },
      { name: 'O3', bitWidth: 1 },
      { name: 'O4', bitWidth: 1 },
      { name: 'O5', bitWidth: 1 },
      { name: 'O6', bitWidth: 1 },
      { name: 'O7', bitWidth: 1 },
    ],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'A', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 6 }, label: 'B', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 9 }, label: 'C', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 1 }, label: 'O0', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 4 }, label: 'O1', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 7 }, label: 'O2', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 10 }, label: 'O3', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 13 }, label: 'O4', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 16 }, label: 'O5', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 19 }, label: 'O6', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 22, y: 22 }, label: 'O7', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', "3bit-and"] },
    mode: 'combinational',
    test: {
      name: '3-bit Decoder',
      description: 'Decode 3 bits to 8 one-hot outputs',
      mode: 'combinational',
      cases: (() => {
        const cases = [];
        for (let i = 0; i < 8; i++) {
          const expected: Record<string, number> = {};
          for (let j = 0; j < 8; j++) expected[`O${j}`] = j === i ? 1 : 0;
          cases.push({
            inputs: { A: (i >> 2) & 1, B: (i >> 1) & 1, C: i & 1 },
            expected,
          });
        }
        return cases;
      })(),
    },
    prerequisites: [lid('1bit-decoder'), lid('and')],
    mapPosition: { x: 52, y: 7 },
  },

  // =========================================================================
  // Tier 7: 2's Complement
  // =========================================================================
  {
    id: lid('8bit-negative'),
    name: '8-bit Negate',
    description:
      "Negate an 8-bit number using two's complement.\n\nGiven an unsigned 8-bit input, output its negation (mod 256).\n\nHint: -A = NOT(A) + 1. Use a splitter, joiner, and a chain of adder logic, or use the constant gate for +1.",
    inputs: [{ name: 'A', bitWidth: 8 }],
    outputs: [{ name: 'Out', bitWidth: 8 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 5 }, label: 'A', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'output', pos: { x: 30, y: 5 }, label: 'Out', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', '8bit-not', 'constant', 'splitter', 'joiner'] },
    mode: 'combinational',
    test: {
      name: '8-bit Negate',
      description: "Two's complement negation",
      mode: 'combinational',
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
  },

  // =========================================================================
  // Tier 8: Sequential Circuits
  // =========================================================================
  {
    id: lid('delay'),
    name: 'Delay',
    description:
      'Pass the input to the output with a 1-tick delay.\n\nThe output should reflect the input value from the previous tick.\n\nHint: Use a delay gate.',
    inputs: [{ name: 'In', bitWidth: 1 }],
    outputs: [{ name: 'Out', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'In', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 12, y: 3 }, label: 'Out', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['delay'] },
    mode: 'sequential',
    test: {
      name: 'Delay',
      description: 'Output follows input with a 1-tick delay',
      mode: 'sequential',
      steps: [
        { type: 'write', pin: 'In', value: 1 },
        { type: 'read', pin: 'Out', expected: 1 },
        { type: 'write', pin: 'In', value: 0 },
        { type: 'read', pin: 'Out', expected: 0 },
        { type: 'write', pin: 'In', value: 1 },
        { type: 'read', pin: 'Out', expected: 1 },
      ],
    },
    prerequisites: [lid('not')],
    mapPosition: { x: 44, y: 11 },
  },
  {
    id: lid('rs-latch'),
    name: 'RS Latch',
    description:
      'Build a 1-bit RS latch using delay gates.\n\nS (set) = 1 sets Q to 1. R (reset) = 1 sets Q to 0. When both are 0, Q holds its value.\n\nHint: Use NOR gates with delay feedback to break the combinational loop.',
    inputs: [
      { name: 'S', bitWidth: 1 },
      { name: 'R', bitWidth: 1 },
    ],
    outputs: [{ name: 'Q', bitWidth: 1 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 2 }, label: 'S', canRemove: false, canMove: false },
      { type: 'input', pos: { x: 2, y: 7 }, label: 'R', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 18, y: 3 }, label: 'Q', canRemove: false, canMove: false },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'delay'] },
    mode: 'sequential',
    test: {
      name: 'RS Latch',
      description: 'Set, hold, reset, hold',
      mode: 'sequential',
      steps: [
        // Set: S=1, R=0 → Q=1
        [{ type: 'write', pin: 'S', value: 1 }, { type: 'write', pin: 'R', value: 0 }],
        { type: 'read', pin: 'Q', expected: 1 },
        // Hold: S=0, R=0 → Q=1
        { type: 'write', pin: 'S', value: 0 },
        { type: 'read', pin: 'Q', expected: 1 },
        // Reset: S=0, R=1 → Q=0
        { type: 'write', pin: 'R', value: 1 },
        { type: 'read', pin: 'Q', expected: 0 },
        // Hold: S=0, R=0 → Q=0
        { type: 'write', pin: 'R', value: 0 },
        { type: 'read', pin: 'Q', expected: 0 },
        // Set again: S=1, R=0 → Q=1
        { type: 'write', pin: 'S', value: 1 },
        { type: 'read', pin: 'Q', expected: 1 },
      ],
    },
    prerequisites: [lid('delay'), lid('nor')],
    mapPosition: { x: 52, y: 11 },
  },
  {
    id: lid('8bit-memory'),
    name: '8-bit Memory',
    description:
      'Build an 8-bit register (D flip-flop).\n\nWhen W (write enable) is 1, store the value of D. Output Q always shows the stored value.\n\nHint: Use a switch/mux to select between the stored value and new input based on W, then feed through delays.',
    inputs: [
      { name: 'D', bitWidth: 8 },
      { name: 'W', bitWidth: 1 },
    ],
    outputs: [{ name: 'Q', bitWidth: 8 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'D', canRemove: false, canMove: false, bitWidth: 8 },
      { type: 'input', pos: { x: 2, y: 7 }, label: 'W', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 24, y: 5 }, label: 'Q', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'nor', 'switch', 'delay', 'rs-latch', 'splitter', 'joiner'] },
    mode: 'sequential',
    test: {
      name: '8-bit Memory',
      description: 'Store and recall 8-bit values',
      mode: 'sequential',
      steps: [
        // Write 42
        [{ type: 'write', pin: 'D', value: 42 }, { type: 'write', pin: 'W', value: 1 }],
        { type: 'read', pin: 'Q', expected: 42 },
        // Disable write, change D — Q should hold
        [{ type: 'write', pin: 'W', value: 0 }, { type: 'write', pin: 'D', value: 0 }],
        { type: 'read', pin: 'Q', expected: 42 },
        // Write 255
        [{ type: 'write', pin: 'D', value: 255 }, { type: 'write', pin: 'W', value: 1 }],
        { type: 'read', pin: 'Q', expected: 255 },
        // Hold
        { type: 'write', pin: 'W', value: 0 },
        { type: 'read', pin: 'Q', expected: 255 },
        // Write 0
        [{ type: 'write', pin: 'D', value: 0 }, { type: 'write', pin: 'W', value: 1 }],
        { type: 'read', pin: 'Q', expected: 0 },
      ],
    },
    prerequisites: [lid('rs-latch'), lid('switch')],
    mapPosition: { x: 60, y: 11 },
  },
  {
    id: lid('8bit-counter'),
    name: '8-bit Counter',
    description:
      'Build an 8-bit increment counter.\n\nThe output increments by 1 each tick. Starts at 0, wraps around at 255.\n\nHint: Feed the output back through an adder (+1) and delays to create a counter loop.',
    inputs: [],
    outputs: [{ name: 'Q', bitWidth: 8 }],
    predefinedGates: [
      { type: 'output', pos: { x: 24, y: 5 }, label: 'Q', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', 'nor', '8bit-or', '8bit-nor', '8bit-not', '2bit-adder', 'switch', 'delay', 'rs-latch', '8bit-memory', 'constant', 'splitter', 'joiner'] },
    mode: 'sequential',
    test: {
      name: '8-bit Counter',
      description: 'Counts up from 0 each tick',
      mode: 'sequential',
      steps: [
        { type: 'read', pin: 'Q', expected: 1 },
        { type: 'read', pin: 'Q', expected: 2 },
        { type: 'read', pin: 'Q', expected: 3 },
        { type: 'read', pin: 'Q', expected: 4 },
        { type: 'read', pin: 'Q', expected: 5 },
      ],
    },
    prerequisites: [lid('8bit-memory'), lid('2bit-adder'), lid('always-on')],
    mapPosition: { x: 68, y: 11 },
  },
  {
    id: lid('8bit-counter-reset'),
    name: '8-bit Counter + Reset',
    description:
      'Build an 8-bit increment counter with a reset input.\n\nSame as the counter, but when R=1 the counter resets to 0 on the next tick.\n\nHint: Use a switch/mux to choose between the incremented value and 0 based on R.',
    inputs: [{ name: 'R', bitWidth: 1 }],
    outputs: [{ name: 'Q', bitWidth: 8 }],
    predefinedGates: [
      { type: 'input', pos: { x: 2, y: 3 }, label: 'R', canRemove: false, canMove: false },
      { type: 'output', pos: { x: 24, y: 5 }, label: 'Q', canRemove: false, canMove: false, bitWidth: 8 },
    ],
    gateConstraints: { allow: ['nand', 'not', 'and', 'or', 'xor', 'nor', '8bit-or', '8bit-nor', '8bit-not', '2bit-adder', 'switch', 'delay', 'rs-latch', '8bit-memory', '8bit-counter', 'constant', 'splitter', 'joiner'] },
    mode: 'sequential',
    test: {
      name: '8-bit Counter + Reset',
      description: 'Counts up, resets to 0 when R=1',
      mode: 'sequential',
      steps: [
        // Count up
        { type: 'write', pin: 'R', value: 0 },
        { type: 'read', pin: 'Q', expected: 1 },
        { type: 'read', pin: 'Q', expected: 2 },
        { type: 'read', pin: 'Q', expected: 3 },
        // Reset
        { type: 'write', pin: 'R', value: 1 },
        { type: 'read', pin: 'Q', expected: 0 },
        // Resume counting
        { type: 'write', pin: 'R', value: 0 },
        { type: 'read', pin: 'Q', expected: 1 },
        { type: 'read', pin: 'Q', expected: 2 },
      ],
    },
    prerequisites: [lid('8bit-counter')],
    mapPosition: { x: 76, y: 11 },
  },
];

export function getLevelById(id: LevelId): Level | undefined {
  return LEVELS.find(l => l.id === id);
}
