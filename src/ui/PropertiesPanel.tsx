import { useEditorState } from './editorStore.ts';
import { getGateDefinition } from '../editor/gates.ts';
import type { Command } from '../editor/commands.ts';
import { ChangePinCommand, ChangeWireCommand } from '../editor/commands.ts';
import type { PinId } from '../editor/types.ts';

const BIT_OPTIONS = [1, 8, 16, 32];

interface PropertiesPanelProps {
  onExecute: (cmd: Command) => void;
}

export function PropertiesPanel({ onExecute }: PropertiesPanelProps) {
  const state = useEditorState();
  if (!state) return null;

  // Check for selected gate (IO/constant only)
  const gateItem = state.selection.find(s => s.type === 'gate');
  if (gateItem?.type === 'gate') {
    const gate = state.circuit.gates.get(gateItem.id);
    if (gate && (gate.type === 'input' || gate.type === 'output' || gate.type === 'constant')) {
      const def = getGateDefinition(gate.type);
      const allPinIds: PinId[] = [...gate.inputPins, ...gate.outputPins];
      const firstPin = allPinIds.length > 0 ? state.circuit.pins.get(allPinIds[0]) : undefined;

      // Value field for input/constant
      const outPinId = (gate.type === 'input' || gate.type === 'constant')
        ? gate.outputPins[0]
        : undefined;
      const outPin = outPinId ? state.circuit.pins.get(outPinId) : undefined;
      const mask = outPin ? ((1 << outPin.bitWidth) >>> 0) - 1 : 0;

      return (
        <div class="props-section" style={{ display: 'block' }}>
          <div class="props-header">Properties</div>
          <div class="props-content">
            <div class="prop-row">
              <span class="prop-label">Type</span>
              <span class="prop-value">{def.label}</span>
            </div>

            {outPin && outPinId && (
              <div class="prop-row">
                <span class="prop-label">Value</span>
                <input
                  type="number"
                  class="prop-input prop-input-number"
                  value={outPin.value ?? 0}
                  min={0}
                  max={mask}
                  onChange={(e) => {
                    let v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (isNaN(v)) v = 0;
                    v = Math.max(0, Math.min(mask, v));
                    onExecute(new ChangePinCommand(state, [outPinId], { value: v }));
                  }}
                  onInput={(e) => {
                    let v = parseInt((e.target as HTMLInputElement).value, 10);
                    if (isNaN(v)) return;
                    v = Math.max(0, Math.min(mask, v));
                    onExecute(new ChangePinCommand(state, [outPinId], { value: v }));
                  }}
                />
              </div>
            )}

            {firstPin && (
              <div class="prop-row">
                <span class="prop-label">Bits</span>
                <select
                  class="prop-select"
                  value={firstPin.bitWidth}
                  onChange={(e) => {
                    const v = parseInt((e.target as HTMLSelectElement).value, 10);
                    onExecute(new ChangePinCommand(state, allPinIds, { bitWidth: v }));
                  }}
                >
                  {BIT_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
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
