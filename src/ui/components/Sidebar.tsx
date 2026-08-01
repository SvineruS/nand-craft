import { useRef, type MutableRef } from 'preact/hooks';
import { type GateDefinition, type GateType, getGateDefinition } from '../../circuit-builder/editor/gates.ts';
import type { BuiltInGateType } from '../../circuit-builder/simulation/gateTypes.ts';
import { useEditorState } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { isGateAllowed, getGateCount, type GateConstraints } from '../../circuit-builder/levels/levelTypes.ts';
import type { EditorState } from "../../circuit-builder/editor/EditorState.ts";
import { getAllComponents, isComponentType } from '../../circuit-builder/components/componentRegistry.ts';
import { gateColorsOf } from '../../circuit-builder/editor/gateColors.ts';

interface SidebarProps {
  onDragEnd: () => void;
}

const CATEGORIES = [
  { label: '1-bit Logic', types: ['nand', 'and', 'or', 'nor', 'xor', 'xnor', 'not', '3bit-or', '3bit-and'] },
  { label: '8-bit Logic', types: ['8bit-or', '8bit-nor', '8bit-not'] },
  { label: 'Math', types: ['2bit-adder', '3bit-adder', '8bit-adder', '8bit-negative', '8bit-subtractor'] },
  { label: 'Routing', types: ['mux', '8bit-mux', 'tristate', '8bit-tristate', '1bit-decoder', '3bit-decoder', 'splitter', 'joiner'] },
  { label: 'Memory', types: ['delay', 'rs-latch', '1bit-memory', '8bit-memory', '8bit-counter', '8bit-counter-reset'] },
  { label: 'Constants', types: ['constant', 'constant-8bit', 'constant-16bit'] },
  { label: 'I/O', types: [
    'input', 'input-8bit', 'input-16bit',
    'input-sw', 'input-8bit-sw', 'input-16bit-sw',
    'output', 'output-8bit', 'output-16bit',
    'output-sw', 'output-8bit-sw', 'output-16bit-sw',
  ]},
] as const satisfies readonly { label: string; types: readonly BuiltInGateType[] }[];

/**
 * Every built-in gate type must appear in a category above, or it silently never shows up
 * in the sidebar and becomes unplaceable. 'level' is excluded: it is the level-map node,
 * not a gate the player places.
 *
 * If this line errors, the type in the message is the one missing from CATEGORIES.
 */
type Categorized = typeof CATEGORIES[number]['types'][number];
type AssertNever<T extends never> = T;
export type _EveryGateTypeIsCategorized =
  AssertNever<Exclude<Exclude<BuiltInGateType, 'level'>, Categorized>>;

export function Sidebar({ onDragEnd }: SidebarProps) {
  const didDrag = useRef(false);
  const { level } = useEditor();
  const constraints = level?.gateConstraints;
  const editorState = useEditorState();

  const isAllowed = (type: GateType) => isGateAllowed(type, constraints);

  // Recent section
  const recentTypes = editorState.recentGateTypes.filter(isAllowed);

  return (
    <div class="sidebar">
      {recentTypes.length > 0 && (
        <>
          <div class="sidebar-header">Recent</div>
          {recentTypes.map(type => (
            <GateItem key={`recent-${type}`} type={type} def={getGateDefinition(type)} constraints={constraints}
              editorState={editorState} didDrag={didDrag} onDragEnd={onDragEnd} />
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
                editorState={editorState} didDrag={didDrag} onDragEnd={onDragEnd} />
            ))}
          </>
        );
      })}
      {(() => {
        // Show custom components filtered by gate constraints
        const components = getAllComponents().filter(comp => {
          if (!constraints?.allow) return true; // No constraints = show all
          // Component allowed if all its primitive gate types are allowed
          return comp.usedGateTypes.every(t => isGateAllowed(t, constraints));
        });
        if (components.length === 0) return null;
        return (
          <>
            <div class="sidebar-header">Components</div>
            {components.map(comp => {
              const def = getGateDefinition(comp.id);
              return (
                <GateItem key={comp.id} type={comp.id} def={def} constraints={undefined}
                  editorState={editorState} didDrag={didDrag} onDragEnd={onDragEnd} />
              );
            })}
          </>
        );
      })()}
    </div>
  );
}


interface GateItemProps {
  type: GateType;
  def: GateDefinition;
  constraints: GateConstraints | undefined;
  editorState: EditorState;
  didDrag: MutableRef<boolean>;
  onDragEnd: () => void;
}

function GateItem({ type, def, constraints, editorState, didDrag, onDragEnd }: GateItemProps) {
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
        // onDragStart sets stamping mode; we set componentId directly to avoid race
        editorState.mode = { kind: 'stamping', gateType: type };
      }}
      onDragEnd={(e: DragEvent) => {
        (e.currentTarget as HTMLElement).style.opacity = '1';
        onDragEnd();
      }}
      onClick={() => {
        if (!didDrag.current && !atLimit) {
          // Set stamping mode directly with componentId
          editorState.mode = { kind: 'stamping', gateType: type };
          editorState.renderDirty = true;
        }
      }}
    >
      <div class="sidebar-item-row">
        {def.svg && (
          <svg
            class="sidebar-item-icon"
            // Component SVGs extend beyond grid points (border padding), need wider viewBox
            viewBox={isComponentType(type)
              ? `${-0.5} ${-0.5} ${Math.max(def.width, 1) + 1} ${Math.max(def.height, 1) + 1}`
              : `0 0 ${def.width} ${def.height}`}
          >
            {Array.isArray(def.svg) ? def.svg.map((layer, i) => {
              const l = typeof layer === 'string' ? { path: layer } : layer;
              return <path key={i} d={l.path}
                fill={l.fill === false ? 'none' : gateColorsOf(def).fill}
                stroke={gateColorsOf(def).stroke} stroke-width="0.08"
                opacity={l.alpha ?? 1} />;
            }) : (
              <path d={def.svg} fill={gateColorsOf(def).fill}
                stroke={gateColorsOf(def).stroke} stroke-width="0.08" />
            )}
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
