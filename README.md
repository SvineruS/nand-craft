# nand-craft

A browser-based digital logic simulator and puzzle game. Build circuits from NAND gates, solve puzzles, and learn how computers work from the ground up.

### **[>>> Play online <<<](https://svinerus.github.io/nand-craft/)**

## Controls

### Keyboard

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

### Mouse

| Action | Result |
|--------|--------|
| **Left click** gate | Select |
| **Left drag** gate | Move (with attached wires) |
| **Left click** pin / wire node | Start wiring |
| **Left drag** to pin / node / wire | Complete wire |
| **Double-click** constant | Toggle value |
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

### Sidebar

- **Click** a component to enter stamp mode (click to place repeatedly)
- **Drag** a component onto the canvas to place once

### Test Editor

Open with the **Tests** button in sandbox mode. Write custom tests using three modes:

- **@mode table** — truth table with `@inputs` / `@outputs` headers and value rows
- **@mode code** — JS function that computes expected outputs
- **@mode queue** — sequential tests with switch I/O gates and enable handshake

Click **Apply** to generate test cases, then **Step** or **Run All** to execute.

## Inspired by

Also check out [Turing Complete](https://store.steampowered.com/app/1444480/Turing_Complete/) - inspiration for circuit builder part of the game.
~~I hope there will be another part besides the circuit builder.~~
