import { useEffect, useRef } from 'preact/hooks';
import { Renderer } from '../../circuit-builder/editor/render/Renderer.ts';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import { notifyStateChange } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { Sidebar } from '../components/Sidebar.tsx';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import {
  buildLevelMapEditable,
  exportLevelMap,
} from '../../circuit-builder/levels/levelManager.ts';
import { WIRE_COLORS } from '../../circuit-builder/editor/consts.ts';


export function LevelMapEditorScreen() {
  const containerRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  // Create editor before first render so Sidebar can access getEditor()
  if (!initialized.current) {
    buildLevelMapEditable();
    initialized.current = true;
  }

  useEffect(() => {
    const container = containerRef.current!;
    const editor = getEditor();

    // Canvas
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    // Renderer
    const renderer = new Renderer(canvas);
    renderer.startLoop(
      () => editor.getState(),
      () => { editor.onCircuitChanged(); notifyStateChange(); },
      undefined,
      () => notifyStateChange(),
    );

    // Input
    const input = new InputHandler(canvas, () => editor.getState(), () => editor.getHistory(), renderer);
    input.attach();

    editor.getState().renderDirty = true;

    const onResize = () => { editor.getState().renderDirty = true; };
    window.addEventListener('resize', onResize);

    return () => {
      renderer.stopLoop();
      input.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

  function handleUndo() { getEditor().undo(); notifyStateChange(); }
  function handleRedo() { getEditor().redo(); notifyStateChange(); }
  function handleExport() { exportLevelMap(); alert('Exported to console — check DevTools'); }
  function handleColorChange(color: string) { getEditor().getState().wireColor = color; notifyStateChange(); }
  function handleDragEnd() { getEditor().getState().mode = { kind: 'normal' }; }

  return (
    <>
      <div class="toolbar">
        <button class="toolbar-btn" onClick={() => navigateTo('levelSelect')}>
          Back
        </button>
        <button class="toolbar-btn" onClick={handleUndo}>Undo</button>
        <button class="toolbar-btn" onClick={handleRedo}>Redo</button>
        <div class="toolbar-spacer" />
        {WIRE_COLORS.map(color => (
          <button
            key={color}
            class="toolbar-btn color-btn"
            style={{ backgroundColor: color, width: '24px', height: '24px', minWidth: '24px', padding: 0, borderRadius: '4px' }}
            onClick={() => handleColorChange(color)}
          />
        ))}
        <div class="toolbar-spacer" />
        <button class="toolbar-btn" style={{ fontWeight: 'bold' }} onClick={handleExport}>
          Export
        </button>
      </div>
      <div class="main-row">
        <div id="editor-container" ref={containerRef} />
        <Sidebar onDragEnd={handleDragEnd} />
      </div>
    </>
  );
}
