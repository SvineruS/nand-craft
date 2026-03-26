import { useRef } from 'preact/hooks';
import type { GateType } from '../types.ts';
import { getAllGateDefinitions } from '../levels/gates.ts';

interface SidebarProps {
  onStamp: (type: GateType) => void;
  onDragStart: (type: GateType) => void;
  onDragEnd: () => void;
}

export function Sidebar({ onStamp, onDragStart, onDragEnd }: SidebarProps) {
  const didDrag = useRef(false);

  const entries = getAllGateDefinitions()
    .filter(([, def]) => def.placeable);

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
          onClick={() => {
            if (!didDrag.current) onStamp(type);
          }}
        >
          <div class="sidebar-item-label">{def.label}</div>
          <div class="sidebar-item-desc">{def.description}</div>
        </div>
      ))}
    </div>
  );
}
