import { useRef } from 'preact/hooks';
import { useEditorState } from '../editorStore.ts';
import { getGateDefinition, getPinBitWidth } from '../../circuit-builder/editor/gates.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { ChangeGateLabelCommand, ChangeGateStateCommand, ChangeWireCommand } from '../../circuit-builder/editor/commands.ts';
import { isConstantGate, isInputGate, isOutputGate } from '../../circuit-builder/simulation/gateTypes.ts';


interface PropertiesPanelProps {
  onExecute: (cmd: Command) => void;
}

export function PropertiesPanel({ onExecute }: PropertiesPanelProps) {
  const state = useEditorState();
  const labelBeforeEdit = useRef<string | undefined>(undefined);

  // Check for selected gate (IO/constant only)
  const gateItem = state.selection.find(s => s.type === 'gate');
  if (gateItem?.type === 'gate') {
    const gate = state.circuit.gates.get(gateItem.id);
    if (gate && (isInputGate(gate.type) || isOutputGate(gate.type) || isConstantGate(gate.type))) {
      const def = getGateDefinition(gate.type);

      // Value field for input/constant
      const hasOutput = isInputGate(gate.type) || isConstantGate(gate.type);
      const outValue = hasOutput
        ? state.circuit.getPinValue(gate.id, 'output', 0)
        : undefined;
      const outBitWidth = hasOutput ? getPinBitWidth(gate.type, 'output', 0) : 1;
      const mask = ((1 << outBitWidth) >>> 0) - 1;

      return (
        <div class="props-section" style={{ display: 'block' }}>
          <div class="props-header">Properties</div>
          <div class="props-content">
            <div class="prop-row">
              <span class="prop-label">Type</span>
              <span class="prop-value">{def.label}</span>
            </div>

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

            {hasOutput && outValue !== undefined && (
              <div class="prop-row">
                <span class="prop-label">Value</span>
                <input
                  type="number"
                  class="prop-input prop-input-number"
                  value={outValue ?? 0}
                  min={0}
                  max={mask}
                  onChange={(e) => {
                    let v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (isNaN(v)) v = 0;
                    v = Math.max(0, Math.min(mask, v));
                    onExecute(new ChangeGateStateCommand(state, [gate.id], v));
                  }}
                  onInput={(e) => {
                    let v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (isNaN(v)) return;
                    v = Math.max(0, Math.min(mask, v));
                    onExecute(new ChangeGateStateCommand(state, [gate.id], v));
                  }}
                />
              </div>
            )}

          </div>
        </div>
      );
    }
  }

  // Check for selected wire segment
  const segItem = state.selection.find(s => s.type === 'wireSegment');
  if (segItem?.type === 'wireSegment') {
    const seg = state.circuit.wireSegments.get(segItem.id);
    if (seg) {
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
                value={seg.label ?? ''}
                placeholder="none"
                onBlur={(e) => {
                  const v = (e.target as HTMLInputElement).value || undefined;
                  if (v !== seg.label) {
                    onExecute(new ChangeWireCommand(state, [segItem.id], { label: v }));
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
  }

  // Nothing selected — hide
  return <div class="props-section" />;
}
