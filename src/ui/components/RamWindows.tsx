import type { VNode } from 'preact';
import { memoryWindowGateId, programWindowGateId, useEditorState } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { isRamGate, type Gate } from '../../circuit-builder/simulation/gateTypes.ts';
import type { GateId } from '../../circuit-builder/editor/types.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import type { EditorState } from '../../circuit-builder/editor/EditorState.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import { RamMemoryView } from './RamMemoryView.tsx';
import { RamProgramView } from './RamProgramView.tsx';

/**
 * The two windows behind a RAM chip's buttons: what it holds, and the program that fills it.
 *
 * Separate windows rather than tabs of one, so a player can watch the bytes change while
 * editing the program — which is the whole job when a CPU is not doing what it should.
 * Each is opened by gate id, because the board can hold several chips.
 */
export function RamWindows() {
  const editor = useEditor();
  const state = useEditorState();
  const execute = (cmd: Command) => editor.executeCommand(cmd);

  return (
    <>
      <RamWindow
        id="ram-memory"
        sizeClass="window-ram-memory"
        gateId={memoryWindowGateId.value}
        state={state}
        onClose={() => { memoryWindowGateId.value = null; }}
        title={gate => `${gate.label ?? 'RAM'} — memory`}
        render={gate => <RamMemoryView gate={gate} state={state} onExecute={execute} />}
      />
      <RamWindow
        id="ram-program"
        sizeClass="window-ram-program"
        gateId={programWindowGateId.value}
        state={state}
        onClose={() => { programWindowGateId.value = null; }}
        title={gate => `${gate.label ?? 'RAM'} — program`}
        render={gate => <RamProgramView gate={gate} state={state} onExecute={execute} />}
      />
    </>
  );
}

interface RamWindowProps {
  /** Identifies the remembered position and size. */
  id: string;
  /** Class carrying the window's default size and place. */
  sizeClass: string;
  gateId: GateId | null;
  state: EditorState;
  onClose: () => void;
  title: (gate: Gate) => string;
  render: (gate: Gate) => VNode;
}

/** Resolves the gate behind one window, or draws nothing when there isn't one. */
function RamWindow({ id, sizeClass, gateId, state, onClose, title, render }: RamWindowProps) {
  if (!gateId) return null;

  const gate = state.circuit.gates.get(gateId);
  // The gate can be deleted while its window is open; the click that deletes it also
  // re-renders this, so simply drawing nothing is enough.
  if (!gate || !isRamGate(gate.type)) return null;

  return (
    <FloatingWindow id={id} class={sizeClass} title={title(gate)} onClose={onClose}>
      {render(gate)}
    </FloatingWindow>
  );
}
