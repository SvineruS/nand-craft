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
import { deserializeCircuit } from '../persistence/serialize.ts';
import { LEVEL_MAP_CIRCUIT } from './levelMapData.ts';

/** Map from LevelId to the GateId representing it on the level map. */
export type LevelGateMap = Map<LevelId, GateId>;

function levelStatus(level: Level, solvedIds: Set<LevelId>): 'locked' | 'available' | 'solved' {
  if (solvedIds.has(level.id)) return 'solved';
  if (isLevelUnlocked(level, solvedIds)) return 'available';
  return 'locked';
}

/**
 * Build a virtual circuit representing the level map.
 * If LEVEL_MAP_CIRCUIT is set (and not in editor mode), load from saved data.
 * Otherwise generate from level definitions + prerequisites.
 */
export function buildLevelMapCircuit(
  levels: Level[],
  solvedIds: Set<LevelId>,
  editable = false,
): { circuit: Circuit; levelGateMap: LevelGateMap } {
  if (LEVEL_MAP_CIRCUIT && !editable) {
    return loadSavedLevelMap(LEVEL_MAP_CIRCUIT, levels, solvedIds);
  }
  return generateLevelMapCircuit(levels, solvedIds, editable);
}

/** Load level map from serialized circuit data. Updates gate statuses from current solve state. */
function loadSavedLevelMap(
  json: string,
  levels: Level[],
  solvedIds: Set<LevelId>,
): { circuit: Circuit; levelGateMap: LevelGateMap } {
  const circuit = deserializeCircuit(json);
  const levelGateMap: LevelGateMap = new Map();

  // Build label → Level lookup
  const nameToLevel = new Map<string, Level>();
  for (const level of levels) nameToLevel.set(level.name, level);

  // Map gates to levels by label, update statuses
  const outputPinsMap = new Map<GateId, number>();
  for (const gate of circuit.gates.values()) {
    if (gate.type !== 'level' || !gate.label) continue;
    const level = nameToLevel.get(gate.label);
    if (!level) continue;
    const status = levelStatus(level, solvedIds);
    gate.status = status;
    levelGateMap.set(level.id, gate.id);
    outputPinsMap.set(gate.id, status === 'solved' ? 1 : 0);
  }

  circuit.tick(outputPinsMap);
  return { circuit, levelGateMap };
}

/** Generate level map circuit from scratch using level definitions and prerequisites. */
function generateLevelMapCircuit(
  levels: Level[],
  solvedIds: Set<LevelId>,
  editable: boolean,
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
      canMove: editable,
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

  circuit.tick(outputPinsMap);
  return { circuit, levelGateMap };
}

/** Find which LevelId a gate belongs to, given the reverse map. */
export function gateIdToLevelId(gateId: GateId, levelGateMap: LevelGateMap): LevelId | undefined {
  for (const [levelId, gId] of levelGateMap) {
    if (gId === gateId) return levelId;
  }
  return undefined;
}
