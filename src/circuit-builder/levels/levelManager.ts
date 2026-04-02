import { Editor } from '../editor/Editor.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { createEditorState } from '../editor/EditorState.ts';
import type { LevelId } from '../editor/types.ts';
import { gateCenter } from '../editor/utils/geometry.ts';
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

  const points: Vec2[] = [...circuit.gates.values()].map(g => gateCenter(g));
  const center = Vec2.avg(points);
  state.camera.pos = center;

  levelMapState = state;
  levelGateMap = levelGateMap_;
}

export function getLevelMapState(): EditorState | null {
  return levelMapState;
}

export function getLevelGateMap(): LevelGateMap {
  return levelGateMap;
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

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
