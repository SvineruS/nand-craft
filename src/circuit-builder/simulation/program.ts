import type { GateId, Net, NetId, WireNodeId } from '../editor/types.ts';
import { getGatePinMeta, getPinBitWidth } from '../editor/gates.ts';
import type { Circuit } from './circuit.ts';
import { type Gate, type GateType, isConstantGate, isInputGate, isOutputGate, isSequentialGate } from './gateTypes.ts';

// ---------------------------------------------------------------------------
// Opcodes
//
// Integer tags replacing the per-tick string switches. `erasableSyntaxOnly` rules
// out TS enums, so these are const objects.
// ---------------------------------------------------------------------------

/** Combinational evaluation opcode. Gate types with identical math share one op. */
export const Op = {
  NOP: 0,
  NAND: 1,
  AND: 2,
  OR: 3,          // 'or' and '8bit-or'
  NOR: 4,         // 'nor' and '8bit-nor'
  XOR: 5,
  XNOR: 6,
  NOT: 7,         // 'not' and '8bit-not'
  OR3: 8,
  AND3: 9,
  ADD2: 10,
  ADD3: 11,
  DEC1: 12,
  DEC3: 13,
  ADD8: 14,
  NEG8: 15,
  SUB8: 16,
  CONSTANT: 17,   // all constant widths
  MUX: 18,        // 'mux' and '8bit-mux'
  TRISTATE: 19,   // 'tristate' and '8bit-tristate'
  SPLITTER: 20,
  JOINER: 21,
  INPUT_ENABLE: 22,
  COMPONENT: 23,
  RAM: 24,        // read path only; the write lands in SeqOp.RAM
} as const;

/** How setSourceOutputs seeds a gate's output before propagation. */
export const SrcOp = {
  /** Driven from the caller's input map (input gates and 'level'). */
  DRIVEN: 1,
  /** gate.state as a user-set constant. */
  CONSTANT: 2,
  /** gate.state as registered sequential state. */
  SEQUENTIAL: 3,
} as const;

/** How advanceSequentialState updates a gate's state after propagation. */
export const SeqOp = {
  DELAY: 1,
  RS_LATCH: 2,
  MEMORY: 3,        // '1bit-memory' and '8bit-memory'
  COUNTER: 4,
  COUNTER_RESET: 5,
  /**
   * Unlike the others, a RAM gate is *also* evaluated combinationally (Op.RAM): its output
   * depends on the address wire, so it cannot be seeded as a source before propagation.
   * Only the write-back happens here. buildRoleLists keys this list off sequentialOpcodeFor
   * rather than isSequentialGate, which is what lets a gate be in both roles.
   */
  RAM: 6,
} as const;

function opcodeFor(type: GateType): number {
  switch (type) {
    case 'nand': return Op.NAND;
    case 'and': return Op.AND;
    case 'or': case '8bit-or': return Op.OR;
    case 'nor': case '8bit-nor': return Op.NOR;
    case 'xor': return Op.XOR;
    case 'xnor': return Op.XNOR;
    case 'not': case '8bit-not': return Op.NOT;
    case '3bit-or': return Op.OR3;
    case '3bit-and': return Op.AND3;
    case '2bit-adder': return Op.ADD2;
    case '3bit-adder': return Op.ADD3;
    case '1bit-decoder': return Op.DEC1;
    case '3bit-decoder': return Op.DEC3;
    case '8bit-adder': return Op.ADD8;
    case '8bit-negative': return Op.NEG8;
    case '8bit-subtractor': return Op.SUB8;
    case 'constant': case 'constant-8bit': case 'constant-16bit': return Op.CONSTANT;
    case 'mux': case '8bit-mux': return Op.MUX;
    case 'tristate': case '8bit-tristate': return Op.TRISTATE;
    case 'splitter': return Op.SPLITTER;
    case 'joiner': return Op.JOINER;
    case 'ram': return Op.RAM;
    default:
      // Input gates with an enable pin gate their output to high-Z when it is low.
      if (isInputGate(type)) return Op.INPUT_ENABLE;
      // Output gates only ever read; their old switch branch wrote nothing. They are
      // also never combinational (zero output pins), so this is unreachable anyway.
      if (isOutputGate(type)) return Op.NOP;
      return Op.COMPONENT;
  }
}

