import { playSound, preloadSounds } from '../engine/audio.ts';
import blockedSound from '../assets/sounds/blocked.wav';
import gateDeleteSound from '../assets/sounds/gate_delete.wav';
import gatePlaceSound from '../assets/sounds/gate_place.wav';
import levelCompleteSound from '../assets/sounds/level_complete.wav';
import testsPassedSound from '../assets/sounds/tests_passed.wav';
import uiClickSound from '../assets/sounds/ui_click.wav';
import uiHoverSound from '../assets/sounds/ui_hover.wav';
import wireCancelSound from '../assets/sounds/wire_cancel.wav';
import wireConnectSound from '../assets/sounds/wire_connect.wav';
import wireStartSound from '../assets/sounds/wire_start.wav';

/**
 * What the game plays, named by what happened rather than by which file it is.
 *
 * Call sites say `playSfx('gatePlace')`, so choosing a different recording for one is a change to
 * this table alone. Each file is named after the action it was picked for — the folder reads as
 * the list of things the game says — but there are more things worth hearing than there are
 * sounds so far, so some names borrow a file another one owns. Those are marked below: replacing
 * `wire_start.wav` also changes what a toggle and a test step sound like, until they are given
 * files of their own.
 *
 * A `gain` is part of the choice, not a detail: the sounds that fire constantly — hover, and the
 * click under every button — have to sit under the ones that mark something happening, or the
 * player turns the whole lot off.
 */
const SOUNDS = {
  /** The pointer moved onto a button. Quietest thing in the game by a distance. */
  uiHover: { file: uiHoverSound, gain: 0.2 },
  /** Any button or sidebar entry pressed. */
  uiClick: { file: uiClickSound, gain: 0.55 },
  /**
   * A gate or a wire clicked on the board — the canvas's answer to a button press, and the
   * reason a plain selection is not silent. Borrows the button click.
   */
  select: { file: uiClickSound, gain: 0.55 },

  /** A wire drag has begun from a pin or a node. */
  wireStart: wireStartSound,
  /** The drag ended on something, and a segment was created. */
  wireConnect: wireConnectSound,
  /** The drag ended on nothing, or on a connection that already existed. */
  wireCancel: wireCancelSound,

  /** Something picked up: a gate off the sidebar, or a selection off the board. Borrows hover. */
  dragStart: uiHoverSound,
  /** Put down somewhere it counted. Borrows the placed-gate sound. */
  dragDrop: gatePlaceSound,
  /** Let go where nothing could take it. Borrows the cancelled-wire sound. */
  dragCancel: { file: wireCancelSound, gain: 0.7 },

  gatePlace: gatePlaceSound,
  gateDelete: gateDeleteSound,
  /** Borrows the button click. */
  gateRotate: uiClickSound,
  /** A constant gate double-clicked to the next value. Borrows the wire-start blip. */
  toggleValue: wireStartSound,

  /** The action was refused: a gate the level keeps, a gate the level has run out of. */
  blocked: blockedSound,
  /** One case or one command, stepped by hand. Borrows the wire-start blip. */
  testStep: wireStartSound,
  /** A run stopped on a failure. Borrows the refusal, since both mean "no". */
  testsFailed: blockedSound,
  testsPassed: testsPassedSound,
  levelComplete: levelCompleteSound,
} as const satisfies Record<string, SoundSpec>;

/** A sound is a file, or a file played at a set share of the master volume. */
type SoundSpec = string | { file: string; gain: number };

export type SoundName = keyof typeof SOUNDS;

export const SOUND_NAMES = Object.keys(SOUNDS) as SoundName[];

export function playSfx(name: SoundName): void {
  const spec: SoundSpec = SOUNDS[name];
  if (typeof spec === 'string') playSound(spec);
  else playSound(spec.file, spec.gain);
}

/** The file behind a name — for the check that every name still has one. */
export function soundFile(name: SoundName): string {
  const spec: SoundSpec = SOUNDS[name];
  return typeof spec === 'string' ? spec : spec.file;
}

/** Decode everything up front, so no interaction is the one that goes unheard. */
export function preloadSfx(): void {
  preloadSounds([...new Set(SOUND_NAMES.map(soundFile))]);
}
