import { useEffect, useRef, useCallback } from 'preact/hooks';
import { Editor } from '../editor/Editor.ts';
import { Toolbar } from './Toolbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TestPanel } from './TestPanel.tsx';
import { LevelDialog } from './LevelDialog.tsx';
import { LEVELS } from '../levels/registry.ts';
import type { GateType, TestResult } from '../types.ts';
import {
  setStateGetter,
  notifyStateChange,
  currentLevel,
  currentLevelIndex,
  testResults,
  testCaseIndex,
  warningText,
  levelDialogVisible,
} from './editorStore.ts';
import '../style.css';

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function App() {
  const editorRef = useRef<Editor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // RAF-debounce flag for circuit change callback
  const resimScheduled = useRef(false);

  // -----------------------------------------------------------------------
  // Helpers (closed over editorRef)
  // -----------------------------------------------------------------------

  function getWarning(): string | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const warnings: string[] = [];
    if (editor.hasShortCircuit()) warnings.push('Short circuit \u2014 feedback loop without delay gate');
    if (editor.hasContention()) warnings.push('Bus contention \u2014 multiple drivers on same net');
    return warnings.length > 0 ? warnings.join(' | ') : null;
  }

  function simulateFirstCase(): void {
    const editor = editorRef.current;
    if (!editor) return;
    const level = LEVELS[currentLevelIndex.value];
    testCaseIndex.value = 0;
    testResults.value = [];
    const result = editor.runSingleCase(level, 0, true);
    testResults.value = [result];
    warningText.value = getWarning();
  }

  function stepTestCase(): void {
    const editor = editorRef.current;
    if (!editor) return;
    const level = LEVELS[currentLevelIndex.value];
    const cases = level.test.cases;
    if (!cases || cases.length === 0) return;

    let idx = testCaseIndex.value + 1;
    if (idx >= cases.length) {
      idx = 0;
      testResults.value = [];
    }
    testCaseIndex.value = idx;

    const result = editor.runSingleCase(level, idx);
    const next = [...testResults.value];
    next[idx] = result;
    testResults.value = next;
    warningText.value = getWarning();
  }

  function runAllCases(): void {
    const editor = editorRef.current;
    if (!editor) return;
    const level = LEVELS[currentLevelIndex.value];
    const results: TestResult[] = editor.runTests(level);
    testResults.value = results;
    testCaseIndex.value = results.length - 1;
  }

  function resetTests(): void {
    simulateFirstCase();
  }

  function loadLevel(index: number): void {
    const editor = editorRef.current;
    if (!editor) return;
    currentLevelIndex.value = index;
    testCaseIndex.value = -1;
    testResults.value = [];
    const level = LEVELS[index];
    currentLevel.value = level;
    editor.loadLevel(level);
    simulateFirstCase();
    levelDialogVisible.value = true;
  }

  // -----------------------------------------------------------------------
  // Toolbar callbacks
  // -----------------------------------------------------------------------

  const handleUndo = useCallback(() => {
    editorRef.current?.undo();
  }, []);

  const handleRedo = useCallback(() => {
    editorRef.current?.redo();
  }, []);

  const handleColorChange = useCallback((color: string) => {
    const editor = editorRef.current;
    if (editor) {
      editor.getState().wireColor = color;
      notifyStateChange();
    }
  }, []);

  const handleLevelDialogStart = useCallback(() => {
    // visibility already toggled inside LevelDialog component
  }, []);

  // -----------------------------------------------------------------------
  // Sidebar callbacks (stable via useCallback + editorRef)
  // -----------------------------------------------------------------------

  const handleStamp = useCallback((type: GateType) => {
    const editor = editorRef.current;
    if (!editor) return;
    const state = editor.getState();
    state.stampGateType = type;
    state.pasteMode = false;
    state.dirty = true;
  }, []);

  const handleDragStart = useCallback((type: GateType) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getState().stampGateType = type;
  }, []);

  const handleDragEnd = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.getState().stampGateType = null;
  }, []);

  const handlePropChange = useCallback(() => {
    simulateFirstCase();
  }, []);

  // -----------------------------------------------------------------------
  // Mount everything once
  // -----------------------------------------------------------------------

  useEffect(() => {
    const container = editorContainerRef.current!;

    // --- Editor ---
    const editor = new Editor(container);
    editorRef.current = editor;
    setStateGetter(() => editor.getState());

    // --- Circuit change callback (debounced via rAF) ---
    editor.onCircuitChange = () => {
      if (!resimScheduled.current) {
        resimScheduled.current = true;
        requestAnimationFrame(() => {
          resimScheduled.current = false;
          simulateFirstCase();
          notifyStateChange();
        });
      }
    };

    // --- Per-frame state sync for reactive components ---
    let animating = true;
    function updateUI(): void {
      if (!animating) return;
      notifyStateChange();
      requestAnimationFrame(updateUI);
    }
    requestAnimationFrame(updateUI);

    // --- Load first level ---
    loadLevel(0);

    // --- Cleanup ---
    return () => {
      animating = false;
      editor.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <>
      <Toolbar onUndo={handleUndo} onRedo={handleRedo} onColorChange={handleColorChange} />
      <div class="main-row">
        <TestPanel
          onReset={resetTests}
          onStep={stepTestCase}
          onRunAll={runAllCases}
          onPropChange={handlePropChange}
        />
        <div id="editor-container" ref={editorContainerRef} />
        <Sidebar onStamp={handleStamp} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
      </div>
      <LevelDialog onStart={handleLevelDialogStart} />
    </>
  );
}
