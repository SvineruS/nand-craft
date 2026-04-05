import { useRef, type MutableRef } from 'preact/hooks';
import { type GateDefinition, type GateType, getGateDefinition } from '../../circuit-builder/editor/gates.ts';
import { useEditorState } from '../editorStore.ts';
import { getEditor } from '../../circuit-builder/editorInstance.ts';
import { isGateAllowed, getGateCount, type GateConstraints } from '../../circuit-builder/levels/levelTypes.ts';
import type { EditorState } from "../../circuit-builder/editor/EditorState.ts";

interface SidebarProps {
  onStamp: (type: GateType) => void;
  onDragStart: (type: GateType) => void;
  onDragEnd: () => void;
}

interface Category {
  label: string;
  types: GateType[];
}

const CATEGORIES: Category[] = [
  { label: '1-bit Logic', types: ['nand', 'and', 'or', 'nor', 'xor', 'xnor', 'not', '3bit-or', '3bit-and'] },
  { label: '8-bit Logic', types: ['8bit-or', '8bit-nor', '8bit-not'] },
  { label: 'Math', types: ['2bit-adder', '3bit-adder', '8bit-negative'] },
  { label: 'Routing', types: ['switch', 'tristate', '1bit-decoder', '3bit-decoder', 'splitter', 'joiner'] },
  { label: 'Memory', types: ['delay', 'rs-latch', '8bit-memory', '8bit-counter', '8bit-counter-reset'] },
  { label: 'Constants', types: ['constant', 'constant-8bit', 'constant-16bit'] },
];

export function Sidebar({ onStamp, onDragStart, onDragEnd }: SidebarProps) {
  const didDrag = useRef(false);
  const level = getEditor().level;
  const constraints = level?.gateConstraints;
  const editorState = useEditorState();

  const isAllowed = (type: GateType) => {
    const def = getGateDefinition(type);
    return def.placeable && isGateAllowed(type, constraints);
  };

  // Recent section
  const recentTypes = editorState.recentGateTypes.filter(isAllowed);

  return (
    <div class="sidebar">
      {recentTypes.length > 0 && (
        <>
          <div class="sidebar-header">Recent</div>
          {recentTypes.map(type => (
            <GateItem key={`recent-${type}`} type={type} def={getGateDefinition(type)} constraints={constraints}
              editorState={editorState} didDrag={didDrag} onDragStart={onDragStart} onDragEnd={onDragEnd} onStamp={onStamp} />
          ))}
        </>
      )}
      {CATEGORIES.map(cat => {
        const types = cat.types.filter(isAllowed);
        if (types.length === 0) return null;
        return (
          <>
            <div class="sidebar-header">{cat.label}</div>
            {types.map(type => (
              <GateItem key={type} type={type} def={getGateDefinition(type)} constraints={constraints}
                editorState={editorState} didDrag={didDrag} onDragStart={onDragStart} onDragEnd={onDragEnd} onStamp={onStamp} />
            ))}
          </>
        );
      })}
    </div>
  );
}


interface GateItemProps {
  type: GateType;
  def: GateDefinition;
  constraints: GateConstraints | undefined;
  editorState: EditorState;
  didDrag: MutableRef<boolean>;
  onDragStart: (type: GateType) => void;
  onDragEnd: () => void;
  onStamp: (type: GateType) => void;
}

function GateItem({ type, def, constraints, editorState, didDrag, onDragStart, onDragEnd, onStamp }: GateItemProps) {
  const maxCount = constraints?.maxCount?.[type];
  const currentCount = editorState && maxCount !== undefined ? getGateCount(type, editorState.circuit.gates.values()) : 0;
  const atLimit = maxCount !== undefined && currentCount >= maxCount;

  return (
    <div
      class={`sidebar-item${atLimit ? ' sidebar-item-disabled' : ''}`}
      draggable={!atLimit}
      onMouseDown={() => {
        didDrag.current = false;
      }}
      onDragStart={(e: DragEvent) => {
        if (atLimit) {
          e.preventDefault();
          return;
        }
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
      <div class="sidebar-item-row">
        {def.svg && (
          <svg
            class="sidebar-item-icon"
            viewBox={`0 0 ${def.width} ${def.height}`}
          >
            <path d={def.svg} fill={def.color ?? '#444'} stroke={def.stroke ?? '#888'} stroke-width="0.08" />
          </svg>
        )}
        <div>
          <div class="sidebar-item-label">
            {def.label}
            {maxCount !== undefined && <span class="sidebar-item-count"> {currentCount}/{maxCount}</span>}
          </div>
          <div class="sidebar-item-desc">{def.description}</div>
        </div>
      </div>
    </div>
  );
}