function sourceOpcodeFor(type: GateType): number {
  // Order mirrors setSourceOutputs: driven IO first, then constants, then sequential.
  if (isInputGate(type) || type === 'level') return SrcOp.DRIVEN;
  if (isConstantGate(type)) return SrcOp.CONSTANT;
  if (isSequentialGate(type)) return SrcOp.SEQUENTIAL;
  return 0;
}

function sequentialOpcodeFor(type: GateType): number {
  switch (type) {
    case 'delay': return SeqOp.DELAY;
    case 'rs-latch': return SeqOp.RS_LATCH;
    case '1bit-memory': case '8bit-memory': return SeqOp.MEMORY;
    case '8bit-counter': return SeqOp.COUNTER;
    case '8bit-counter-reset': return SeqOp.COUNTER_RESET;
    case 'ram': return SeqOp.RAM;
    default: return 0;
  }
}

/** Derived: anything not sequential, not a pure IO gate, and not 'level'. */
export function isCombinational(type: GateType): boolean {
  if (type === 'level') return false;
  if (isSequentialGate(type)) return false;
  // Plain IO gates are sources/sinks; switch variants have both inputs and outputs
  const meta = getGatePinMeta(type);
  if (isInputGate(type)) return meta.inputCount > 0;
  if (isOutputGate(type)) return meta.outputCount > 0;
  return true;
}

// ---------------------------------------------------------------------------
// Compiled program
// ---------------------------------------------------------------------------

/**
 * Integer-indexed form of the circuit topology, built once per topology change and
 * consumed by tick(). Everything here is keyed by dense indices so the tick loop
 * touches no strings, maps, or allocations.
 *
 * Net fan-in/fan-out lists use CSR layout: `xOffset[i]..xOffset[i+1]` bounds the
 * slice of `xSlots` belonging to net `i`.
 */
export interface CompiledProgram {
  // --- gates, indexed by gate index ---
  gates: Gate[];
  gateIndexById: Map<GateId, number>;
  inputBase: Int32Array;
  outputBase: Int32Array;
  inputCount: Int32Array;
  outputCount: Int32Array;

  // --- pin slots ---
  slotCount: number;
  /** Bit mask for each output slot's width. Unused for input slots. */
  slotMask: Int32Array;

  // --- nets ---
  netCount: number;
  netIds: NetId[];
  netDriverOffset: Int32Array;
  netDriverSlots: Int32Array;
  netReceiverOffset: Int32Array;
  netReceiverSlots: Int32Array;
  /** Width of the net's widest pin. Every pin agrees unless netWidthMismatch is set. */
  netBitWidth: Int32Array;
  /** 1 when the net's pins disagree on bit width — a topology-only error. */
  netWidthMismatch: Uint8Array;

  // --- evaluation schedule ---
  /** Topologically ordered gate indices. */
  order: Int32Array;
  /** Combinational opcode per gate index. */
  opcode: Uint8Array;
  /** Nets with no in-order combinational driver; resolved once before the loop. */
  initialNets: Int32Array;
  /** CSR over steps: nets whose last combinational driver is that step. */
  resolveAfterOffset: Int32Array;
  resolveAfterNets: Int32Array;
  /** Nets with a driver stranded in a cycle; resolved again in a final sweep. */
  unresolvedNets: Int32Array;

  // --- per-tick role lists (gate indices) ---
  sourceGates: Int32Array;
  sourceOpcode: Uint8Array;
  sequentialGates: Int32Array;
  sequentialOpcode: Uint8Array;
  outputGates: Int32Array;

  // --- renderer support ---
  nodeNet: Map<WireNodeId, number>;
  /** Segments touching a short-circuited gate. Topology-only, so precomputed. */
  shortCircuitSegmentIds: Set<string>;
}

