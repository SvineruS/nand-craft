import { Editor } from '../editor/Editor.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { createEditorState } from '../editor/EditorState.ts';
import type { GateId, LevelId } from '../editor/types.ts';
import { gateCenter } from '../editor/utils/geometry.ts';
import type { Circuit } from '../simulation/circuit.ts';
import type { LevelGateMap } from './levelMap.ts';
import { buildLevelMapCircuit, gateIdToLevelId } from './levelMap.ts';
import type { Level } from './levelTypes.ts';
import { LEVELS } from './registry.ts';
import { isLevelUnlocked, loadCircuit } from '../persistence/storage.ts';
import { getEditor, hasEditor, setEditor } from '../editorInstance.ts';
import {
  levelDialogVisible,
  notifyStateChange,
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

export function loadLevel(index: number): void {
  // Save previous level's circuit
  if (hasEditor()) {
    const prev = getEditor();
    prev.tests.cancelRunAll();
    prev.save();
  }

  const level = LEVELS[index];
  const savedCircuit = loadCircuit(level.id) ?? undefined;
  const editor = Editor.loadLevel(level, savedCircuit);

  setEditor(editor);

  levelDialogVisible.value = true;
  notifyStateChange();
}

export function buildLevelMap(): void {
  const { circuit, levelGateMap: levelGateMap_ } = buildLevelMapCircuit(LEVELS, solvedLevelIds.value);
  const state = createEditorState();
  state.circuit = circuit;
  state.circuitDirty = false;

  state.camera.pos = findLeftmostAvailable(circuit);

  // Add component nodes below levels
  addComponentNodes(circuit);

  levelMapState = state;
  levelGateMap = levelGateMap_;
}

/** Add saved component gates to the level map for display. */
function addComponentNodes(circuit: Circuit): void {
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
    circuit.gates.set(gateId, {
      id: gateId,
      type: 'level', // Reuse level gate type for display
      pos: { x: startX + i * 160, y: startY },
      rotation: 0,
      label: comp.name,
      state: 'available', // Always accessible
    });
  }
}

/** Find center of the leftmost available (unlocked, unsolved) level gate. Falls back to center of all gates. */
function findLeftmostAvailable(circuit: Circuit): Vec2 {
  let best: { pos: Vec2; x: number } | null = null;
  const all: Vec2[] = [];

  for (const gate of circuit.gates.values()) {
    if (gate.type !== 'level') continue;
    const center = gateCenter(gate);
    all.push(center);
    if (gate.state === 'available') {
      if (!best || center.x < best.x) {
        best = { pos: center, x: center.x };
      }
    }
  }

  if (best) return best.pos;
  return all.length > 0 ? Vec2.avg(all) : { x: 0, y: 0 };
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

export function buildLevelMapEditable(): void {
  if (hasEditor()) getEditor().save();

  const { circuit } = buildLevelMapCircuit(LEVELS, solvedLevelIds.value, true);
  const editor = Editor.create(circuit);

  const points: Vec2[] = [...circuit.gates.values()].map(g => gateCenter(g));
  const center = Vec2.avg(points);
  editor.getState().camera.pos = center;
  editor.getState().circuitDirty = false;

  setEditor(editor);
}

export function exportLevelMap(): void {
  if (!hasEditor()) return;
  const circuit = getEditor().getCircuit();

  // Strip runtime fields from gates so export matches the clean format
  const STRIP_FIELDS = new Set(['state', 'canRemove', 'canMove', 'inputValues', 'outputValues', 'label']);
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
