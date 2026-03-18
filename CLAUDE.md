
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

nand-craft is a vanilla TypeScript + Vite web application (no framework). ES modules throughout (`"type": "module"`).

## Commands

- **Dev server:** `npm run dev` (Vite with HMR)
- **Build:** `npm run build` (runs `tsc && vite build` — TypeScript type-check then Vite bundle)
- **Preview production build:** `npm run preview`

No test runner or linter is configured.

## Architecture

- `index.html` — HTML entry point, loads `/src/main.ts`
- `src/main.ts` — Renders the page via innerHTML template literals, initializes interactive components
- `src/counter.ts` — Isolated counter module with internal state and DOM event binding
- `src/style.css` — Global styles using CSS variables, CSS nesting, dark mode via `prefers-color-scheme`, responsive breakpoint at 1024px
- `src/assets/` — Static images/SVGs imported as ES modules
- `public/` — Served as-is (favicon, icon spritesheet)

## TypeScript

Strict mode with `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `verbatimModuleSyntax` enabled. Target ES2023.
