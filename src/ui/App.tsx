import { useEffect, useRef, useCallback } from 'preact/hooks';
import { Editor } from '../editor/Editor.ts';
import { Toolbar } from './Toolbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TestPanel } from './TestPanel.tsx';
import { LevelDialog } from './LevelDialog.tsx';
import { LEVELS } from '../levels/registry.ts';
import type { GateId, GateType, TestResult } from '../types.ts';
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
  const runAllInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // -----------------------------------------------------------------------
  // Test case logic (decoupled from Editor — Editor just ticks, we check)
  // -----------------------------------------------------------------------

  function getWarning(): string | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const warnings: string[] = [];
    if (editor.hasShortCircuit()) warnings.push('Short circuit \u2014 feedback loop without delay gate');
    if (editor.hasContention()) warnings.push('Bus contention \u2014 multiple drivers on same net');
    return warnings.length > 0 ? warnings.join(' | ') : null;
  }

  /** Apply a test case: set inputs on live circuit, tick, check outputs. */
  function applyTestCase(caseIdx: number, resetDelay = false): TestResult {
    const editor = editorRef.current!;
    const level = LEVELS[currentLevelIndex.value];
    const cases = level.test.cases;
    if (!cases || !cases[caseIdx]) {
      return { passed: false, caseIndex: caseIdx, message: 'Case not found' };
    }

    const testCase = cases[caseIdx];
    const inputNames = level.inputs.map(i => i.name);
    const outputNames = level.outputs.map(o => o.name);
    const inputGateIds = editor.getInputGateIds();
    const outputGateIds = editor.getOutputGateIds();

    // Build input map from test case
    const inputs = new Map<GateId, number>();
    for (let j = 0; j < inputNames.length; j++) {
      const name = inputNames[j];
      if (name in testCase.inputs) {
        inputs.set(inputGateIds[j], testCase.inputs[name]);
      }
    }

    // Tick the live circuit
    editor.applyInputs(inputs, resetDelay);

    // Check outputs
    const actuals = editor.readOutputs(outputGateIds, outputNames);
    let passed = true;
    const mismatches: string[] = [];
    for (const name of outputNames) {
      if (!(name in testCase.expected)) continue;
      if (actuals[name] !== testCase.expected[name]) {
        passed = false;
        mismatches.push(`${name}: expected ${testCase.expected[name]}, got ${actuals[name]}`);
      }
    }

    return {
      passed,
      caseIndex: caseIdx,
      actuals,
      message: passed
        ? `All outputs correct`
        : mismatches.join('; '),
    };
  }

  function cancelRunAll(): void {
    if (runAllInterval.current !== null) {
      clearInterval(runAllInterval.current);
      runAllInterval.current = null;
    }
  }

  function simulateFirstCase(): void {
    cancelRunAll();
    if (!editorRef.current) return;
    testCaseIndex.value = 0;
    testResults.value = [];
    const result = applyTestCase(0, true);
    testResults.value = [result];
    warningText.value = getWarning();
  }

  function stepTestCase(): void {
    cancelRunAll();
    if (!editorRef.current) return;
    const level = LEVELS[currentLevelIndex.value];
    const cases = level.test.cases;
    if (!cases || cases.length === 0) return;

    let idx = testCaseIndex.value + 1;
    if (idx >= cases.length) {
      idx = 0;
      testResults.value = [];
    }
    testCaseIndex.value = idx;

    const result = applyTestCase(idx);
    const next = [...testResults.value];
    next[idx] = result;
    testResults.value = next;
    warningText.value = getWarning();
  }

  function runAllAnimated(): void {
    cancelRunAll();
    if (!editorRef.current) return;
    const level = LEVELS[currentLevelIndex.value];
    const cases = level.test.cases;
    if (!cases || cases.length === 0) return;

    // Reset to start
    testCaseIndex.value = 0;
    testResults.value = [];
    const results: TestResult[] = [];
    let idx = 0;

    // Run first case immediately
    const firstResult = applyTestCase(0, true);
    results[0] = firstResult;
    testResults.value = [...results];
    warningText.value = getWarning();
    idx = 1;

    if (idx >= cases.length) return;

    // Animate remaining cases at 5/sec
    runAllInterval.current = setInterval(() => {
      if (idx >= cases.length) {
        cancelRunAll();
        return;
      }
      testCaseIndex.value = idx;
      const result = applyTestCase(idx);
      results[idx] = result;
      testResults.value = [...results];
      warningText.value = getWarning();
      notifyStateChange();
      idx++;
    }, 200);
  }

  function resetTests(): void {
    simulateFirstCase();
  }

  function loadLevel(index: number): void {
    const editor = editorRef.current;
    if (!editor) return;
    cancelRunAll();
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

  const handleUndo = useCallback(() => { editorRef.current?.undo(); }, []);
  const handleRedo = useCallback(() => { editorRef.current?.redo(); }, []);
  const handleColorChange = useCallback((color: string) => {
    const editor = editorRef.current;
    if (editor) { editor.getState().wireColor = color; notifyStateChange(); }
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

  const handlePropChange = useCallback(() => { simulateFirstCase(); }, []);

  // -----------------------------------------------------------------------
  // Mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    const container = editorContainerRef.current!;
    const editor = new Editor(container);
    editorRef.current = editor;
    setStateGetter(() => editor.getState());

    editor.onCircuitChange = () => {
      simulateFirstCase();
      notifyStateChange();
    };

    loadLevel(0);

    return () => {
      cancelRunAll();
      editor.destroy();
    };
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
          onRunAll={runAllAnimated}
          onPropChange={handlePropChange}
        />
        <div id="editor-container" ref={editorContainerRef} />
        <Sidebar onStamp={handleStamp} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
      </div>
      <LevelDialog />
    </>
  );
}
