# Controls

<!--
  This file is the single source for the game's controls: linked from the README and
  rendered in-game under Controls in the main menu (src/ui/components/ControlsWindow.tsx).

  The in-game renderer (src/ui/markdown.tsx) covers headings, tables, bullet lists, fenced
  code, and inline code / bold / italic / strikethrough / links. Stay inside that subset —
  anything else renders as its own source text. Comments like this one are skipped, and the
  title above is dropped because the window already has one.
-->

## Keyboard

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected |
| `R` | Rotate selection 90° |
| `E` | Apply wire color to selected segments |
| `Shift+E` | Flood-fill wire color to all connected segments |
| `Ctrl+C` / `Ctrl+X` / `Ctrl+V` | Copy / Cut / Paste |
| `Q` | Eyedropper — over gate: stamp mode; over wire: pick color |
| `Escape` | Cancel current action |

## Mouse

| Action | Result |
|--------|--------|
| **Left click** gate | Select |
| **Left drag** gate | Move (with attached wires) |
| **Left click** pin / wire node | Start wiring |
| **Left drag** to pin / node / wire | Complete wire |
| **Double-click** constant | Toggle value |
| **Click** a button on a RAM chip | Open its memory or program window |
| **Double-click** wire node | Drag node |
| **Double-click** wire segment | Split and drag |
| **Double-click** empty space | Create node and start wiring |
| **Ctrl+click** | Toggle multi-select |
| **Left drag** empty space | Area select |
| **Shift+drag** gate | Disconnect drag (wires stay) |
| **Middle click** empty space | Pan canvas |
| **Right-click** | Delete (gate / node / segment) |
| **Shift+right-click** wire | Delete all connected |
| **Scroll** | Zoom in/out |

## Sidebar

- **Click** a component to enter stamp mode (click to place repeatedly)
- **Drag** a component onto the canvas to place once

## Windows

**Goals**, **Hints**, **Tests** and the RAM windows are floating windows rather than
modals — the board stays visible and clickable behind them. Drag one by its header, resize it
from the grip in the bottom-right corner, and close it with **✕** or **Escape**. Each window
remembers where you left it and how big you made it.

## Test Editor

Open with the **Tests** button in sandbox mode. Write custom tests using three modes:

- **@mode table** — truth table with `@inputs` / `@outputs` headers and value rows
- **@mode code** — JS function that computes expected outputs
- **@mode queue** — sequential tests with switch I/O gates and enable handshake

Click **Apply** to generate test cases, then **Step** or **Run All** to execute.

## RAM Windows

Every RAM chip carries two small buttons in its bottom-right corner, each opening a window
of its own — they can be open at the same time, side by side, so the bytes stay in view while
the program that fills them is edited. Both are also reachable from the Properties panel.

- **Memory** (even bars) — all 256 bytes in hex, decimal, binary or ASCII, with the address
  the circuit is currently presenting highlighted. Click a byte to edit it.
- **Program** (ragged bars) — a file explorer and a text editor for writing the bytes as
  source. **Flash** assembles the program and writes it into the chip, keeping it as the
  chip's boot image so it is reloaded whenever a test run resets memory.

Programs are plain byte sequences — the game has no instruction set, your CPU defines what a
byte means. The default syntax supports decimal / `0x` / `0b` / `0o` / `'c'` / `"text"`
values, arithmetic and bit operators, `#define` constants and copy-paste macros with
arguments, `#include`, `#org` and labels:

```asm
#include "cpu/opcodes.inc"
#define LOADI(reg, value) 0x10 | reg, value

start:
  LOADI(1, 42)
  ADD
  JMP start
```

Files live in a small localStorage-backed file system (folders come from the path, e.g.
`cpu/opcodes.inc`) and can be renamed and deleted from the explorer. Press **?** in the
window for the full syntax reference. The syntax itself is a registry entry
(`src/circuit-builder/asm/registry.ts`), so alternative preprocessors can be added.
