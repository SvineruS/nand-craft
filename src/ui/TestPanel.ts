import type { GateId, TestResult, Level } from '../types.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { GATE_DEFS } from '../editor/geometry.ts';

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
const PROP_BG = '#252540';
const INPUT_BG = '#1a1a30';
const INPUT_BORDER = '#4a4a7a';
const BIT_OPTIONS = [1, 8, 16, 32];

export class TestPanel {
  readonly element: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly warningEl: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly propsSection: HTMLElement;
  private readonly propsContent: HTMLElement;
  private currentPropGateId: GateId | null = null;
  onPropChange: (() => void) | null = null;

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

    // Properties section (at bottom, shown for IO/constant gates)
    this.propsSection = document.createElement('div');
    Object.assign(this.propsSection.style, {
      display: 'none',
      borderTop: `1px solid ${BORDER_COLOR}`,
      padding: '8px 6px',
      flexShrink: '0',
    });

    const propsHeader = document.createElement('div');
    Object.assign(propsHeader.style, {
      color: TEXT_DIM,
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '6px',
    });
    propsHeader.textContent = 'Properties';
    this.propsSection.appendChild(propsHeader);

    this.propsContent = document.createElement('div');
    Object.assign(this.propsContent.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
    });
    this.propsSection.appendChild(this.propsContent);
    panel.appendChild(this.propsSection);
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

  // ---------------------------------------------------------------------------
  // Properties panel for IO / Constant gates
  // ---------------------------------------------------------------------------

  updateProps(state: EditorState): void {
    const gateItem = state.selection.find(s => s.type === 'gate');
    const gateId = gateItem?.type === 'gate' ? gateItem.id : null;

    if (!gateId) {
      this.propsSection.style.display = 'none';
      this.currentPropGateId = null;
      return;
    }

    const gate = state.circuit.gates.get(gateId);
    if (!gate || (gate.type !== 'input' && gate.type !== 'output' && gate.type !== 'constant')) {
      this.propsSection.style.display = 'none';
      this.currentPropGateId = null;
      return;
    }

    this.propsSection.style.display = 'block';
    if (this.currentPropGateId === gateId) return;
    this.currentPropGateId = gateId;
    this.propsContent.innerHTML = '';

    const def = GATE_DEFS[gate.type];
    this.propsContent.appendChild(this.propLabel('Type', def.label));

    // Value (for input/constant)
    if (gate.type === 'input' || gate.type === 'constant') {
      const outPin = gate.outputPins[0] ? state.circuit.pins.get(gate.outputPins[0]) : undefined;
      if (outPin) {
        const mask = ((1 << outPin.bitWidth) >>> 0) - 1;
        this.propsContent.appendChild(this.propNumber('Value', outPin.value ?? 0, 0, mask, (v) => {
          outPin.value = v;
          this.onPropChange?.();
        }));
      }
    }

    // Bit width dropdown
    const allPinIds = [...gate.inputPins, ...gate.outputPins];
    const firstPin = allPinIds.length > 0 ? state.circuit.pins.get(allPinIds[0]) : undefined;
    if (firstPin) {
      this.propsContent.appendChild(this.propSelect('Bits', BIT_OPTIONS, firstPin.bitWidth, (v) => {
        for (const pid of allPinIds) {
          const pin = state.circuit.pins.get(pid);
          if (pin) pin.bitWidth = v;
        }
        this.currentPropGateId = null; // force rebuild to update value max
        this.onPropChange?.();
      }));
    }
  }

  private propLabel(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 6px', background: PROP_BG, borderRadius: '3px', fontSize: '11px',
    });
    const l = document.createElement('span');
    l.textContent = label;
    l.style.color = TEXT_DIM;
    row.appendChild(l);
    const v = document.createElement('span');
    v.textContent = value;
    v.style.color = TEXT_COLOR;
    v.style.fontWeight = '600';
    row.appendChild(v);
    return row;
  }

  private propNumber(label: string, value: number, min: number, max: number, onSet: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 6px', background: PROP_BG, borderRadius: '3px', fontSize: '11px',
    });
    const l = document.createElement('span');
    l.textContent = label;
    l.style.color = TEXT_DIM;
    row.appendChild(l);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    Object.assign(input.style, {
      width: '48px', background: INPUT_BG, color: TEXT_COLOR,
      border: `1px solid ${INPUT_BORDER}`, borderRadius: '3px',
      padding: '2px 4px', fontSize: '11px',
      fontFamily: 'ui-monospace, Consolas, monospace', textAlign: 'right', outline: 'none',
    });
    input.addEventListener('change', () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v)) v = min;
      v = Math.max(min, Math.min(max, v));
      input.value = String(v);
      onSet(v);
    });
    input.addEventListener('input', () => {
      let v = parseInt(input.value, 10);
      if (isNaN(v)) return;
      v = Math.max(min, Math.min(max, v));
      onSet(v);
    });
    row.appendChild(input);
    return row;
  }

  private propSelect(label: string, options: number[], current: number, onSet: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    Object.assign(row.style, {
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '3px 6px', background: PROP_BG, borderRadius: '3px', fontSize: '11px',
    });
    const l = document.createElement('span');
    l.textContent = label;
    l.style.color = TEXT_DIM;
    row.appendChild(l);

    const select = document.createElement('select');
    Object.assign(select.style, {
      width: '52px', background: INPUT_BG, color: TEXT_COLOR,
      border: `1px solid ${INPUT_BORDER}`, borderRadius: '3px',
      padding: '2px 4px', fontSize: '11px',
      fontFamily: 'ui-monospace, Consolas, monospace', outline: 'none',
    });
    for (const opt of options) {
      const o = document.createElement('option');
      o.value = String(opt);
      o.textContent = String(opt);
      if (opt === current) o.selected = true;
      select.appendChild(o);
    }
    select.addEventListener('change', () => {
      onSet(parseInt(select.value, 10));
    });
    row.appendChild(select);
    return row;
  }
}
