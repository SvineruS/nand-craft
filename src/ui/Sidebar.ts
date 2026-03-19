import type { GateType } from '../types.ts';
import { GATE_DEFS } from '../editor/geometry.ts';
import { THEME } from './theme.ts';

const SIDEBAR_BG = THEME.bg;
const ITEM_BG = THEME.surface;
const ITEM_HOVER = THEME.surfaceHover;
const ITEM_TEXT = THEME.text;
const ITEM_DESC = THEME.textDim;
const BORDER_COLOR = THEME.border;

export class Sidebar {
  readonly element: HTMLElement;
  onStamp: ((type: GateType) => void) | null = null;
  onDragStart: ((type: GateType) => void) | null = null;
  onDragEnd: (() => void) | null = null;

  constructor() {
    const panel = document.createElement('div');
    this.element = panel;
    Object.assign(panel.style, {
      width: '160px',
      minWidth: '160px',
      background: SIDEBAR_BG,
      borderLeft: `1px solid ${BORDER_COLOR}`,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      padding: '8px',
      gap: '4px',
      boxSizing: 'border-box',
      userSelect: 'none',
      flexShrink: '0',
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      color: ITEM_DESC,
      fontSize: '11px',
      fontWeight: '600',
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
      padding: '4px 4px 2px',
    });
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
    Object.assign(el.style, {
      background: ITEM_BG,
      borderRadius: '6px',
      padding: '6px 10px',
      cursor: 'grab',
      transition: 'background 0.15s',
    });

    const labelEl = document.createElement('div');
    Object.assign(labelEl.style, { color: ITEM_TEXT, fontSize: '12px', fontWeight: '600' });
    labelEl.textContent = label;
    el.appendChild(labelEl);

    const desc = document.createElement('div');
    Object.assign(desc.style, { color: ITEM_DESC, fontSize: '10px', marginTop: '1px' });
    desc.textContent = description;
    el.appendChild(desc);

    el.addEventListener('mouseenter', () => { el.style.background = ITEM_HOVER; });
    el.addEventListener('mouseleave', () => { el.style.background = ITEM_BG; });

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
