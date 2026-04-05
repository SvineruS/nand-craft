import { useEffect, useRef } from 'preact/hooks';
import { getEditor, hasEditor } from '../../circuit-builder/editorInstance.ts';
import { Renderer } from '../../circuit-builder/editor/render/Renderer.ts';
import { CanvasInput } from '../../engine/input.ts';
import { notifyStateChange, solvedLevelIds } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import {
  buildLevelMap,
  getLevelGateMap,
  getLevelMapState,
  hitTestLevel,
  loadLevel,
} from '../../circuit-builder/levels/levelManager.ts';
import { LEVELS } from '../../circuit-builder/levels/registry.ts';
import { getSolvedLevelIds, markLevelSolved } from '../../circuit-builder/persistence/storage.ts';

export function LevelSelectScreen() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;

    // Save current circuit before showing level map
    if (hasEditor()) {
      const editor = getEditor();
      editor.save();
    }

    // Build level map state (persistent in levelManager)
    buildLevelMap();
    const levelMapState = getLevelMapState()!;

    // Canvas
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    // Renderer + render loop
    const renderer = new Renderer(canvas);
    renderer.startLoop(() => levelMapState);

    // Input — click to select level, middle-click to pan
    const input = new CanvasInput(canvas, {
      onPointerUp(e) {
        const idx = hitTestLevel(levelMapState, getLevelGateMap(), LEVELS, solvedLevelIds.value, e.world.x, e.world.y);
        if (idx !== null) {
          loadLevel(idx);
          navigateTo('editor');
        }
      },
    }, {
      getCamera: () => levelMapState.camera,
      onCameraChange() { levelMapState.renderDirty = true; },
      shouldPan: (e) => e.button === 1,
    });
    input.attach();

    // Resize
    const onResize = () => { levelMapState.renderDirty = true; };
    window.addEventListener('resize', onResize);

    return () => {
      renderer.stopLoop();
      input.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

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
        <button class="toolbar-btn" onClick={() => navigateTo('levelMapEditor')}>Edit Map</button>
      </div>
      <div class="main-row">
        <div id="editor-container" ref={containerRef} />
      </div>
    </>
  );
}
