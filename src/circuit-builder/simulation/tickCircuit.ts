import type { ComponentId, GateId } from "../editor/types.ts";
import { type BuildResult, HIGH_Z, type SimulationState, type TickResult } from "./types.ts";
import { Circuit } from "./circuit.ts";
import { isInputGate, isOutputGate, RAM_ADDRESS_MASK, RAM_SIZE } from "./gateTypes.ts";
import { type CompiledProgram, Op, SeqOp, SrcOp } from "./program.ts";
import { getComponent } from "../components/componentRegistry.ts";
import { deserializeCircuit } from "../persistence/serialize.ts";

/**
 * Execute one simulation tick:
 * 1. Set source gate outputs (inputs, constants, sequential)
 * 2. Propagate combinational logic
 * 3. Advance sequential gate state from new inputs
 * 4. Collect outputs
 */
export function tick(
  circuit: Circuit,
  buildResult: BuildResult,
  inputs: Map<GateId, number>,
): TickResult {
  const { program } = buildResult;
  const values = circuit.simState;

  setSourceOutputs(program, values, inputs);
  const contentionNets = propagate(circuit, program, {
    values,
    netValues: circuit.netValues,
    contentionNets: [],
    contentionSeen: circuit.contentionSeen,
  });
  advanceSequentialState(program, values);

  return {
    outputs: collectOutputs(program, values),
    contentionNets: contentionNets.map(netIndex => program.netIds[netIndex] as string),
    errorSegmentIds: buildErrorSegments(program, buildResult, contentionNets),
    netValues: circuit.netValues,
  };
}

// ---------------------------------------------------------------------------
// Slot access
//
// HIGH_Z is the undriven sentinel. Two distinct nullable readings exist and the
// difference is load-bearing, so they get separate helpers:
//  - readInput   treats undriven as 0 (most gates)
//  - isLow       treats undriven as false, matching how `!value` read when values
//                were `number | null` (mux select, input-gate enable)
// A raw `!== 0` comparison, as used by tri-state enable, deliberately lets an
// undriven pin count as enabled — preserved from the original switch.
// ---------------------------------------------------------------------------

function readInput(values: SimulationState, slot: number): number {
  const value = values[slot];
  return value === HIGH_Z ? 0 : value;
}

function isLow(value: number): boolean {
  return value === HIGH_Z || value === 0;
}

// ---------------------------------------------------------------------------
// Sources and sequential state
// ---------------------------------------------------------------------------

/** Seed outputValues for all source gates (inputs, constants, sequential). */
function setSourceOutputs(
  program: CompiledProgram,
  values: SimulationState,
  inputs: Map<GateId, number>,
): void {
  const { sourceGates, sourceOpcode, gates, outputBase, outputCount } = program;

  for (let i = 0; i < sourceGates.length; i++) {
    const gateIndex = sourceGates[i];
    if (outputCount[gateIndex] === 0) continue;
    const gate = gates[gateIndex];
    const slot = outputBase[gateIndex];

    switch (sourceOpcode[i]) {
      case SrcOp.DRIVEN: {
        // Undriven inputs keep their cleared value rather than falling back to 0
        const value = inputs.get(gate.id);
        if (value !== undefined) values[slot] = value;
        break;
      }
      case SrcOp.CONSTANT:
        values[slot] = gate.value ?? 0;
        break;
      case SrcOp.SEQUENTIAL:
        values[slot] = gate.register ?? 0;
        break;
    }
  }
}

/** Update sequential gate state from current input values (delivered by propagation). */
function advanceSequentialState(program: CompiledProgram, values: SimulationState): void {
  const { sequentialGates, sequentialOpcode, gates, inputBase } = program;

  for (let i = 0; i < sequentialGates.length; i++) {
    const gateIndex = sequentialGates[i];
    const gate = gates[gateIndex];
    const base = inputBase[gateIndex];

    switch (sequentialOpcode[i]) {
      case SeqOp.DELAY:
        gate.register = readInput(values, base);
        break;

      case SeqOp.RS_LATCH: {
        const set = readInput(values, base);
        const reset = readInput(values, base + 1);
        let q = gate.register ?? 0;
        if (set && !reset) q = 1;
        else if (reset && !set) q = 0;
        gate.register = q;
        break;
      }

      case SeqOp.MEMORY: {
        const write = readInput(values, base);
        const data = readInput(values, base + 1);
        if (write) gate.register = data;
        break;
      }

      case SeqOp.RAM: {
        if (!readInput(values, base + 1)) break;
        // Allocated on first write so an untouched RAM costs nothing. The address is masked
        // because it indexes an array, not just because the pin is 8 bits wide.
        const cells = gate.cells ??= new Array<number>(RAM_SIZE).fill(0);
        cells[readInput(values, base + 2) & RAM_ADDRESS_MASK] = readInput(values, base + 3) & 0xFF;
        break;
      }

      case SeqOp.COUNTER_SET: {
        // Pin order is O then V — the flag sits above the value on every stateful gate.
        const override = readInput(values, base);
        const value = readInput(values, base + 1);
        // O=1 → set to V, O=0 → increment by 1
        gate.register = override ? value : ((gate.register ?? 0) + 1) & 0xFF;
        break;
      }
    }
  }
}

