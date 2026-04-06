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
}
