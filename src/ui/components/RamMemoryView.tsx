import type { RefObject } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Gate } from '../../circuit-builder/simulation/gateTypes.ts';
import { padRamCells, RAM_SIZE } from '../../circuit-builder/simulation/gateTypes.ts';
import type { EditorState } from '../../circuit-builder/editor/EditorState.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { WriteRamCommand } from '../../circuit-builder/editor/commands.ts';

/**
 * The 256 bytes of a RAM gate, as a grid the player can read in four notations and edit
 * a byte at a time.
 *
 * Editing goes through WriteRamCommand like a flash does, so a mistyped byte is one undo
 * away and the frame loop re-ticks the circuit with the new contents.
 */

type Radix = 'hex' | 'dec' | 'bin' | 'ascii';

const RADIX_LABELS: { id: Radix; label: string }[] = [
  { id: 'hex', label: 'Hex' },
  { id: 'dec', label: 'Dec' },
  { id: 'bin', label: 'Bin' },
  { id: 'ascii', label: 'ASCII' },
];

/**
 * Narrowest a cell may be drawn. Binary needs room for eight digits, the rest for two or
 * three, and the address gutter takes a fixed slice off the front.
 */
function minCellWidthFor(radix: Radix): number {
  return radix === 'bin' ? 58 : 26;
}

/** Room the address column takes off the front of every row, plus a little slack. */
const ADDRESS_GUTTER_WIDTH = 34;

/**
 * How many bytes per row: the wide layout when the window can hold it, half that when it
 * cannot.
 *
 * A row is a power of two either way, so an address still reads off the gutter plus the
 * column heading. Binary starts from half as many columns as the other notations because
 * each of its cells is four times as wide.
 */
function columnsFor(radix: Radix, availableWidth: number): number {
  const wide = radix === 'bin' ? 8 : 16;
  const needed = ADDRESS_GUTTER_WIDTH + wide * minCellWidthFor(radix);
  return availableWidth >= needed ? wide : wide / 2;
}

/** Input pin order of the RAM gate, from its definition in gates.ts. */
const PIN_READ = 0;
const PIN_WRITE = 1;
const PIN_ADDRESS = 2;
const PIN_VALUE = 3;

interface RamMemoryViewProps {
  gate: Gate;
  state: EditorState;
  onExecute: (cmd: Command) => void;
}