export function compileProgram(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  evaluationOrder: GateId[],
  shortCircuitGates: GateId[],
): CompiledProgram {
  const slots = assignSlots(circuit);
  const netTables = buildNetTables(circuit, nets, slots);
  const schedule = buildSchedule(slots, netTables, evaluationOrder);
  const roles = buildRoleLists(slots);

  return {
    ...slots,
    ...netTables,
    ...schedule,
    ...roles,
    nodeNet: buildNodeNet(nets, netTables.netIds),
    shortCircuitSegmentIds: buildShortCircuitSegments(circuit, nets, shortCircuitGates),
  };
}

// ---------------------------------------------------------------------------
// Slot assignment
// ---------------------------------------------------------------------------

interface SlotTables {
  gates: Gate[];
  gateIndexById: Map<GateId, number>;
  inputBase: Int32Array;
  outputBase: Int32Array;
  inputCount: Int32Array;
  outputCount: Int32Array;
  slotCount: number;
  slotMask: Int32Array;
  opcode: Uint8Array;
}

/** Give every pin of every gate a dense integer slot. */
function assignSlots(circuit: Circuit): SlotTables {
  const gates = [...circuit.gates.values()];
  const gateCount = gates.length;

  const gateIndexById = new Map<GateId, number>();
  const inputBase = new Int32Array(gateCount);
  const outputBase = new Int32Array(gateCount);
  const inputCount = new Int32Array(gateCount);
  const outputCount = new Int32Array(gateCount);
  const opcode = new Uint8Array(gateCount);

  let slotCount = 0;
  for (let i = 0; i < gateCount; i++) {
    const gate = gates[i];
    const meta = getGatePinMeta(gate.type);
    gateIndexById.set(gate.id, i);
    inputBase[i] = slotCount;
    inputCount[i] = meta.inputCount;
    slotCount += meta.inputCount;
    outputBase[i] = slotCount;
    outputCount[i] = meta.outputCount;
    slotCount += meta.outputCount;
    opcode[i] = opcodeFor(gate.type);
  }

  const slotMask = new Int32Array(slotCount);
  for (let i = 0; i < gateCount; i++) {
    const meta = getGatePinMeta(gates[i].type);
    for (let p = 0; p < meta.outputCount; p++) {
      const bitWidth = meta.outputBitWidths[p];
      slotMask[outputBase[i] + p] = (((1 << bitWidth) >>> 0) - 1) | 0;
    }
  }

  return {
    gates, gateIndexById, inputBase, outputBase, inputCount, outputCount,
    slotCount, slotMask, opcode,
  };
}

// ---------------------------------------------------------------------------
// Net tables
// ---------------------------------------------------------------------------

interface NetTables {
  netCount: number;
  netIds: NetId[];
  netDriverOffset: Int32Array;
  netDriverSlots: Int32Array;
  netReceiverOffset: Int32Array;
  netReceiverSlots: Int32Array;
  netBitWidth: Int32Array;
  netWidthMismatch: Uint8Array;
}

