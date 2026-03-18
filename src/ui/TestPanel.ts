import type { TestResult, Level } from '../types.ts';

const PANEL_BG = '#1e1e2e';
const HEADER_BG = '#2d2d4d';
const BORDER_COLOR = '#444466';
const TEXT_COLOR = '#e0e0e0';
const TEXT_DIM = '#999baf';
const PASS_COLOR = '#22c55e';
const FAIL_COLOR = '#ef4444';
const LABEL_BG = '#252540';
const CURRENT_BG = 'rgba(96,165,250,0.12)';
const CURRENT_BORDER = '#60a5fa';
const BUTTON_BG = '#363650';
const BUTTON_HOVER = '#44446a';

export class TestPanel {
  readonly element: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly warningEl: HTMLElement;
  private readonly tableWrap: HTMLElement;

  constructor(options: {
    onReset: () => void;
    onStep: () => void;
    onRunAll: () => void;
  }) {
    const panel = document.createElement('div');
    this.element = panel;
    Object.assign(panel.style, {
      width: '200px',
      minWidth: '200px',
      background: PANEL_BG,
      borderRight: `1px solid ${BORDER_COLOR}`,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      flexShrink: '0',
    });

    // Header with title + summary
    const headerEl = document.createElement('div');
    Object.assign(headerEl.style, {
      padding: '8px 10px',
      background: HEADER_BG,
      borderBottom: `1px solid ${BORDER_COLOR}`,
      flexShrink: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    });

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '6px',
    });

    const title = document.createElement('span');
    title.textContent = 'Truth Table';
    Object.assign(title.style, {
      color: '#ffffff',
      fontSize: '12px',
      fontWeight: '600',
    });
    titleRow.appendChild(title);

    this.summaryEl = document.createElement('span');
    Object.assign(this.summaryEl.style, {
      fontSize: '11px',
      fontWeight: '500',
    });
    titleRow.appendChild(this.summaryEl);
    headerEl.appendChild(titleRow);

    // Button rows
    const topBtnRow = document.createElement('div');
    Object.assign(topBtnRow.style, { display: 'flex', gap: '4px' });

    const stepBtn = this.createBtn('\u25B6| Step', 'Next test case');
    stepBtn.addEventListener('click', () => options.onStep());
    topBtnRow.appendChild(stepBtn);

    const runBtn = this.createBtn('\u25B6\u25B6 Run All', 'Run all cases');
    runBtn.addEventListener('click', () => options.onRunAll());
    topBtnRow.appendChild(runBtn);

    headerEl.appendChild(topBtnRow);

    const resetBtn = this.createBtn('\u21BA Reset', 'Reset tests');
    resetBtn.style.width = '100%';
    resetBtn.addEventListener('click', () => options.onReset());
    headerEl.appendChild(resetBtn);
    panel.appendChild(headerEl);

    // Warning banner
    this.warningEl = document.createElement('div');
    Object.assign(this.warningEl.style, {
      display: 'none',
      padding: '6px 10px',
      background: 'rgba(239,68,68,0.15)',
      borderBottom: `1px solid ${BORDER_COLOR}`,
      color: FAIL_COLOR,
      fontSize: '11px',
      fontWeight: '600',
      flexShrink: '0',
    });
    panel.appendChild(this.warningEl);

    // Scrollable table area
    this.tableWrap = document.createElement('div');
    Object.assign(this.tableWrap.style, {
      flex: '1',
      overflow: 'auto',
      padding: '6px',
    });
    panel.appendChild(this.tableWrap);
  }

  setWarning(text: string | null): void {
    if (text) {
      this.warningEl.textContent = '\u26A0 ' + text;
      this.warningEl.style.display = 'block';
    } else {
      this.warningEl.style.display = 'none';
    }
  }

  show(level: Level, results?: TestResult[], currentCase?: number): void {
    this.tableWrap.innerHTML = '';

    if (!level.test.cases || level.test.cases.length === 0) {
      this.summaryEl.textContent = '';
      return;
    }

    const cases = level.test.cases;
    const inputNames = level.inputs.map(i => i.name);
    const outputNames = level.outputs.map(o => o.name);

    // Summary
    if (results && results.length > 0) {
      const passCount = results.filter(r => r.passed).length;
      const tested = results.length;
      const allDone = tested === cases.length;
      const allPassed = allDone && passCount === tested;
      this.summaryEl.textContent = allDone
        ? (allPassed ? `${tested}/${tested}` : `${passCount}/${tested}`)
        : `${tested}/${cases.length}`;
      this.summaryEl.style.color = allPassed ? PASS_COLOR : (passCount < tested ? FAIL_COLOR : TEXT_DIM);
    } else {
      this.summaryEl.textContent = `${cases.length}`;
      this.summaryEl.style.color = TEXT_DIM;
    }

    // Transposed table: rows = cases, columns = pins
    const table = document.createElement('table');
    Object.assign(table.style, {
      borderCollapse: 'separate',
      borderSpacing: '0',
      fontSize: '12px',
      fontFamily: 'ui-monospace, Consolas, monospace',
      color: TEXT_COLOR,
      whiteSpace: 'nowrap',
      width: '100%',
    });

    // Header row: pin names — inputs + expected + actual per output
    const headerRow = document.createElement('tr');
    headerRow.appendChild(this.headerCell('#'));
    for (const name of inputNames) {
      headerRow.appendChild(this.headerCell(name, 'input'));
    }
    for (const name of outputNames) {
      headerRow.appendChild(this.headerCell(name, 'expected'));
    }
    for (const name of outputNames) {
      headerRow.appendChild(this.headerCell(name, 'actual'));
    }
    table.appendChild(headerRow);

    // Data rows: one per test case
    for (let c = 0; c < cases.length; c++) {
      const isCurrent = currentCase !== undefined && currentCase === c;
      const result = results?.[c];
      const row = document.createElement('tr');
      row.style.background = this.rowBg(result?.passed, isCurrent);

      // Case number
      const numTd = document.createElement('td');
      numTd.textContent = String(c + 1);
      Object.assign(numTd.style, {
        padding: '3px 6px',
        textAlign: 'center',
        fontSize: '10px',
        fontWeight: '600',
        color: isCurrent ? CURRENT_BORDER : TEXT_DIM,
        borderBottom: `1px solid ${BORDER_COLOR}33`,
        borderRight: `2px solid ${BORDER_COLOR}`,
        background: LABEL_BG,
      });
      row.appendChild(numTd);

      // Input values
      for (const name of inputNames) {
        const td = document.createElement('td');
        td.textContent = String(cases[c].inputs[name] ?? '?');
        Object.assign(td.style, {
          padding: '3px 6px',
          textAlign: 'center',
          borderBottom: `1px solid ${BORDER_COLOR}33`,
        });
        row.appendChild(td);
      }

      // Expected output values
      for (const name of outputNames) {
        const td = document.createElement('td');
        td.textContent = String(cases[c].expected[name] ?? '?');
        Object.assign(td.style, {
          padding: '3px 6px',
          textAlign: 'center',
          borderBottom: `1px solid ${BORDER_COLOR}33`,
          borderLeft: c === 0 ? 'none' : undefined,
          color: TEXT_DIM,
        });
        row.appendChild(td);
      }

      // Actual output values
      for (const name of outputNames) {
        const actual = result?.actuals?.[name];
        const expected = cases[c].expected[name];
        const match = actual !== undefined && actual === expected;
        const mismatch = actual !== undefined && actual !== null && actual !== expected;
        const td = document.createElement('td');
        td.textContent = actual !== undefined && actual !== null ? String(actual) : '\u2014';
        Object.assign(td.style, {
          padding: '3px 6px',
          textAlign: 'center',
          fontWeight: '600',
          borderBottom: `1px solid ${BORDER_COLOR}33`,
          color: mismatch ? FAIL_COLOR : match ? PASS_COLOR : TEXT_DIM,
        });
        row.appendChild(td);
      }

      table.appendChild(row);
    }

    this.tableWrap.appendChild(table);
  }

  private rowBg(passed?: boolean, isCurrent?: boolean): string {
    if (isCurrent) return CURRENT_BG;
    if (passed === undefined) return 'transparent';
    return passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
  }

  private headerCell(text: string, kind?: 'input' | 'expected' | 'actual'): HTMLTableCellElement {
    const th = document.createElement('td');
    th.textContent = kind === 'expected' ? `exp` : kind === 'actual' ? `act` : text;
    if (kind === 'expected' || kind === 'actual') {
      const sub = document.createElement('div');
      sub.textContent = text;
      Object.assign(sub.style, { fontSize: '9px', opacity: '0.7' });
      th.textContent = kind === 'expected' ? 'Exp' : 'Act';
      th.appendChild(sub);
    }
    const color = kind === 'input' ? '#60a5fa'
      : kind === 'expected' ? '#c084fc'
      : kind === 'actual' ? '#facc15'
      : TEXT_DIM;
    Object.assign(th.style, {
      padding: '4px 6px',
      textAlign: 'center',
      fontWeight: '600',
      fontSize: '10px',
      color,
      textTransform: 'uppercase',
      letterSpacing: '0.3px',
      borderBottom: `2px solid ${BORDER_COLOR}`,
      background: LABEL_BG,
      position: 'sticky',
      top: '0',
      zIndex: '1',
    });
    return th;
  }

  private createBtn(label: string, tooltip: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = tooltip;
    Object.assign(btn.style, {
      flex: '1',
      background: BUTTON_BG,
      color: TEXT_COLOR,
      border: 'none',
      borderRadius: '4px',
      padding: '7px 4px',
      cursor: 'pointer',
      fontSize: '12px',
      fontFamily: 'inherit',
      whiteSpace: 'nowrap',
      transition: 'background 0.15s',
    });
    btn.addEventListener('mouseenter', () => { btn.style.background = BUTTON_HOVER; });
    btn.addEventListener('mouseleave', () => { btn.style.background = BUTTON_BG; });
    return btn;
  }
}
