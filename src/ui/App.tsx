import { useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { Editor } from '../editor/Editor.ts';
import { Toolbar } from './Toolbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TestPanel } from './TestPanel.tsx';
import { LevelDialog } from './LevelDialog.tsx';
import { LevelCompleteDialog } from './LevelCompleteDialog.tsx';
import type { GateType } from '../types.ts';
import {
  setStateGetter,
  notifyStateChange,
  currentLevel,
  viewMode,
} from './editorStore.ts';
import {
  simulateFirstCase,
  stepTestCase,
  runAllAnimated,
  resetTests,
  cancelRunAll,
  suppressSimulate,
  resetSuppressSimulate,
} from './testRunner.ts';
import {
  buildLevelMap,
  getLevelMapState,
  switchToLevelMap,
  switchToEditor,
  handleLevelMapClick,
} from './levelManager.ts';
import '../style.css';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function App() {
  const editorRef = useRef<Editor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  const onLevelComplete = useCallback(() => setShowLevelComplete(true), []);

  // -----------------------------------------------------------------------
  // Toolbar callbacks
  // -----------------------------------------------------------------------

  const handleUndo = useCallback(() => { editorRef.current?.undo(); }, []);
  const handleRedo = useCallback(() => { editorRef.current?.redo(); }, []);
  const handleColorChange = useCallback((color: string) => {
    const editor = editorRef.current;
    if (editor) { editor.getState().wireColor = color; notifyStateChange(); }
  }, []);
  const handleShowLevels = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (viewMode.value === 'levelMap') {
      if (currentLevel.value) switchToEditor(editor);
    } else {
      switchToLevelMap(editor);
    }
  }, []);
  const handleResetLevel = useCallback(() => {
    const editor = editorRef.current;
    const level = currentLevel.value;
    if (!editor || !level) return;
    editor.loadLevel(level);
    simulateFirstCase(editor);
  }, []);

  // -----------------------------------------------------------------------
  // Sidebar callbacks
  // -----------------------------------------------------------------------

  const handleStamp = useCallback((type: GateType) => {
    const editor = editorRef.current;
    if (!editor) return;
    const state = editor.getState();
    state.mode = { kind: 'stamping', gateType: type };
    state.renderDirty = true;
  }, []);

  const handleDragStart = useCallback((type: GateType) => {
    const editor = editorRef.current;
    if (editor) editor.getState().mode = { kind: 'stamping', gateType: type };
  }, []);

  const handleDragEnd = useCallback(() => {
    const editor = editorRef.current;
    if (editor) editor.getState().mode = { kind: 'normal' };
  }, []);

  const handleExecuteCommand = useCallback((cmd: import('../editor/CommandHistory.ts').Command) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeCommand(cmd);
    simulateFirstCase(editor);
  }, []);

  // -----------------------------------------------------------------------
  // Test panel callbacks
  // -----------------------------------------------------------------------

  const handleReset = useCallback(() => {
    const editor = editorRef.current;
    if (editor) resetTests(editor);
  }, []);

  const handleStep = useCallback(() => {
    const editor = editorRef.current;
    if (editor) stepTestCase(editor, onLevelComplete);
  }, []);

  const handleRunAll = useCallback(() => {
    const editor = editorRef.current;
    if (editor) runAllAnimated(editor, onLevelComplete);
  }, []);

  // -----------------------------------------------------------------------
  // Mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    const container = editorContainerRef.current!;
    const editor = new Editor(container);
    editorRef.current = editor;

    // Start in level map mode
    buildLevelMap();
    editor.setStateOverride(getLevelMapState());
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

    // Click handler for level map
    const canvas = container.querySelector('canvas');
    const clickHandler = (e: MouseEvent) => {
      if (canvas) handleLevelMapClick(editor, e, canvas);
    };
    if (canvas) {
      canvas.addEventListener('click', clickHandler);
    }

    return () => {
      cancelRunAll();
      if (canvas) canvas.removeEventListener('click', clickHandler);
      editor.destroy();
    };
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  const isMapView = viewMode.value === 'levelMap';
  return (
    <>
      <Toolbar onUndo={handleUndo} onRedo={handleRedo} onColorChange={handleColorChange} onShowLevels={handleShowLevels} onResetLevel={handleResetLevel} />
      <div class="main-row">
        {!isMapView && (
          <TestPanel
            onReset={handleReset}
            onStep={handleStep}
            onRunAll={handleRunAll}
            onExecuteCommand={handleExecuteCommand}
          />
        )}
        <div id="editor-container" ref={editorContainerRef} />
        {!isMapView && (
          <Sidebar onStamp={handleStamp} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
        )}
      </div>
      {!isMapView && <LevelDialog />}
      {showLevelComplete && <LevelCompleteDialog onLevelMap={() => { const e = editorRef.current; if (e) switchToLevelMap(e); setShowLevelComplete(false); }} onClose={() => setShowLevelComplete(false)} />}
    </>
  );
}