function collectOutputs(
  program: CompiledProgram,
  values: SimulationState,
): Map<GateId, number | null> {
  const outputs = new Map<GateId, number | null>();
  const { outputGates, gates, inputBase, inputCount } = program;

  for (let i = 0; i < outputGates.length; i++) {
    const gateIndex = outputGates[i];
    if (inputCount[gateIndex] === 0) {
      outputs.set(gates[gateIndex].id, null);
      continue;
    }
    const value = values[inputBase[gateIndex]];
    outputs.set(gates[gateIndex].id, value === HIGH_Z ? null : value);
  }
  return outputs;
}

// ---------------------------------------------------------------------------
// Propagation
// ---------------------------------------------------------------------------

/** Mutable accumulators threaded through one tick's resolve pass. */
interface ResolvePass {
  values: SimulationState;
  /** Resolved value per net — also the value the renderer draws on the wire. */
  netValues: Int32Array;
  contentionNets: number[];
  /** Keeps contentionNets unique when a net gets resolved more than once. */
  contentionSeen: Uint8Array;
}

/**
 * One tick of combinational propagation. Each net resolves exactly once, at the step
 * where its last combinational driver has just evaluated (see buildSchedule).
 * Returns the net indices found in contention.
 */
function propagate(circuit: Circuit, program: CompiledProgram, pass: ResolvePass): number[] {
  const { order, resolveAfterOffset, resolveAfterNets, initialNets, unresolvedNets } = program;

  resolveRange(program, pass, initialNets, 0, initialNets.length);

  for (let step = 0; step < order.length; step++) {
    evaluateGate(circuit, program, pass.values, order[step]);
    resolveRange(
      program, pass, resolveAfterNets,
      resolveAfterOffset[step], resolveAfterOffset[step + 1],
    );
  }

  // Nets fed by gates stranded in a cycle never got a scheduled resolve of their own
  resolveRange(program, pass, unresolvedNets, 0, unresolvedNets.length);

  return pass.contentionNets;
}

function resolveRange(
  program: CompiledProgram,
  pass: ResolvePass,
  netList: Int32Array,
  from: number,
  to: number,
): void {
  for (let i = from; i < to; i++) {
    resolveNet(program, pass, netList[i]);
  }
}

/** Resolve one net's value from its drivers and write it to every receiver pin. */
function resolveNet(program: CompiledProgram, pass: ResolvePass, netIndex: number): void {
  const { values } = pass;
  const driverFrom = program.netDriverOffset[netIndex];
  const driverTo = program.netDriverOffset[netIndex + 1];

  let activeDrivers = 0;
  let netValue = HIGH_Z;
  for (let i = driverFrom; i < driverTo; i++) {
    const value = values[program.netDriverSlots[i]];
    if (value !== HIGH_Z) {
      activeDrivers++;
      netValue = value;
    }
  }

  if (program.netWidthMismatch[netIndex] === 1 || activeDrivers > 1) {
    netValue = HIGH_Z;
    if (pass.contentionSeen[netIndex] === 0) {
      pass.contentionSeen[netIndex] = 1;
      pass.contentionNets.push(netIndex);
    }
  } else if (activeDrivers === 0) {
    netValue = HIGH_Z;
  }

  pass.netValues[netIndex] = netValue;

  const receiverFrom = program.netReceiverOffset[netIndex];
  const receiverTo = program.netReceiverOffset[netIndex + 1];
  for (let i = receiverFrom; i < receiverTo; i++) {
    values[program.netReceiverSlots[i]] = netValue;
  }
}

// ---------------------------------------------------------------------------
// Gate evaluation
// ---------------------------------------------------------------------------

