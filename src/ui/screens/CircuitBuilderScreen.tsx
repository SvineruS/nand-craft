import { useEffect, useMemo } from 'preact/hooks';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import type { Editor } from '../../circuit-builder/editor/Editor.ts';
import { createLevelEditor } from '../../circuit-builder/levels/levelManager.ts';
import { Toolbar } from '../components/Toolbar.tsx';
import { Sidebar } from '../components/Sidebar.tsx';
import { TestPanel } from '../components/TestPanel.tsx';
import { LevelDialog } from '../components/LevelDialog.tsx';
import { LevelCompleteDialog } from '../components/LevelCompleteDialog.tsx';
import { TestEditorDialog } from '../components/TestEditorDialog.tsx';
import { useEditorCallbacks } from '../useEditorCallbacks.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import { EditorContext } from '../editorContext.ts';
import { notifyStateChange, openLevelIndex, saveError } from '../editorStore.ts';
import { switchToLevelMap } from '../screenManager.ts';

const AUTOSAVE_INTERVAL_MS = 30_000;

export function CircuitBuilderScreen() {
  const levelIndex = openLevelIndex.value ?? 0;
  // This screen owns the Editor: built for the requested level, discarded on unmount.
  const editor = useMemo(() => createLevelEditor(levelIndex), [levelIndex]);

  return (
    <EditorContext.Provider value={editor}>
      <CircuitBuilder editor={editor} />
    </EditorContext.Provider>
  );
}

/** Inner component so the toolbar, sidebar and panels can useEditor() from context. */
function CircuitBuilder({ editor }: { editor: Editor }) {
  const cb = useEditorCallbacks();

  const containerRef = useCanvasEditor({
    getState: () => editor.getState(),
    createInput: (canvas) => new InputHandler(
      canvas,
      () => editor.getState(),
      () => editor.getHistory(),
    ),
    onCircuitDirty: () => {
      editor.onCircuitChanged();
      notifyStateChange();
    },
    onValueDirty: () => {
      editor.retick();
      notifyStateChange();
    },
    onStateChanged: () => notifyStateChange(),
    onTeardown: () => {
      save(editor);
      editor.tests.cancelRunAll();
    },
  });

  // Auto-save: periodically, when the tab is hidden, and when it closes
  useEffect(() => {
    const saveNow = () => save(editor);
    const onVisibilityChange = () => { if (document.hidden) saveNow(); };
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(saveNow, AUTOSAVE_INTERVAL_MS);

    return () => {
      window.removeEventListener('beforeunload', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, [editor]);

  return (
    <>
      <Toolbar
        onUndo={cb.handleUndo}
        onRedo={cb.handleRedo}
        onColorChange={cb.handleColorChange}
        onShowLevels={cb.handleShowLevels}
        onMenu={cb.handleMenu}
        onResetLevel={cb.handleResetLevel}
      />
      <div class="main-row">
        <TestPanel
          onReset={cb.handleReset}
          onStep={cb.handleStep}
          onRunAll={cb.handleRunAll}
          onPause={cb.handlePause}
          onExecuteCommand={cb.handleExecuteCommand}
        />
        <div id="editor-container" ref={containerRef}/>
        <Sidebar onDragEnd={cb.handleDragEnd}/>
      </div>
      <LevelDialog/>
      <TestEditorDialog/>
      {cb.showLevelComplete && (
        <LevelCompleteDialog
          onLevelMap={() => {
            switchToLevelMap();
            cb.setShowLevelComplete(false);
          }}
          onClose={() => cb.setShowLevelComplete(false)}
        />
      )}
    </>
  );
}

/** Save, surfacing a storage failure in the toolbar rather than swallowing it. */
function save(editor: Editor): void {
  const error = editor.save();
  if (error !== saveError.peek()) saveError.value = error;
}
