/**
 * The soundtracks. Data only — `composer.ts` derives the music from these numbers and a seed;
 * `ui/musicDirector.ts` maps a screen to a mood.
 *
 * A soundtrack is one style in three moods. A theme is a whole style: key and tempo, but also
 * which layers exist, what they play and which patch plays them.
 */
import type { PatchName } from './instruments.ts';

/** Where music plays. Every soundtrack provides all three. */
export type MoodId = 'menu' | 'map' | 'puzzle';

/** Everything the composer can put on a step. */
export type MusicLayer = 'pad' | 'bass' | 'kick' | 'snare' | 'hat' | 'arp' | 'bell' | 'lead';

export interface MusicTheme {
  readonly bpm: number;
  /** MIDI note of the key's root — where the bass plays, so it sets the whole register. */
  readonly root: number;
  /** Semitones of the seven scale degrees, from the root. */
  readonly scale: readonly number[];
  /** Chord loops to choose between, each written as scale degrees. 0 is the tonic. */
  readonly progressions: readonly (readonly number[])[];
  readonly barsPerChord: number;
  /** 0…1, how much of the arrangement plays, against the thresholds in `layers`. */
  readonly intensity: number;
  readonly reverb: number;
  /** The layers this theme has at all, and the intensity each needs to join. */
  readonly layers: Partial<Record<MusicLayer, number>>;
  /** Rhythms to choose between per section. A layer with none plays on every step it may. */
  readonly patterns: Partial<Record<MusicLayer, readonly string[]>>;
  /** Patch overrides; a layer without one plays the patch of the same name. */
  readonly voices?: Partial<Record<MusicLayer, PatchName>>;
}

const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];

/** Degrees — `[0, 5, 3, 6]` is i–VI–iv–VII. All start on the tonic, so any can follow any. */
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

/** i–VI–III–VII and relatives: the loops that carry a dark lead riff. */
const DARK_LOOPS = [
  [0, 5, 2, 6],
  [0, 6, 5, 2],
  [0, 3, 6, 5],
  [0, 2, 5, 6],
] as const;

// ---------------------------------------------------------------------------
// Rhythms — one bar of sixteenths, `x` where the layer plays
// ---------------------------------------------------------------------------

const AMBIENT_PATTERNS = {
  kick: ['x.......x.......', 'x.......x...x...', 'x.......x..x....', 'x...x...x...x...'],
  hat: ['..x...x...x...x.', '..x...x...x...xx', '..x.x.x...x.x.x.', '..x...x.....x.x.'],
  bass: ['x...............', 'x.........x.....', 'x.......x.......', 'x.....x...x.....'],
  arp: ['..x..x....x..x..', '..x...x.x...x...', '....x.....x...x.', '..x..x..x..x..x.'],
} as const;

/** Four on the floor under a backbeat, with the bass working the sixteenths between them. */
const INDUSTRIAL_PATTERNS = {
  kick: ['x...x...x...x...', 'x...x.....x.x...', 'x...x...x.x.x...', 'x.....x.x...x...'],
  snare: ['....x.......x...', '....x.....x.x...', '....x..x....x...', '....x.......x.x.'],
  hat: ['..x.x.x.x.x.x.x.', '..x...x...x...x.', 'x.x.x.x.x.x.x.xx', '..x.x.x...x.x.x.'],
  bass: ['x.xxx.x.x.xxx.x.', 'x.x.x.xxx.x.x.x.', 'xx.xx.x.xx.xx.x.', 'x.xx.xx.x.xx.x.x'],
  arp: ['..x..x..x..x..x.', 'x.x.x.x.x.x.x.x.', '....x.x.....x.x.', '..x.x...x.x.x...'],
  lead: ['x..x..x...x.x...', 'x.x...x..x..x..x', 'x...x.x.x...x.x.', 'x..x.x..x..x.x..'],
} as const;

// ---------------------------------------------------------------------------
// Soundtracks
// ---------------------------------------------------------------------------

