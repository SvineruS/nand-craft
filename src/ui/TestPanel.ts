import type { TestResult, Level } from '../types.ts';

const PANEL_BG = '#1e1e2e';
const PANEL_WIDTH = '380px';
const HEADER_BG = '#2d2d4d';
const ROW_PASS = 'rgba(34,197,94,0.12)';
const ROW_FAIL = 'rgba(239,68,68,0.12)';
const BORDER_COLOR = '#444466';
const TEXT_COLOR = '#e0e0e0';
const TEXT_DIM = '#999baf';
const PASS_COLOR = '#22c55e';
const FAIL_COLOR = '#ef4444';

export class TestPanel {
  readonly element: HTMLElement;
  private readonly resultsContainer: HTMLElement;
  private readonly headerEl: HTMLElement;
  private readonly closeBtn: HTMLButtonElement;
  private visible = false;

  constructor() {
    const panel = document.createElement('div');
    this.element = panel;
    Object.assign(panel.style, {
      position: 'absolute',
      top: '0',
      right: '0',
      width: PANEL_WIDTH,
      height: '100%',
      background: PANEL_BG,
      borderLeft: `1px solid ${BORDER_COLOR}`,
      display: 'none',
      flexDirection: 'column',
      overflow: 'hidden',
      zIndex: '100',
      boxShadow: '-4px 0 16px rgba(0,0,0,0.4)',
    });

    // Header
    this.headerEl = document.createElement('div');
    Object.assign(this.headerEl.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: HEADER_BG,
      borderBottom: `1px solid ${BORDER_COLOR}`,
      flexShrink: '0',
    });

    const title = document.createElement('span');
    title.textContent = 'Test Results';
    Object.assign(title.style, {
      color: '#ffffff',
      fontSize: '14px',
      fontWeight: '600',
    });
    this.headerEl.appendChild(title);

    this.closeBtn = document.createElement('button');
    this.closeBtn.textContent = '\u00d7';
    Object.assign(this.closeBtn.style, {
      background: 'none',
      border: 'none',
      color: TEXT_DIM,
      fontSize: '20px',
      cursor: 'pointer',
      padding: '0 4px',
      lineHeight: '1',
    });
    this.closeBtn.addEventListener('click', () => this.hide());
    this.headerEl.appendChild(this.closeBtn);

    panel.appendChild(this.headerEl);

