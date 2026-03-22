import type { GateId, WireSegmentId, TestResult, Level } from '../types.ts';
import type { EditorState } from '../editor/EditorState.ts';
import { GATE_DEFS } from '../editor/geometry.ts';

const BIT_OPTIONS = [1, 8, 16, 32];

export class TestPanel {
  readonly element: HTMLElement;
  private readonly summaryEl: HTMLElement;
  private readonly warningEl: HTMLElement;
  private readonly tableWrap: HTMLElement;
  private readonly propsSection: HTMLElement;
  private readonly propsContent: HTMLElement;
  private currentPropId: string | null = null; // gate or segment ID
  onPropChange: (() => void) | null = null;

  constructor(options: {
    onReset: () => void;
    onStep: () => void;
    onRunAll: () => void;
  }) {
    const panel = document.createElement('div');
    this.element = panel;
    panel.className = 'test-panel';

    // Header with title + summary
    const headerEl = document.createElement('div');
    headerEl.className = 'test-panel-header';

    const titleRow = document.createElement('div');
    titleRow.className = 'test-panel-title-row';

    const title = document.createElement('span');
    title.className = 'test-panel-title';
    title.textContent = 'Truth Table';
    titleRow.appendChild(title);

    this.summaryEl = document.createElement('span');
    this.summaryEl.className = 'test-panel-summary';
    titleRow.appendChild(this.summaryEl);
    headerEl.appendChild(titleRow);

    // Button rows
    const topBtnRow = document.createElement('div');
    topBtnRow.className = 'test-panel-btn-row';

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
    this.warningEl.className = 'test-panel-warning';
    panel.appendChild(this.warningEl);

    // Scrollable table area
    this.tableWrap = document.createElement('div');
    this.tableWrap.className = 'test-panel-table-wrap';
    panel.appendChild(this.tableWrap);

    // Properties section (at bottom, shown for IO/constant gates)
    this.propsSection = document.createElement('div');
    this.propsSection.className = 'props-section';

    const propsHeader = document.createElement('div');
    propsHeader.className = 'props-header';
    propsHeader.textContent = 'Properties';
    this.propsSection.appendChild(propsHeader);

    this.propsContent = document.createElement('div');
    this.propsContent.className = 'props-content';
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
      this.summaryEl.style.color = allPassed ? 'var(--pass)' : (passCount < tested ? 'var(--fail)' : 'var(--text-dim2)');
    } else {
      this.summaryEl.textContent = `${cases.length}`;
      this.summaryEl.style.color = 'var(--text-dim2)';
    }

    // Table
    const table = document.createElement('table');
    table.className = 'test-table';

    // Header row
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

    // Data rows
    for (let c = 0; c < cases.length; c++) {
      const isCurrent = currentCase !== undefined && currentCase === c;
      const result = results?.[c];
      const row = document.createElement('tr');
      row.style.background = this.rowBg(result?.passed, isCurrent);

      // Case number
      const numTd = document.createElement('td');
      numTd.textContent = String(c + 1);
      numTd.className = 'test-table-num-cell';
      numTd.style.color = isCurrent ? 'var(--current-border)' : 'var(--text-dim)';
      row.appendChild(numTd);

      // Input values
      for (const name of inputNames) {
        const td = document.createElement('td');
        td.textContent = String(cases[c].inputs[name] ?? '?');
        td.className = 'test-table-cell';
        row.appendChild(td);
      }

      // Expected output values
      for (const name of outputNames) {
        const td = document.createElement('td');
        td.textContent = String(cases[c].expected[name] ?? '?');
        td.className = 'test-table-expected-cell';
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
        td.className = 'test-table-actual-cell';
        td.style.color = mismatch ? 'var(--fail)' : match ? 'var(--pass)' : 'var(--text-dim)';
        row.appendChild(td);
      }

      table.appendChild(row);
    }

