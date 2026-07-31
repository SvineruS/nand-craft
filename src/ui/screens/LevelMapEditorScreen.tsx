import { useRef } from 'preact/hooks';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
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
  const initialized = useRef(false);

  // Create editor before first render so Sidebar can access getEditor()
  if (!initialized.current) {
    buildLevelMapEditable();
    initialized.current = true;
  }

  const containerRef = useCanvasEditor({
    getState: () => getEditor().getState(),
    createInput: (canvas, renderer) => new InputHandler(
      canvas,
      () => getEditor().getState(),
      () => getEditor().getHistory(),
      renderer,
    ),
    onCircuitDirty: () => { getEditor().onCircuitChanged(); notifyStateChange(); },
    onStateChanged: () => notifyStateChange(),
  });

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
