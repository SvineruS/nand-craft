/**
 * The reading of a transcribed score: which synth plays each of the module's instruments, in which
 * register, and how loud. The notes themselves are generated data — see `scores/`.
 *
 * Every number here was measured rather than guessed, with `npm run music:analyze`:
 *
 * - `--probe` says whether a sample is a tone or a noise, how fast it decays, and how bright it is,
 *   which is what picks the patch.
 * - `--sample=N` prints its harmonic spectrum, which is what the tuned patches were built from.
 * - `transpose` was measured by rendering the module with every channel but one muted and reading
 *   the pitches that actually came out. It is the difference between the note written in the
 *   pattern and the note heard, and it is large: a tracker note is a playback rate, and these
 *   samples were recorded up to two octaves away from where they are written.
 */
import type { PlayableScore, ScoreVoice } from './score.ts';
import { FOREGONE } from './scores/foregone.ts';

/**
 * What each instrument of *Foregone Destruction* is.
 *
 * The mapping onto layers is what lets the intensity control mean something for a written piece:
 * the seven percussion samples all count as `hat`, the two kick samples as `kick`, and the sine
 * that carries the hook as `lead` — so turning the energy down strips the arrangement back in the
 * same order it does for a generated theme, and the hook is the last thing to go.
 */
const FOREGONE_VOICES: Record<number, ScoreVoice> = {
  // --- percussion. Unpitched, so only the ring length distinguishes them.
  /** Busy sixteenths, bright and short — the shaker the groove sits on. */
  1: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.5, ring: 0.09 },
  /** A crash, 334 ms of attack: it swells rather than hits. */
  2: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.7, ring: 0.5 },
  /** The main tick, and the most-played sample in the piece by a distance. */
  5: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.42, ring: 0.11 },
  6: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.55, ring: 0.22 },
  4: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.5, ring: 0.34 },
  14: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.45, ring: 0.1 },
  /** A noise sweep, not a hit. A hat with a long ring is as near as this engine gets. */
  20: { kind: 'hat', layer: 'hat', transpose: 0, gain: 0.6, ring: 0.45 },

  7: { kind: 'snare', layer: 'snare', transpose: 0, gain: 0.85 },
  /** Four on the floor. */
  21: { kind: 'kick', layer: 'kick', transpose: 0, gain: 1 },
  /**
   * The other kick, written across nine pitches. `KickVoice` has one pitch and ignores the note,
   * so the tuned part of it is lost — the rhythm is not.
   */
  3: { kind: 'kick', layer: 'kick', transpose: -24, gain: 0.8 },

  // --- tuned.
  /**
   * The hook: a sine, played fast, with the piece's whole melodic argument in it. Written around
   * D♯7 and sounding around G4 — nineteen semitones down, which is why reading the pattern
   * literally puts this line an octave and a fifth too high.
   */
  18: { kind: 'riff', layer: 'lead', transpose: -19, gain: 0.9 },
  /** A low tone with its first three harmonics all but equal — hollow, and nothing like a saw. */
  9: { kind: 'hollow', layer: 'bass', transpose: -36, gain: 0.7 },
  /**
   * The bass stab under the drops. Three octaves down, which reads as a mistake until you look:
   * its written F-4 sounds a 21.8 Hz fundamental with the octave above it twice as loud, and that
   * is what makes it felt rather than heard.
   */
  13: { kind: 'subhit', layer: 'bass', transpose: -36, gain: 0.85 },
  /**
   * The three stabs, all written at G-6 and rotating through the bar — and the one part of this
   * piece carried as audio rather than synthesised.
   *
   * They are chords, recorded whole, so a patch has no single tone to match: given the one note
   * the pattern writes, an oscillator plays a bare note where the original has a triad, and it is
   * heard as the wrong chord rather than a plainer one. Their `transpose` is 0 because the
   * recording already is the sound — the note in the pattern plays it at the rate it was sampled.
   */
  15: { kind: 'sample15', layer: 'pad', transpose: 0, gain: 0.22 },
  16: { kind: 'sample16', layer: 'pad', transpose: 0, gain: 0.22 },
  17: { kind: 'sample17', layer: 'pad', transpose: 0, gain: 0.22 },
  /** Long evolving atmospheres, several seconds of attack each. */
  10: { kind: 'pad', layer: 'pad', transpose: -24, gain: 0.8 },
  11: { kind: 'pad', layer: 'pad', transpose: -12, gain: 0.8 },
  12: { kind: 'pad', layer: 'pad', transpose: -12, gain: 0.8 },
  /** The buzzy line that runs under the breaks — its spectrum peaks at the sixth harmonic. */
  19: { kind: 'pluck', layer: 'arp', transpose: -35, gain: 0.5 },
  /** The strings, and the one part that is a tune rather than a figure. */
  31: { kind: 'strings', layer: 'bell', transpose: -12, gain: 0.9 },
  22: { kind: 'choir', layer: 'bell', transpose: -19, gain: 0.8 },
};

export const SCORES = {
  foregone: { score: FOREGONE, voices: FOREGONE_VOICES },
} as const satisfies Record<string, PlayableScore>;

export type ScoreId = keyof typeof SCORES;
