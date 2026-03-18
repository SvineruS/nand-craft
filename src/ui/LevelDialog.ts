import type { TestResult, Level } from '../types.ts';

const OVERLAY_BG = 'rgba(0,0,0,0.7)';
const CARD_BG = '#2d2d4d';
const CARD_BORDER = '#444466';
const TEXT_COLOR = '#e0e0e0';
const TEXT_DIM = '#999baf';
const PASS_COLOR = '#22c55e';
const FAIL_COLOR = '#ef4444';
const ACCENT_COLOR = '#3b82f6';
const ACCENT_HOVER = '#2563eb';

function createStyledButton(
  label: string,
  bg: string,
  hoverBg: string,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  Object.assign(btn.style, {
    background: bg,
    color: '#ffffff',
    border: 'none',
    borderRadius: '6px',
    padding: '10px 28px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 0.15s',
  } satisfies Partial<Record<keyof CSSStyleDeclaration, string>>);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = hoverBg;
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = bg;
  });
  return btn;
}

export class LevelDialog {
  readonly element: HTMLElement;
  private readonly contentEl: HTMLElement;

  constructor() {
    // Overlay
    const overlay = document.createElement('div');
    this.element = overlay;
    Object.assign(overlay.style, {
      position: 'fixed',
      inset: '0',
      background: OVERLAY_BG,
      display: 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: '1000',
    });

    // Card
    const card = document.createElement('div');
    Object.assign(card.style, {
      background: CARD_BG,
      borderRadius: '12px',
      border: `1px solid ${CARD_BORDER}`,
      padding: '32px 36px',
      maxWidth: '520px',
      width: '90%',
      maxHeight: '80vh',
      overflowY: 'auto',
      color: TEXT_COLOR,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    });
    this.contentEl = card;
    overlay.appendChild(card);
  }

  showIntro(level: Level, onStart: () => void): void {
    this.contentEl.innerHTML = '';
    this.element.style.display = 'flex';

    // Title
    const title = document.createElement('h2');
    title.textContent = level.name;
    Object.assign(title.style, {
      margin: '0 0 8px 0',
      fontSize: '22px',
      color: '#ffffff',
    });
    this.contentEl.appendChild(title);

    // Description
    const desc = document.createElement('p');
    desc.textContent = level.description;
    Object.assign(desc.style, {
      margin: '0 0 20px 0',
      color: TEXT_DIM,
      fontSize: '14px',
      lineHeight: '1.5',
    });
    this.contentEl.appendChild(desc);

    // Inputs / Outputs info
    const ioSection = document.createElement('div');
    Object.assign(ioSection.style, {
      display: 'flex',
      gap: '24px',
      marginBottom: '24px',
    });

    const inputsDiv = this.buildPinList('Inputs', level.inputs);
    const outputsDiv = this.buildPinList('Outputs', level.outputs);
    ioSection.appendChild(inputsDiv);
    ioSection.appendChild(outputsDiv);
    this.contentEl.appendChild(ioSection);

    // Mode badge
    const modeBadge = document.createElement('div');
    modeBadge.textContent = level.mode === 'combinational' ? 'Combinational' : 'Sequential';
    Object.assign(modeBadge.style, {
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: '500',
      background: 'rgba(59,130,246,0.15)',
      color: ACCENT_COLOR,
      border: `1px solid ${ACCENT_COLOR}44`,
      marginBottom: '24px',
    });
    this.contentEl.appendChild(modeBadge);

    // Start button
    const btnRow = document.createElement('div');
    btnRow.style.textAlign = 'center';
    const startBtn = createStyledButton('Start', ACCENT_COLOR, ACCENT_HOVER);
    startBtn.addEventListener('click', () => {
      this.hide();
      onStart();
    });
    btnRow.appendChild(startBtn);
    this.contentEl.appendChild(btnRow);
  }

