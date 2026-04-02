import { useEffect, useRef } from 'preact/hooks';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import { Renderer } from '../../circuit-builder/editor/render/Renderer.ts';
import { CanvasInput } from '../../engine/input.ts';
import { Toolbar } from '../components/Toolbar.tsx';
import { viewMode, notifyStateChange, solvedLevelIds, currentLevel } from '../editorStore.ts';
import {
  buildLevelMap,
  getLevelMapState,
  getLevelGateMap,
  hitTestLevel,
  loadLevel,
} from '../../circuit-builder/levels/levelManager.ts';
import { LEVELS } from '../../circuit-builder/levels/registry.ts';
import { saveCircuit } from '../../circuit-builder/persistence/storage.ts';

export function LevelSelectScreen() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;
    const editor = getEditor();

    // Save current circuit before showing level map
    if (currentLevel.value) {
      saveCircuit(currentLevel.value.id, editor.getCircuit());
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
          loadLevel(editor, idx);
          viewMode.value = 'editor';
          notifyStateChange();
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
      <Toolbar
        onShowLevels={() => {
          if (currentLevel.value) {
            viewMode.value = 'editor';
            notifyStateChange();
          }
        }}
        onMenu={() => { viewMode.value = 'mainMenu'; notifyStateChange(); }}
      />
      <div class="main-row">
        <div id="editor-container" ref={containerRef} />
      </div>
    </>
  );
}
