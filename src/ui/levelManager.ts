import type { Editor } from '../editor/Editor.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { createEditorState } from '../editor/EditorState.ts';
import { getGateDims } from '../editor/utils/geometry.ts';
import { LEVELS } from '../levels/registry.ts';
import { buildLevelMapCircuit, gateIdToLevelId } from '../levels/levelMap.ts';
import type { LevelGateMap } from '../levels/levelMap.ts';
import type { Circuit } from '../editor/circuit.ts';
import type { Level } from '../types.ts';
import {
  currentLevel,
  currentLevelIndex,
  testCaseIndex,
  testResults,
  levelDialogVisible,
  viewMode,
  solvedLevelIds,
  notifyStateChange,
} from './editorStore.ts';
import { saveCircuit, loadCircuit, isLevelUnlocked } from '../persistence/storage.ts';
import { simulateFirstCase, cancelRunAll } from './testRunner.ts';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let levelMapState: EditorState | null = null;
let levelGateMap: LevelGateMap = new Map();

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Check that a saved circuit contains the expected predefined gates (by type+label). */
function hasPredefinedGates(level: Level, circuit: Circuit): boolean {
  if (!level.predefinedGates || level.predefinedGates.length === 0) return true;
  for (const pg of level.predefinedGates) {
    let found = false;
    for (const gate of circuit.gates.values()) {
      if (gate.type === pg.type && gate.label === pg.label) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

export function loadLevel(editor: Editor, index: number): void {
  // Auto-save current level's circuit
  const prevLevel = currentLevel.value;
  if (prevLevel) {
    saveCircuit(prevLevel.id, editor.getCircuit());
  }

  cancelRunAll();
  currentLevelIndex.value = index;
  testCaseIndex.value = -1;
  testResults.value = [];
  const level = LEVELS[index];
  currentLevel.value = level;

  // Try to load saved circuit, but validate predefined gates are present
  const savedCircuit = loadCircuit(level.id);
  if (savedCircuit && hasPredefinedGates(level, savedCircuit)) {
    editor.loadCircuitFromSave(savedCircuit);
  } else {
    editor.loadLevel(level);
  }

  // Switch to editor view (clear override, reattach input)
  editor.setStateOverride(null);
  editor.attachInput();
  viewMode.value = 'editor';
  simulateFirstCase(editor);
  levelDialogVisible.value = true;
  notifyStateChange();
}

export function buildLevelMap(): void {
  const solved = solvedLevelIds.value;
  const { circuit, levelGateMap: gateMap } = buildLevelMapCircuit(LEVELS, solved);
  const mapState = createEditorState();
  mapState.circuit = circuit;
  mapState.circuitDirty = false;
  // Center camera on the map
  let cx = 0, cy = 0, count = 0;
  for (const gate of circuit.gates.values()) {
    const dims = getGateDims(gate);
    cx += gate.pos.x + dims.w / 2;
    cy += gate.pos.y + dims.h / 2;
    count++;
  }
  if (count > 0) {
    mapState.camera.pos = { x: cx / count, y: cy / count };
  }
  levelMapState = mapState;
  levelGateMap = gateMap;
}

export function getLevelMapState(): EditorState | null {
  return levelMapState;
}

export function switchToLevelMap(editor: Editor): void {
  // Auto-save if currently in editor
  if (viewMode.value === 'editor' && currentLevel.value) {
    saveCircuit(currentLevel.value.id, editor.getCircuit());
  }

  buildLevelMap();

  viewMode.value = 'levelMap';
  editor.detachInput();
  editor.setStateOverride(levelMapState);
  notifyStateChange();
}

export function switchToEditor(editor: Editor): void {
  viewMode.value = 'editor';
  editor.attachInput();
  editor.setStateOverride(null);
  notifyStateChange();
}

export function handleLevelMapClick(
  editor: Editor,
  e: MouseEvent,
  canvas: HTMLCanvasElement,
): void {
  if (viewMode.value !== 'levelMap') return;
  if (!levelMapState) return;

  // Convert screen → world
  const rect = canvas.getBoundingClientRect();
  const sx = e.clientX - rect.left;
  const sy = e.clientY - rect.top;
  const cam = levelMapState.camera;
  const wx = (sx - canvas.clientWidth / 2) / cam.zoom + cam.pos.x;
  const wy = (sy - canvas.clientHeight / 2) / cam.zoom + cam.pos.y;

  // Hit test gates
  for (const gate of levelMapState.circuit.gates.values()) {
    const dims = getGateDims(gate);
    if (wx >= gate.pos.x && wx <= gate.pos.x + dims.w && wy >= gate.pos.y && wy <= gate.pos.y + dims.h) {
      const levelId = gateIdToLevelId(gate.id, levelGateMap);
      if (!levelId) break;
      const levelIdx = LEVELS.findIndex(l => l.id === levelId);
      if (levelIdx < 0) break;
      const level = LEVELS[levelIdx];
      if (!isLevelUnlocked(level, solvedLevelIds.value)) break;
      loadLevel(editor, levelIdx);
      return;
    }
  }
}
