# nand-craft: Circuit Builder

A browser-based digital logic simulator and puzzle game. Build circuits from NAND gates, test them against truth tables, and learn how computers work from the ground up.

## Features

- **12 gate types** — NAND, AND, OR, NOR, NOT, delay, tri-state, constant, splitter, joiner, I/O
- **Real-time simulation** — animated signal flow with color-coded values (T/F for 1-bit, decimal for 8-bit, hex for 16-bit)
- **Truth table testing** — step through test cases one at a time or run all at once
- **Full editor** — undo/redo, copy/paste, stamp mode, rotation, area select
- **Error detection** — short circuits (feedback loops) and bus contention highlighted in real-time
- **Multi-bit wires** — 1-bit (orange pins), 8-bit (blue pins), 16-bit (pink pins) with gradient signal visualization
- **Wire routing** — automatic horizontal/vertical/diagonal routing between grid points

## Quick Start

```bash
npm install
npm run dev      # dev server with HMR
npm run build    # production build
npm run preview  # preview production build
```

## Controls

### Keyboard

| Key | Action |
|-----|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Delete` / `Backspace` | Delete selected |
| `R` | Rotate selection 90° (or rotate clipboard in paste mode) |
| `E` | Apply wire color to selected segments |
| `Shift+E` / `Ctrl+E` | Flood-fill wire color to all connected segments |
| `Ctrl+C` | Copy selection |
| `Ctrl+X` | Cut selection |
| `Ctrl+V` | Paste (enter paste mode) |
| `Q` | Eyedropper — over gate: stamp mode; over wire: pick color |
| `Escape` | Cancel current action (wiring, dragging, stamp, paste) |

### Left Mouse Button

| Action | Result |
|--------|--------|
| Click gate | Select gate |
| Drag gate | Move gate (with attached wires) |
| Click pin or wire node | Start wiring |
| Drag to pin/node/wire/empty | Complete wire connection |
| Double-click constant gate | Toggle value |
| Double-click wire node | Start dragging node |
| Double-click pin | Detach wire node from pin and drag it |
| Double-click wire segment | Split wire and drag new node |
| Double-click empty space | Create wire node and start wiring |
| Ctrl+click | Toggle multi-select |
| Drag empty space | Area select rectangle |
| Shift+drag gate | Disconnect drag (wires stay, gate moves freely) |

### Middle Mouse Button

| Action | Result |
|--------|--------|
| Click gate | Disconnect drag |
| Click wire node | Drag node (merge on release if no movement) |
| Click wire segment | Split and drag new node |
| Click pin | Detach wire node and drag |
| Click empty space | Pan canvas |

### Right Mouse Button

| Action | Result |
|--------|--------|
| Right-click gate | Delete gate |
| Right-click wire node | Delete node and attached segments |
| Right-click wire segment | Delete segment |
| Shift+right-click wire | Delete all connected wires |
| Right-click empty space | Clear selection |
| Right-click (stamp/paste mode) | Cancel mode |

### Scroll Wheel

| Action | Result |
|--------|--------|
| Scroll up | Zoom in (max 4x) |
| Scroll down | Zoom out (min 0.25x) |

### Sidebar

- **Click** a component to enter stamp mode (click canvas to place repeatedly)
- **Drag** a component to the canvas to place it once

## Gate Types

| Gate | Size | Pins | Description |
|------|------|------|-------------|
| **NAND** | 3x2 | 2 in, 1 out | Bitwise NAND — the universal gate |
| **AND** | 3x2 | 2 in, 1 out | Bitwise AND |
| **OR** | 3x2 | 2 in, 1 out | Bitwise OR |
| **NOR** | 3x2 | 2 in, 1 out | Bitwise NOR |
| **NOT** | 2x2 | 1 in, 1 out | Inverter |
| **DLY** | 3x2 | 1 in, 1 out | 1-tick delay (breaks feedback loops) |
| **TRI** | 2x2 | 2 in (data + enable), 1 out | Tri-state buffer (high-Z when disabled) |
| **C** | 2x2 | 1 out | Constant value (double-click to toggle) |
| **SPL** | 2x7 | 1x8-bit in, 8x1-bit out | 8-bit bus splitter |
| **JON** | 2x7 | 8x1-bit in, 1x8-bit out | 8-bit bus joiner |
| **IN** | 2x2 | 1 out | Level input (auto-placed) |
| **OUT** | 2x2 | 1 in | Level output (auto-placed) |

Each gate has a unique color and SVG shape. Sizes are in grid units (20px each).

## Levels

The game includes puzzle levels where you build circuits from basic gates:

| Level | Goal | Hint |
|-------|------|------|
| **NOT** | Invert the input | Connect both NAND inputs together |
| **AND** | Output 1 only when both inputs are 1 | NAND is the opposite of AND |
| **OR** | Output 1 when at least one input is 1 | De Morgan's law — 3 NAND gates |

Levels auto-create input/output gates. The truth table shows expected vs actual values for each test case. Use **Step** to test one case at a time or **Run All** to test everything.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    UI Layer                      │
│  Preact + Signals (Toolbar, Sidebar, TestPanel)  │
├─────────────────────────────────────────────────┤
│                 Editor Layer                     │
│  Canvas 2D (Renderer, InputHandler, Commands)    │
├─────────────────────────────────────────────────┤
│              Simulation Engine                   │
│  Tick-based propagation, net resolution, cycles  │
├─────────────────────────────────────────────────┤
│                 Data Model                       │
│  Circuit, Gates, Pins, Wires, Nets (types.ts)    │
└─────────────────────────────────────────────────┘
```

