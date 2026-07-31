import { useMemo } from 'preact/hooks';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import type { Editor } from '../../circuit-builder/editor/Editor.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import { EditorContext, useEditor } from '../editorContext.ts';
import { notifyStateChange } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import { Sidebar } from '../components/Sidebar.tsx';
import {
  createLevelMapEditor,
  exportLevelMap,
} from '../../circuit-builder/levels/levelManager.ts';
import { WIRE_COLORS } from '../../circuit-builder/editor/consts.ts';


export function LevelMapEditorScreen() {
  // This screen owns the Editor over the level map graph.
  const editor = useMemo(() => createLevelMapEditor(), []);

  return (
    <EditorContext.Provider value={editor}>
      <LevelMapEditor />
    </EditorContext.Provider>
  );
}

function LevelMapEditor() {
  const editor: Editor = useEditor();

  const containerRef = useCanvasEditor({
    getState: () => editor.getState(),
    createInput: (canvas) => new InputHandler(
      canvas,
      () => editor.getState(),
      () => editor.getHistory(),
    ),
    onCircuitDirty: () => { editor.onCircuitChanged(); notifyStateChange(); },
    onStateChanged: () => notifyStateChange(),
  });

  function handleUndo() { editor.undo(); notifyStateChange(); }
  function handleRedo() { editor.redo(); notifyStateChange(); }
  function handleExport() {
    exportLevelMap(editor.getCircuit());
    alert('Exported to console — check DevTools');
  }
  function handleColorChange(color: string) { editor.getState().wireColor = color; notifyStateChange(); }
  function handleDragEnd() { editor.getState().mode = { kind: 'normal' }; }

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
