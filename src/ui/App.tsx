import { useEffect, useRef } from 'preact/hooks';
import { Editor } from '../editor/Editor.ts';
import { Toolbar } from './Toolbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TestPanel } from './TestPanel.tsx';
import { LevelDialog } from './LevelDialog.tsx';
import { LevelCompleteDialog } from './LevelCompleteDialog.tsx';
import { MainMenuScreen } from './screens/MainMenuScreen.tsx';
import { SettingsScreen } from './screens/SettingsScreen.tsx';
import { FactoryScreen } from './screens/FactoryScreen.tsx';
import { useEditorCallbacks } from './useEditorCallbacks.ts';
import {
  setStateGetter,
  notifyStateChange,
  viewMode,
} from './editorStore.ts';
import {
  simulateFirstCase,
  cancelRunAll,
  suppressSimulate,
  resetSuppressSimulate,
} from './testRunner.ts';
import {
  buildLevelMap,
  getLevelMapState,
  attachMapInput,
  detachMapInput,
  switchToLevelMap,
} from './levelManager.ts';
import '../style.css';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function App() {
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cb = useEditorCallbacks(editorRef);

  // Create editor once
  useEffect(() => {
    const container = containerRef.current!;
    const editor = new Editor(container);
    editorRef.current = editor;

    editor.detachInput();
    setStateGetter(() => editor.getState());

    editor.onCircuitChange = () => {
      if (suppressSimulate) {
        resetSuppressSimulate();
      } else {
        simulateFirstCase(editor);
      }
      notifyStateChange();
    };

    return () => {
      cancelRunAll();
      detachMapInput();
      editor.destroy();
    };
  }, []);

  // Configure editor when view mode changes
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    const mode = viewMode.value;
    if (mode === 'levelSelect') {
      buildLevelMap();
      editor.setStateOverride(getLevelMapState());
      editor.detachInput();
      attachMapInput(editor, editor.getCanvas());
      notifyStateChange();
    }
  }, [viewMode.value]);

  const mode = viewMode.value;
  const isCanvasScreen = mode === 'editor' || mode === 'levelSelect';

  return (
    <>
      {mode === 'mainMenu' && <MainMenuScreen />}
      {mode === 'factory' && <FactoryScreen />}
      {mode === 'settings' && <SettingsScreen />}

      {isCanvasScreen && (
        <Toolbar
          onUndo={cb.handleUndo}
          onRedo={cb.handleRedo}
          onColorChange={cb.handleColorChange}
          onShowLevels={cb.handleShowLevels}
          onMenu={cb.handleMenu}
          onResetLevel={cb.handleResetLevel}
        />
      )}
      <div class="main-row" style={isCanvasScreen ? undefined : { display: 'none' }}>
        {mode === 'editor' && (
          <TestPanel
            onReset={cb.handleReset}
            onStep={cb.handleStep}
            onRunAll={cb.handleRunAll}
            onExecuteCommand={cb.handleExecuteCommand}
          />
        )}
        <div id="editor-container" ref={containerRef} />
        {mode === 'editor' && (
          <Sidebar onStamp={cb.handleStamp} onDragStart={cb.handleDragStart} onDragEnd={cb.handleDragEnd} />
        )}
      </div>
      {mode === 'editor' && <LevelDialog />}
      {cb.showLevelComplete && (
        <LevelCompleteDialog
          onLevelMap={() => { const e = editorRef.current; if (e) switchToLevelMap(e); cb.setShowLevelComplete(false); }}
          onClose={() => cb.setShowLevelComplete(false)}
        />
      )}
    </>
  );
}