export function RamMemoryView({ gate, state, onExecute }: RamMemoryViewProps) {
  const [radix, setRadix] = useState<Radix>('hex');
  /**
   * The cell being typed into, and what has been typed so far. The text lives here rather
   * than in the DOM because the whole view re-renders on every tick of a running circuit,
   * which would otherwise overwrite a half-typed byte with the stored one.
   */
  const [editing, setEditing] = useState<{ address: number; text: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const availableWidth = useContentWidth(scrollRef);

  const cells = readCells(gate);
  const columns = columnsFor(radix, availableWidth);
  const liveAddress = state.circuit.getPinValue(gate.id, 'input', PIN_ADDRESS);

  const writeCells = (next: number[]) => {
    onExecute(new WriteRamCommand(state, gate.id, { cells: next, rom: gate.rom }));
  };

  const commitCell = () => {
    if (!editing) return;
    const value = parseByte(editing.text, radix);
    setEditing(null);
    if (value === null) return;
    const next = [...cells];
    next[editing.address] = value;
    writeCells(next);
  };

  return (
    <div class="ram-memory">
      <div class="ram-toolbar">
        <div class="ram-radix">
          {RADIX_LABELS.map(option => (
            <button
              key={option.id}
              class={`window-tab${radix === option.id ? ' is-active' : ''}`}
              onClick={() => { setEditing(null); setRadix(option.id); }}
            >{option.label}</button>
          ))}
        </div>
      </div>

      <PinStatus gate={gate} state={state} />

      <div class="ram-grid-scroll" ref={scrollRef}>
        <div
          class="ram-grid"
          style={{
            gridTemplateColumns: `auto repeat(${columns}, minmax(${minCellWidthFor(radix)}px, 1fr))`,
          }}
        >
          <div class="ram-grid-corner" />
          {range(columns).map(column => (
            <div key={column} class="ram-grid-head">{column.toString(16).toUpperCase()}</div>
          ))}

          {range(RAM_SIZE / columns).map(row => [
            <div key={`a${row}`} class="ram-grid-addr">{hex(row * columns, 2)}</div>,
            ...range(columns).map(column => {
              const address = row * columns + column;
              return (
                <MemoryCell
                  key={address}
                  address={address}
                  value={cells[address]}
                  radix={radix}
                  draft={editing?.address === address ? editing.text : null}
                  live={liveAddress === address}
                  onEdit={() => setEditing({ address, text: formatByte(cells[address], radix) })}
                  onDraft={text => setEditing({ address, text })}
                  onCommit={commitCell}
                  onCancel={() => setEditing(null)}
                />
              );
            }),
          ])}
        </div>
      </div>
    </div>
  );
}

interface MemoryCellProps {
  address: number;
  value: number;
  radix: Radix;
  /** Text being typed into this cell, or null when it is not the one being edited. */
  draft: string | null;
  /** The address the circuit is presenting on the RAM's address pin right now. */
  live: boolean;
  onEdit: () => void;
  onDraft: (text: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function MemoryCell(props: MemoryCellProps) {
  const { address, value, radix, draft, live, onEdit, onDraft, onCommit, onCancel } = props;

  if (draft !== null) {
    return (
      <input
        class="ram-cell ram-cell-input"
        autofocus
        value={draft}
        onInput={e => onDraft((e.target as HTMLInputElement).value)}
        onBlur={onCommit}
        onKeyDown={e => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') onCancel();
        }}
      />
    );
  }

  const classes = ['ram-cell'];
  if (value === 0) classes.push('is-zero');
  if (live) classes.push('is-live');

  return (
    <button class={classes.join(' ')} title={`${hex(address, 2)} = ${value}`} onClick={onEdit}>
      {formatByte(value, radix)}
    </button>
  );
}

/** What the circuit is asking of the chip this instant — the other half of debugging it. */
function PinStatus({ gate, state }: { gate: Gate; state: EditorState }) {
  const pin = (index: number) => {
    const value = state.circuit.getPinValue(gate.id, 'input', index);
    return value === null ? '—' : String(value);
  };

  return (
    <div class="ram-status">
      <span>R <b>{pin(PIN_READ)}</b></span>
      <span>W <b>{pin(PIN_WRITE)}</b></span>
      <span>A <b>{pin(PIN_ADDRESS)}</b></span>
      <span>V <b>{pin(PIN_VALUE)}</b></span>
    </div>
  );
}

/**
 * Content-box width of an element, kept current as the window around it is resized.
 *
 * Measured rather than derived from a CSS breakpoint because these windows are resized by
 * hand: the layout has to answer to the element's own width, not the viewport's. The
 * content box, not `clientWidth`, because that includes the scroll box's padding — which is
 * room the grid does not get.
 *
 * No initial measurement is needed: ResizeObserver reports the element once on observe().
 */
function useContentWidth(ref: RefObject<HTMLElement>): number {
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(entries => {
      const box = entries[0].contentBoxSize?.[0];
      setWidth(box ? box.inlineSize : entries[0].target.clientWidth);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);

  return width;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Live cells, falling back to the boot image the next reset would load. */
function readCells(gate: Gate): number[] {
  if (gate.cells) return gate.cells;
  return padRamCells(gate.rom ?? []);
}

function formatByte(value: number, radix: Radix): string {
  switch (radix) {
    case 'hex': return hex(value, 2);
    case 'dec': return String(value);
    case 'bin': return value.toString(2).padStart(8, '0');
    case 'ascii': return printable(value);
  }
}

function printable(value: number): string {
  return value >= 0x20 && value <= 0x7E ? String.fromCharCode(value) : '·';
}

/** Parse an edited cell, or null when the text is not a byte in this notation. */
function parseByte(text: string, radix: Radix): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  if (radix === 'ascii') {
    return trimmed.length === 1 ? trimmed.charCodeAt(0) & 0xFF : null;
  }

  // A prefix always wins over the current notation, so "0x1F" works in the decimal view.
  const prefixed = trimmed.match(/^0([xbo])(.+)$/i);
  const base = prefixed
    ? { x: 16, b: 2, o: 8 }[prefixed[1].toLowerCase() as 'x' | 'b' | 'o']
    : { hex: 16, dec: 10, bin: 2 }[radix];
  const digits = prefixed ? prefixed[2] : trimmed;

  const value = parseInt(digits, base);
  if (isNaN(value) || value < 0 || value > 0xFF) return null;
  return value;
}

function hex(value: number, width: number): string {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function range(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i);
}
