import type { Editor } from '../circuit-builder/editor/Editor.ts';
import { CanvasInput } from '../engine/input.ts';
import { LEVELS } from '../circuit-builder/levels/registry.ts';
import { hitTestLevel, loadLevel, buildLevelMap, getLevelMapState, getLevelGateMap } from '../circuit-builder/levels/levelManager.ts';
import { saveCircuit } from '../circuit-builder/persistence/storage.ts';
import {
  currentLevel,
  viewMode,
  solvedLevelIds,
  notifyStateChange,
} from './editorStore.ts';

let mapInput: CanvasInput | null = null;

export function attachMapInput(editor: Editor, canvas: HTMLCanvasElement): void {
  detachMapInput();
  const levelMapState = getLevelMapState();
  if (!levelMapState) return;

  mapInput = new CanvasInput(canvas, {
    onPointerUp(e) {
      const idx = hitTestLevel(levelMapState!, getLevelGateMap(), LEVELS, solvedLevelIds.value, e.world.x, e.world.y);
      if (idx !== null) {
        loadLevel(editor, idx);
        detachMapInput();
        editor.setStateOverride(null);
        editor.attachInput();
        viewMode.value = 'editor';
        notifyStateChange();
      }
    },
  }, {
    getCamera: () => levelMapState!.camera,
    onCameraChange() { if (levelMapState) levelMapState.renderDirty = true; },
    shouldPan: (e) => e.button === 1,
  });
  mapInput.attach();
}

export function detachMapInput(): void {
  if (mapInput) {
    mapInput.detach();
    mapInput = null;
  }
}

export function switchToLevelMap(editor: Editor): void {
  if (viewMode.value === 'editor' && currentLevel.value) {
    saveCircuit(currentLevel.value.id, editor.getCircuit());
  }

  buildLevelMap();
  viewMode.value = 'levelSelect';
  editor.detachInput();
  editor.setStateOverride(getLevelMapState());

  const canvas = editor.getCanvas();
  if (canvas) attachMapInput(editor, canvas);

  notifyStateChange();
}

export function switchToEditor(editor: Editor): void {
  detachMapInput();
  viewMode.value = 'editor';
  editor.attachInput();
  editor.setStateOverride(null);
  notifyStateChange();
}