    this.tableWrap.appendChild(table);
  }

  private rowBg(passed?: boolean, isCurrent?: boolean): string {
    if (isCurrent) return 'var(--current-bg)';
    if (passed === undefined) return 'transparent';
    return passed ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)';
  }

  private headerCell(text: string, kind?: 'input' | 'expected' | 'actual'): HTMLTableCellElement {
    const th = document.createElement('td');
    const displayText = kind === 'expected' ? 'Exp' : kind === 'actual' ? 'Act' : text;
    th.textContent = displayText;
    if (kind === 'expected' || kind === 'actual') {
      const sub = document.createElement('div');
      sub.textContent = text;
      sub.className = 'test-table-header-sub';
      th.appendChild(sub);
    }
    const kindClass = kind === 'input' ? 'col-input'
      : kind === 'expected' ? 'col-expected'
      : kind === 'actual' ? 'col-actual'
      : 'col-index';
    th.className = `test-table-header-cell ${kindClass}`;
    return th;
  }

  private createBtn(label: string, tooltip: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.title = tooltip;
    btn.className = 'test-panel-btn';
    return btn;
  }

  // ---------------------------------------------------------------------------
  // Properties panel for IO / Constant gates
  // ---------------------------------------------------------------------------

  updateProps(state: EditorState): void {
    // Check for selected gate (IO/constant only)
    const gateItem = state.selection.find(s => s.type === 'gate');
    if (gateItem?.type === 'gate') {
      const gate = state.circuit.gates.get(gateItem.id);
      if (gate && (gate.type === 'input' || gate.type === 'output' || gate.type === 'constant')) {
        this.showGateProps(state, gateItem.id);
        return;
      }
    }

    // Check for selected wire segment
    const segItem = state.selection.find(s => s.type === 'wireSegment');
    if (segItem?.type === 'wireSegment') {
      this.showSegmentProps(state, segItem.id);
      return;
    }

    this.propsSection.style.display = 'none';
    this.currentPropId = null;
  }

  private showGateProps(state: EditorState, gateId: GateId): void {
    this.propsSection.style.display = 'block';
    if (this.currentPropId === (gateId as string)) return;
    this.currentPropId = gateId as string;
    this.propsContent.innerHTML = '';

    const gate = state.circuit.gates.get(gateId)!;
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
        this.currentPropId = null; // force rebuild to update value max
        this.onPropChange?.();
      }));
    }
  }

  private showSegmentProps(state: EditorState, segId: WireSegmentId): void {
    this.propsSection.style.display = 'block';
    if (this.currentPropId === (segId as string)) return;
    this.currentPropId = segId as string;
    this.propsContent.innerHTML = '';

    const seg = state.circuit.wireSegments.get(segId);
    if (!seg) return;

    this.propsContent.appendChild(this.propLabel('Type', 'Wire'));
    this.propsContent.appendChild(this.propText('Label', seg.label ?? '', (v) => {
      seg.label = v || undefined;
      state.dirty = true;
    }));
  }

  private propLabel(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('span');
    l.textContent = label;
    l.className = 'prop-label';
    row.appendChild(l);
    const v = document.createElement('span');
    v.textContent = value;
    v.className = 'prop-value';
    row.appendChild(v);
    return row;
  }

  private propNumber(label: string, value: number, min: number, max: number, onSet: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('span');
    l.textContent = label;
    l.className = 'prop-label';
    row.appendChild(l);

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(value);
    input.min = String(min);
    input.max = String(max);
    input.className = 'prop-input prop-input-number';
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

  private propText(label: string, value: string, onSet: (v: string) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('span');
    l.textContent = label;
    l.className = 'prop-label';
    row.appendChild(l);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.placeholder = 'none';
    input.className = 'prop-input prop-input-text';
    input.addEventListener('change', () => { onSet(input.value); });
    input.addEventListener('input', () => { onSet(input.value); });
    row.appendChild(input);
    return row;
  }

  private propSelect(label: string, options: number[], current: number, onSet: (v: number) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'prop-row';
    const l = document.createElement('span');
    l.textContent = label;
    l.className = 'prop-label';
    row.appendChild(l);

    const select = document.createElement('select');
    select.className = 'prop-select';
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