/** Pad, bell, bass, hats, a soft kick, an arpeggio last. Nothing hurries. */
const AMBIENT_LAYERS = { pad: 0, bell: 0.15, bass: 0.22, hat: 0.4, kick: 0.5, arp: 0.62 };

/** Bass and drums early, the riff at the top: the arrangement of something driving. */
const INDUSTRIAL_LAYERS = {
  pad: 0, bass: 0.1, kick: 0.25, hat: 0.35, snare: 0.45, lead: 0.58, arp: 0.72,
};

/** Stabs instead of a wash, a short square bass instead of a sub. */
const INDUSTRIAL_VOICES = { pad: 'stab', bass: 'drive' } as const;

export const SOUNDTRACKS = {
  /** Calm ambient techno. Music to leave on for an hour of puzzle-solving. */
  ambient: {
    label: 'Ambient',
    description: 'Slow pads, deep bass, room to think',
    moods: {
      menu: {
        bpm: 84, root: 45, scale: NATURAL_MINOR, progressions: SLOW_LOOPS,
        barsPerChord: 4, intensity: 0.2, reverb: 0.5,
        layers: AMBIENT_LAYERS, patterns: AMBIENT_PATTERNS,
      },
      map: {
        bpm: 88, root: 43, scale: DORIAN, progressions: MINOR_LOOPS,
        barsPerChord: 2, intensity: 0.38, reverb: 0.46,
        layers: AMBIENT_LAYERS, patterns: AMBIENT_PATTERNS,
      },
      puzzle: {
        bpm: 92, root: 45, scale: NATURAL_MINOR, progressions: MINOR_LOOPS,
        barsPerChord: 2, intensity: 0.55, reverb: 0.42,
        layers: AMBIENT_LAYERS, patterns: AMBIENT_PATTERNS,
      },
    },
  },

  /**
   * Dark industrial breakbeat, after the Impulse Tracker music of late-90s shooters — a driving
   * sixteenth bass, a backbeat, and a detuned lead riff over minor chords. Dry, not washed.
   */
  industrial: {
    label: 'Industrial',
    description: 'Driving bass, breakbeat, a lead riff',
    moods: {
      menu: {
        bpm: 112, root: 40, scale: NATURAL_MINOR, progressions: DARK_LOOPS,
        barsPerChord: 4, intensity: 0.3, reverb: 0.34,
        layers: INDUSTRIAL_LAYERS, patterns: INDUSTRIAL_PATTERNS, voices: INDUSTRIAL_VOICES,
      },
      map: {
        bpm: 126, root: 40, scale: NATURAL_MINOR, progressions: DARK_LOOPS,
        barsPerChord: 2, intensity: 0.55, reverb: 0.28,
        layers: INDUSTRIAL_LAYERS, patterns: INDUSTRIAL_PATTERNS, voices: INDUSTRIAL_VOICES,
      },
      puzzle: {
        bpm: 138, root: 38, scale: NATURAL_MINOR, progressions: DARK_LOOPS,
        barsPerChord: 2, intensity: 0.78, reverb: 0.24,
        layers: INDUSTRIAL_LAYERS, patterns: INDUSTRIAL_PATTERNS, voices: INDUSTRIAL_VOICES,
      },
    },
  },
} as const satisfies Record<string, Soundtrack>;

export interface Soundtrack {
  readonly label: string;
  readonly description: string;
  readonly moods: Record<MoodId, MusicTheme>;
}

export type SoundtrackId = keyof typeof SOUNDTRACKS;

export const SOUNDTRACK_IDS = Object.keys(SOUNDTRACKS) as SoundtrackId[];
export const MOOD_IDS: MoodId[] = ['menu', 'map', 'puzzle'];

export const DEFAULT_SOUNDTRACK: SoundtrackId = 'ambient';

export function themeOf(soundtrack: SoundtrackId, mood: MoodId): MusicTheme {
  return SOUNDTRACKS[soundtrack].moods[mood];
}
