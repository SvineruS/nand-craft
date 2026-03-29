import { currentLevel, testResults, warningText } from './editorStore.ts';
import { TruthTable } from './TruthTable.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import type { Command } from '../editor/commands.ts';

interface TestPanelProps {
  onReset: () => void;
  onStep: () => void;
  onRunAll: () => void;
  onExecuteCommand: (cmd: Command) => void;
}

export function TestPanel({ onReset, onStep, onRunAll, onExecuteCommand }: TestPanelProps) {
  const level = currentLevel.value;
  const results = testResults.value;
  const warning = warningText.value;

  // Summary computation
  let summaryText = '';
  let summaryColor = 'var(--text-dim2)';
  if (level && level.test.cases && level.test.cases.length > 0) {
    const cases = level.test.cases;
    if (results.length > 0) {
      const passCount = results.filter(r => r.passed).length;
      const tested = results.length;
      const allDone = tested === cases.length;
      const allPassed = allDone && passCount === tested;
      summaryText = allDone
        ? (allPassed ? `${tested}/${tested}` : `${passCount}/${tested}`)
        : `${tested}/${cases.length}`;
      summaryColor = allPassed ? 'var(--pass)' : (passCount < tested ? 'var(--fail)' : 'var(--text-dim2)');
    } else {
      summaryText = `${cases.length}`;
    }
  }

  return (
    <div class="test-panel">
      {/* Header */}
      <div class="test-panel-header">
        <div class="test-panel-title-row">
          <span class="test-panel-title">Truth Table</span>
          <span class="test-panel-summary" style={{ color: summaryColor }}>{summaryText}</span>
        </div>
        <div class="test-panel-btn-row">
          <button class="test-panel-btn" title="Next test case" onClick={onStep}>
            {'\u25B6| Step'}
          </button>
          <button class="test-panel-btn" title="Run all cases" onClick={onRunAll}>
            {'\u25B6\u25B6 Run All'}
          </button>
        </div>
        <button class="test-panel-btn" title="Reset tests" style={{ width: '100%' }} onClick={onReset}>
          {'\u21BA Reset'}
        </button>
      </div>

      {/* Warning banner */}
      {warning && (
        <div class="test-panel-warning" style={{ display: 'block' }}>
          {'\u26A0 ' + warning}
        </div>
      )}

      {/* Truth table */}
      <TruthTable />

      {/* Properties panel */}
      <PropertiesPanel onExecute={onExecuteCommand} />
    </div>
  );
}
