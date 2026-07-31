import { useEffect, useRef } from 'preact/hooks';
import { CanvasInput } from '../../engine/input.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import type { EditorState } from '../../circuit-builder/editor/EditorState.ts';
import { notifyStateChange, solvedLevelIds } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { openComponentEditor, editComponent } from '../componentNav.ts';
import { hitTestGate_ } from '../../circuit-builder/editor/utils/hitTests.ts';
import type { ComponentId } from '../../circuit-builder/editor/types.ts';
import {
  buildLevelMap,
  getLevelGateMap,
  getLevelMapState,
  hitTestLevel,
  requestLevel,
} from '../../circuit-builder/levels/levelManager.ts';
import { LEVELS } from '../../circuit-builder/levels/registry.ts';
import { getSolvedLevelIds, markLevelSolved } from '../../circuit-builder/persistence/storage.ts';

export function LevelSelectScreen() {
  // The level map is a plain EditorState, not an Editor: it is displayed, never edited.
  const mapState = useRef<EditorState | null>(null);

  // Declared before useCanvasEditor so it runs first — effects fire in declaration order,
  // and the canvas loop reads mapState as soon as it starts.
  useEffect(() => {
    buildLevelMap();
    mapState.current = getLevelMapState()!;
  }, []);

  const containerRef = useCanvasEditor({
    getState: () => mapState.current!,
    // Click to select a level or open a component; middle-click to pan.
    createInput: (canvas) => new CanvasInput(canvas, {
      onPointerUp(e) {
        const state = mapState.current!;
        // Check for component node clicks first
        for (const gate of state.circuit.gates.values()) {
          if (!hitTestGate_({ x: e.world.x, y: e.world.y }, gate)) continue;
          const id = gate.id as string;
          if (id.startsWith('cmp:')) {
            editComponent(id.slice(4) as ComponentId);
            return;
          }
        }
        // Then check level clicks
        const idx = hitTestLevel(state, getLevelGateMap(), LEVELS, solvedLevelIds.value, e.world.x, e.world.y);
        if (idx !== null) {
          requestLevel(idx);
          navigateTo('editor');
        }
      },
    }, {
      getCamera: () => mapState.current!.camera,
      onCameraChange() { mapState.current!.renderDirty = true; },
      shouldPan: (e) => e.button === 1,
    }),
  });

  return (
    <>
      <div class="toolbar">
        <button class="toolbar-btn" onClick={() => navigateTo('mainMenu')}>Menu</button>
        <button class="toolbar-btn" style={{ fontWeight: 'bold' }}>Levels</button>
        <div class="toolbar-spacer" />
        <button class="toolbar-btn" onClick={() => {
          for (const level of LEVELS) markLevelSolved(level.id);
          solvedLevelIds.value = getSolvedLevelIds();
          buildLevelMap();
          notifyStateChange();
        }}>Unlock All</button>
        <button class="toolbar-btn" onClick={() => openComponentEditor()}>Create Circuit</button>
        <button class="toolbar-btn" onClick={() => navigateTo('levelMapEditor')}>Edit Map</button>
      </div>
      <div class="main-row">
        <div id="editor-container" ref={containerRef} />
      </div>
    </>
  );
}
