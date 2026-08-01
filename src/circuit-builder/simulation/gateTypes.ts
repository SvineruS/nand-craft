import type { ComponentId, GateId, Rotation, Vec2 } from "../editor/types.ts";

export interface Gate {
  id: GateId;
  type: GateType;
  pos: Vec2;
  rotation: Rotation;
  /**
   * User-set output value. Constant gates only — see isConstantGate.
   * Persisted, because the player chose it.
   */
  value?: number;
  /**
   * Register contents. Sequential gates only — see isSequentialGate. undefined means
   * "not yet clocked", which reads as 0. Persisted, so a memory keeps its contents
   * across a reload.
   */
  register?: number;
  /**
   * RAM contents, one byte per address. RAM gates only — see isRamGate. undefined means
   * "never written", which reads as 0. Allocated on the first write so an untouched RAM
   * costs nothing. Persisted, like `register`, so contents survive a reload.
   */
  cells?: number[];
  label?: string;
  canRemove?: boolean;
  canMove?: boolean;
}

const INPUT_TYPES = new Set<GateType>(['input', 'input-8bit', 'input-16bit', 'input-sw', 'input-8bit-sw', 'input-16bit-sw']);
const OUTPUT_TYPES = new Set<GateType>(['output', 'output-8bit', 'output-16bit', 'output-sw', 'output-8bit-sw', 'output-16bit-sw']);

const CONSTANT_TYPES = new Set<GateType>(['constant', 'constant-8bit', 'constant-16bit']);

/**
 * Gates whose output is a stored value needing no computation, so setSourceOutputs can seed
 * it before propagation and isCombinational can drop them from the evaluation order.
 *
 * 'ram' is deliberately absent: its output is a stored value *selected by its address input*,
 * so it cannot be answered until that wire has resolved. It runs in the evaluation order like
 * a combinational gate and writes back via SeqOp.RAM. See the note in program.ts.
 */
const SEQUENTIAL_TYPES = new Set<GateType>(['delay', 'rs-latch', '1bit-memory', '8bit-memory', '8bit-counter', '8bit-counter-reset']);

/** Addressable bytes in a RAM gate — the full range of its 8-bit address pin. */
export const RAM_SIZE = 256;
export const RAM_ADDRESS_MASK = RAM_SIZE - 1;

export function isInputGate(type: GateType): boolean { return INPUT_TYPES.has(type); }
export function isOutputGate(type: GateType): boolean { return OUTPUT_TYPES.has(type); }
export function isConstantGate(type: GateType): boolean { return CONSTANT_TYPES.has(type); }
export function isSequentialGate(type: GateType): boolean { return SEQUENTIAL_TYPES.has(type); }
export function isRamGate(type: GateType): boolean { return type === 'ram'; }

/**
 * Discard a gate's stored state, so a test run starts from a known board.
 *
 * RAM needs its own branch because it is not in SEQUENTIAL_TYPES — see the note there.
 * gate.value is left alone: it holds the player's constants, not simulation state.
 */
export function clearGateState(gate: Gate): void {
  if (isSequentialGate(gate.type)) gate.register = undefined;
  else if (isRamGate(gate.type)) gate.cells = undefined;
}

/**
 * A gate type is either one of these built-ins or a user component's id.
 *
 * Keeping them as distinct types is what makes `Record<BuiltInGateType, ...>` exhaustive
 * and stops an arbitrary string from passing as a gate type — the previous
 * `| (string & {})` escape hatch accepted any typo silently.
 */
export type BuiltInGateType =
  | 'nand'
  | 'and'
  | 'or'
  | 'nor'
  | 'xor'
  | 'xnor'
  | 'not'
  | '8bit-and'
  | '8bit-or'
  | '8bit-nor'
  | '8bit-not'
  | '8bit-shr'
  | '8bit-shl'
  | '3bit-or'
  | '3bit-and'
  | '2bit-adder'
  | '3bit-adder'
  | '1bit-decoder'
  | '3bit-decoder'
  | '8bit-negative'
  | '8bit-adder'
  | '8bit-subtractor'
  | '8bit-mux'
  | 'mux'
  | 'delay'
  | 'rs-latch'
  | '1bit-memory'
  | '8bit-memory'
  | '8bit-counter'
  | '8bit-counter-reset'
  | 'ram'
  | 'tristate'
  | '8bit-tristate'
  | 'constant'
  | 'constant-8bit'
  | 'constant-16bit'
  | 'splitter'
  | 'joiner'
  | 'input'
  | 'input-8bit'
  | 'input-16bit'
  | 'input-sw'
  | 'input-8bit-sw'
  | 'input-16bit-sw'
  | 'output'
  | 'output-8bit'
  | 'output-16bit'
  | 'output-sw'
  | 'output-8bit-sw'
  | 'output-16bit-sw'
  | 'level';

export type GateType = BuiltInGateType | ComponentId;
