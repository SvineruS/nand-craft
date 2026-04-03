import type { GateId, WireNode, WireNodeId, WireSegment, WireSegmentId } from '../editor/types.ts';
import type { Gate } from "./gateTypes.ts";
import type { BuildResult, TickResult } from "./types.ts";
import { build } from "./buildCircuit.ts";
import { tick } from "./tickCircuit.ts";

export class Circuit {
  gates = new Map<GateId, Gate>();
  wireNodes = new Map<WireNodeId, WireNode>();
  wireSegments = new Map<WireSegmentId, WireSegment>();

  cachedBuild: BuildResult | null = null;
  tickResult: TickResult = {
    outputs: new Map<GateId, number | null>(),
    contentionNets: [],
    errorSegmentIds: new Set<string>(),
    nodeValues: new Map<string, number | null>(),
    nodeBitWidths: new Map<string, number>(),
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
    this.tickResult = tick(this, buildResult, inputs);
  }

  /** Rebuild structural analysis. Called automatically by tick() if invalidated. */
  buildCircuit(circuit: Circuit): BuildResult {
    this.cachedBuild = build(circuit);
    return this.cachedBuild;
  }

  /** Invalidate cached build — call when circuit topology changes. */
  invalidateBuild(): void {
    this.cachedBuild = null;
  }

  /** Get the current cached build, or null if invalidated. */
  getBuild(): BuildResult | null {
    return this.cachedBuild;
  }

}
