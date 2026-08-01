import type { GateId } from './types.ts';
import type { QueueCommandResult } from '../levels/levelTypes.ts';
import type { TestCommand } from '../testing/dslParser.ts';
import type { Circuit } from '../simulation/circuit.ts';
import { clearGateState } from '../simulation/gateTypes.ts';

/** Where in a command list a `@case` group starts, for grouping the log. */
export interface CaseBoundary {
  index: number;
  name?: string;
}

/** Label → gate id, for the switch-style IO gates a queue test drives. */
export interface TestGateLabels {
  inputs: ReadonlyMap<string, GateId>;
  outputs: ReadonlyMap<string, GateId>;
}

/** Enable-asserted labels for this tick — the handshake window the test may act in. */
interface ReadyLabels {
  inputs: ReadonlySet<string>;
  outputs: ReadonlySet<string>;
}

/** One command's outcome: consumed/verified, still waiting, or failed outright. */
type CommandOutcome = 'satisfied' | 'waiting' | 'failed';

/**
 * Sequential test engine for levels with switch IO.
 *
 * Values are queued per input gate; each tick the circuit decides — via its enable pins —
 * when it is ready to accept the next write or produce the next read. The runner therefore
 * cannot step commands on its own schedule: it ticks, sees which gates asserted enable, and
 * advances as far through the command list as the handshake allows.
 *
 * Kept separate from the table-driven runner in LevelTests: the two share only the label
 * maps, and previously lived in one class with two disjoint sets of fields.
 */
export class QueueTestRunner {
  commands: TestCommand[] = [];
  results: QueueCommandResult[] = [];
  /** Index of the command being awaited; -1 before the first startQueue. */
  commandIndex = -1;
  tickCount = 0;

  private labels: TestGateLabels;
  private caseBoundaries: CaseBoundary[] = [];
  /** Pending write values per input gate, consumed front-first. */
  private pendingWrites = new Map<GateId, number[]>();

  constructor(labels: TestGateLabels) {
    this.labels = labels;
  }

  /** Point the runner at freshly built label maps (after a circuit edit). */
  setLabels(labels: TestGateLabels): void {
    this.labels = labels;
  }

  get done(): boolean {
    return this.commandIndex >= this.commands.length;
  }

  get failed(): boolean {
    return this.results.some(r => r.status === 'failed');
  }

  /** (Re)start execution. Boundaries are kept when not supplied. */
  start(circuit: Circuit, commands: TestCommand[], caseBoundaries?: CaseBoundary[]): void {
    this.commands = commands;
    if (caseBoundaries !== undefined) this.caseBoundaries = caseBoundaries;
    this.results = this.buildPendingResults();
    this.commandIndex = 0;
    this.tickCount = 0;

    this.pendingWrites.clear();
    for (const cmd of commands) {
      if (cmd.type !== 'write') continue;
      const gateId = this.labels.inputs.get(cmd.label);
      if (!gateId) continue;
      const queue = this.pendingWrites.get(gateId);
      if (queue) queue.push(cmd.value);
      else this.pendingWrites.set(gateId, [cmd.value]);
    }

    // Sequential levels must start from a known state; the player's constants stay.
    for (const gate of circuit.gates.values()) clearGateState(gate);

    this.markRunning();
  }

  /** Clear results back to pending without forgetting the command list. */
  reset(): void {
    this.results = this.buildPendingResults();
    this.commandIndex = -1;
    this.pendingWrites.clear();
  }

