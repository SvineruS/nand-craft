import { Circuit } from '../simulation/circuit.ts';
import {
  generateId,
  type GateId,
  type LevelId,
  type PinId,

  type WireNodeId,
  type WireSegment,
  type WireSegmentId,
} from '../editor/types.ts';
import { isLevelUnlocked } from '../persistence/storage.ts';
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

  const outputPinsMap = new Map<GateId, number>();

  // Create a gate for each level
  for (const level of levels) {
    const gateId = generateId('gate') as GateId;
    const inputPinId = generateId('pin') as PinId;
    const outputPinId = generateId('pin') as PinId;
    const pos = Vec2.scale(level.mapPosition, GRID_SIZE)

    const status = levelStatus(level, solvedIds);
    outputPinsMap.set(gateId, status == 'solved' ? 1 : 0);

    const gate: Gate = {
      id: gateId,
      type: 'level',
      pos,
      rotation: 0,
      inputPins: [inputPinId],
      outputPins: [outputPinId],
      label: level.name,
      status,
      canRemove: false,
      canMove: false,
    };
    circuit.gates.set(gateId, gate);
    circuit.pins.set(inputPinId, { id: inputPinId, gateId, kind: 'input', index: 0, bitWidth: 1, value: null });
    circuit.pins.set(outputPinId, { id: outputPinId, gateId, kind: 'output', index: 0, bitWidth: 1, value: null });
    levelGateMap.set(level.id, gateId);
  }

  // Create one wire node per pin (reused across all wires touching that pin)
  const pinNodeMap = new Map<PinId, WireNodeId>();
  function getOrCreatePinNode(gate: Gate, pinId: PinId): WireNodeId {
    let nodeId = pinNodeMap.get(pinId);
    if (!nodeId) {
      nodeId = generateId('wn') as WireNodeId;
      const pos = getPinPositions(gate).get(pinId)!;
      circuit.wireNodes.set(nodeId, { id: nodeId, pos, pinId });
      pinNodeMap.set(pinId, nodeId);
    }
    return nodeId;
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

      const fromNodeId = getOrCreatePinNode(prereqGate, prereqPinId);
      const toNodeId = getOrCreatePinNode(targetGate, targetPinId);

      const segId = generateId('ws') as WireSegmentId;
      const seg: WireSegment = { id: segId, from: fromNodeId, to: toNodeId };
      circuit.wireSegments.set(segId, seg);
    }
  }


  circuit.tick(outputPinsMap); // Set initial gate statuses based on solved levels
  console.log(circuit)

  return { circuit, levelGateMap };
}

/** Find which LevelId a gate belongs to, given the reverse map. */
export function gateIdToLevelId(gateId: GateId, levelGateMap: LevelGateMap): LevelId | undefined {
  for (const [levelId, gId] of levelGateMap) {
    if (gId === gateId) return levelId;
  }
  return undefined;
}