function evaluateGate(
  circuit: Circuit,
  program: CompiledProgram,
  values: SimulationState,
  gateIndex: number,
): void {
  const inBase = program.inputBase[gateIndex];
  const outBase = program.outputBase[gateIndex];
  const mask = program.slotMask[outBase];

  switch (program.opcode[gateIndex]) {
    case Op.NAND:
      values[outBase] = (~(readInput(values, inBase) & readInput(values, inBase + 1)) & mask) >>> 0;
      break;
    case Op.AND:
      values[outBase] = readInput(values, inBase) & readInput(values, inBase + 1);
      break;
    case Op.OR:
      values[outBase] = readInput(values, inBase) | readInput(values, inBase + 1);
      break;
    case Op.NOR:
      values[outBase] = (~(readInput(values, inBase) | readInput(values, inBase + 1)) & mask) >>> 0;
      break;
    case Op.XOR:
      values[outBase] = readInput(values, inBase) ^ readInput(values, inBase + 1);
      break;
    case Op.XNOR:
      values[outBase] = (~(readInput(values, inBase) ^ readInput(values, inBase + 1)) & mask) >>> 0;
      break;
    case Op.NOT:
      values[outBase] = (~readInput(values, inBase) & mask) >>> 0;
      break;

    case Op.OR3:
      values[outBase] = readInput(values, inBase)
        | readInput(values, inBase + 1)
        | readInput(values, inBase + 2);
      break;
    case Op.AND3:
      values[outBase] = readInput(values, inBase)
        & readInput(values, inBase + 1)
        & readInput(values, inBase + 2);
      break;

    case Op.ADD2: {
      const sum = readInput(values, inBase) + readInput(values, inBase + 1);
      values[outBase] = sum & 1;            // S
      values[outBase + 1] = (sum >> 1) & 1; // C
      break;
    }
    case Op.ADD3: {
      const sum = readInput(values, inBase)
        + readInput(values, inBase + 1)
        + readInput(values, inBase + 2);
      values[outBase] = sum & 1;            // S
      values[outBase + 1] = (sum >> 1) & 1; // Cout
      break;
    }
    case Op.ADD8: {
      const carryIn = readInput(values, inBase);
      const sum = readInput(values, inBase + 1) + readInput(values, inBase + 2) + carryIn;
      values[outBase] = sum & 0xFF;
      values[outBase + 1] = (sum >> 8) & 1;
      break;
    }
    case Op.NEG8:
      values[outBase] = (-readInput(values, inBase) & 0xFF) >>> 0;
      break;
    case Op.SUB8:
      values[outBase] = ((readInput(values, inBase) - readInput(values, inBase + 1)) & 0xFF) >>> 0;
      break;

    // Logical shifts by a full 8-bit amount. The >= 8 case is spelled out because JS shift
    // operators take the amount mod 32, so `x >>> 8` is 0 but `x >>> 32` would be x.
    case Op.SHR8: {
      const amount = readInput(values, inBase + 1);
      values[outBase] = amount >= 8 ? 0 : (readInput(values, inBase) & 0xFF) >>> amount;
      break;
    }
    case Op.SHL8: {
      const amount = readInput(values, inBase + 1);
      values[outBase] = amount >= 8 ? 0 : ((readInput(values, inBase) << amount) & 0xFF) >>> 0;
      break;
    }

    case Op.DEC1: {
      const isZero = readInput(values, inBase) === 0;
      values[outBase] = isZero ? 1 : 0;
      values[outBase + 1] = isZero ? 0 : 1;
      break;
    }
    case Op.DEC3: {
      const index = (readInput(values, inBase + 2) << 2)
        | (readInput(values, inBase + 1) << 1)
        | readInput(values, inBase);
      // DIS is the fourth input. Unwired reads as 0 (readInput folds high-Z to low), so a
      // decoder nobody has connected it to behaves exactly as it did before the pin existed.
      const disabled = readInput(values, inBase + 3) !== 0;
      const count = program.outputCount[gateIndex];
      for (let i = 0; i < count; i++) {
        values[outBase + i] = !disabled && i === index ? 1 : 0;
      }
      break;
    }

    case Op.CONSTANT:
      // setSourceOutputs already seeded this from gate.value; only a missing value falls here
      if (values[outBase] === HIGH_Z) values[outBase] = 0;
      break;

    case Op.MUX: {
      const select = values[inBase];
      values[outBase] = isLow(select)
        ? readInput(values, inBase + 1)
        : readInput(values, inBase + 2);
      break;
    }

    case Op.TRISTATE:
      // Enable low *or* unwired blocks the output, matching mux select and input-gate
      // enable. An unwired enable used to pass the input through, which silently made a
      // half-wired buffer drive the bus.
      values[outBase] = isLow(values[inBase + 1]) ? HIGH_Z : values[inBase];
      break;

    case Op.SPLITTER: {
      const input = readInput(values, inBase);
      const count = program.outputCount[gateIndex];
      for (let i = 0; i < count; i++) values[outBase + i] = (input >>> i) & 1;
      break;
    }
    case Op.JOINER: {
      let result = 0;
      const count = program.inputCount[gateIndex];
      for (let i = 0; i < count; i++) result |= (readInput(values, inBase + i) & 1) << i;
      values[outBase] = result;
      break;
    }

    case Op.RAM: {
      // Async read: Q follows the address within the tick, like the decoder + tri-state
      // circuit this gate stands in for. Read low (or unwired) blocks the output, matching
      // Op.TRISTATE, so a half-wired RAM cannot drive a shared bus. The write lands later,
      // in advanceSequentialState, so reading an address written this tick sees the old byte.
      if (isLow(values[inBase])) {
        values[outBase] = HIGH_Z;
        break;
      }
      const cells = program.gates[gateIndex].cells;
      values[outBase] = cells ? cells[readInput(values, inBase + 2) & RAM_ADDRESS_MASK] : 0;
      break;
    }

    case Op.INPUT_ENABLE:
      // Switch-style inputs: enable low (or unwired) forces the output to high-Z
      if (program.inputCount[gateIndex] > 0 && isLow(values[inBase])) {
        values[outBase] = HIGH_Z;
      }
      break;

    case Op.COMPONENT:
      evaluateComponent(circuit, program, values, gateIndex);
      break;

    case Op.NOP:
      break;

    default:
      // Every opcode opcodeFor() can produce is handled above. Components used to land
      // here via `default`, which silently turned any unhandled opcode into a component
      // evaluation.
      throw new Error(`Unhandled opcode ${program.opcode[gateIndex]}`);
  }
}

