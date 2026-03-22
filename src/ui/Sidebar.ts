import type { GateType } from '../types.ts';
import { GATE_DEFS } from '../editor/geometry.ts';

export class Sidebar {
  readonly element: HTMLElement;
  onStamp: ((type: GateType) => void) | null = null;
  onDragStart: ((type: GateType) => void) | null = null;
  onDragEnd: (() => void) | null = null;

  constructor() {
    const panel = document.createElement('div');
    this.element = panel;
    panel.className = 'sidebar';

    const header = document.createElement('div');
    header.className = 'sidebar-header';
    header.textContent = 'Components';
    panel.appendChild(header);

    for (const [type, def] of Object.entries(GATE_DEFS)) {
      if (!def.placeable) continue;
      panel.appendChild(this.createItem(type as GateType, def.label, def.description));
    }
  }

  private createItem(type: GateType, label: string, description: string): HTMLElement {
    const el = document.createElement('div');
    el.draggable = true;
    el.className = 'sidebar-item';

    const labelEl = document.createElement('div');
    labelEl.className = 'sidebar-item-label';
    labelEl.textContent = label;
    el.appendChild(labelEl);

    const desc = document.createElement('div');
    desc.className = 'sidebar-item-desc';
    desc.textContent = description;
    el.appendChild(desc);

    // Track whether a drag occurred so we can distinguish a click (stamp) from
    // a drag-start. On mousedown we reset the flag; dragstart sets it to true.
    // The click handler only fires onStamp if no drag happened.
    let didDrag = false;
    el.addEventListener('mousedown', () => { didDrag = false; });
    el.addEventListener('dragstart', (e) => {
      didDrag = true;
      if (!e.dataTransfer) return;
      e.dataTransfer.setData('text/plain', type);
      e.dataTransfer.effectAllowed = 'copy';
      const empty = document.createElement('div');
      empty.style.width = '0';
      empty.style.height = '0';
      document.body.appendChild(empty);
      e.dataTransfer.setDragImage(empty, 0, 0);
      requestAnimationFrame(() => document.body.removeChild(empty));
      el.style.opacity = '0.6';
      this.onDragStart?.(type);
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
      this.onDragEnd?.();
    });
    el.addEventListener('click', () => {
      if (!didDrag) this.onStamp?.(type);
    });

    return el;
  }
}
