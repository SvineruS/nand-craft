import type { ComponentId, GateId, Net, NetId, PinRef } from '../editor/types.ts';
import { pinRefKey } from '../editor/types.ts';
import type { Circuit } from './circuit.ts';
import { componentDefVersion, getGatePinMeta, isBuiltInGateType } from '../editor/gates.ts';
import { type GateType, isInputGate, isOutputGate } from './gateTypes.ts';
import { getComponent } from '../components/componentRegistry.ts';
import { deserializeCircuit } from '../persistence/serialize.ts';
import { buildNets, buildPinToNet } from './nets.ts';

/**
 * A *registered* input pin is one the gate only samples at the end of the tick, after
 * propagation, so it has no combinational path to any of the gate's outputs. Two things
 * follow, and both matter:
 *
 *  - the build graph must not treat it as a dependency, so wiring an output back into it
 *    is a one-tick feedback loop rather than a short circuit;
 *  - the gate must therefore read it in the post-propagation phase, because the schedule
 *    is free to evaluate the gate before that wire has resolved.
 *
 * Built-in gates declare theirs in GATE_DEFS (`PinDef.registered` — today only RAM's W and
 * V). A component cannot declare anything, so its pins are derived: an input pin is
 * registered exactly when no combinational path runs from it to any of the component's
 * outputs. That is what makes a player-built register behave like the built-in one.
 */

const NONE: readonly boolean[] = [];

/** Cache keyed by component id, dropped whenever a definition changes. */
const componentCache = new Map<ComponentId, readonly boolean[]>();
let cachedDefVersion = componentDefVersion;

/** Guards a component that (illegally) contains itself — see evaluateComponent. */
const analyzing = new Set<ComponentId>();

/** Per input pin of `type`: true when the pin is sampled only after propagation. */
export function getRegisteredInputs(type: GateType): readonly boolean[] {
  if (isBuiltInGateType(type)) return getGatePinMeta(type).inputRegistered;
  return getComponentRegisteredInputs(type as ComponentId);
}

/** Whether `type` has any registered input, i.e. needs the post-propagation phase. */
export function hasRegisteredInput(type: GateType): boolean {
  const registered = getRegisteredInputs(type);
  for (const flag of registered) if (flag) return true;
  return false;
}

function getComponentRegisteredInputs(compId: ComponentId): readonly boolean[] {
  if (cachedDefVersion !== componentDefVersion) {
    componentCache.clear();
    cachedDefVersion = componentDefVersion;
  }

  const cached = componentCache.get(compId);
  if (cached) return cached;

  // A component reached while it is already being analyzed is a cyclic definition. Calling
  // every pin combinational is the conservative answer: it can only over-report a cycle,
  // never let a gate read an unresolved wire.
  if (analyzing.has(compId)) return NONE;

  analyzing.add(compId);
  try {
    const registered = analyzeComponent(compId);
    componentCache.set(compId, registered);
    return registered;
  } finally {
    analyzing.delete(compId);
  }
}

/**
 * Walk combinational influence forward from each of the component's inner input gates and
 * record which of them never reach an inner output gate.
 *
 * Influence enters a gate on a non-registered input pin and leaves on every output pin,
 * except at a fully sequential gate, where it stops: that gate's outputs come from its
 * stored state, which this tick's inputs cannot reach.
 */
function analyzeComponent(compId: ComponentId): readonly boolean[] {
  const def = getComponent(compId);
  const inputCount = getGatePinMeta(compId).inputCount;
  if (!def) return new Array<boolean>(inputCount).fill(false);

  const circuit = deserializeCircuit(def.circuit);
  const nets = buildNets(circuit);
  const pinToNet = buildPinToNet(circuit, nets);
  const receiversByNet = buildReceiversByNet(circuit, nets);

  // Same iteration order buildComponentDefinition used for def.inputs, and the same order
  // evaluateComponent maps outer pins onto, so index i lines up across all three.
  const innerInputIds: GateId[] = [];
  for (const gate of circuit.gates.values()) {
    if (isInputGate(gate.type)) innerInputIds.push(gate.id);
  }

  const registered = new Array<boolean>(inputCount).fill(false);
  for (let i = 0; i < inputCount && i < innerInputIds.length; i++) {
    registered[i] = !reachesAnOutput(circuit, pinToNet, receiversByNet, innerInputIds[i]);
  }
  return registered;
}

/** Input pins sitting on each net, so influence can cross from a driver to its receivers. */
function buildReceiversByNet(circuit: Circuit, nets: Map<NetId, Net>): Map<NetId, PinRef[]> {
  const receiversByNet = new Map<NetId, PinRef[]>();
  for (const [netId, net] of nets) {
    const receivers: PinRef[] = [];
    for (const nodeId of net.nodeIds) {
      const pin = circuit.getWireNode(nodeId).pin;
      if (pin && pin.kind === 'input') receivers.push(pin);
    }
    if (receivers.length > 0) receiversByNet.set(netId, receivers);
  }
  return receiversByNet;
}

function reachesAnOutput(
  circuit: Circuit,
  pinToNet: Map<string, NetId>,
  receiversByNet: Map<NetId, PinRef[]>,
  startGateId: GateId,
): boolean {
  const seen = new Set<GateId>([startGateId]);
  const stack: GateId[] = [startGateId];

  while (stack.length > 0) {
    const gateId = stack.pop()!;
    const outputCount = getGatePinMeta(circuit.getGate(gateId).type).outputCount;

    for (let index = 0; index < outputCount; index++) {
      const netId = pinToNet.get(pinRefKey({ gateId, kind: 'output', index }));
      if (netId === undefined) continue;

      for (const pin of receiversByNet.get(netId) ?? []) {
        const receiverType = circuit.getGate(pin.gateId).type;
        // Any output gate is the component's boundary, including a switched one reached
        // on its enable pin — the enable gates the value through combinationally.
        if (isOutputGate(receiverType)) return true;
        // No separate test for registers: every pin of one is registered, so they stop
        // influence by the same rule as RAM's V or a nested component's own registered pin.
        if (getRegisteredInputs(receiverType)[pin.index]) continue;
        if (seen.has(pin.gateId)) continue;
        seen.add(pin.gateId);
        stack.push(pin.gateId);
      }
    }
  }
  return false;
}
