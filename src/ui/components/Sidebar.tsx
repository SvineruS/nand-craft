import { useRef } from 'preact/hooks';
import { type GateType, getAllGateDefinitions } from '../../circuit-builder/editor/gates.ts';
import { currentLevel, useEditorState } from '../editorStore.ts';
import { isGateAllowed, getGateCount } from '../../circuit-builder/levels/levelTypes.ts';

interface SidebarProps {
  onStamp: (type: GateType) => void;
  onDragStart: (type: GateType) => void;
  onDragEnd: () => void;
}

export function Sidebar({ onStamp, onDragStart, onDragEnd }: SidebarProps) {
  const didDrag = useRef(false);
  const level = currentLevel.value;
  const constraints = level?.gateConstraints;
  const editorState = useEditorState();

  const entries = getAllGateDefinitions()
    .filter(([type, def]) => def.placeable && isGateAllowed(type, constraints));

  return (
    <div class="sidebar">
      <div class="sidebar-header">Components</div>
      {entries.map(([type, def]) => {
        const maxCount = constraints?.maxCount?.[type];
        const currentCount = editorState && maxCount !== undefined ? getGateCount(type, editorState.circuit.gates.values()) : 0;
        const atLimit = maxCount !== undefined && currentCount >= maxCount;

        return (
          <div
            key={type}
            class={`sidebar-item${atLimit ? ' sidebar-item-disabled' : ''}`}
            draggable={!atLimit}
            onMouseDown={() => { didDrag.current = false; }}
            onDragStart={(e: DragEvent) => {
              if (atLimit) { e.preventDefault(); return; }
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
            onClick={() => {
              if (!didDrag.current && !atLimit) onStamp(type);
            }}
          >
            <div class="sidebar-item-label">
              {def.label}
              {maxCount !== undefined && <span class="sidebar-item-count"> {currentCount}/{maxCount}</span>}
            </div>
            <div class="sidebar-item-desc">{def.description}</div>
          </div>
        );
      })}
    </div>
  );
}
