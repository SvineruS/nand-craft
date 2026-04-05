import { Circuit } from '../simulation/circuit.ts';
import {
  generateId,
  pinRefKey,
  type GateId,
  type LevelId,
  type PinRef,
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
import { deserializeCircuit, type SerializedCircuit } from '../persistence/serialize.ts';
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
  if (LEVEL_MAP_CIRCUIT) {
    const result = loadSavedLevelMap(LEVEL_MAP_CIRCUIT, levels, solvedIds, editable);
    addMissingLevels(result.circuit, result.levelGateMap, levels, solvedIds, editable);
    return result;
  }
  return generateLevelMapCircuit(levels, solvedIds, editable);
}

/** Load level map from serialized circuit data. Updates gate statuses from current solve state. */
function loadSavedLevelMap(
  json: SerializedCircuit,
  levels: Level[],
  solvedIds: Set<LevelId>,
  editable: boolean,
): { circuit: Circuit; levelGateMap: LevelGateMap } {
  const circuit = deserializeCircuit(json);
  const levelGateMap: LevelGateMap = new Map();

  // Build level ID → Level lookup
  const idToLevel = new Map<string, Level>();
  for (const level of levels) idToLevel.set(level.id as string, level);

  // Map gates to levels by gate ID = level ID, update statuses
  const outputPinsMap = new Map<GateId, number>();
  for (const gate of circuit.gates.values()) {
    if (gate.type !== 'level') continue;
    const level = idToLevel.get(gate.id as string);
    if (!level) continue;
    const status = levelStatus(level, solvedIds);
    gate.state = status;
    // Use level name as label unless manually overridden
    if (!gate.label) gate.label = level.name;
    gate.canMove = editable;
    levelGateMap.set(level.id, gate.id);
    outputPinsMap.set(gate.id, status === 'solved' ? 1 : 0);
  }

  circuit.tick(outputPinsMap);
  return { circuit, levelGateMap };
}

/** Add level gates for any levels not found in the saved map. */
function addMissingLevels(
  circuit: Circuit,
  levelGateMap: LevelGateMap,
  levels: Level[],
  solvedIds: Set<LevelId>,
  editable: boolean,
): void {
  // Find max x position of existing gates to place new ones to the right
  let maxX = 0;
  for (const gate of circuit.gates.values()) {
    if (gate.type === 'level') maxX = Math.max(maxX, gate.pos.x);
  }

  for (const level of levels) {
    if (levelGateMap.has(level.id)) continue;

    // Use level ID as gate ID so the map can match them
    const gateId = level.id as unknown as GateId;
    const status = levelStatus(level, solvedIds);
    maxX += 160;

    const gate: Gate = {
      id: gateId,
      type: 'level',
      pos: { x: maxX, y: 0 },
      rotation: 0,
      label: level.name,
      state: status,
      canRemove: false,
      canMove: editable,
    };
    circuit.gates.set(gateId, gate);
    levelGateMap.set(level.id, gateId);
  }
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

  // Create a gate for each level (gate ID = level ID)
  for (const level of levels) {
    const gateId = level.id as unknown as GateId;
    const pos = Vec2.scale(level.mapPosition, GRID_SIZE)

    const status = levelStatus(level, solvedIds);
    outputPinsMap.set(gateId, status == 'solved' ? 1 : 0);

    const gate: Gate = {
      id: gateId,
      type: 'level',
      pos,
      rotation: 0,
      label: level.name,
      state: status,
      canRemove: false,
      canMove: editable,
    };
    circuit.gates.set(gateId, gate);
    levelGateMap.set(level.id, gateId);
  }

  // Create one wire node per pin (reused across all wires touching that pin)
  const pinNodeMap = new Map<string, WireNodeId>();
  function getOrCreatePinNode(gate: Gate, pin: PinRef): WireNodeId {
    const key = pinRefKey(pin);
    let nodeId = pinNodeMap.get(key);
    if (!nodeId) {
      nodeId = generateId('wn') as WireNodeId;
      const positions = getPinPositions(gate);
      const pos = pin.kind === 'input' ? positions.inputs[pin.index] : positions.outputs[pin.index];
      circuit.wireNodes.set(nodeId, { id: nodeId, pos, pin });
      pinNodeMap.set(key, nodeId);
    }
    return nodeId;
  }

  // Create wire connections for prerequisites
  for (const level of levels) {
    const targetGateId = levelGateMap.get(level.id)!;
    const targetGate = circuit.gates.get(targetGateId)!;
    const targetPin: PinRef = { gateId: targetGateId, kind: 'input', index: 0 };

    for (const prereqId of level.prerequisites) {
      const prereqGateId = levelGateMap.get(prereqId);
      if (!prereqGateId)
        throw new Error(`Prerequisite level ${prereqId} not found for level ${level.id}`);
      const prereqGate = circuit.gates.get(prereqGateId)!;
      const prereqPin: PinRef = { gateId: prereqGateId, kind: 'output', index: 0 };

      const fromNodeId = getOrCreatePinNode(prereqGate, prereqPin);
      const toNodeId = getOrCreatePinNode(targetGate, targetPin);

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