  showResults(
    results: TestResult[],
    level: Level,
    onRetry: () => void,
    onNext?: () => void,
  ): void {
    this.contentEl.innerHTML = '';
    this.element.style.display = 'flex';

    const passCount = results.filter(r => r.passed).length;
    const totalCount = results.length;
    const allPassed = passCount === totalCount;

    // Title
    const title = document.createElement('h2');
    title.textContent = allPassed ? 'Level Complete!' : 'Test Results';
    Object.assign(title.style, {
      margin: '0 0 8px 0',
      fontSize: '22px',
      color: allPassed ? PASS_COLOR : '#ffffff',
    });
    this.contentEl.appendChild(title);

    // Summary
    const summary = document.createElement('p');
    summary.textContent = allPassed
      ? `Congratulations! All ${totalCount} tests passed.`
      : `${passCount} of ${totalCount} tests passed.`;
    Object.assign(summary.style, {
      margin: '0 0 20px 0',
      fontSize: '14px',
      color: allPassed ? PASS_COLOR : FAIL_COLOR,
      fontWeight: '500',
    });
    this.contentEl.appendChild(summary);

    // Truth table for failed combinational tests
    if (!allPassed && level.mode === 'combinational' && level.test.cases) {
      const tableWrap = document.createElement('div');
      Object.assign(tableWrap.style, {
        overflowX: 'auto',
        marginBottom: '24px',
      });

      const table = document.createElement('table');
      Object.assign(table.style, {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '13px',
        color: TEXT_COLOR,
      });

      const inputNames = level.inputs.map(i => i.name);
      const outputNames = level.outputs.map(o => o.name);

      // Header
      const thead = document.createElement('thead');
      const hRow = document.createElement('tr');
      for (const h of [...inputNames, ...outputNames.map(n => `Exp ${n}`), 'Result']) {
        const th = document.createElement('th');
        th.textContent = h;
        Object.assign(th.style, {
          padding: '6px 8px',
          textAlign: 'center',
          borderBottom: `2px solid ${CARD_BORDER}`,
          color: TEXT_DIM,
          fontWeight: '500',
          fontSize: '11px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
        });
        hRow.appendChild(th);
      }
      thead.appendChild(hRow);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let i = 0; i < level.test.cases.length; i++) {
        const tc = level.test.cases[i]!;
        const result = results[i];
        const passed = result ? result.passed : false;

        const row = document.createElement('tr');
        row.style.background = passed
          ? 'rgba(34,197,94,0.08)'
          : 'rgba(239,68,68,0.08)';

        for (const name of inputNames) {
          const td = document.createElement('td');
          td.textContent = String(tc.inputs[name] ?? '?');
          Object.assign(td.style, {
            padding: '6px 8px',
            textAlign: 'center',
            borderBottom: `1px solid ${CARD_BORDER}`,
          });
          row.appendChild(td);
        }
        for (const name of outputNames) {
          const td = document.createElement('td');
          td.textContent = String(tc.expected[name] ?? '?');
          Object.assign(td.style, {
            padding: '6px 8px',
            textAlign: 'center',
            borderBottom: `1px solid ${CARD_BORDER}`,
          });
          row.appendChild(td);
        }
        const resultTd = document.createElement('td');
        resultTd.textContent = passed ? '\u2713' : '\u2717';
        Object.assign(resultTd.style, {
          padding: '6px 8px',
          textAlign: 'center',
          borderBottom: `1px solid ${CARD_BORDER}`,
          fontWeight: '700',
          fontSize: '15px',
          color: passed ? PASS_COLOR : FAIL_COLOR,
        });
        row.appendChild(resultTd);

        tbody.appendChild(row);
      }
      table.appendChild(tbody);
      tableWrap.appendChild(table);
      this.contentEl.appendChild(tableWrap);
    } else if (!allPassed) {
      // Sequential or generic: show failed messages
      for (const result of results) {
        if (result.passed) continue;
        const item = document.createElement('div');
        Object.assign(item.style, {
          padding: '8px 12px',
          marginBottom: '6px',
          borderRadius: '4px',
          background: 'rgba(239,68,68,0.1)',
          border: `1px solid ${FAIL_COLOR}33`,
          color: TEXT_COLOR,
          fontSize: '13px',
        });
        const icon = document.createElement('span');
        icon.textContent = '\u2717 ';
        icon.style.color = FAIL_COLOR;
        icon.style.fontWeight = '700';
        item.appendChild(icon);
        item.appendChild(document.createTextNode(result.message));
        this.contentEl.appendChild(item);
      }
    }

    // Buttons
    const btnRow = document.createElement('div');
    Object.assign(btnRow.style, {
      display: 'flex',
      justifyContent: 'center',
      gap: '12px',
      marginTop: '8px',
    });

    if (allPassed && onNext) {
      const nextBtn = createStyledButton('Next Level', PASS_COLOR, '#16a34a');
      nextBtn.addEventListener('click', () => {
        this.hide();
        onNext();
      });
      btnRow.appendChild(nextBtn);
    }

    const retryBtn = createStyledButton(
      allPassed ? 'Retry' : 'Retry',
      allPassed ? '#363650' : ACCENT_COLOR,
      allPassed ? '#44446a' : ACCENT_HOVER,
    );
    retryBtn.addEventListener('click', () => {
      this.hide();
      onRetry();
    });
    btnRow.appendChild(retryBtn);

    this.contentEl.appendChild(btnRow);
  }

  hide(): void {
    this.element.style.display = 'none';
  }

  private buildPinList(
    heading: string,
    pins: { name: string; bitWidth: number }[],
  ): HTMLElement {
    const container = document.createElement('div');
    container.style.flex = '1';

    const h = document.createElement('div');
    h.textContent = heading;
    Object.assign(h.style, {
      fontSize: '12px',
      fontWeight: '600',
      color: TEXT_DIM,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      marginBottom: '6px',
    });
    container.appendChild(h);

    for (const pin of pins) {
      const item = document.createElement('div');
      Object.assign(item.style, {
        padding: '4px 10px',
        marginBottom: '4px',
        borderRadius: '4px',
        background: 'rgba(255,255,255,0.05)',
        fontSize: '13px',
        color: TEXT_COLOR,
      });
      item.textContent = pin.bitWidth > 1
        ? `${pin.name} [${pin.bitWidth}-bit]`
        : pin.name;
      container.appendChild(item);
    }

    return container;
  }
}
