import { useEffect, useRef } from 'preact/hooks';
import { Renderer } from '../../circuit-builder/editor/render/Renderer.ts';
import { InputHandler } from '../../circuit-builder/editor/InputHandler.ts';
import { notifyStateChange } from '../editorStore.ts';
import { navigateTo } from '../screenManager.ts';
import {
  buildLevelMapEditable,
  exportLevelMap,
  getMapEditorHistory,
  getMapEditorState,
} from '../../circuit-builder/levels/levelManager.ts';
import { WIRE_COLORS } from '../../circuit-builder/editor/consts.ts';
import { type GateType, getAllGateDefinitions } from '../../circuit-builder/editor/gates.ts';

export function LevelMapEditorScreen() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current!;

    buildLevelMapEditable();
    const state = getMapEditorState()!;
    const history = getMapEditorHistory()!;

    // Canvas
    const canvas = document.createElement('canvas');
    Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' });
    container.appendChild(canvas);

    // Renderer
    const renderer = new Renderer(canvas);
    renderer.startLoop(
      () => state,
      () => { notifyStateChange(); },
    );

    // Input — full editor interaction (drag gates, wire, etc.)
    const input = new InputHandler(canvas, () => state, () => history, renderer);
    input.attach();

    state.renderDirty = true;

    const onResize = () => { state.renderDirty = true; };
    window.addEventListener('resize', onResize);

    return () => {
      renderer.stopLoop();
      input.detach();
      window.removeEventListener('resize', onResize);
      container.removeChild(canvas);
    };
  }, []);

  function handleUndo() {
    const h = getMapEditorHistory();
    if (h) { h.undo(); notifyStateChange(); }
  }
  function handleRedo() {
    const h = getMapEditorHistory();
    if (h) { h.redo(); notifyStateChange(); }
  }
  function handleExport() {
    exportLevelMap();
    alert('Exported to console — check DevTools');
  }
  function handleColorChange(color: string) {
    const s = getMapEditorState();
    if (s) { s.wireColor = color; notifyStateChange(); }
  }
  function handleStamp(type: GateType) {
    const s = getMapEditorState();
    if (s) { s.mode = { kind: 'stamping', gateType: type }; s.renderDirty = true; }
  }
  function handleDragStart(type: GateType) {
    const s = getMapEditorState();
    if (s) s.mode = { kind: 'stamping', gateType: type };
  }
  function handleDragEnd() {
    const s = getMapEditorState();
    if (s) s.mode = { kind: 'normal' };
  }

  const NON_PLACEABLE = new Set(['component', 'level']);
  const sidebarEntries = getAllGateDefinitions().filter(([type]) => !NON_PLACEABLE.has(type));

  return (
    <>
      <div class="toolbar">
        <button class="toolbar-btn" onClick={() => navigateTo('levelSelect')}>
          Back
        </button>
        <button class="toolbar-btn" onClick={handleUndo}>Undo</button>
        <button class="toolbar-btn" onClick={handleRedo}>Redo</button>
        <div class="toolbar-spacer" />
        {WIRE_COLORS.map(color => (
          <button
            key={color}
            class="toolbar-btn color-btn"
            style={{ backgroundColor: color, width: '24px', height: '24px', minWidth: '24px', padding: 0, borderRadius: '4px' }}
            onClick={() => handleColorChange(color)}
          />
        ))}
        <div class="toolbar-spacer" />
        <button class="toolbar-btn" style={{ fontWeight: 'bold' }} onClick={handleExport}>
          Export
        </button>
      </div>
      <div class="main-row">
        <div id="editor-container" ref={containerRef} />
        <MapEditorSidebar entries={sidebarEntries} onStamp={handleStamp} onDragStart={handleDragStart} onDragEnd={handleDragEnd} />
      </div>
    </>
  );
}

import type { GateDefinition } from '../../circuit-builder/editor/gates.ts';

function MapEditorSidebar({ entries, onStamp, onDragStart, onDragEnd }: {
  entries: [GateType, GateDefinition][];
  onStamp: (type: GateType) => void;
  onDragStart: (type: GateType) => void;
  onDragEnd: () => void;
}) {
  const didDrag = useRef(false);

  return (
    <div class="sidebar">
      <div class="sidebar-header">Components</div>
      {entries.map(([type, def]) => (
        <div
          key={type}
          class="sidebar-item"
          draggable
          onMouseDown={() => { didDrag.current = false; }}
          onDragStart={(e: DragEvent) => {
            didDrag.current = true;
            if (!e.dataTransfer) return;
            e.dataTransfer.setData('text/plain', type);
            e.dataTransfer.effectAllowed = 'copy';
            const empty = document.createElement('div');
            empty.style.width = '0';
            empty.style.height = '0';
            document.body.appendChild(empty);
            e.dataTransfer.setDragImage(empty, 0, 0);
            requestAnimationFrame(() => document.body.removeChild(empty));
            (e.currentTarget as HTMLElement).style.opacity = '0.6';
            onDragStart(type);
          }}
          onDragEnd={(e: DragEvent) => {
            (e.currentTarget as HTMLElement).style.opacity = '1';
            onDragEnd();
          }}
          onClick={() => { if (!didDrag.current) onStamp(type); }}
        >
          <div class="sidebar-item-label">{def.label}</div>
          <div class="sidebar-item-desc">{def.description}</div>
        </div>
      ))}
    </div>
  );
}
