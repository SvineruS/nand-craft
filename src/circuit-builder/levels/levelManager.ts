import { Editor } from '../editor/Editor.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { createEditorState, type LevelNodeStatus } from '../editor/EditorState.ts';
import type { GateId, LevelId } from '../editor/types.ts';
import { gateCenter } from '../editor/utils/geometry.ts';
import type { Circuit } from '../simulation/circuit.ts';
import type { LevelGateMap } from './levelMap.ts';
import { buildLevelMapCircuit, gateIdToLevelId } from './levelMap.ts';
import type { Level } from './levelTypes.ts';
import { LEVELS } from './registry.ts';
import { isLevelUnlocked, loadCircuit } from '../persistence/storage.ts';
import {
  levelDialogVisible,
  notifyStateChange,
  openLevelIndex,
  solvedLevelIds,
} from '../../ui/editorStore.ts';
import { Vec2 } from "../editor/utils/vec2.ts";
import { hitTestGate_ } from "../editor/utils/hitTests.ts";
import { getAllComponents } from '../components/componentRegistry.ts';

// ---------------------------------------------------------------------------
// Level state management
// ---------------------------------------------------------------------------

let levelMapState: EditorState | null = null;
let levelGateMap: LevelGateMap = new Map();

/**
 * Ask the circuit editor screen to open a level. The screen builds the Editor when it
 * mounts (see createLevelEditor); the previous screen saves its own circuit on unmount.
 */
export function requestLevel(index: number): void {
  openLevelIndex.value = index;
  levelDialogVisible.value = true;
  notifyStateChange();
}

/** Build the Editor for a level index, restoring the player's saved circuit if any. */
export function createLevelEditor(index: number): Editor {
  const level = LEVELS[index];
  return Editor.loadLevel(level, loadCircuit(level.id) ?? undefined);
}

export function buildLevelMap(): void {
  const prevCamera = levelMapState?.camera;

  const map = buildLevelMapCircuit(LEVELS, solvedLevelIds.value);
  const state = createEditorState();
  state.circuit = map.circuit;
  state.gateStatuses = map.gateStatuses;
  state.circuitDirty = false;

  if (prevCamera) state.camera = prevCamera;

  // Add component nodes below levels
  addComponentNodes(map.circuit, map.gateStatuses);

  levelMapState = state;
  levelGateMap = map.levelGateMap;
}

/** Add saved component gates to the level map for display. */
function addComponentNodes(circuit: Circuit, gateStatuses: Map<GateId, LevelNodeStatus>): void {
  const components = getAllComponents();
  if (components.length === 0) return;

  // Find lowest Y of existing gates to place components below
  let maxY = 0;
  for (const gate of circuit.gates.values()) {
    maxY = Math.max(maxY, gate.pos.y);
  }

  const startY = maxY + 120; // gap below levels
  const startX = -160;

  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    // Use component ID as gate ID so we can identify clicks
    const gateId = ('cmp:' + comp.id) as GateId;
    circuit.addGate({
      id: gateId,
      type: 'level', // Reuse level gate type for display
      pos: { x: startX + i * 160, y: startY },
      rotation: 0,
      label: comp.name,
    });
    gateStatuses.set(gateId, 'available'); // Always accessible
  }
}


export function getLevelMapState(): EditorState | null {
  return levelMapState;
}

export function getLevelGateMap(): LevelGateMap {
  return levelGateMap;
}

// ---------------------------------------------------------------------------
// Level map editor — uses Editor.create() without a level
// ---------------------------------------------------------------------------

/** Build a level-less Editor over the level map, centred on the map, for editing it. */
export function createLevelMapEditor(): Editor {
  const map = buildLevelMapCircuit(LEVELS, solvedLevelIds.value, true);
  const editor = Editor.create(map.circuit);

  const points: Vec2[] = [...map.circuit.gates.values()].map(g => gateCenter(g));
  const state = editor.getState();
  state.camera.pos = Vec2.avg(points);
  state.gateStatuses = map.gateStatuses;
  state.circuitDirty = false;

  return editor;
}

export function exportLevelMap(circuit: Circuit): void {
  // Strip runtime fields from gates so export matches the clean format
  const STRIP_FIELDS = new Set(['value', 'register', 'canRemove', 'canMove', 'label']);
  const data = {
    version: 1,
    gates: [...circuit.gates.entries()].map(([id, g]) => {
      const { id: _, ...rest } = g;
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (STRIP_FIELDS.has(k)) continue;
        if (k === 'rotation' && v === 0) continue; // default rotation
        cleaned[k] = v;
      }
      return [id as string, cleaned];
    }),
    wireNodes: [...circuit.wireNodes.entries()].map(([id, n]) => {
      const { id: _, ...rest } = n;
      return [id as string, rest];
    }),
    wireSegments: [...circuit.wireSegments.entries()].map(([id, s]) => {
      const { id: _, ...rest } = s;
      return [id as string, rest];
    }),
  };

  const json = JSON.stringify(data);
  console.log('// Paste into src/circuit-builder/levels/levelMapData.ts:');
  console.log(`export const LEVEL_MAP_CIRCUIT = ${json} as unknown as SerializedCircuit;`);
}

export function hitTestLevel(
  state: EditorState,
  levelGateMap: LevelGateMap,
  levels: Level[],
  solvedIds: Set<LevelId>,
  x: number,
  y: number,
): number | null {
  for (const gate of state.circuit.gates.values()) {
    if (!hitTestGate_({x, y}, gate)) continue;

    const levelId = gateIdToLevelId(gate.id, levelGateMap);
    if (!levelId) continue;
    const levelIdx = levels.findIndex(l => l.id === levelId);
    if (levelIdx < 0) continue;
    const level = levels[levelIdx];
    if (!isLevelUnlocked(level, solvedIds)) continue;
    return levelIdx;
  }
  return null;
}
