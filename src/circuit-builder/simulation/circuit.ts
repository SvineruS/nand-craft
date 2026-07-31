import type { GateId, WireNode, WireNodeId, WireSegment, WireSegmentId } from '../editor/types.ts';
import type { Gate } from "./gateTypes.ts";
import { type BuildResult, HIGH_Z, type SimulationState, type TickResult } from "./types.ts";
import { build } from "./buildCircuit.ts";
import { tick } from "./tickCircuit.ts";

export class Circuit {
  gates = new Map<GateId, Gate>();
  wireNodes = new Map<WireNodeId, WireNode>();
  wireSegments = new Map<WireSegmentId, WireSegment>();

  /**
   * Inner circuit per component gate, created on first evaluation and reused after.
   *
   * Runtime only, and deliberately not on the Gate: a Circuit carries its own compiled
   * program and typed arrays, which used to end up in the save file when gates were
   * serialized. Keyed by gate id so instances survive a topology rebuild.
   */
  componentInstances = new Map<GateId, Circuit>();

  /** Pin values indexed by the compiled program's slots. Sized by buildCircuit(). */
  simState: SimulationState = new Int32Array(0);
  /** Per-net display values, reused across ticks. Sized by buildCircuit(). */
  netValues = new Int32Array(0);
  /** Scratch flags keeping contentionNets free of duplicates. Sized by buildCircuit(). */
  contentionSeen = new Uint8Array(0);

  cachedBuild: BuildResult | null = null;
  tickResult: TickResult = {
    outputs: new Map<GateId, number | null>(),
    contentionNets: [],
    errorSegmentIds: new Set<string>(),
    netValues: new Int32Array(0),
  };


  getGate(id: GateId): Gate {
    const gate = this.gates.get(id);
    if (!gate) throw new Error(`Gate ${id} not found`);
    return gate;
  }

  getWireNode(id: WireNodeId): WireNode {
    const node = this.wireNodes.get(id);
    if (!node) throw new Error(`WireNode ${id} not found`);
    return node;
  }

  getWireSegment(id: WireSegmentId): WireSegment {
    const seg = this.wireSegments.get(id);
    if (!seg) throw new Error(`WireSegment ${id} not found`);
    return seg;
  }


  tick(inputs: Map<GateId, number>) {
    // Rebuild if invalidated
    if (!this.cachedBuild) this.buildCircuit(this);
    const buildResult = this.cachedBuild!;
    this.simState.fill(HIGH_Z);
    this.contentionSeen.fill(0);
    this.tickResult = tick(this, buildResult, inputs);
  }

  /** Rebuild structural analysis. Called automatically by tick() if invalidated. */
  buildCircuit(circuit: Circuit): BuildResult {
    this.pruneComponentInstances();
    this.cachedBuild = build(circuit);
    const { program } = this.cachedBuild;
    this.simState = new Int32Array(program.slotCount);
    this.netValues = new Int32Array(program.netCount);
    this.contentionSeen = new Uint8Array(program.netCount);
    return this.cachedBuild;
  }

  /**
   * Drop inner circuits whose component gate is gone, so deleting components does not
   * leak their instances for the life of the editor. Gate ids are never reused, so an
   * absent id can never come back — except by undoing the deletion, which rebuilds the
   * instance from the component definition with its registers cleared.
   */
  private pruneComponentInstances(): void {
    if (this.componentInstances.size === 0) return;
    for (const gateId of this.componentInstances.keys()) {
      if (!this.gates.has(gateId)) this.componentInstances.delete(gateId);
    }
  }

  /** Invalidate cached build — call when circuit topology changes. */
  invalidateBuild(): void {
    this.cachedBuild = null;
  }

  /** Get the current cached build, or null if invalidated. */
  getBuild(): BuildResult | null {
    return this.cachedBuild;
  }

  /** Current value of one gate pin. null = high-Z / not simulated yet. */
  getPinValue(gateId: GateId, kind: 'input' | 'output', index: number): number | null {
    const program = this.cachedBuild?.program;
    if (!program) return null;

    const gateIndex = program.gateIndexById.get(gateId);
    if (gateIndex === undefined) return null;
    const count = kind === 'output' ? program.outputCount[gateIndex] : program.inputCount[gateIndex];
    if (index < 0 || index >= count) return null;

    const base = kind === 'output' ? program.outputBase[gateIndex] : program.inputBase[gateIndex];
    const value = this.simState[base + index];
    return value === HIGH_Z ? null : value;
  }

  /** Display value of the net a wire node belongs to. See TickResult.netValues. */
  getNetValue(nodeId: WireNodeId): number | null {
    const netIndex = this.cachedBuild?.program.nodeNet.get(nodeId);
    if (netIndex === undefined || netIndex >= this.tickResult.netValues.length) return null;
    const value = this.tickResult.netValues[netIndex];
    return value === HIGH_Z ? null : value;
  }

  /** Bit width of the net a wire node belongs to. Topology-derived, so always valid. */
  getNetBitWidth(nodeId: WireNodeId): number {
    const program = this.cachedBuild?.program;
    const netIndex = program?.nodeNet.get(nodeId);
    if (program === undefined || netIndex === undefined) return 1;
    return program.netBitWidth[netIndex];
  }
}
