import type { Level } from '../types.ts';

export class LevelDialog {
  readonly element: HTMLElement;
  private readonly contentEl: HTMLElement;

  constructor() {
    // Overlay
    const overlay = document.createElement('div');
    this.element = overlay;
    overlay.className = 'level-dialog-overlay';

    // Card
    const card = document.createElement('div');
    card.className = 'level-dialog-card';
    this.contentEl = card;
    overlay.appendChild(card);
  }

  showIntro(level: Level, onStart: () => void): void {
    this.contentEl.innerHTML = '';
    this.element.style.display = 'flex';

    // Title
    const title = document.createElement('h2');
    title.textContent = level.name;
    title.className = 'level-dialog-title';
    this.contentEl.appendChild(title);

    // Description
    const desc = document.createElement('p');
    desc.textContent = level.description;
    desc.className = 'level-dialog-desc';
    this.contentEl.appendChild(desc);

    // Inputs / Outputs info
    const ioSection = document.createElement('div');
    ioSection.className = 'level-dialog-io-section';

    const inputsDiv = this.buildPinList('Inputs', level.inputs);
    const outputsDiv = this.buildPinList('Outputs', level.outputs);
    ioSection.appendChild(inputsDiv);
    ioSection.appendChild(outputsDiv);
    this.contentEl.appendChild(ioSection);

    // Mode badge
    const modeBadge = document.createElement('div');
    modeBadge.textContent = level.mode === 'combinational' ? 'Combinational' : 'Sequential';
    modeBadge.className = 'level-dialog-mode-badge';
    this.contentEl.appendChild(modeBadge);

    // Start button
    const btnRow = document.createElement('div');
    btnRow.className = 'level-dialog-btn-row';
    const startBtn = document.createElement('button');
    startBtn.textContent = 'Start';
    startBtn.className = 'level-dialog-start-btn';
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
    container.className = 'level-dialog-pin-list';

    const h = document.createElement('div');
    h.textContent = heading;
    h.className = 'level-dialog-pin-heading';
    container.appendChild(h);

    for (const pin of pins) {
      const item = document.createElement('div');
      item.className = 'level-dialog-pin-item';
      item.textContent = pin.bitWidth > 1
        ? `${pin.name} [${pin.bitWidth}-bit]`
        : pin.name;
      container.appendChild(item);
    }

    return container;
  }
}
