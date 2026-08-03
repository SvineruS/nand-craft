import type { ComponentId, Vec2 } from '../editor/types.ts';
import type { SerializedCircuit } from '../persistence/serialize.ts';
import type { GateType } from '../simulation/gateTypes.ts';

export interface ComponentPin {
  name: string;
  bitWidth: number;
  /** Position on the component gate in grid units (derived from IO gate pos / 4) */
  gridPos: Vec2;
  kind: 'input' | 'output';
}

export interface ComponentDefinition {
  id: ComponentId;
  name: string;
  circuit: SerializedCircuit;
  inputs: ComponentPin[];
  outputs: ComponentPin[];
  /** Component gate size in grid units */
  width: number;
  height: number;
  /** SVG layers for the component shape [border, squares] */
  svg: import('../editor/gates.ts').SvgLayer[];
  /** All primitive gate types used (for constraint filtering) */
  usedGateTypes: GateType[];
  /**
   * The `.test` document last applied while editing this component, re-applied when it is opened
   * again. Inside the definition rather than in a key of its own, because a new component has no
   * id to key by until it is first saved — and because tests belong to the component, so they
   * travel with it wherever the definition goes.
   */
  tests?: string;
}
