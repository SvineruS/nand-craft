import type { GateId, PinRef, WireNode, WireNodeId, WireSegment, WireSegmentId } from '../editor/types.ts';
import { pinRefKey } from '../editor/types.ts';
import type { Gate } from "./gateTypes.ts";
import { type BuildResult, HIGH_Z, type SimulationState, type TickResult } from "./types.ts";
import { build } from "./buildCircuit.ts";
import { tick } from "./tickCircuit.ts";

const NO_SEGMENTS: ReadonlySet<WireSegmentId> = new Set();

/**
 * The circuit graph plus its simulation state.
 *
 * Gates, nodes and segments are readable as maps but mutable only through the methods
 * below, because Circuit maintains adjacency indexes alongside them. Before those indexes
 * existed, ten call sites across five modules each re-derived "which segments touch this
 * node" or "which node sits on this pin" by scanning every segment or node in the circuit.
 */
export class Circuit {
  private readonly gateMap = new Map<GateId, Gate>();
  private readonly nodeMap = new Map<WireNodeId, WireNode>();
  private readonly segmentMap = new Map<WireSegmentId, WireSegment>();

  /** Segments incident to each node. Only nodes with at least one segment appear. */
  private readonly segmentsByNode = new Map<WireNodeId, Set<WireSegmentId>>();
  /** Node anchored to each pin, keyed by pinRefKey. First claimant wins, as before. */
  private readonly nodeByPin = new Map<string, WireNodeId>();
  /** All nodes anchored to any pin of a gate. */
  private readonly nodesByGate = new Map<GateId, Set<WireNodeId>>();

  get gates(): ReadonlyMap<GateId, Gate> { return this.gateMap; }
  get wireNodes(): ReadonlyMap<WireNodeId, WireNode> { return this.nodeMap; }
  get wireSegments(): ReadonlyMap<WireSegmentId, WireSegment> { return this.segmentMap; }

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


  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  getGate(id: GateId): Gate {
    const gate = this.gateMap.get(id);
    if (!gate) throw new Error(`Gate ${id} not found`);
    return gate;
  }

  getWireNode(id: WireNodeId): WireNode {
    const node = this.nodeMap.get(id);
    if (!node) throw new Error(`WireNode ${id} not found`);
    return node;
  }

  getWireSegment(id: WireSegmentId): WireSegment {
    const seg = this.segmentMap.get(id);
    if (!seg) throw new Error(`WireSegment ${id} not found`);
    return seg;
  }

  /** Segments incident to a node. Empty set if the node is free-standing or unknown. */
  segmentsOf(nodeId: WireNodeId): ReadonlySet<WireSegmentId> {
    return this.segmentsByNode.get(nodeId) ?? NO_SEGMENTS;
  }

  /** Number of segments incident to a node. */
  degreeOf(nodeId: WireNodeId): number {
    return this.segmentsByNode.get(nodeId)?.size ?? 0;
  }

  /** The wire node anchored to a pin, if any. */
  findNodeForPin(pin: PinRef): WireNodeId | null {
    return this.nodeByPin.get(pinRefKey(pin)) ?? null;
  }

  /** Wire nodes anchored to any pin of the given gates. */
  anchoredNodesOf(gateIds: Iterable<GateId>): WireNodeId[] {
    const result: WireNodeId[] = [];
    for (const gateId of gateIds) {
      const nodes = this.nodesByGate.get(gateId);
      if (nodes) result.push(...nodes);
    }
    return result;
  }

  // ---------------------------------------------------------------------------
  // Mutations — the only writers of the maps above
  // ---------------------------------------------------------------------------

  addGate(gate: Gate): void {
    this.gateMap.set(gate.id, gate);
  }

  /** Remove a gate only. Callers handle its anchored nodes and their segments. */
  removeGate(id: GateId): void {
    this.gateMap.delete(id);
  }

  addWireNode(node: WireNode): void {
    this.nodeMap.set(node.id, node);
    if (node.pin) this.claimPin(node.pin, node.id);
  }

  removeWireNode(id: WireNodeId): void {
    const node = this.nodeMap.get(id);
    if (!node) return;
    if (node.pin) this.releasePin(node.pin, id);
    this.nodeMap.delete(id);
    this.segmentsByNode.delete(id);
  }

  addWireSegment(segment: WireSegment): void {
    this.segmentMap.set(segment.id, segment);
    this.linkSegment(segment.from, segment.id);
    this.linkSegment(segment.to, segment.id);
  }

  removeWireSegment(id: WireSegmentId): void {
    const segment = this.segmentMap.get(id);
    if (!segment) return;
    this.unlinkSegment(segment.from, id);
    this.unlinkSegment(segment.to, id);
    this.segmentMap.delete(id);
  }

  /** Set or clear a node's pin anchor, keeping the pin index in step. */
  setWireNodePin(id: WireNodeId, pin: PinRef | undefined): PinRef | undefined {
    const node = this.getWireNode(id);
    const previous = node.pin;
    if (previous) this.releasePin(previous, id);
    // The only writer of WireNode.pin, which is readonly precisely to force this path.
    (node as { pin?: PinRef }).pin = pin;
    if (pin) this.claimPin(pin, id);
    return previous;
  }

  // ---------------------------------------------------------------------------
  // Index bookkeeping
  // ---------------------------------------------------------------------------

  private linkSegment(nodeId: WireNodeId, segmentId: WireSegmentId): void {
    let segments = this.segmentsByNode.get(nodeId);
    if (!segments) {
      segments = new Set();
      this.segmentsByNode.set(nodeId, segments);
    }
    segments.add(segmentId);
  }

  private unlinkSegment(nodeId: WireNodeId, segmentId: WireSegmentId): void {
    const segments = this.segmentsByNode.get(nodeId);
    if (!segments) return;
    segments.delete(segmentId);
    if (segments.size === 0) this.segmentsByNode.delete(nodeId);
  }

  private claimPin(pin: PinRef, nodeId: WireNodeId): void {
    const key = pinRefKey(pin);
    // First claimant wins, matching the old "first match in insertion order" scan.
    if (!this.nodeByPin.has(key)) this.nodeByPin.set(key, nodeId);

    let nodes = this.nodesByGate.get(pin.gateId);
    if (!nodes) {
      nodes = new Set();
      this.nodesByGate.set(pin.gateId, nodes);
    }
    nodes.add(nodeId);
  }

  private releasePin(pin: PinRef, nodeId: WireNodeId): void {
    const nodes = this.nodesByGate.get(pin.gateId);
    if (nodes) {
      nodes.delete(nodeId);
      if (nodes.size === 0) this.nodesByGate.delete(pin.gateId);
    }

    const key = pinRefKey(pin);
    if (this.nodeByPin.get(key) !== nodeId) return;
    this.nodeByPin.delete(key);
    // Two nodes on one pin is malformed but reachable; promote any remaining claimant
    // rather than leaving the pin looking unwired.
    for (const other of this.nodeMap.values()) {
      if (other.id !== nodeId && other.pin && pinRefKey(other.pin) === key) {
        this.nodeByPin.set(key, other.id);
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

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
      if (!this.gateMap.has(gateId)) this.componentInstances.delete(gateId);
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
