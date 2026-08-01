import { useState } from 'preact/hooks';
import { ramDialogGateId, useEditorState } from '../editorStore.ts';
import { useEditor } from '../editorContext.ts';
import { isRamGate } from '../../circuit-builder/simulation/gateTypes.ts';
import type { Command } from '../../circuit-builder/editor/commands.ts';
import { FloatingWindow } from './FloatingWindow.tsx';
import { RamMemoryView } from './RamMemoryView.tsx';
import { RamProgramView } from './RamProgramView.tsx';

/**
 * The window behind a RAM chip's on-body button: what it holds, and the program editor
 * that fills it.
 *
 * Opened by gate id (see `ramDialogGateId`), because the board can hold several chips and
 * each has its own bytes.
 */

type RamTab = 'memory' | 'program';

export function RamDialog() {
  const editor = useEditor();
  const state = useEditorState();
  const gateId = ramDialogGateId.value;
  const [tab, setTab] = useState<RamTab>('memory');

  if (!gateId) return null;
  const gate = state.circuit.gates.get(gateId);
  // The gate can be deleted while its window is open; the click that deletes it also
  // re-renders this, so simply drawing nothing is enough.
  if (!gate || !isRamGate(gate.type)) return null;

  const execute = (cmd: Command) => editor.executeCommand(cmd);

  const tabs = (
    <>
      <button
        class={`window-tab${tab === 'memory' ? ' is-active' : ''}`}
        onClick={() => setTab('memory')}
      >Memory</button>
      <button
        class={`window-tab${tab === 'program' ? ' is-active' : ''}`}
        onClick={() => setTab('program')}
      >Program</button>
    </>
  );

  return (
    <FloatingWindow
      id="ram"
      class="window-ram"
      title={`${gate.label ?? 'RAM'} — 256 bytes`}
      actions={tabs}
      onClose={() => { ramDialogGateId.value = null; }}
    >
      {tab === 'memory'
        ? <RamMemoryView gate={gate} state={state} onExecute={execute} />
        : <RamProgramView gate={gate} state={state} onExecute={execute} />}
    </FloatingWindow>
  );
}
