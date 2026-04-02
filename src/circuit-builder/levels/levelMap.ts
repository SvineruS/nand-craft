import { Circuit } from '../simulation/circuit.ts';
import {
  generateId,
  type GateId,
  type LevelId,
  type PinId,
  type WireNode,
  type WireNodeId,
  type WireSegment,
  type WireSegmentId,
} from '../editor/types.ts';
import { isLevelUnlocked } from '../persistence/storage.ts';
import { build } from '../simulation/evaluate.ts';
import type { Gate } from "../editor/gates.ts";
import type { Level } from "./levelTypes.ts";
import { GRID_SIZE } from "../editor/consts.ts";
import { getPinPositions } from "../editor/utils/geometry.ts";
import { Vec2 } from "../editor/utils/vec2.ts";

/** Map from LevelId to the GateId representing it on the level map. */
export type LevelGateMap = Map<LevelId, GateId>;

function levelStatus(level: Level, solvedIds: Set<LevelId>): 'locked' | 'available' | 'solved' {
  if (solvedIds.has(level.id)) return 'solved';
  if (isLevelUnlocked(level, solvedIds)) return 'available';
  return 'locked';
}

/**
 * Build a virtual circuit representing the level map.
 * Each level becomes a gate of type 'level', wired by prerequisites.
 */
export function buildLevelMapCircuit(
  levels: Level[],
  solvedIds: Set<LevelId>,
): { circuit: Circuit; levelGateMap: LevelGateMap } {
  const circuit = new Circuit();
  const levelGateMap: LevelGateMap = new Map();

  // Create a gate for each level
  for (const level of levels) {
    const gateId = generateId('gate') as GateId;
    const inputPinId = generateId('pin') as PinId;
    const outputPinId = generateId('pin') as PinId;
    const pos = Vec2.scale(level.mapPosition, GRID_SIZE)

    const gate: Gate = {
      id: gateId,
      type: 'level',
      pos,
      rotation: 0,
      inputPins: [inputPinId],
      outputPins: [outputPinId],
      label: level.name,
      status: levelStatus(level, solvedIds),
      canRemove: false,
      canMove: false,
    };
    circuit.gates.set(gateId, gate);
    circuit.pins.set(inputPinId, { id: inputPinId, gateId, kind: 'input', index: 0, bitWidth: 1, value: null });
    circuit.pins.set(outputPinId, { id: outputPinId, gateId, kind: 'output', index: 0, bitWidth: 1, value: null });
    levelGateMap.set(level.id, gateId);
  }

  // Create wire connections for prerequisites
  for (const level of levels) {
    const targetGateId = levelGateMap.get(level.id)!;
    const targetGate = circuit.gates.get(targetGateId)!;
    const targetPinId = targetGate.inputPins[0];

    for (const prereqId of level.prerequisites) {
      const prereqGateId = levelGateMap.get(prereqId);
      if (!prereqGateId)
        throw new Error(`Prerequisite level ${prereqId} not found for level ${level.id}`);
      const prereqGate = circuit.gates.get(prereqGateId)!;
      const prereqPinId = prereqGate.outputPins[0];

      // Create wire nodes at pin positions
      const fromNodeId = generateId('wn') as WireNodeId;
      const fromPos = getPinPositions(prereqGate).get(prereqPinId)!;
      const fromNode: WireNode = { id: fromNodeId, pos: fromPos, pinId: prereqPinId };
      circuit.wireNodes.set(fromNodeId, fromNode);

      const toNodeId = generateId('wn') as WireNodeId;
      const toPos = getPinPositions(targetGate).get(targetPinId)!;
      const toNode: WireNode = { id: toNodeId, pos: toPos, pinId: targetPinId };
      circuit.wireNodes.set(toNodeId, toNode);

      // Connect with a wire segment
      const segId = generateId('ws') as WireSegmentId;
      const seg: WireSegment = { id: segId, from: fromNodeId, to: toNodeId };
      circuit.wireSegments.set(segId, seg);
    }
  }

  build(circuit);
  return { circuit, levelGateMap };
}

/** Find which LevelId a gate belongs to, given the reverse map. */
export function gateIdToLevelId(gateId: GateId, levelGateMap: LevelGateMap): LevelId | undefined {
  for (const [levelId, gId] of levelGateMap) {
    if (gId === gateId) return levelId;
  }
  return undefined;
}
