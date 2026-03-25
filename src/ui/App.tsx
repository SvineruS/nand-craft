import { useEffect, useRef, useCallback, useState } from 'preact/hooks';
import { Editor } from '../editor/Editor.ts';
import { Toolbar } from './Toolbar.tsx';
import { Sidebar } from './Sidebar.tsx';
import { TestPanel } from './TestPanel.tsx';
import { LevelDialog } from './LevelDialog.tsx';
import { LevelCompleteDialog } from './LevelCompleteDialog.tsx';
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
  viewMode,
  solvedLevelIds,
} from './editorStore.ts';
import { saveCircuit, loadCircuit, markLevelSolved, getSolvedLevelIds, isLevelUnlocked } from '../persistence/storage.ts';
import { buildLevelMapCircuit, gateIdToLevelId } from '../levels/levelMap.ts';
import type { LevelGateMap } from '../levels/levelMap.ts';
import { createEditorState } from '../editor/EditorState.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { getGateDims } from '../editor/geometry.ts';
import type { Circuit, Level } from '../types.ts';
import '../style.css';

/** Check that a saved circuit contains the expected predefined gates (by type+label). */
function hasPredefinedGates(level: Level, circuit: Circuit): boolean {
  if (!level.predefinedGates || level.predefinedGates.length === 0) return true;
  for (const pg of level.predefinedGates) {
    let found = false;
    for (const gate of circuit.gates.values()) {
      if (gate.type === pg.type && gate.label === pg.label) { found = true; break; }
    }
    if (!found) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

export function App() {
  const editorRef = useRef<Editor | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const runAllInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const suppressSimulate = useRef(false);
  const [showLevelComplete, setShowLevelComplete] = useState(false);

  // Level map state (built once, updated on view switch)
  const levelMapStateRef = useRef<EditorState | null>(null);
  const levelGateMapRef = useRef<LevelGateMap>(new Map());

  // -----------------------------------------------------------------------
  // Test case logic
  // -----------------------------------------------------------------------

  function getWarning(): string | null {
    const editor = editorRef.current;
    if (!editor) return null;
    const warnings: string[] = [];
    if (editor.hasShortCircuit()) warnings.push('Short circuit \u2014 feedback loop without delay gate');
    if (editor.hasContention()) warnings.push('Bus contention \u2014 multiple drivers on same net');
    return warnings.length > 0 ? warnings.join(' | ') : null;
  }

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

    const inputs = new Map<GateId, number>();
    for (let j = 0; j < inputNames.length; j++) {
      const name = inputNames[j];
      if (name in testCase.inputs) {
        inputs.set(inputGateIds[j], testCase.inputs[name]);
      }
    }

    editor.applyInputs(inputs, resetDelay);

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
      message: passed ? `All outputs correct` : mismatches.join('; '),
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
    if (!editorRef.current || !currentLevel.value) return;
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
    suppressSimulate.current = true;

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
    checkAllPassed(testResults.value);
    notifyStateChange();
  }

  function runAllAnimated(): void {
    cancelRunAll();
    if (!editorRef.current) return;
    const level = LEVELS[currentLevelIndex.value];
    const cases = level.test.cases;
    if (!cases || cases.length === 0) return;
    suppressSimulate.current = true;

    testCaseIndex.value = 0;
    testResults.value = [];
    const results: TestResult[] = [];
    let idx = 0;

    const firstResult = applyTestCase(0, true);
    results[0] = firstResult;
    testResults.value = [...results];
    warningText.value = getWarning();
    idx = 1;

    if (idx >= cases.length) {
      checkAllPassed(results);
      return;
    }

    runAllInterval.current = setInterval(() => {
      if (idx >= cases.length) {
        cancelRunAll();
        checkAllPassed(results);
        return;
      }
      testCaseIndex.value = idx;
      suppressSimulate.current = true;
      const result = applyTestCase(idx);
      results[idx] = result;
      testResults.value = [...results];
      warningText.value = getWarning();
      notifyStateChange();
      idx++;
    }, 200);
  }

  function checkAllPassed(results: TestResult[]): void {
    const level = currentLevel.value;
    if (!level) return;
    const cases = level.test.cases;
    if (!cases) return;
    const allPassed = results.length === cases.length && results.every(r => r.passed);
    if (allPassed) {
      markLevelSolved(level.id);
      solvedLevelIds.value = getSolvedLevelIds();
      setShowLevelComplete(true);
    }
  }

  function resetTests(): void {
    simulateFirstCase();
  }

  // -----------------------------------------------------------------------
  // Level loading
  // -----------------------------------------------------------------------

  function loadLevel(index: number): void {
    const editor = editorRef.current;
    if (!editor) return;

    // Auto-save current level's circuit
    const prevLevel = currentLevel.value;
    if (prevLevel) {
      saveCircuit(prevLevel.id, editor.getCircuit());
    }

    cancelRunAll();
    currentLevelIndex.value = index;
    testCaseIndex.value = -1;
    testResults.value = [];
    const level = LEVELS[index];
    currentLevel.value = level;

    // Try to load saved circuit, but validate predefined gates are present
    const savedCircuit = loadCircuit(level.id);
    if (savedCircuit && hasPredefinedGates(level, savedCircuit)) {
      editor.loadCircuitFromSave(savedCircuit);
    } else {
      editor.loadLevel(level);
    }

    // Switch to editor view (clear override, reattach input)
    editor.setStateOverride(null);
    editor.attachInput();
    viewMode.value = 'editor';
    simulateFirstCase();
    levelDialogVisible.value = true;
    notifyStateChange();
  }

  // -----------------------------------------------------------------------
  // Level map
  // -----------------------------------------------------------------------

  function buildLevelMap(): void {
    const solved = solvedLevelIds.value;
    const { circuit, levelGateMap } = buildLevelMapCircuit(LEVELS, solved);
    const mapState = createEditorState();
    mapState.circuit = circuit;
    mapState.circuitDirty = false;
    // Center camera on the map
    let cx = 0, cy = 0, count = 0;
    for (const gate of circuit.gates.values()) {
      const dims = getGateDims(gate);
      cx += gate.pos.x + dims.w / 2;
      cy += gate.pos.y + dims.h / 2;
      count++;
    }
    if (count > 0) {
      mapState.camera.pos = { x: cx / count, y: cy / count };
    }
    levelMapStateRef.current = mapState;
    levelGateMapRef.current = levelGateMap;
  }

  function switchToLevelMap(): void {
    const editor = editorRef.current;
    if (!editor) return;

    // Auto-save if currently in editor
    if (viewMode.value === 'editor' && currentLevel.value) {
      saveCircuit(currentLevel.value.id, editor.getCircuit());
    }

    // Build/update level map
    buildLevelMap();

    viewMode.value = 'levelMap';
    editor.detachInput();
    editor.setStateOverride(levelMapStateRef.current);
    notifyStateChange();
  }

  function switchToEditor(): void {
    const editor = editorRef.current;
    if (!editor) return;
    viewMode.value = 'editor';
    editor.attachInput();
    editor.setStateOverride(null);
    notifyStateChange();
  }

  function handleLevelMapClick(e: MouseEvent): void {
    if (viewMode.value !== 'levelMap') return;
    const mapState = levelMapStateRef.current;
    const editor = editorRef.current;
    if (!mapState || !editor) return;

    // Convert screen → world
    const canvas = editorContainerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const cam = mapState.camera;
    const wx = (sx - canvas.clientWidth / 2) / cam.zoom + cam.pos.x;
    const wy = (sy - canvas.clientHeight / 2) / cam.zoom + cam.pos.y;

    // Hit test gates
    for (const gate of mapState.circuit.gates.values()) {
      const dims = getGateDims(gate);
      if (wx >= gate.pos.x && wx <= gate.pos.x + dims.w && wy >= gate.pos.y && wy <= gate.pos.y + dims.h) {
        const levelId = gateIdToLevelId(gate.id, levelGateMapRef.current);
        if (!levelId) break;
        const levelIdx = LEVELS.findIndex(l => l.id === levelId);
        if (levelIdx < 0) break;
        const level = LEVELS[levelIdx];
        if (!isLevelUnlocked(level, solvedLevelIds.value)) break;
        loadLevel(levelIdx);
        return;
      }
    }
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
  const handleShowLevels = useCallback(() => {
    if (viewMode.value === 'levelMap') {
      if (currentLevel.value) switchToEditor();
    } else {
      switchToLevelMap();
    }
  }, []);
  const handleResetLevel = useCallback(() => {
    const editor = editorRef.current;
    const level = currentLevel.value;
    if (!editor || !level) return;
    editor.loadLevel(level);
    simulateFirstCase();
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
    simulateFirstCase();
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
    editor.setStateOverride(levelMapStateRef.current);
    editor.detachInput();
    setStateGetter(() => editor.getState());

    editor.onCircuitChange = () => {
      if (suppressSimulate.current) {
        suppressSimulate.current = false;
      } else {
        simulateFirstCase();
      }
      notifyStateChange();
    };

    // Click handler for level map
    const canvas = container.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', handleLevelMapClick);
    }

    return () => {
      cancelRunAll();
      if (canvas) canvas.removeEventListener('click', handleLevelMapClick);
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
            onReset={resetTests}
            onStep={stepTestCase}
            onRunAll={runAllAnimated}
            onExecuteCommand={handleExecuteCommand}
          />
        )}
        <div id="editor-container" ref={editorContainerRef} />
        {!isMapView && (
          <Sidebar onStamp={handleStamp} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
        )}
      </div>
      {!isMapView && <LevelDialog />}
      {showLevelComplete && <LevelCompleteDialog onLevelMap={switchToLevelMap} onClose={() => setShowLevelComplete(false)} />}
    </>
  );
}