    // Results container
    this.resultsContainer = document.createElement('div');
    Object.assign(this.resultsContainer.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '12px 16px',
    });
    panel.appendChild(this.resultsContainer);
  }

  show(results: TestResult[], level: Level): void {
    this.visible = true;
    this.element.style.display = 'flex';
    this.resultsContainer.innerHTML = '';

    const passCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const allPassed = passCount === totalCount;

    // Summary
    const summary = document.createElement('div');
    Object.assign(summary.style, {
      padding: '10px 14px',
      borderRadius: '6px',
      marginBottom: '16px',
      background: allPassed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
      border: `1px solid ${allPassed ? PASS_COLOR : FAIL_COLOR}`,
      color: allPassed ? PASS_COLOR : FAIL_COLOR,
      fontSize: '14px',
      fontWeight: '600',
      textAlign: 'center',
    });
    summary.textContent = allPassed
      ? `All ${totalCount} tests passed!`
      : `${passCount}/${totalCount} tests passed`;
    this.resultsContainer.appendChild(summary);

    // Build truth table for combinational tests
    if (level.mode === 'combinational' && level.test.cases) {
      const table = document.createElement('table');
      Object.assign(table.style, {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
        color: TEXT_COLOR,
      });

      // Header row
      const thead = document.createElement('thead');
      const headerRow = document.createElement('tr');

      const inputNames = level.inputs.map(i => i.name);
      const outputNames = level.outputs.map(o => o.name);

      const allHeaders = [
        ...inputNames,
        ...outputNames.map(n => `Exp ${n}`),
        ...outputNames.map(n => `Act ${n}`),
        'Result',
      ];

      for (const h of allHeaders) {
        const th = document.createElement('th');
        th.textContent = h;
        Object.assign(th.style, {
          padding: '6px 8px',
          textAlign: 'center',
          borderBottom: `2px solid ${BORDER_COLOR}`,
          color: TEXT_DIM,
          fontWeight: '500',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        });
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      // Body rows
      const tbody = document.createElement('tbody');
      for (let i = 0; i < level.test.cases.length; i++) {
        const testCase = level.test.cases[i]!;
        const result = results[i];
        const passed = result ? result.passed : false;

        const row = document.createElement('tr');
        row.style.background = passed ? ROW_PASS : ROW_FAIL;

        // Input values
        for (const name of inputNames) {
          const td = document.createElement('td');
          td.textContent = String(testCase.inputs[name] ?? '?');
          Object.assign(td.style, {
            padding: '6px 8px',
            textAlign: 'center',
            borderBottom: `1px solid ${BORDER_COLOR}`,
          });
          row.appendChild(td);
        }

        // Expected output values
        for (const name of outputNames) {
          const td = document.createElement('td');
          td.textContent = String(testCase.expected[name] ?? '?');
          Object.assign(td.style, {
            padding: '6px 8px',
            textAlign: 'center',
            borderBottom: `1px solid ${BORDER_COLOR}`,
          });
          row.appendChild(td);
        }

        // Actual output values (extracted from result message or shown as '?')
        for (const name of outputNames) {
          const td = document.createElement('td');
          // Try to parse actual value from the result message
          td.textContent = this.extractActual(result, name);
          Object.assign(td.style, {
            padding: '6px 8px',
            textAlign: 'center',
            borderBottom: `1px solid ${BORDER_COLOR}`,
            fontWeight: passed ? 'normal' : '600',
            color: passed ? TEXT_COLOR : FAIL_COLOR,
          });
          row.appendChild(td);
        }

        // Result indicator
        const resultTd = document.createElement('td');
        resultTd.textContent = passed ? '\u2713' : '\u2717';
        Object.assign(resultTd.style, {
          padding: '6px 8px',
          textAlign: 'center',
          borderBottom: `1px solid ${BORDER_COLOR}`,
          fontWeight: '700',
          fontSize: '15px',
          color: passed ? PASS_COLOR : FAIL_COLOR,
        });
        row.appendChild(resultTd);

        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      this.resultsContainer.appendChild(table);
    } else {
      // Sequential or generic: list results
      for (const result of results) {
        const item = document.createElement('div');
        Object.assign(item.style, {
          padding: '8px 12px',
          marginBottom: '6px',
          borderRadius: '4px',
          background: result.passed ? ROW_PASS : ROW_FAIL,
          border: `1px solid ${result.passed ? PASS_COLOR : FAIL_COLOR}33`,
          color: TEXT_COLOR,
          fontSize: '13px',
        });
        const icon = document.createElement('span');
        icon.textContent = result.passed ? '\u2713 ' : '\u2717 ';
        icon.style.color = result.passed ? PASS_COLOR : FAIL_COLOR;
        icon.style.fontWeight = '700';
        item.appendChild(icon);
        item.appendChild(document.createTextNode(result.message));
        this.resultsContainer.appendChild(item);
      }
    }
  }

  hide(): void {
    this.visible = false;
    this.element.style.display = 'none';
  }

  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      // Show requires data, so just toggle visibility if already rendered
      this.visible = true;
      this.element.style.display = 'flex';
    }
  }

  private extractActual(result: TestResult | undefined, _pinName: string): string {
    if (!result) return '?';
    // If passed, actual equals expected — but we don't have direct access.
    // The result message typically contains the actual vs expected info.
    // For a passed test, actual matches expected so we show the expected value.
    // For a failed test we parse from the message if possible.
    // Fallback to showing the message or '?'
    if (result.passed) return '\u2014'; // em-dash; caller can enrich later
    // Try simple pattern: "expected X got Y" or "pin: expected X, got Y"
    const match = result.message.match(/got\s+(\d+)/i);
    if (match) return match[1]!;
    return '?';
  }
}
