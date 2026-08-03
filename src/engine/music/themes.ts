/**
 * One theme per mood, named by where it plays. Data only — `composer.ts` derives the music from
 * these numbers and a seed; `ui/musicDirector.ts` decides which screen gets which.
 */

export interface MusicTheme {
  readonly bpm: number;
  /** MIDI note of the key's root — where the bass plays, so it sets the whole register. */
  readonly root: number;
  /** Semitones of the seven scale degrees, from the root. */
  readonly scale: readonly number[];
  /** Chord loops to choose between, each written as scale degrees. 0 is the tonic. */
  readonly progressions: readonly (readonly number[])[];
  readonly barsPerChord: number;
  /** 0…1, how much of the arrangement plays: a pad alone at 0.2, drums from 0.5, arp from 0.62. */
  readonly intensity: number;
  /** Reverb wet level. High is a wash; the busier themes want less of it. */
  readonly reverb: number;
}

const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/**
 * Written as degrees — `[0, 5, 3, 6]` is i–VI–iv–VII. All start on the tonic, so any can follow
 * any at a section boundary.
 */
const MINOR_LOOPS = [
  [0, 5, 3, 6],
  [0, 6, 5, 3],
  [0, 3, 5, 4],
  [0, 5, 6, 3],
] as const;

/** Two chords, four bars each: barely moves, which is the point on a menu. */
const SLOW_LOOPS = [
  [0, 5],
  [0, 3],
] as const;

export const MUSIC_THEMES = {
  /** Main menu and settings: a pad, a bell every few bars, and nothing else. */
  menu: {
    bpm: 84, root: 45, scale: NATURAL_MINOR, progressions: SLOW_LOOPS,
    barsPerChord: 4, intensity: 0.2, reverb: 0.5,
  },
  /** Level select. Brighter than the menu — dorian's major sixth does that — and moving. */
  map: {
    bpm: 88, root: 43, scale: DORIAN, progressions: MINOR_LOOPS,
    barsPerChord: 2, intensity: 0.38, reverb: 0.46,
  },
  /**
   * The editors, where the player spends hours. Deliberately the least eventful thing here that
   * still has a pulse: a soft kick on 1 and 3, offbeat hats, and no melody to speak of.
   */
  puzzle: {
    bpm: 92, root: 45, scale: NATURAL_MINOR, progressions: MINOR_LOOPS,
    barsPerChord: 2, intensity: 0.55, reverb: 0.42,
  },
} as const satisfies Record<string, MusicTheme>;

export type MusicThemeId = keyof typeof MUSIC_THEMES;

export const MUSIC_THEME_IDS = Object.keys(MUSIC_THEMES) as MusicThemeId[];
