/**
 * What the player consumes: notes on a sixteenth grid, and the two things that can produce them.
 *
 * `Composer` writes music from a handful of numbers and a seed; `ScorePlayer` reads one that was
 * written down. Neither knows how a note sounds — that is `instruments.ts` — and the player knows
 * which of the two it holds only through this interface.
 */
import type { PatchName } from './instruments.ts';
import type { SampleName } from './samples.ts';

/**
 * The instrument an event is for: a synth patch, one of the drums, or a recording.
 *
 * The three key spaces are disjoint, so the player can tell them apart by name alone and nothing
 * needs a second field saying which kind of thing this is.
 */
export type EventKind = PatchName | 'kick' | 'snare' | 'hat' | SampleName;

/** One note about to start. Mutable and pooled, to allocate nothing while rendering. */
export interface NoteEvent {
  kind: EventKind;
  /** MIDI note. Ignored by the drums. */
  note: number;
  /** Seconds the note is written to last, before its release. For a hat, how long it rings. */
  duration: number;
  velocity: number;
  /** -1 left … +1 right. */
  pan: number;
  /** Noise seed, so a hat is a different hat each time but the same one on every replay. */
  seed: number;
}

export const STEPS_PER_BAR = 16;
export const STEPS_PER_BEAT = 4;

/** Where a note comes from. The player holds one of these and never asks which. */
export interface NoteSource {
  /** Seconds per sixteenth — the grid everything lands on. */
  readonly stepDuration: number;
  /** Seconds per beat. */
  readonly beatDuration: number;
  /**
   * Sixteenths after which the music can be handed over without it showing — the end of a chord
   * for a generated theme, the end of a pattern for a written one.
   */
  readonly stepsPerChord: number;
  /** Fill `out` with the notes starting on `step` and return how many. */
  collect(step: number, intensity: number, out: NoteEvent[]): number;
}

export function createEventPool(size: number): NoteEvent[] {
  return Array.from({ length: size }, () => (
    { kind: 'pad', note: 60, duration: 1, velocity: 1, pan: 0, seed: 0 } satisfies NoteEvent
  ));
}
