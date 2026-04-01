import type { Editor } from './Editor.ts';
import type { GateId } from './types.ts';
import type { Level, TestResult } from '../levels/levelTypes.ts';
import { LEVELS } from '../levels/registry.ts';
import {
  currentLevel,
  currentLevelIndex,
  testResults,
  testCaseIndex,
  warningText,
  solvedLevelIds,
  notifyStateChange,
} from '../ui/editorStore.ts';
import { markLevelSolved, getSolvedLevelIds } from '../persistence/storage.ts';

// ---------------------------------------------------------------------------
// Test case execution (pure domain logic)
// ---------------------------------------------------------------------------

function getWarning(editor: Editor): string | null {
  const warnings: string[] = [];
  if (editor.hasShortCircuit()) warnings.push('Short circuit \u2014 feedback loop without delay gate');
  if (editor.hasContention()) warnings.push('Bus contention \u2014 multiple drivers on same net');
  return warnings.length > 0 ? warnings.join(' | ') : null;
}

function applyTestCase(editor: Editor, level: Level, caseIdx: number, resetDelay = false): TestResult {
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
    message: passed ? 'All outputs correct' : mismatches.join('; '),
  };
}

function allTestsPassed(results: TestResult[], level: Level): boolean {
  const cases = level.test.cases;
  if (!cases) return false;
  return results.length === cases.length && results.every(r => r.passed);
}

// ---------------------------------------------------------------------------
// Test orchestration (signal-driven)
// ---------------------------------------------------------------------------

let runAllInterval: ReturnType<typeof setInterval> | null = null;

export let suppressSimulate = false;

export function resetSuppressSimulate(): void {
  suppressSimulate = false;
}

export function cancelRunAll(): void {
  if (runAllInterval !== null) {
    clearInterval(runAllInterval);
    runAllInterval = null;
  }
}

export function simulateFirstCase(editor: Editor): void {
  cancelRunAll();
  const level = currentLevel.value;
  if (!level) return;
  testCaseIndex.value = 0;
  testResults.value = [];
  const result = applyTestCase(editor, level, 0, true);
  testResults.value = [result];
  warningText.value = getWarning(editor);
}

export function stepTestCase(editor: Editor, onLevelComplete: () => void): void {
  cancelRunAll();
  const level = LEVELS[currentLevelIndex.value];
  const cases = level.test.cases;
  if (!cases || cases.length === 0) return;
  suppressSimulate = true;

  let idx = testCaseIndex.value + 1;
  if (idx >= cases.length) {
    idx = 0;
    testResults.value = [];
  }
  testCaseIndex.value = idx;

  const result = applyTestCase(editor, level, idx);
  const next = [...testResults.value];
  next[idx] = result;
  testResults.value = next;
  warningText.value = getWarning(editor);
  if (allTestsPassed(testResults.value, level)) {
    markLevelSolved(level.id);
    solvedLevelIds.value = getSolvedLevelIds();
    onLevelComplete();
  }
  notifyStateChange();
}

export function runAllAnimated(editor: Editor, onLevelComplete: () => void): void {
  cancelRunAll();
  const level = LEVELS[currentLevelIndex.value];
  const cases = level.test.cases;
  if (!cases || cases.length === 0) return;
  suppressSimulate = true;

  testCaseIndex.value = 0;
  testResults.value = [];
  const results = [applyTestCase(editor, level, 0, true)];
  testResults.value = [...results];
  warningText.value = getWarning(editor);
  let idx = 1;

  if (idx >= cases.length) {
    if (allTestsPassed(results, level)) {
      markLevelSolved(level.id);
      solvedLevelIds.value = getSolvedLevelIds();
      onLevelComplete();
    }
    return;
  }

  runAllInterval = setInterval(() => {
    if (idx >= cases.length) {
      cancelRunAll();
      if (allTestsPassed(results, level)) {
        markLevelSolved(level.id);
        solvedLevelIds.value = getSolvedLevelIds();
        onLevelComplete();
      }
      return;
    }
    testCaseIndex.value = idx;
    suppressSimulate = true;
    results[idx] = applyTestCase(editor, level, idx);
    testResults.value = [...results];
    warningText.value = getWarning(editor);
    notifyStateChange();
    idx++;
  }, 200);
}

export function resetTests(editor: Editor): void {
  simulateFirstCase(editor);
}
