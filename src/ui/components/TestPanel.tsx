import { stateVersion } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { TruthTable } from './TruthTable.tsx';
import { QueueLog } from './QueueLog.tsx';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import type { Editor } from "../../circuit-builder/editor/Editor.ts";

interface TestPanelProps {
  onReset: () => void;
  onStep: () => void;
  onRunAll: () => void;
  onPause: () => void;
  onExecuteCommand: (cmd: Command) => void;
}

export function TestPanel({ onReset, onStep, onRunAll, onPause, onExecuteCommand }: TestPanelProps) {
  stateVersion.value; // subscribe to updates
  const editor = useEditor();
  const { suite } = editor.tests;
  const results = editor.tests.table.results;
  const queueResults = editor.tests.queue.results;
  const isQueue = editor.tests.mode === 'queue';
  const warning = getWarning(editor)

  // Summary computation
  let summaryText = '';
  let summaryColor = 'var(--text-dim2)';
  if (isQueue) {
    if (queueResults.length > 0) {
      const passCount = queueResults.filter(r => r.status === 'passed').length;
      const total = queueResults.length;
      const failCount = queueResults.filter(r => r.status === 'failed').length;
      summaryText = `${passCount}/${total}`;
      summaryColor = failCount > 0 ? 'var(--fail)' : (passCount === total ? 'var(--pass)' : 'var(--text-dim2)');
    }
  } else if (suite.cases.length > 0) {
    const cases = suite.cases;
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

  const tickLabel = editor.tests.tickCount > 0 ? `Tick: ${editor.tests.tickCount}` : '';

  return (
    <div class="test-panel">
      {/* Header */}
      <div class="test-panel-header">
        <div class="test-panel-title-row">
          <span class="test-panel-title">Testing</span>
          <span class="test-panel-summary" style={{ color: 'var(--text-dim)' }}>{tickLabel}</span>
        </div>
        <div class="test-panel-btn-row">
          <button class="test-panel-btn" title="Next test case" onClick={onStep}>
            {'\u25B6| Step'}
          </button>
          {editor.tests.running ? (
            <button class="test-panel-btn" title="Pause" onClick={onPause}>
              {'\u275A\u275A Pause'}
            </button>
          ) : (
            <button class="test-panel-btn" title="Run all cases" onClick={onRunAll}>
              {'\u25B6\u25B6 Run All'}
            </button>
          )}
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

      {/* Mode label + summary */}
      <div class="test-panel-mode-row">
        <span>{isQueue ? 'Queue' : 'Truth Table'}</span>
        <span style={{ color: summaryColor }}>{summaryText}</span>
      </div>

      {/* Truth table or queue log */}
      {editor.tests.mode === 'queue' ? <QueueLog /> : <TruthTable />}

      {/* Properties panel */}
      <PropertiesPanel onExecute={onExecuteCommand} />
    </div>
  );
}

function getWarning(editor: Editor): string | null {
  const warnings: string[] = [];
  if (editor.hasShortCircuit()) warnings.push('Short circuit \u2014 feedback loop without delay gate');
  if (editor.hasContention()) warnings.push('Bus contention \u2014 multiple drivers on same net');

  // Test failures
  const { tests } = editor;
  if (tests.mode === 'queue') {
    const failed = tests.queue.results.find(r => r.status === 'failed');
    if (failed) {
      const detail = failed.error ? `: ${failed.error}` : '';
      warnings.push(`${failed.type} ${failed.label} ${failed.expected} failed${detail}`);
    }
  } else {
    const failed = tests.table.results.find(r => !r.passed);
    if (failed) warnings.push(failed.message);
  }

  return warnings.length > 0 ? warnings.join(' | ') : null;
}