// ---------------------------------------------------------------------------
// Component gates
// ---------------------------------------------------------------------------

/** Track component evaluation chain to detect circular references. */
const evaluatingComponents = new Set<string>();

function evaluateComponent(
  circuit: Circuit,
  program: CompiledProgram,
  values: SimulationState,
  gateIndex: number,
): void {
  const gate = program.gates[gateIndex];
  const compId = gate.type as ComponentId;
  const def = getComponent(compId);
  if (!def) return; // Not a component gate — unknown type, silently skip

  // Circular reference check
  if (evaluatingComponents.has(compId)) return;
  evaluatingComponents.add(compId);

  try {
    // Get or create this gate's inner circuit instance, kept on the owning Circuit
    let innerCircuit = circuit.componentInstances.get(gate.id);
    if (!innerCircuit) {
      innerCircuit = deserializeCircuit(def.circuit);
      circuit.componentInstances.set(gate.id, innerCircuit);
    }

    // Collect inner IO gates in iteration order (same order as buildComponentDefinition)
    const innerInputIds: GateId[] = [];
    const innerOutputIds: GateId[] = [];
    for (const innerGate of innerCircuit.gates.values()) {
      if (isInputGate(innerGate.type)) innerInputIds.push(innerGate.id);
      else if (isOutputGate(innerGate.type)) innerOutputIds.push(innerGate.id);
    }

    // Map component input pins → inner circuit input gate values
    const inBase = program.inputBase[gateIndex];
    const inCount = program.inputCount[gateIndex];
    const inputs = new Map<GateId, number>();
    for (let i = 0; i < def.inputs.length && i < innerInputIds.length && i < inCount; i++) {
      inputs.set(innerInputIds[i], readInput(values, inBase + i));
    }

    // Tick the inner circuit
    innerCircuit.tick(inputs);

    // Read inner circuit output gate values → component output pins
    const outBase = program.outputBase[gateIndex];
    const outCount = program.outputCount[gateIndex];
    for (let i = 0; i < def.outputs.length && i < innerOutputIds.length && i < outCount; i++) {
      const value = innerCircuit.tickResult.outputs.get(innerOutputIds[i]) ?? null;
      values[outBase + i] = value === null ? HIGH_Z : value;
    }
  } finally {
    evaluatingComponents.delete(compId);
  }
}

// ---------------------------------------------------------------------------
// Derived render data
// ---------------------------------------------------------------------------

/** Short-circuit segments are static; contention segments come from this tick. */
function buildErrorSegments(
  program: CompiledProgram,
  buildResult: BuildResult,
  contentionNets: number[],
): Set<string> {
  const segments = new Set(program.shortCircuitSegmentIds);
  for (const netIndex of contentionNets) {
    const net = buildResult.nets.get(program.netIds[netIndex]);
    if (!net) continue;
    for (const segmentId of net.segmentIds) segments.add(segmentId as string);
  }
  return segments;
}