  /** Tick the circuit once and advance as far as the handshake allows. Returns true if done. */
  tick(circuit: Circuit): boolean {
    if (this.commandIndex < 0 || this.commandIndex >= this.commands.length) return true;

    circuit.tick(this.buildInputs());
    this.tickCount++;

    const ready = this.readyLabels(circuit);
    // One gate serves at most one command per tick, so a repeated label has to wait.
    const usedInputs = new Set<string>();
    const usedOutputs = new Set<string>();
    let advanced = false;

    while (this.commandIndex < this.commands.length) {
      const outcome = this.applyCommand(circuit, ready, usedInputs, usedOutputs);
      if (outcome === 'failed') return true;
      if (outcome === 'waiting') break;

      this.results[this.commandIndex].status = 'passed';
      this.commandIndex++;
      advanced = true;
      this.markRunning();
    }

    if (this.done) return true;
    if (!advanced) this.markRunning();
    return false;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  /** Drive each input gate with the value at the head of its queue. */
  private buildInputs(): Map<GateId, number> {
    const inputs = new Map<GateId, number>();
    for (const [gateId, queue] of this.pendingWrites) {
      if (queue.length > 0) inputs.set(gateId, queue[0]);
    }
    return inputs;
  }

  /**
   * Labels whose switch gate asserted enable this tick. Input gates carry enable on pin 0,
   * output gates on pin 1 (pin 0 being the value they receive).
   */
  private readyLabels(circuit: Circuit): ReadyLabels {
    const inputs = new Set<string>();
    const outputs = new Set<string>();

    for (const [label, gateId] of this.labels.inputs) {
      if (isSwitchGate(circuit, gateId) && circuit.getPinValue(gateId, 'input', 0)) inputs.add(label);
    }
    for (const [label, gateId] of this.labels.outputs) {
      if (isSwitchGate(circuit, gateId) && circuit.getPinValue(gateId, 'input', 1)) outputs.add(label);
    }
    return { inputs, outputs };
  }

  /** Try to satisfy the current command against this tick's handshake state. */
  private applyCommand(
    circuit: Circuit,
    ready: ReadyLabels,
    usedInputs: Set<string>,
    usedOutputs: Set<string>,
  ): CommandOutcome {
    const cmd = this.commands[this.commandIndex];
    const result = this.results[this.commandIndex];

    if (cmd.type === 'write') {
      const gateId = this.labels.inputs.get(cmd.label);
      if (!gateId) return this.fail(result, `No input gate "${cmd.label}"`);
      if (!ready.inputs.has(cmd.label) || usedInputs.has(cmd.label)) return 'waiting';

      this.pendingWrites.get(gateId)?.shift();
      usedInputs.add(cmd.label);
      return 'satisfied';
    }

    if (cmd.type === 'read') {
      const gateId = this.labels.outputs.get(cmd.label);
      if (!gateId) return this.fail(result, `No output gate "${cmd.label}"`);
      if (!ready.outputs.has(cmd.label) || usedOutputs.has(cmd.label)) return 'waiting';

      const actual = circuit.tickResult.outputs.get(gateId) ?? null;
      result.actual = actual;
      if (actual !== cmd.value) {
        return this.fail(result, `expected ${cmd.value}, got ${actual ?? 'null'}`);
      }
      usedOutputs.add(cmd.label);
      return 'satisfied';
    }

    // 'set' / 'expect' belong to table mode and never reach a queue run.
    return 'satisfied';
  }

  private fail(result: QueueCommandResult, error: string): CommandOutcome {
    result.status = 'failed';
    result.error = error;
    return 'failed';
  }

  private markRunning(): void {
    const result = this.results[this.commandIndex];
    if (result && result.status === 'pending') result.status = 'running';
  }

  private buildPendingResults(): QueueCommandResult[] {
    const boundaries = new Map(this.caseBoundaries.map(b => [b.index, b.name]));
    return this.commands.map((cmd, i) => ({
      type: cmd.type as 'write' | 'read',
      label: cmd.label,
      expected: cmd.value,
      status: 'pending' as const,
      caseStart: boundaries.has(i),
      caseName: boundaries.get(i),
    }));
  }
}

/** Switch-style IO gates are the ones with an enable pin, named `*-sw`. */
function isSwitchGate(circuit: Circuit, gateId: GateId): boolean {
  return circuit.gates.get(gateId)?.type.endsWith('-sw') ?? false;
}
