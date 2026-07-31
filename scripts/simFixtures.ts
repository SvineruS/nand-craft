import './localStorageShim.ts';

import { Circuit } from '../src/circuit-builder/simulation/circuit.ts';
import type { GateId, PinRef, WireNodeId, WireSegmentId } from '../src/circuit-builder/editor/types.ts';
import { generateId } from '../src/circuit-builder/editor/types.ts';
import type { GateType } from '../src/circuit-builder/simulation/gateTypes.ts';
import { getPinBitWidth, getPinCounts } from '../src/circuit-builder/editor/gates.ts';
import { buildComponentDefinition } from '../src/circuit-builder/components/componentBuilder.ts';
import { saveComponent } from '../src/circuit-builder/components/componentRegistry.ts';
import type { ComponentId } from '../src/circuit-builder/editor/types.ts';

// ---------------------------------------------------------------------------
// Fixture shape
// ---------------------------------------------------------------------------

export interface FixtureInstance {
  circuit: Circuit;
  /** One entry per tick: gate label -> driven value. */
  ticks: Record<string, number>[];
  /** Stable names, so snapshots survive changes in generated-ID ordering. */
  gateLabels: Map<GateId, string>;
  nodeNames: Map<WireNodeId, string>;
  segmentNames: Map<WireSegmentId, string>;
  /** False for the large bench fixture: record outputs/errors only, not every pin. */
  fullState: boolean;
}

export interface Fixture {
  name: string;
  /** Fresh circuit per call — sequential gates mutate state in place. */
  create(): FixtureInstance;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/** Grid spacing wide enough that buildComponentDefinition sees distinct grid points. */
const GATE_SPACING = 100;
const GATES_PER_ROW = 24;

class Builder {
  circuit = new Circuit();
  gateLabels = new Map<GateId, string>();
  nodeNames = new Map<WireNodeId, string>();
  segmentNames = new Map<WireSegmentId, string>();
  private gateCount = 0;
  private nodeCount = 0;
  private segmentCount = 0;

  /** `value` seeds a constant gate's output; sequential gates start with no register. */
  gate(type: GateType, label: string, value?: number): GateId {
    const id = generateId('g') as GateId;
    const slot = this.gateCount++;
    this.circuit.addGate({
      id,
      type,
      pos: {
        x: (slot % GATES_PER_ROW) * GATE_SPACING,
        y: Math.floor(slot / GATES_PER_ROW) * GATE_SPACING,
      },
      rotation: 0,
      value,
      label,
    });
    this.gateLabels.set(id, label);
    return id;
  }

  /** Join all given pins into one net via a chain of wire nodes and segments. */
  net(...refs: PinRef[]): void {
    const nodeIds: WireNodeId[] = [];
    for (const ref of refs) {
      const nodeId = generateId('n') as WireNodeId;
      this.circuit.addWireNode({ id: nodeId, pos: { x: 0, y: 0 }, pin: ref });
      this.nodeNames.set(nodeId, `node#${this.nodeCount++}`);
      nodeIds.push(nodeId);
    }
    for (let i = 1; i < nodeIds.length; i++) {
      const segmentId = generateId('s') as WireSegmentId;
      this.circuit.addWireSegment({
        id: segmentId,
        from: nodeIds[i - 1],
        to: nodeIds[i],
      });
      this.segmentNames.set(segmentId, `seg#${this.segmentCount++}`);
    }
  }

