import { Editor } from './editor/Editor.ts';
import { Toolbar } from './ui/Toolbar.ts';
import { Sidebar } from './ui/Sidebar.ts';
import { TestPanel } from './ui/TestPanel.ts';
import { LevelDialog } from './ui/LevelDialog.ts';
import { LEVELS } from './levels/registry.ts';
import type { TestResult } from './types.ts';
import './style.css';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

const editorContainer = document.createElement('div');
editorContainer.id = 'editor-container';
Object.assign(editorContainer.style, {
  flex: '1',
  position: 'relative',
  overflow: 'hidden',
});

const editor = new Editor(editorContainer);
const sidebar = new Sidebar();
sidebar.onStamp = (type) => {
  const state = editor.getState();
  state.stampGateType = type;
  state.pasteMode = false;
  state.dirty = true;
};
sidebar.onDragStart = (type) => {
  editor.getState().stampGateType = type;
};
sidebar.onDragEnd = () => {
  editor.getState().stampGateType = null;
};
const levelDialog = new LevelDialog();

let currentLevelIndex = 0;
let testCaseIndex = -1;
let testResults: TestResult[] = [];

function stepTestCase(): void {
  const level = LEVELS[currentLevelIndex];
  const cases = level.test.cases;
  if (!cases || cases.length === 0) return;

  testCaseIndex++;
  if (testCaseIndex >= cases.length) {
    testCaseIndex = 0;
    testResults = [];
  }

  const result = editor.runSingleCase(level, testCaseIndex);
  testResults[testCaseIndex] = result;
  testPanel.setWarning(getWarning());
  testPanel.show(level, testResults, testCaseIndex);
}

function runAllCases(): void {
  const level = LEVELS[currentLevelIndex];
  const results = editor.runTests(level);
  testResults = results;
  testCaseIndex = results.length - 1;
  testPanel.show(level, testResults);
}

function resetTests(): void {
  simulateFirstCase();
}

function getWarning(): string | null {
  const warnings: string[] = [];
  if (editor.hasShortCircuit()) warnings.push('Short circuit — feedback loop without delay gate');
  if (editor.hasContention()) warnings.push('Bus contention — multiple drivers on same net');
  return warnings.length > 0 ? warnings.join(' | ') : null;
}

function simulateFirstCase(): void {
  const level = LEVELS[currentLevelIndex];
  testCaseIndex = 0;
  testResults = [];
  const result = editor.runSingleCase(level, 0, true);
  testResults[0] = result;
  testPanel.setWarning(getWarning());
  testPanel.show(level, testResults, 0);
}

const testPanel = new TestPanel({
  onReset: resetTests,
  onStep: stepTestCase,
  onRunAll: runAllCases,
});
testPanel.onPropChange = () => simulateFirstCase();

function loadLevel(index: number): void {
  currentLevelIndex = index;
  testCaseIndex = -1;
  testResults = [];
  const level = LEVELS[index];
  editor.loadLevel(level);
  toolbar.setLevelName(level.name);
  simulateFirstCase();
  levelDialog.showIntro(level, () => levelDialog.hide());
}

// Re-simulate first case whenever the circuit changes (debounced to next frame)
let resimScheduled = false;
editor.onCircuitChange = () => {
  if (!resimScheduled) {
    resimScheduled = true;
    requestAnimationFrame(() => {
      resimScheduled = false;
      simulateFirstCase();
    });
  }
};

const toolbar = new Toolbar({
  onUndo: () => editor.undo(),
  onRedo: () => editor.redo(),
  onColorChange: (color) => { editor.getState().wireColor = color; },
});

// Layout: toolbar top, then [testPanel | canvas | sidebar]
const mainRow = document.createElement('div');
Object.assign(mainRow.style, {
  display: 'flex',
  flex: '1',
  overflow: 'hidden',
});
mainRow.appendChild(testPanel.element);
mainRow.appendChild(editorContainer);
mainRow.appendChild(sidebar.element);

app.appendChild(toolbar.element);
app.appendChild(mainRow);
app.appendChild(levelDialog.element);

function updateUI(): void {
  const state = editor.getState();
  toolbar.update(state);
  testPanel.updateProps(state);
  requestAnimationFrame(updateUI);
}
requestAnimationFrame(updateUI);

loadLevel(0);
