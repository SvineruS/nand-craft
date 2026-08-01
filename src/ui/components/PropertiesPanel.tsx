import { useRef } from 'preact/hooks';
import { ramDialogGateId, solvedLevelIds, useEditorState } from '../editorStore.ts';
import { findGateDefinition, openGateDefinition } from '../gateNav.ts';
import { getGateDefinition, getPinBitWidth } from '../../circuit-builder/editor/gates.ts';
import type { EditorState } from '../../circuit-builder/editor/EditorState.ts';
import type { Gate, GateType } from '../../circuit-builder/simulation/gateTypes.ts';
import type { GateId, WireSegmentId } from '../../circuit-builder/editor/types.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { ChangeGateLabelCommand, ChangeGateValueCommand, ChangeWireCommand } from '../../circuit-builder/editor/commands.ts';
import { isConstantGate, isInputGate, isOutputGate, isRamGate } from '../../circuit-builder/simulation/gateTypes.ts';


interface PropertiesPanelProps {
  onExecute: (cmd: Command) => void;
}

export function PropertiesPanel({ onExecute }: PropertiesPanelProps) {
  const state = useEditorState();

  const gateItem = state.selection.find(s => s.type === 'gate');
  if (gateItem?.type === 'gate') {
    const gate = state.circuit.gates.get(gateItem.id);
    if (gate) return <GateProperties gate={gate} state={state} onExecute={onExecute} />;
  }

  const segItem = state.selection.find(s => s.type === 'wireSegment');
  if (segItem?.type === 'wireSegment') {
    const segment = state.circuit.wireSegments.get(segItem.id);
    if (segment) {
      return (
        <WireProperties label={segment.label} onExecute={onExecute} state={state} id={segItem.id} />
      );
    }
  }

  // Nothing selected — hide
  return <div class="props-section" />;
}

interface GatePropertiesProps {
  gate: Gate;
  state: EditorState;
  onExecute: (cmd: Command) => void;
}

/**
 * What the gate is, followed by what the player can change about this one.
 *
 * Every gate gets the descriptive half — type, description, pins, where it is defined —
 * while the editable rows below stay limited to the gates that have something to edit.
 */
function GateProperties({ gate, state, onExecute }: GatePropertiesProps) {
  const def = getGateDefinition(gate.type);
  const isNamable = isInputGate(gate.type) || isOutputGate(gate.type) || isConstantGate(gate.type);
  const hasValue = isInputGate(gate.type) || isConstantGate(gate.type);

  return (
    <div class="props-section" style={{ display: 'block' }}>
      <div class="props-header">Properties</div>
      <div class="props-content">
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <span class="prop-value">{def.label}</span>
        </div>

        <div class="prop-desc">{def.description}</div>

        <DefinitionRow type={gate.type} />

        {isNamable && <LabelRow gate={gate} state={state} onExecute={onExecute} />}
        {hasValue && <ValueRow gate={gate} state={state} onExecute={onExecute} />}
        {isRamGate(gate.type) && <MemoryRow gateId={gate.id} />}
      </div>
    </div>
  );
}

/** The level or component this gate comes from, with a way to open it. */
function DefinitionRow({ type }: { type: GateType }) {
  const ref = findGateDefinition(type, solvedLevelIds.value);
  if (!ref) return null;

  const locked = ref.kind === 'level' && !ref.unlocked;
  return (
    <div class="prop-row">
      <span class="prop-label">{ref.kind === 'level' ? 'Level' : 'Circuit'}</span>
      {locked ? (
        <span class="prop-value prop-value-dim" title="Solve the levels leading to it first">
          {ref.name} {'\u{1F512}'}
        </span>
      ) : (
        <button
          class="prop-link"
          title={ref.kind === 'level' ? `Open level "${ref.name}"` : `Edit circuit "${ref.name}"`}
          onClick={() => openGateDefinition(ref)}
        >
          {ref.name} {'↗'}
        </button>
      )}
    </div>
  );
}

/** Second way into the memory window — the first is the button on the chip itself. */
function MemoryRow({ gateId }: { gateId: GateId }) {
  return (
    <div class="prop-row">
      <span class="prop-label">Memory</span>
      <button
        class="prop-link"
        title="View the bytes and edit the program"
        onClick={() => { ramDialogGateId.value = gateId; }}
      >
        Open {'↗'}
      </button>
    </div>
  );
}

function LabelRow({ gate, state, onExecute }: GatePropertiesProps) {
  const labelBeforeEdit = useRef<string | undefined>(undefined);

  return (
    <div class="prop-row">
      <span class="prop-label">Label</span>
      <input
        type="text"
        class="prop-input prop-input-text"
        value={gate.label ?? ''}
        placeholder="none"
        onFocus={() => {
          labelBeforeEdit.current = gate.label;
        }}
        onInput={(e) => {
          gate.label = (e.target as HTMLInputElement).value || undefined;
          state.renderDirty = true;
        }}
        onBlur={(e) => {
          const v = (e.target as HTMLInputElement).value || undefined;
          if (v !== labelBeforeEdit.current) {
            gate.label = labelBeforeEdit.current;
            onExecute(new ChangeGateLabelCommand(state, gate.id, v));
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
    </div>
  );
}

function ValueRow({ gate, state, onExecute }: GatePropertiesProps) {
  const value = state.circuit.getPinValue(gate.id, 'output', 0);
  const bitWidth = getPinBitWidth(gate.type, 'output', 0);
  const mask = ((1 << bitWidth) >>> 0) - 1;
  const clamp = (raw: string) => {
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? null : Math.max(0, Math.min(mask, parsed));
  };

  return (
    <div class="prop-row">
      <span class="prop-label">Value</span>
      <input
        type="number"
        class="prop-input prop-input-number"
        value={value ?? 0}
        min={0}
        max={mask}
        onChange={(e) => {
          onExecute(new ChangeGateValueCommand(state, [gate.id], clamp((e.target as HTMLInputElement).value) ?? 0));
        }}
        onInput={(e) => {
          const v = clamp((e.target as HTMLInputElement).value);
          if (v !== null) onExecute(new ChangeGateValueCommand(state, [gate.id], v));
        }}
      />
    </div>
  );
}

interface WirePropertiesProps {
  id: WireSegmentId;
  label: string | undefined;
  state: EditorState;
  onExecute: (cmd: Command) => void;
}

function WireProperties({ id, label, state, onExecute }: WirePropertiesProps) {
  return (
    <div class="props-section" style={{ display: 'block' }}>
      <div class="props-header">Properties</div>
      <div class="props-content">
        <div class="prop-row">
          <span class="prop-label">Type</span>
          <span class="prop-value">Wire</span>
        </div>
        <div class="prop-row">
          <span class="prop-label">Label</span>
          <input
            type="text"
            class="prop-input prop-input-text"
            value={label ?? ''}
            placeholder="none"
            onBlur={(e) => {
              const v = (e.target as HTMLInputElement).value || undefined;
              if (v !== label) {
                onExecute(new ChangeWireCommand(state, [id], { label: v }));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}