- **Data Model** (`types.ts`) — flat, ID-indexed maps for gates, pins, wire nodes, wire segments, nets
- **Simulation** (`simulation/`) — tick-based engine: reset pins → set inputs → propagate combinational → advance delay gates → collect outputs
- **Editor** (`editor/`) — Canvas 2D rendering, mouse/keyboard input handling, undo/redo command history, gate geometry definitions
- **UI** (`ui/`) — Preact components for toolbar, sidebar, truth table, properties panel, level dialog
- **Levels** (`levels/`) — level definitions with JSON test cases, test runner

## Project Structure

```
src/
  main.tsx              Entry point
  types.ts              Data model
  style.css             Global styles (CSS variables, dark theme)
  editor/
    Editor.ts           Orchestrator
    EditorState.ts      Mutable state shape
    Renderer.ts         Canvas 2D drawing
    InputHandler.ts     Mouse/keyboard/drag events
    CommandHistory.ts   Undo/redo commands
    geometry.ts         Gate definitions, pin positions, grid helpers
  simulation/
    engine.ts           Tick-based simulation
    evaluate.ts         Gate evaluation, net resolution, cycle detection
  testing/
    interpreter.ts      Test case runner
  levels/
    registry.ts         Level definitions
    runner.ts           Level test orchestration
  ui/
    App.tsx             Root component
    Toolbar.tsx         Undo/redo, color picker
    Sidebar.tsx         Gate palette
    TestPanel.tsx       Test controls
    TruthTable.tsx      Truth table display
    PropertiesPanel.tsx Gate/wire property editor
    LevelDialog.tsx     Level intro modal
    editorStore.ts      Signal-based state bridge
```

## Tech Stack

- [Preact](https://preactjs.com/) + [@preact/signals](https://preactjs.com/guide/v10/signals/) — lightweight reactive UI
- [TypeScript](https://www.typescriptlang.org/) 5.9 — strict mode
- [Vite](https://vitejs.dev/) 8 — bundler with HMR
- Canvas 2D — circuit rendering (no WebGL)
- Zero CSS framework — custom dark theme with CSS variables and nesting

## License

MIT
