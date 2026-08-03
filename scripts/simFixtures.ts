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
  '8bit-and', '8bit-or', '8bit-nor', '8bit-not',
  '8bit-shr', '8bit-shl',
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

/**
 * Both shifters over every interesting shift amount. The generic sweep only samples
 * amounts 0/1/127/128/255, which misses the whole 2..7 range and, more importantly,
 * 32 — where a naive `a >>> amount` returns `a` because JS takes the amount mod 32.
 */
const shiftAmounts: Fixture = {
  name: 'shift-amounts',
  create() {
    const b = new Builder();
    const value = b.gate('input-8bit', 'value');
    const amount = b.gate('input-8bit', 'amount');
    const shr = b.gate('8bit-shr', 'shr');
    const shl = b.gate('8bit-shl', 'shl');
    const shrOut = b.gate('output-8bit', 'shrOut');
    const shlOut = b.gate('output-8bit', 'shlOut');

    b.net(op(value), ip(shr, 0), ip(shl, 0));
    b.net(op(amount), ip(shr, 1), ip(shl, 1));
    b.net(op(shr), ip(shrOut));
    b.net(op(shl), ip(shlOut));

    const ticks: Record<string, number>[] = [];
    for (const a of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 31, 32, 33, 64, 255]) {
      ticks.push({ value: 0b10110011, amount: a });
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
  // Input 0 is the 1-bit set flag; the data pin that decides the bus width is input 1.
  const bw = getPinBitWidth(type, 'input', 1);
  return {
    name,
    create() {
      const b = new Builder();
      const value = b.gate(inputTypeFor(bw), 'value');
      const write = b.gate('input', 'write');
      const mem = b.gate(type, 'mem');
      const sink = b.gate(outputTypeFor(bw), 'sink');
      b.net(op(write), ip(mem, 0));
      b.net(op(value), ip(mem, 1));
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

/**
 * RAM read path. Unlike the register fixtures this one varies the address, which is the
 * whole point: RAM is evaluated in the combinational order so Q must track A within a tick,
 * while the write still lands after propagation.
 */
const ramSeq: Fixture = {
  name: 'ram-seq',
  create() {
    const b = new Builder();
    const addr = b.gate('input-8bit', 'addr');
    const value = b.gate('input-8bit', 'value');
    const read = b.gate('input', 'read');
    const write = b.gate('input', 'write');
    const ram = b.gate('ram', 'ram');
    const sink = b.gate('output-8bit', 'sink');
    b.net(op(read), ip(ram, 0));
    b.net(op(write), ip(ram, 1));
    b.net(op(addr), ip(ram, 2));
    b.net(op(value), ip(ram, 3));
    b.net(op(ram), ip(sink));

    return b.done([
      { addr: 3, value: 42, read: 0, write: 1 },    // write 42 -> 3, output undriven
      { addr: 3, value: 0, read: 1, write: 0 },     // reads 42
      { addr: 5, value: 99, read: 1, write: 1 },    // same-tick read+write reads the old 0
      { addr: 5, value: 0, read: 1, write: 0 },     // now 99
      { addr: 3, value: 0, read: 1, write: 0 },     // address 3 untouched
      { addr: 3, value: 0, read: 0, write: 0 },     // read low -> high-Z
      { addr: 200, value: 255, read: 0, write: 1 }, // beyond the level's 8 cells
      { addr: 200, value: 0, read: 1, write: 0 },   // reads 255
      { addr: 255, value: 7, read: 0, write: 1 },   // top of the address range
      { addr: 255, value: 0, read: 1, write: 0 },   // reads 7
      { addr: 1, value: 0, read: 1, write: 0 },     // never written -> 0
      { addr: 5, value: 0, read: 1, write: 0 },     // earlier writes survived
    ]);
  },
};

/** Two RAMs sharing an output bus — the arrangement the RAM level has the player build. */
const ramSharedBus: Fixture = {
  name: 'ram-shared-bus',
  create() {
    const b = new Builder();
    const addr = b.gate('input-8bit', 'addr');
    const value = b.gate('input-8bit', 'value');
    const readA = b.gate('input', 'readA');
    const readB = b.gate('input', 'readB');
    const writeA = b.gate('input', 'writeA');
    const writeB = b.gate('input', 'writeB');
    const ramA = b.gate('ram', 'ramA');
    const ramB = b.gate('ram', 'ramB');
    const sink = b.gate('output-8bit', 'sink');
    b.net(op(readA), ip(ramA, 0));
    b.net(op(readB), ip(ramB, 0));
    b.net(op(writeA), ip(ramA, 1));
    b.net(op(writeB), ip(ramB, 1));
    b.net(op(addr), ip(ramA, 2), ip(ramB, 2));
    b.net(op(value), ip(ramA, 3), ip(ramB, 3));
    b.net(op(ramA), op(ramB), ip(sink));

    return b.done([
      { addr: 2, value: 11, readA: 0, readB: 0, writeA: 1, writeB: 0 },
      { addr: 2, value: 22, readA: 0, readB: 0, writeA: 0, writeB: 1 },
      { addr: 2, value: 0, readA: 1, readB: 0, writeA: 0, writeB: 0 },  // 11
      { addr: 2, value: 0, readA: 0, readB: 1, writeA: 0, writeB: 0 },  // 22
      { addr: 2, value: 0, readA: 1, readB: 1, writeA: 0, writeB: 0 },  // contention
      { addr: 2, value: 0, readA: 0, readB: 0, writeA: 0, writeB: 0 },  // nobody drives
    ]);
  },
};

/**
 * RAM output wired back into its own V input, both directly and through a NOT.
 *
 * V is a registered input — it is read after propagation — so neither loop is a short
 * circuit, and errorSegmentIds must stay empty. The direct wire exercises the self-loop
 * path in buildCombinationalGraph, the NOT the SCC path in detectCycles.
 *
 * `hold` copies a cell onto itself, so its byte must survive. `flip` writes back the
 * complement, so its byte toggles between 0 and 255 on every writing tick.
 */
const ramSelfFeedback: Fixture = {
  name: 'ram-self-feedback',
  create() {
    const b = new Builder();
    const addr = b.gate('input-8bit', 'addr');
    const write = b.gate('input', 'write');
    const readHold = b.gate('input', 'readHold');
    const seedEnable = b.gate('input', 'seedEnable');
    const seed = b.gate('input-8bit-sw', 'seed');
    const hold = b.gate('ram', 'hold');
    const flip = b.gate('ram', 'flip');
    const not = b.gate('8bit-not', 'not');
    const one = b.gate('constant', 'one', 1);
    const holdSink = b.gate('output-8bit', 'holdSink');
    const flipSink = b.gate('output-8bit', 'flipSink');

    b.net(op(write), ip(hold, 1), ip(flip, 1));
    b.net(op(addr), ip(hold, 2), ip(flip, 2));

    // `hold` shares one bus between its Q, its V and the switched `seed` input, so the two
    // take turns driving it: R low parks Q in high-Z while seed loads the cell.
    b.net(op(seedEnable), ip(seed, 0));
    b.net(op(readHold), ip(hold, 0));
    b.net(op(hold), ip(hold, 3), ip(holdSink), op(seed));

    b.net(op(one), ip(flip, 0));
    b.net(op(flip), ip(not), ip(flipSink));
    b.net(op(not), ip(flip, 3));

    return b.done([
      // hold: seed drives V, writes 77. flip: reads 0, writes back 255.
      { addr: 4, write: 1, seed: 77, seedEnable: 1, readHold: 0 },
      // From here hold sees only its own Q: 77 rewrites itself while flip toggles.
      { addr: 4, write: 1, seed: 0, seedEnable: 0, readHold: 1 },
      { addr: 4, write: 1, seed: 0, seedEnable: 0, readHold: 1 },
      { addr: 4, write: 0, seed: 0, seedEnable: 0, readHold: 1 },  // read-only tick
      { addr: 4, write: 1, seed: 0, seedEnable: 0, readHold: 1 },
      { addr: 9, write: 1, seed: 0, seedEnable: 0, readHold: 1 },  // a never-seeded cell
    ]);
  },
};

/** Left free-running: with O unwired the counter must still increment every tick. */
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

const counterSetSeq: Fixture = {
  name: 'counter-set-seq',
  create() {
    const b = new Builder();
    const value = b.gate('input-8bit', 'value');
    const override = b.gate('input', 'override');
    const ctr = b.gate('8bit-counter', 'ctr');
    const sink = b.gate('output-8bit', 'sink');
    b.net(op(override), ip(ctr, 0));
    b.net(op(value), ip(ctr, 1));
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
    inner.net(op(iw), ip(mem, 0));
    inner.net(op(iv), ip(mem, 1));
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

/**
 * A player-built register wired back into itself, the component equivalent of the RAM
 * Q -> V case.
 *
 * `reg8`'s V and W reach Q only through an 8bit-memory, so both are registered inputs: the
 * feedback is a one-tick loop, not a short circuit, and the component must latch in
 * LatchOp.COMPONENT rather than during propagation. `count` closes the loop through an adder,
 * which is the part that catches a stale read: incrementing needs the value the adder
 * produced *this* tick, so a counter that ticks 0,1,2,3 can only come from the deferred
 * latch seeing the resolved wire.
 *
 * `mix` additionally has a plain combinational input, so its N output must track P within
 * the tick while its Q side still runs a tick behind.
 */
const componentSelfFeedback: Fixture = {
  name: 'component-self-feedback',
  create() {
    // reg8: V + W -> 8bit-memory -> Q. Both inputs registered.
    const reg = new Builder();
    const rv = reg.gate('input-8bit', 'V');
    const rw = reg.gate('input', 'W');
    const mem = reg.gate('8bit-memory', 'mem');
    const rq = reg.gate('output-8bit', 'Q');
    reg.net(op(rw), ip(mem, 0));
    reg.net(op(rv), ip(mem, 1));
    reg.net(op(mem), ip(rq));
    saveComponent(buildComponentDefinition(reg.circuit, 'reg8', 'cmp-reg8' as ComponentId));

    // mix: the same register plus a combinational P -> N passthrough.
    const mixed = new Builder();
    const mv = mixed.gate('input-8bit', 'V');
    const mw = mixed.gate('input', 'W');
    const mp = mixed.gate('input', 'P');
    const mmem = mixed.gate('8bit-memory', 'mem');
    const minv = mixed.gate('not', 'inv');
    const mq = mixed.gate('output-8bit', 'Q');
    const mn = mixed.gate('output', 'N');
    mixed.net(op(mw), ip(mmem, 0));
    mixed.net(op(mv), ip(mmem, 1));
    mixed.net(op(mmem), ip(mq));
    mixed.net(op(mp), ip(minv));
    mixed.net(op(minv), ip(mn));
    saveComponent(buildComponentDefinition(mixed.circuit, 'mix', 'cmp-mix' as ComponentId));

    const b = new Builder();
    const write = b.gate('input', 'write');
    const p = b.gate('input', 'p');
    const one = b.gate('constant-8bit', 'one', 1);
    const count = b.gate('cmp-reg8' as ComponentId, 'count');
    const add = b.gate('8bit-adder', 'add');
    const hold = b.gate('cmp-reg8' as ComponentId, 'hold');
    const mixInstance = b.gate('cmp-mix' as ComponentId, 'mix');
    const countSink = b.gate('output-8bit', 'countSink');
    const holdSink = b.gate('output-8bit', 'holdSink');
    const mixQ = b.gate('output-8bit', 'mixQ');
    const mixN = b.gate('output', 'mixN');

    b.net(op(write), ip(count, 1), ip(hold, 1), ip(mixInstance, 1));

    // count: Q -> adder -> V. Two nodes in the loop, so this is the SCC path in
    // detectCycles; it increments only if the deferred latch sees this tick's sum.
    b.net(op(count), ip(add, 1), ip(countSink), ip(mixInstance, 0));
    b.net(op(one), ip(add, 2));
    b.net(op(add), ip(count, 0));

    // hold: Q straight back into V — the self-loop path. Nothing ever seeds it, so the
    // assertion is that it stays put at 0 instead of being called a short circuit.
    b.net(op(hold), ip(hold, 0), ip(holdSink));

    // mix: V comes off the counter bus above, P is purely combinational.
    b.net(op(p), ip(mixInstance, 2));
    b.net(op(mixInstance, 0), ip(mixQ));
    b.net(op(mixInstance, 1), ip(mixN));

    return b.done([
      { write: 1, p: 0 },
      { write: 1, p: 1 },
      { write: 1, p: 0 },
      { write: 0, p: 1 },  // holds: no register moves
      { write: 1, p: 1 },
      { write: 1, p: 0 },
    ]);
  },
};

/**
 * The discrimination itself: two components fed back the same way, only one of them a
 * short circuit. Guards the failure mode the derived analysis could introduce — calling an
 * input registered when it is not, which would silently swallow a real feedback loop.
 *
 * `combLoop` is a bare inverter, so its input reaches its output within the tick and the
 * loop is a genuine short circuit. `regLoop` reaches its output only through a register.
 * Both are built and fed back in one circuit, so the recorded shortCircuitGates naming
 * exactly one of them is the assertion.
 */
const componentFeedbackDiscrimination: Fixture = {
  name: 'component-feedback-discrimination',
  create() {
    // inv1: A -> not -> Y. No state anywhere, so A is not registered.
    const inv = new Builder();
    const ia = inv.gate('input', 'A');
    const inot = inv.gate('not', 'n');
    const iy = inv.gate('output', 'Y');
    inv.net(op(ia), ip(inot));
    inv.net(op(inot), ip(iy));
    saveComponent(buildComponentDefinition(inv.circuit, 'inv1', 'cmp-inv1' as ComponentId));

    // reg1: V + W -> 1bit-memory -> Q. Both inputs registered.
    const reg = new Builder();
    const rv = reg.gate('input', 'V');
    const rw = reg.gate('input', 'W');
    const rmem = reg.gate('1bit-memory', 'mem');
    const rq = reg.gate('output', 'Q');
    reg.net(op(rw), ip(rmem, 0));
    reg.net(op(rv), ip(rmem, 1));
    reg.net(op(rmem), ip(rq));
    saveComponent(buildComponentDefinition(reg.circuit, 'reg1', 'cmp-reg1' as ComponentId));

    const b = new Builder();
    const write = b.gate('input', 'write');
    const combLoop = b.gate('cmp-inv1' as ComponentId, 'combLoop');
    const regLoop = b.gate('cmp-reg1' as ComponentId, 'regLoop');
    const combSink = b.gate('output', 'combSink');
    const regSink = b.gate('output', 'regSink');

    b.net(op(combLoop), ip(combLoop), ip(combSink));
    b.net(op(regLoop), ip(regLoop, 0), ip(regSink));
    b.net(op(write), ip(regLoop, 1));

    return b.done([{ write: 1 }, { write: 1 }, { write: 0 }]);
  },
};

/**
 * The same feedback one level down: a component wrapping a component that holds the
 * register. The outer component declares nothing, so its pins can only be registered if the
 * reachability walk recurses into the inner one — this is what guards that recursion.
 *
 * Q is the inner register inverted and feeds straight back into V, so the stored bit has to
 * flip every tick that writes: 255, 0, 255, 0.
 */
const nestedComponentFeedback: Fixture = {
  name: 'nested-component-feedback',
  create() {
    const inner = new Builder();
    const iv = inner.gate('input-8bit', 'V');
    const iw = inner.gate('input', 'W');
    const imem = inner.gate('8bit-memory', 'mem');
    const iq = inner.gate('output-8bit', 'Q');
    inner.net(op(iw), ip(imem, 0));
    inner.net(op(iv), ip(imem, 1));
    inner.net(op(imem), ip(iq));
    saveComponent(buildComponentDefinition(inner.circuit, 'nreg', 'cmp-nreg' as ComponentId));

    // Outer: passes V and W through to the inner register, inverts Q on the way out.
    const outer = new Builder();
    const ov = outer.gate('input-8bit', 'V');
    const ow = outer.gate('input', 'W');
    const sub = outer.gate('cmp-nreg' as ComponentId, 'sub');
    const oinv = outer.gate('8bit-not', 'inv8');
    const oq = outer.gate('output-8bit', 'Q');
    outer.net(op(ov), ip(sub, 0));
    outer.net(op(ow), ip(sub, 1));
    outer.net(op(sub), ip(oinv));
    outer.net(op(oinv), ip(oq));
    saveComponent(buildComponentDefinition(outer.circuit, 'nregOuter', 'cmp-nreg-outer' as ComponentId));

    const b = new Builder();
    const write = b.gate('input', 'write');
    const nested = b.gate('cmp-nreg-outer' as ComponentId, 'nested');
    const sink = b.gate('output-8bit', 'sink');
    b.net(op(write), ip(nested, 1));
    b.net(op(nested), ip(nested, 0), ip(sink));

    return b.done([
      { write: 1 },
      { write: 1 },
      { write: 0 },  // holds mid-flip
      { write: 1 },
      { write: 1 },
    ]);
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
  shiftAmounts,
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
  ramSeq, ramSharedBus, ramSelfFeedback,
  counterSeq,
  counterSetSeq,
  switchIo,
  constantsAndLevel,
  nestedComponent, componentSelfFeedback, componentFeedbackDiscrimination, nestedComponentFeedback,
  wideAdder,
];

export const BENCH_FIXTURE = wideAdder;
