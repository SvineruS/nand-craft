import { useEffect } from 'preact/hooks';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import { Toolbar } from '../components/Toolbar.tsx';
import { Sidebar } from '../components/Sidebar.tsx';
import { TestPanel } from '../components/TestPanel.tsx';
import { LevelDialog } from '../components/LevelDialog.tsx';
import { LevelCompleteDialog } from '../components/LevelCompleteDialog.tsx';
import { TestEditorDialog } from '../components/TestEditorDialog.tsx';
import { useEditorCallbacks } from '../useEditorCallbacks.ts';
import { useCanvasEditor } from '../useCanvasEditor.ts';
import { notifyStateChange, saveError } from '../editorStore.ts';
import { switchToLevelMap } from '../screenManager.ts';

const AUTOSAVE_INTERVAL_MS = 30_000;

export function CircuitBuilderScreen() {
  const cb = useEditorCallbacks();

  const containerRef = useCanvasEditor({
    getState: () => getEditor().getState(),
    createInput: (canvas, renderer) => new InputHandler(
      canvas,
      () => getEditor().getState(),
      () => getEditor().getHistory(),
      renderer,
    ),
    onCircuitDirty: () => {
      getEditor().onCircuitChanged();
      notifyStateChange();
    },
    onValueDirty: () => {
      getEditor().retick();
      notifyStateChange();
    },
    onStateChanged: () => notifyStateChange(),
    onTeardown: () => {
      saveNow();
      getEditor().tests.cancelRunAll();
    },
  });

  // Auto-save: periodically, when the tab is hidden, and when it closes
  useEffect(() => {
    const onVisibilityChange = () => { if (document.hidden) saveNow(); };
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', onVisibilityChange);
    const interval = setInterval(saveNow, AUTOSAVE_INTERVAL_MS);

    return () => {
      window.removeEventListener('beforeunload', saveNow);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, []);

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
function saveNow(): void {
  const error = getEditor().save();
  if (error !== saveError.peek()) saveError.value = error;
}