  done(ticks: Record<string, number>[], fullState = true): FixtureInstance {
    return {
      circuit: this.circuit,
      ticks,
      gateLabels: this.gateLabels,
      nodeNames: this.nodeNames,
      segmentNames: this.segmentNames,
      fullState,
    };
  }
}

const ip = (gateId: GateId, index = 0): PinRef => ({ gateId, kind: 'input', index });
const op = (gateId: GateId, index = 0): PinRef => ({ gateId, kind: 'output', index });

// ---------------------------------------------------------------------------
// Test vectors
// ---------------------------------------------------------------------------

const MAX_VECTORS = 24;

function sampleValues(bitWidth: number): number[] {
  if (bitWidth === 1) return [0, 1];
  if (bitWidth <= 8) return [0, 1, 127, 128, 255];
  return [0, 1, 32768, 65535];
}

/** Cartesian product, then a deterministic stride down to MAX_VECTORS. */
function buildVectors(bitWidths: number[]): number[][] {
  let vectors: number[][] = [[]];
  for (const bw of bitWidths) {
    const next: number[][] = [];
    for (const prefix of vectors) {
      for (const value of sampleValues(bw)) next.push([...prefix, value]);
    }
    vectors = next;
  }
  if (vectors.length <= MAX_VECTORS) return vectors;
  const stride = Math.ceil(vectors.length / MAX_VECTORS);
  return vectors.filter((_, i) => i % stride === 0).slice(0, MAX_VECTORS);
}

function inputTypeFor(bitWidth: number): GateType {
  if (bitWidth === 1) return 'input';
  if (bitWidth <= 8) return 'input-8bit';
  return 'input-16bit';
}

function outputTypeFor(bitWidth: number): GateType {
  if (bitWidth === 1) return 'output';
  if (bitWidth <= 8) return 'output-8bit';
  return 'output-16bit';
}

/**
 * Wrap one gate type in matched input/output gates and sweep its input space.
 * Input gate bit widths mirror the pin widths so no width-mismatch contention fires.
 */
function combinationalFixture(type: GateType): Fixture {
  return {
    name: `comb/${type}`,
    create() {
      const b = new Builder();
      const { inputs, outputs } = getPinCounts(type);
      const inputWidths: number[] = [];
      const under = b.gate(type, 'dut');

      for (let i = 0; i < inputs; i++) {
        const bw = getPinBitWidth(type, 'input', i);
        inputWidths.push(bw);
        const src = b.gate(inputTypeFor(bw), `in${i}`);
        b.net(op(src), ip(under, i));
      }
      for (let i = 0; i < outputs; i++) {
        const bw = getPinBitWidth(type, 'output', i);
        const sink = b.gate(outputTypeFor(bw), `out${i}`);
        b.net(op(under, i), ip(sink));
      }

      const ticks = buildVectors(inputWidths).map(vector => {
        const driven: Record<string, number> = {};
        vector.forEach((value, i) => { driven[`in${i}`] = value; });
        return driven;
      });
      return b.done(ticks);
    },
  };
}

const COMBINATIONAL_TYPES: GateType[] = [
  'nand', 'and', 'or', 'nor', 'xor', 'xnor', 'not',
  '8bit-or', '8bit-nor', '8bit-not',
  '3bit-or', '3bit-and',
  '2bit-adder', '3bit-adder',
  '1bit-decoder', '3bit-decoder',
  '8bit-adder', '8bit-negative', '8bit-subtractor',
  'mux', '8bit-mux',
  'tristate', '8bit-tristate',
  'splitter', 'joiner',
];

// ---------------------------------------------------------------------------
// Hand-built edge cases
// ---------------------------------------------------------------------------

/**
 * Tri-state with its enable pin left unwired. Discriminates "undriven enable means
 * disabled" (consistent with mux select and input-gate enable) from the old raw
 * `enable !== 0` test, under which an undriven enable passed the input straight through
 * and silently drove the bus.
 */
const tristateUnwiredEnable: Fixture = {
  name: 'tristate-unwired-enable',
  create() {
    const b = new Builder();
    const value = b.gate('input', 'value');
    const tri = b.gate('tristate', 'tri');
    const sink = b.gate('output', 'sink');
    b.net(op(value), ip(tri, 0));
    // ip(tri, 1) — the enable — deliberately left unconnected
    b.net(op(tri), ip(sink));
    return b.done([{ value: 1 }, { value: 0 }]);
  },
};

/** Two tri-state buffers on one net: none / one / both enabled. */
const tristateContention: Fixture = {
  name: 'tristate-contention',
  create() {
    const b = new Builder();
    const aVal = b.gate('input', 'aVal');
    const aEn = b.gate('input', 'aEn');
    const bVal = b.gate('input', 'bVal');
    const bEn = b.gate('input', 'bEn');
    const triA = b.gate('tristate', 'triA');
    const triB = b.gate('tristate', 'triB');
    const sink = b.gate('output', 'bus');

    b.net(op(aVal), ip(triA, 0));
    b.net(op(aEn), ip(triA, 1));
    b.net(op(bVal), ip(triB, 0));
    b.net(op(bEn), ip(triB, 1));
    // Shared bus: both drivers plus the sink on one net
    b.net(op(triA), op(triB), ip(sink));

    const ticks: Record<string, number>[] = [];
    for (const aEnable of [0, 1]) {
      for (const bEnable of [0, 1]) {
        ticks.push({ aVal: 1, aEn: aEnable, bVal: 0, bEn: bEnable });
      }
    }
    return b.done(ticks);
  },
};

/** 1-bit and 8-bit pins on the same net -> width mismatch -> contention. */
const widthMismatch: Fixture = {
  name: 'width-mismatch',
  create() {
    const b = new Builder();
    const src = b.gate('input', 'src');
    const narrow = b.gate('output', 'narrow');
    const wide = b.gate('output-8bit', 'wide');
    b.net(op(src), ip(narrow), ip(wide));
    return b.done([{ src: 0 }, { src: 1 }]);
  },
};

/**
 * Same mismatch as above but with the 8-bit pin wired FIRST. Discriminates "widest pin
 * wins" from the old "last pin in node order wins": under last-wins this net reports
 * width 1, under widest it reports 8. Guards against the rendered width depending on
 * the order the player drew the wires.
 */
const widthMismatchReversed: Fixture = {
  name: 'width-mismatch-reversed',
  create() {
    const b = new Builder();
    const src = b.gate('input-8bit', 'src');
    const wide = b.gate('output-8bit', 'wide');
    const narrow = b.gate('output', 'narrow');
    b.net(op(src), ip(wide), ip(narrow));
    return b.done([{ src: 200 }]);
  },
};

/** Two always-on drivers on one net -> permanent contention. */
const multiDriver: Fixture = {
  name: 'multi-driver',
  create() {
    const b = new Builder();
    const a = b.gate('input', 'a');
    const c = b.gate('input', 'c');
    const sink = b.gate('output', 'sink');
    b.net(op(a), op(c), ip(sink));
    return b.done([{ a: 0, c: 0 }, { a: 0, c: 1 }, { a: 1, c: 1 }]);
  },
};

/** Unwired gate inputs must read as 0, not high-Z. */
const unconnectedInputs: Fixture = {
  name: 'unconnected-inputs',
  create() {
    const b = new Builder();
    const dut = b.gate('nand', 'dut');
    const sink = b.gate('output', 'sink');
    b.net(op(dut), ip(sink));
    return b.done([{}]);
  },
};

/** Odd inverter ring: no delay breaks the loop -> short circuit. */
const feedbackRing: Fixture = {
  name: 'feedback-ring',
  create() {
    const b = new Builder();
    const n0 = b.gate('not', 'n0');
    const n1 = b.gate('not', 'n1');
    const n2 = b.gate('not', 'n2');
    const probe = b.gate('output', 'probe');
    b.net(op(n0), ip(n1));
    b.net(op(n1), ip(n2));
    b.net(op(n2), ip(n0), ip(probe));
    return b.done([{}, {}]);
  },
};

const selfLoop: Fixture = {
  name: 'self-loop',
  create() {
    const b = new Builder();
    const inv = b.gate('not', 'inv');
    const probe = b.gate('output', 'probe');
    b.net(op(inv), ip(inv), ip(probe));
    return b.done([{}, {}]);
  },
};

/**
 * The one case where a once-per-net resolve schedule could diverge from the old
 * resolve-everything-after-every-gate loop: a net driven both by a gate stranded
 * inside a feedback ring and by a live tri-state buffer.
 */
const cyclePlusTristate: Fixture = {
  name: 'cycle-plus-tristate',
  create() {
    const b = new Builder();
    const ringA = b.gate('not', 'ringA');
    const ringB = b.gate('not', 'ringB');
    const value = b.gate('input', 'value');
    const enable = b.gate('input', 'enable');
    const tri = b.gate('tristate', 'tri');
    const sink = b.gate('output', 'sink');

    // Two-inverter ring — both gates are dropped from the evaluation order
    b.net(op(ringA), ip(ringB));
    b.net(op(value), ip(tri, 0));
    b.net(op(enable), ip(tri, 1));
    // Shared net: ringB (stranded in the cycle) + tri (live) + ringA's input + sink
    b.net(op(ringB), op(tri), ip(ringA), ip(sink));

    return b.done([
      { value: 1, enable: 0 },
      { value: 1, enable: 1 },
      { value: 0, enable: 1 },
    ]);
  },
};

const delayChain: Fixture = {
  name: 'delay-chain',
  create() {
    const b = new Builder();
    const src = b.gate('input', 'src');
    const d0 = b.gate('delay', 'd0');
    const d1 = b.gate('delay', 'd1');
    const d2 = b.gate('delay', 'd2');
    const sink = b.gate('output', 'sink');
    b.net(op(src), ip(d0));
    b.net(op(d0), ip(d1));
    b.net(op(d1), ip(d2));
    b.net(op(d2), ip(sink));

    const pattern = [1, 0, 0, 1, 1, 1, 0, 1, 0, 0, 1, 0];
    return b.done(pattern.map(v => ({ src: v })));
  },
};

const rsLatchSeq: Fixture = {
  name: 'rs-latch-seq',
  create() {
    const b = new Builder();
    const s = b.gate('input', 's');
    const r = b.gate('input', 'r');
    const latch = b.gate('rs-latch', 'latch');
    const q = b.gate('output', 'q');
    b.net(op(s), ip(latch, 0));
    b.net(op(r), ip(latch, 1));
    b.net(op(latch), ip(q));

    const pattern: [number, number][] = [
      [0, 0], [1, 0], [0, 0], [0, 1], [0, 0], [1, 1],
      [0, 0], [1, 0], [1, 1], [0, 1], [0, 0], [1, 0],
    ];
    return b.done(pattern.map(([sv, rv]) => ({ s: sv, r: rv })));
  },
};

function memoryFixture(name: string, type: GateType, values: number[]): Fixture {
  const bw = getPinBitWidth(type, 'input', 0);
  return {
    name,
    create() {
      const b = new Builder();
      const value = b.gate(inputTypeFor(bw), 'value');
      const write = b.gate('input', 'write');
      const mem = b.gate(type, 'mem');
      const sink = b.gate(outputTypeFor(bw), 'sink');
      b.net(op(value), ip(mem, 0));
      b.net(op(write), ip(mem, 1));
      b.net(op(mem), ip(sink));

      const ticks: Record<string, number>[] = [];
      values.forEach((v, i) => {
        ticks.push({ value: v, write: 1 });
        ticks.push({ value: (v + 1) & (bw === 1 ? 1 : 0xFF), write: 0 });
        if (i % 2 === 0) ticks.push({ value: v, write: 0 });
      });
      return b.done(ticks);
    },
  };
}

const counterSeq: Fixture = {
  name: 'counter-seq',
  create() {
    const b = new Builder();
    const ctr = b.gate('8bit-counter', 'ctr');
    const sink = b.gate('output-8bit', 'sink');
    b.net(op(ctr), ip(sink));
    return b.done(Array.from({ length: 12 }, () => ({})));
  },
};

const counterResetSeq: Fixture = {
  name: 'counter-reset-seq',
  create() {
    const b = new Builder();
    const value = b.gate('input-8bit', 'value');
    const override = b.gate('input', 'override');
    const ctr = b.gate('8bit-counter-reset', 'ctr');
    const sink = b.gate('output-8bit', 'sink');
    b.net(op(value), ip(ctr, 0));
    b.net(op(override), ip(ctr, 1));
    b.net(op(ctr), ip(sink));

    const pattern: [number, number][] = [
      [7, 1], [0, 0], [0, 0], [200, 1], [0, 0], [0, 0],
      [255, 1], [0, 0], [0, 0], [0, 1], [0, 0], [0, 0],
    ];
    return b.done(pattern.map(([v, o]) => ({ value: v, override: o })));
  },
};

/** Switch-style IO: enable pins gate the value through. */
const switchIo: Fixture = {
  name: 'switch-io',
  create() {
    const b = new Builder();
    const inEn = b.gate('input', 'inEn');
    const outEn = b.gate('input', 'outEn');
    const sw = b.gate('input-sw', 'sw');
    const inv = b.gate('not', 'inv');
    const swOut = b.gate('output-sw', 'swOut');

    b.net(op(inEn), ip(sw, 0));
    b.net(op(sw), ip(inv));
    b.net(op(inv), ip(swOut, 0));
    b.net(op(outEn), ip(swOut, 1));

    const ticks: Record<string, number>[] = [];
    for (const i of [0, 1]) {
      for (const o of [0, 1]) {
        ticks.push({ inEn: i, outEn: o, sw: 1 });
      }
    }
    return b.done(ticks);
  },
};

const constantsAndLevel: Fixture = {
  name: 'constants-and-level',
  create() {
    const b = new Builder();
    const c1 = b.gate('constant', 'c1', 1);
    const c8 = b.gate('constant-8bit', 'c8', 200);
    const c16 = b.gate('constant-16bit', 'c16', 40000);
    const lvl = b.gate('level', 'lvl');
    const s1 = b.gate('output', 's1');
    const s8 = b.gate('output-8bit', 's8');
    const s16 = b.gate('output-16bit', 's16');
    const sl = b.gate('output', 'sl');

    b.net(op(c1), ip(s1));
    b.net(op(c8), ip(s8));
    b.net(op(c16), ip(s16));
    b.net(op(lvl), ip(sl));

    return b.done([{ lvl: 0 }, { lvl: 1 }]);
  },
};

// ---------------------------------------------------------------------------
// Nested components
// ---------------------------------------------------------------------------

/**
 * Two-level component hierarchy with a register at the bottom:
 *   outer(cmp-outer) -> inner(cmp-inner) -> 1bit-memory
 * Registered into componentRegistry so tickCircuit's evaluateComponent finds them.
 */
const nestedComponent: Fixture = {
  name: 'nested-component',
  create() {
    // Inner: value + write -> 1bit-memory -> q
    const inner = new Builder();
    const iv = inner.gate('input', 'V');
    const iw = inner.gate('input', 'W');
    const mem = inner.gate('1bit-memory', 'mem');
    const iq = inner.gate('output', 'Q');
    inner.net(op(iv), ip(mem, 0));
    inner.net(op(iw), ip(mem, 1));
    inner.net(op(mem), ip(iq));
    const innerDef = buildComponentDefinition(
      inner.circuit, 'inner', 'cmp-inner' as ComponentId,
    );
    saveComponent(innerDef);

    // Outer: wraps inner and inverts its output
    const outer = new Builder();
    const ov = outer.gate('input', 'V');
    const ow = outer.gate('input', 'W');
    const innerInstance = outer.gate('cmp-inner' as ComponentId, 'innerInstance');
    const inv = outer.gate('not', 'inv');
    const oq = outer.gate('output', 'Q');
    outer.net(op(ov), ip(innerInstance, 0));
    outer.net(op(ow), ip(innerInstance, 1));
    outer.net(op(innerInstance), ip(inv));
    outer.net(op(inv), ip(oq));
    const outerDef = buildComponentDefinition(
      outer.circuit, 'outer', 'cmp-outer' as ComponentId,
    );
    saveComponent(outerDef);

    // Top level: drive the outer component
    const b = new Builder();
    const value = b.gate('input', 'value');
    const write = b.gate('input', 'write');
    const instance = b.gate('cmp-outer' as ComponentId, 'instance');
    const sink = b.gate('output', 'sink');
    b.net(op(value), ip(instance, 0));
    b.net(op(write), ip(instance, 1));
    b.net(op(instance), ip(sink));

    const pattern: [number, number][] = [
      [1, 1], [0, 0], [0, 0], [0, 1], [1, 0], [1, 1], [0, 0], [1, 0],
    ];
    return b.done(pattern.map(([v, w]) => ({ value: v, write: w })));
  },
};

// ---------------------------------------------------------------------------
// Bench fixture: 64-bit ripple-carry adder built from NAND gates
// ---------------------------------------------------------------------------

const ADDER_BITS = 64;

/** 9-NAND full adder. Returns the sum and carry-out pin refs. */
function nandFullAdder(
  b: Builder,
  tag: string,
  a: PinRef,
  bIn: PinRef,
  carryIn: PinRef,
): { sum: PinRef; carryOut: PinRef } {
  const n1 = b.gate('nand', `${tag}.n1`);
  const n2 = b.gate('nand', `${tag}.n2`);
  const n3 = b.gate('nand', `${tag}.n3`);
  const n4 = b.gate('nand', `${tag}.n4`);
  const n5 = b.gate('nand', `${tag}.n5`);
  const n6 = b.gate('nand', `${tag}.n6`);
  const n7 = b.gate('nand', `${tag}.n7`);
  const n8 = b.gate('nand', `${tag}.n8`);
  const n9 = b.gate('nand', `${tag}.n9`);

  // n1 = NAND(a, b); n4 = a XOR b
  b.net(a, ip(n1, 0), ip(n2, 0));
  b.net(bIn, ip(n1, 1), ip(n3, 0));
  b.net(op(n1), ip(n2, 1), ip(n3, 1), ip(n9, 0));
  b.net(op(n2), ip(n4, 0));
  b.net(op(n3), ip(n4, 1));
  // n5 = NAND(n4, cin); sum = n4 XOR cin
  b.net(op(n4), ip(n5, 0), ip(n6, 0));
  b.net(carryIn, ip(n5, 1), ip(n7, 0));
  b.net(op(n5), ip(n6, 1), ip(n7, 1), ip(n9, 1));
  b.net(op(n6), ip(n8, 0));
  b.net(op(n7), ip(n8, 1));

  return { sum: op(n8), carryOut: op(n9) };
}

/**
 * 64-bit ripple adder: 8 byte-wide inputs per operand fanned out through splitters,
 * 576 NANDs, and a 128-level-deep carry chain. Doubles as the bench circuit.
 */
const wideAdder: Fixture = {
  name: 'wide-adder',
  create() {
    const b = new Builder();
    const aBits: PinRef[] = [];
    const bBits: PinRef[] = [];

    for (let byte = 0; byte < ADDER_BITS / 8; byte++) {
      for (const [operand, bits] of [['a', aBits], ['b', bBits]] as const) {
        const src = b.gate('input-8bit', `${operand}${byte}`);
        const split = b.gate('splitter', `${operand}${byte}.split`);
        b.net(op(src), ip(split));
        for (let bit = 0; bit < 8; bit++) bits.push(op(split, bit));
      }
    }

    const zero = b.gate('constant', 'zero', 0);
    let carry: PinRef = op(zero);
    const sumBits: PinRef[] = [];
    for (let i = 0; i < ADDER_BITS; i++) {
      const { sum, carryOut } = nandFullAdder(b, `fa${i}`, aBits[i], bBits[i], carry);
      sumBits.push(sum);
      carry = carryOut;
    }

    // Rejoin the sum into bytes so the snapshot has compact, checkable outputs
    for (let byte = 0; byte < ADDER_BITS / 8; byte++) {
      const joiner = b.gate('joiner', `sum${byte}.join`);
      const sink = b.gate('output-8bit', `sum${byte}`);
      for (let bit = 0; bit < 8; bit++) {
        b.net(sumBits[byte * 8 + bit], ip(joiner, bit));
      }
      b.net(op(joiner), ip(sink));
    }
    const carrySink = b.gate('output', 'carryOut');
    b.net(carry, ip(carrySink));

    const ticks: Record<string, number>[] = [];
    for (const [aFill, bFill] of [[0, 0], [255, 1], [170, 85], [255, 255]]) {
      const driven: Record<string, number> = {};
      for (let byte = 0; byte < ADDER_BITS / 8; byte++) {
        driven[`a${byte}`] = aFill;
        driven[`b${byte}`] = bFill;
      }
      ticks.push(driven);
    }
    // fullState=false: ~700 gates x 4 ticks of per-pin data would dwarf the snapshot
    return b.done(ticks, false);
  },
};

// ---------------------------------------------------------------------------

export const FIXTURES: Fixture[] = [
  ...COMBINATIONAL_TYPES.map(combinationalFixture),
  tristateContention,
  tristateUnwiredEnable,
  widthMismatch,
  widthMismatchReversed,
  multiDriver,
  unconnectedInputs,
  feedbackRing,
  selfLoop,
  cyclePlusTristate,
  delayChain,
  rsLatchSeq,
  memoryFixture('mem1-seq', '1bit-memory', [1, 0, 1, 1, 0]),
  memoryFixture('mem8-seq', '8bit-memory', [0, 42, 255, 128, 7]),
  counterSeq,
  counterResetSeq,
  switchIo,
  constantsAndLevel,
  nestedComponent,
  wideAdder,
];

export const BENCH_FIXTURE = wideAdder;