function buildNetTables(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  slots: SlotTables,
): NetTables {
  const netIds = [...nets.keys()];
  const netCount = netIds.length;

  const netBitWidth = new Int32Array(netCount).fill(1);
  const netWidthMismatch = new Uint8Array(netCount);
  const drivers: number[][] = [];
  const receivers: number[][] = [];

  for (let netIndex = 0; netIndex < netCount; netIndex++) {
    const net = nets.get(netIds[netIndex])!;
    const netDrivers: number[] = [];
    const netReceivers: number[] = [];
    let firstBitWidth = -1;
    let mismatch = false;

    for (const nodeId of net.nodeIds) {
      const node = circuit.getWireNode(nodeId);
      if (!node.pin) continue;
      const { gateId, kind, index } = node.pin;
      const gate = circuit.getGate(gateId);

      // Width bookkeeping covers every pin, including stale out-of-range ones (which
      // report width 1), so mismatch detection matches the old per-tick check.
      const bitWidth = getPinBitWidth(gate.type, kind, index);
      if (firstBitWidth < 0) firstBitWidth = bitWidth;
      else if (bitWidth !== firstBitWidth) mismatch = true;
      // Widest pin wins. Every pin agrees on a well-formed net, so this only matters on
      // a mismatched (already flagged) net — where max keeps the rendered width
      // independent of the order the player happened to draw the wires in.
      if (bitWidth > netBitWidth[netIndex]) netBitWidth[netIndex] = bitWidth;

      // Slot lists skip out-of-range pins: they have no storage, and giving them one
      // would alias the next gate's slots. Their old phantom map key was never read.
      const gateIndex = slots.gateIndexById.get(gateId)!;
      const count = kind === 'output' ? slots.outputCount[gateIndex] : slots.inputCount[gateIndex];
      if (index >= count) continue;
      const base = kind === 'output' ? slots.outputBase[gateIndex] : slots.inputBase[gateIndex];

      if (kind === 'output') netDrivers.push(base + index);
      else netReceivers.push(base + index);
    }

    netWidthMismatch[netIndex] = mismatch ? 1 : 0;
    drivers.push(netDrivers);
    receivers.push(netReceivers);
  }

  const driverCsr = toCsr(drivers);
  const receiverCsr = toCsr(receivers);

  return {
    netCount,
    netIds,
    netDriverOffset: driverCsr.offset,
    netDriverSlots: driverCsr.values,
    netReceiverOffset: receiverCsr.offset,
    netReceiverSlots: receiverCsr.values,
    netBitWidth,
    netWidthMismatch,
  };
}

/** Flatten a ragged list into offset/values arrays. */
function toCsr(rows: number[][]): { offset: Int32Array; values: Int32Array } {
  const offset = new Int32Array(rows.length + 1);
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    offset[i] = total;
    total += rows[i].length;
  }
  offset[rows.length] = total;

  const values = new Int32Array(total);
  let cursor = 0;
  for (const row of rows) {
    for (const value of row) values[cursor++] = value;
  }
  return { offset, values };
}

// ---------------------------------------------------------------------------
// Resolve schedule
// ---------------------------------------------------------------------------

interface Schedule {
  order: Int32Array;
  initialNets: Int32Array;
  resolveAfterOffset: Int32Array;
  resolveAfterNets: Int32Array;
  unresolvedNets: Int32Array;
}

/**
 * Schedule each net to resolve exactly once, right after the last combinational gate
 * that drives it. Valid because `evaluationOrder` is a topological sort: every net
 * feeding a gate has all its combinational drivers scheduled earlier.
 *
 * Gates inside combinational cycles are absent from `evaluationOrder` (Kahn's algorithm
 * never reaches them), so nets they drive also get a final sweep — reproducing the old
 * loop's habit of re-resolving every net after every gate.
 */
