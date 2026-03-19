import type { Level } from '../types.ts';
import { THEME } from './theme.ts';

const OVERLAY_BG = 'rgba(0,0,0,0.7)';
const CARD_BG = THEME.surface;
const CARD_BORDER = THEME.border;
const TEXT_COLOR = THEME.text;
const TEXT_DIM = '#999baf';
const ACCENT_COLOR = THEME.accent;
const ACCENT_HOVER = THEME.accentHover;

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
