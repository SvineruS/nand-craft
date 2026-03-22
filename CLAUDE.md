# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [README.md](README.md) for full project documentation, controls reference, and architecture overview.

## Project Overview

nand-craft is a circuit-building game built with TypeScript + Preact + Vite. The canvas editor uses raw Canvas 2D; surrounding UI panels use Preact + @preact/signals.

## Commands

- **Dev server:** `npm run dev` (Vite with HMR)
- **Build:** `npm run build` (runs `tsc && vite build` — TypeScript type-check then Vite bundle)
- **Preview production build:** `npm run preview`

No test runner or linter is configured.

## Architecture

- `src/main.tsx` — Entry point, renders Preact `<App />` component
- `src/ui/App.tsx` — Root component, creates Editor, manages levels and test execution
- `src/ui/editorStore.ts` — Signal-based bridge between mutable EditorState and Preact reactivity
- `src/editor/` — Canvas 2D editor (Editor, Renderer, InputHandler, CommandHistory, geometry)
- `src/simulation/` — Tick-based simulation engine (engine, evaluate)
- `src/levels/` — Level definitions and test runner
- `src/ui/*.tsx` — Preact UI components (Toolbar, Sidebar, TestPanel, TruthTable, PropertiesPanel, LevelDialog)
- `src/style.css` — Global styles with CSS variables, nesting, dark theme

## TypeScript

Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `verbatimModuleSyntax`, and `erasableSyntaxOnly` enabled. Target ES2023. JSX via Preact (`jsxImportSource: "preact"`).

## Key Patterns

- **Gate definitions** are in `src/editor/geometry.ts` (`GATE_DEFS`) — single source of truth for gate types, sizes, pins, SVG shapes, colors
- **EditorState** is mutable — mutated by Editor, InputHandler, CommandHistory; bridged to Preact via `stateVersion` signal
- **Commands** (CommandHistory) are undoable/redoable — all circuit mutations go through commands
- **Orphan cleanup** — RemoveWireSegmentCommand and RemoveWireNodeCommand cascade-delete free wire nodes with no remaining connections