function buildSchedule(
  slots: SlotTables,
  netTables: NetTables,
  evaluationOrder: GateId[],
): Schedule {
  const order = new Int32Array(evaluationOrder.length);
  const stepOfGate = new Int32Array(slots.gates.length).fill(-1);
  for (let step = 0; step < evaluationOrder.length; step++) {
    const gateIndex = slots.gateIndexById.get(evaluationOrder[step])!;
    order[step] = gateIndex;
    stepOfGate[gateIndex] = step;
  }

  // Output slot -> owning gate index, for walking a net back to its drivers
  const slotGate = new Int32Array(slots.slotCount).fill(-1);
  for (let i = 0; i < slots.gates.length; i++) {
    for (let p = 0; p < slots.outputCount[i]; p++) slotGate[slots.outputBase[i] + p] = i;
  }

  const initialNets: number[] = [];
  const unresolvedNets: number[] = [];
  const resolveAfter: number[][] = Array.from({ length: evaluationOrder.length }, () => []);

  for (let netIndex = 0; netIndex < netTables.netCount; netIndex++) {
    let lastStep = -1;
    let hasStrandedDriver = false;

    const from = netTables.netDriverOffset[netIndex];
    const to = netTables.netDriverOffset[netIndex + 1];
    for (let i = from; i < to; i++) {
      const gateIndex = slotGate[netTables.netDriverSlots[i]];
      if (gateIndex < 0) continue;
      const step = stepOfGate[gateIndex];
      if (step >= 0) {
        if (step > lastStep) lastStep = step;
      } else if (isCombinational(slots.gates[gateIndex].type)) {
        hasStrandedDriver = true;
      }
      // else: a source or sequential gate, seeded before the loop runs
    }

    if (lastStep >= 0) resolveAfter[lastStep].push(netIndex);
    else initialNets.push(netIndex);
    if (hasStrandedDriver) unresolvedNets.push(netIndex);
  }

  const resolveCsr = toCsr(resolveAfter);
  return {
    order,
    initialNets: Int32Array.from(initialNets),
    resolveAfterOffset: resolveCsr.offset,
    resolveAfterNets: resolveCsr.values,
    unresolvedNets: Int32Array.from(unresolvedNets),
  };
}

// ---------------------------------------------------------------------------
// Per-tick role lists
// ---------------------------------------------------------------------------

interface RoleLists {
  sourceGates: Int32Array;
  sourceOpcode: Uint8Array;
  sequentialGates: Int32Array;
  sequentialOpcode: Uint8Array;
  outputGates: Int32Array;
}

/** Replaces three full-gate scans per tick with three precomputed index lists. */
function buildRoleLists(slots: SlotTables): RoleLists {
  const sourceGates: number[] = [];
  const sourceOpcode: number[] = [];
  const sequentialGates: number[] = [];
  const sequentialOpcode: number[] = [];
  const outputGates: number[] = [];

  for (let i = 0; i < slots.gates.length; i++) {
    const type = slots.gates[i].type;

    const srcOp = sourceOpcodeFor(type);
    if (srcOp !== 0) {
      sourceGates.push(i);
      sourceOpcode.push(srcOp);
    }

    const seqOp = sequentialOpcodeFor(type);
    if (seqOp !== 0) {
      sequentialGates.push(i);
      sequentialOpcode.push(seqOp);
    }

    if (isOutputGate(type)) outputGates.push(i);
  }

  return {
    sourceGates: Int32Array.from(sourceGates),
    sourceOpcode: Uint8Array.from(sourceOpcode),
    sequentialGates: Int32Array.from(sequentialGates),
    sequentialOpcode: Uint8Array.from(sequentialOpcode),
    outputGates: Int32Array.from(outputGates),
  };
}

// ---------------------------------------------------------------------------
// Renderer support
// ---------------------------------------------------------------------------

/** Lets the renderer look up a wire node's net value without a per-tick node map. */
function buildNodeNet(nets: Map<NetId, Net>, netIds: NetId[]): Map<WireNodeId, number> {
  const nodeNet = new Map<WireNodeId, number>();
  for (let netIndex = 0; netIndex < netIds.length; netIndex++) {
    for (const nodeId of nets.get(netIds[netIndex])!.nodeIds) {
      nodeNet.set(nodeId, netIndex);
    }
  }
  return nodeNet;
}

function buildShortCircuitSegments(
  circuit: Circuit,
  nets: Map<NetId, Net>,
  shortCircuitGates: GateId[],
): Set<string> {
  const segments = new Set<string>();
  if (shortCircuitGates.length === 0) return segments;

  const errorGateIds = new Set<string>(shortCircuitGates.map(id => id as string));
  for (const net of nets.values()) {
    let touches = false;
    for (const nodeId of net.nodeIds) {
      const node = circuit.getWireNode(nodeId);
      if (node.pin && errorGateIds.has(node.pin.gateId as string)) {
        touches = true;
        break;
      }
    }
    if (touches) {
      for (const segmentId of net.segmentIds) segments.add(segmentId as string);
    }
  }
  return segments;
}
