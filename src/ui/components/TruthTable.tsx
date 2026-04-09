import { stateVersion } from '../editorStore.ts';
import { getEditor } from '../../circuit-builder/editorInstance.ts';

function rowBg(passed?: boolean, isCurrent?: boolean): string {
  if (isCurrent) {
    if (passed === true) return 'rgba(34,197,94,0.18)';
    if (passed === false) return 'rgba(239,68,68,0.18)';
    return 'var(--current-bg)';
  }
  if (passed === undefined) return 'transparent';
  return passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
}

export function TruthTable() {
  stateVersion.value; // subscribe to updates
  const { tests } = getEditor();
  const { level, results, caseIndex } = tests;

  if (!level.test.cases || level.test.cases.length === 0) {
    return null;
  }

  const cases = level.test.cases;
  const inputNames = level.inputs.map(i => i.name);
  const outputNames = level.outputs.map(o => o.name);

  return (
    <div class="test-panel-table-wrap">
      <table class="test-table">
        <thead>
          <tr>
            <th class="test-table-header-cell col-index">#</th>
            {inputNames.map(name => (
              <th key={`ih-${name}`} class="test-table-header-cell col-input">{name}</th>
            ))}
            {outputNames.map(name => (
              <th key={`eh-${name}`} class="test-table-header-cell col-expected">
                Exp
                <div class="test-table-header-sub">{name}</div>
              </th>
            ))}
            {outputNames.map(name => (
              <th key={`ah-${name}`} class="test-table-header-cell col-actual">
                Act
                <div class="test-table-header-sub">{name}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
        {cases.map((tc, c) => {
          const isCurrent = caseIndex >= 0 && caseIndex === c;
          const result = results[c];
          return (
            <tr key={c} style={{ background: rowBg(result?.passed, isCurrent) }}>
              <td
                class="test-table-num-cell"
                style={{ color: isCurrent ? 'var(--current-border)' : 'var(--text-dim)' }}
              >
                {c + 1}
              </td>
              {inputNames.map(name => (
                <td key={`i-${name}`} class="test-table-cell">
                  {String(tc.inputs[name] ?? '?')}
                </td>
              ))}
              {outputNames.map(name => (
                <td key={`e-${name}`} class="test-table-expected-cell">
                  {tc.expected[name] !== null && tc.expected[name] !== undefined ? String(tc.expected[name]) : '\u2014'}
                </td>
              ))}
              {outputNames.map(name => {
                const actual = result?.actuals?.[name] ?? null;
                const expected = tc.expected[name] ?? null;
                const hasResult = result?.actuals !== undefined;
                const match = hasResult && actual === expected;
                const mismatch = hasResult && actual !== expected;
                return (
                  <td
                    key={`a-${name}`}
                    class="test-table-actual-cell"
                    style={{
                      color: mismatch ? 'var(--fail)' : match ? 'var(--pass)' : 'var(--text-dim)',
                    }}
                  >
                    {actual !== undefined && actual !== null ? String(actual) : '\u2014'}
                  </td>
                );
              })}
            </tr>
          );
        })}
        </tbody>
      </table>
    </div>
  );
}
