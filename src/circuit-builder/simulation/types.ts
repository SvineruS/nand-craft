import type { GateId, Net, NetId } from '../editor/types.ts';
import type { CompiledProgram } from './program.ts';

/**
 * Pin values indexed by the compiled program's pin slots.
 *
 * HIGH_Z (-1) stands in for null / undriven. Safe as a sentinel because every gate
 * output is masked to an unsigned 1/8/16-bit value and so is never negative.
 */
export type SimulationState = Int32Array;

export const HIGH_Z = -1;

/** Cached structural analysis — recomputed only when circuit topology changes. */
export interface BuildResult {
  /** Nets by ID, for the renderer and hit-testing. Not used by the tick loop. */
  nets: Map<NetId, Net>;
  /** Gates caught in combinational feedback loops. */
  shortCircuitGates: GateId[];
  /** Integer-indexed compiled topology consumed by tick(). */
  program: CompiledProgram;
}

/**
 * Per-tick simulation output — everything the renderer and UI need.
 *
 * One instance per Circuit, refilled in place by each propagate rather than rebuilt. Read
 * it right after ticking and do not retain the containers: a component's inner circuit
 * propagates on every tick of the outer one, so its result is overwritten constantly.
 */
export interface TickResult {
  outputs: Map<GateId, number | null>;
  contentionNets: string[];
  errorSegmentIds: Set<string>;
  /**
   * Resolved value per net, indexed by net — the same value delivered to the net's
   * receiver pins, so a contended or width-mismatched net reads as high-Z. Read it via
   * Circuit.getNetValue().
   */
  netValues: Int32Array;
}
