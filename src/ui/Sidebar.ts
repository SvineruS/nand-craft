const SIDEBAR_BG = '#1e1e2e';
const ITEM_BG = '#2d2d4d';
const ITEM_HOVER = '#3d3d5d';
const ITEM_TEXT = '#e0e0e0';
const ITEM_DESC = '#9ca3af';
const BORDER_COLOR = '#444466';

interface PaletteItem {
  type: string;
  label: string;
  description: string;
}

const GATE_PALETTE: PaletteItem[] = [
  { type: 'nand', label: 'NAND', description: 'Bitwise NAND gate' },
  { type: 'delay', label: 'Delay', description: '1-tick delay' },
  { type: 'tristate', label: 'Tristate', description: 'Tri-state buffer' },
];

export class Sidebar {
  readonly element: HTMLElement;

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
      gap: '6px',
      boxSizing: 'border-box',
      userSelect: 'none',
      flexShrink: '0',
    });

    // Section header
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

    for (const item of GATE_PALETTE) {
      panel.appendChild(this.createItem(item));
    }
  }

  private createItem(item: PaletteItem): HTMLElement {
    const el = document.createElement('div');
    el.draggable = true;
    Object.assign(el.style, {
      background: ITEM_BG,
      borderRadius: '6px',
      padding: '8px 10px',
      cursor: 'grab',
      transition: 'background 0.15s',
    });

    const label = document.createElement('div');
    Object.assign(label.style, {
      color: ITEM_TEXT,
      fontSize: '13px',
      fontWeight: '600',
    });
    label.textContent = item.label;
    el.appendChild(label);

    const desc = document.createElement('div');
    Object.assign(desc.style, {
      color: ITEM_DESC,
      fontSize: '11px',
      marginTop: '2px',
    });
    desc.textContent = item.description;
    el.appendChild(desc);

    el.addEventListener('mouseenter', () => { el.style.background = ITEM_HOVER; });
    el.addEventListener('mouseleave', () => { el.style.background = ITEM_BG; });

    el.addEventListener('dragstart', (e) => {
      if (!e.dataTransfer) return;
      e.dataTransfer.setData('text/plain', item.type);
      e.dataTransfer.effectAllowed = 'copy';
      el.style.opacity = '0.6';
    });
    el.addEventListener('dragend', () => {
      el.style.opacity = '1';
    });

    return el;
  }
}
