/**
 * The soundtracks. Data only — `composer.ts` derives the music from these numbers and a seed;
 * `ui/musicDirector.ts` maps a screen to a mood.
 *
 * A soundtrack is one style in three moods. A theme is a whole style: key and tempo, but also
 * which layers exist, what they play and which patch plays them.
 */
import type { PatchName } from './instruments.ts';
import type { ScoreId } from './scores.ts';

/** Where music plays. Every soundtrack provides all three. */
export type MoodId = 'menu' | 'map' | 'puzzle';

/** Everything the composer can put on a step. */
export type MusicLayer = 'pad' | 'bass' | 'kick' | 'snare' | 'hat' | 'arp' | 'bell' | 'lead';

/**
 * A theme is either written out or generated, and the two share almost nothing.
 *
 * What they do share is what the *player* needs — how much of the arrangement plays, how wet it
 * is, and the per-layer mix — so a soundtrack can be one or the other and nothing above this file
 * has to care which.
 */
export type MusicTheme = GeneratedTheme | LoopTheme;

interface ThemeBase {
  /** 0…1, how much of the arrangement plays, against the thresholds in `layers`. */
  readonly intensity: number;
  readonly reverb: number;
  /** The layers this theme has at all, and the intensity each needs to join. */
  readonly layers: Partial<Record<MusicLayer, number>>;
  /**
   * Per-layer level, multiplying the patch's own gain. 1 is the patch as written.
   *
   * The mix desk for one style: a patch shared by two soundtracks can sit forward in one and back
   * in the other without a second copy of it existing.
   */
  readonly gains?: Partial<Record<MusicLayer, number>>;
}

/**
 * A piece arranged out of a real one's loops: the notes come from a tracker module, the order they
 * come in does not.
 *
 * `route` is the form and the only part of it written by hand — which of the score's sections the
 * music visits, in order, repeating forever. What plays at each stop is chosen from the loops that
 * section really contained, so a mood is a *shape* rather than a stretch of a fixed arrangement.
 */
export interface LoopTheme extends ThemeBase {
  readonly kind: 'loops';
  readonly score: ScoreId;
  /** Section names from the score, in the order they are visited. */
  readonly route: readonly string[];
  /** Four-bar cells one stop on the route lasts. */
  readonly cellsPerStop: number;
  /** How far the arrangement drops for the cell opening each stop. Default 0.15. */
  readonly breath?: number;
}

export interface GeneratedTheme extends ThemeBase {
  readonly kind: 'generated';
  readonly bpm: number;
  /** MIDI note of the key's root — where the bass plays, so it sets the whole register. */
  readonly root: number;
  /** Semitones of the seven scale degrees, from the root. */
  readonly scale: readonly number[];
  /** Chord loops to choose between, each written as scale degrees. 0 is the tonic. */
  readonly progressions: readonly (readonly number[])[];
  readonly barsPerChord: number;
  /** How far the arrangement drops for the four bars opening each section. Default 0.18. */
  readonly breath?: number;
  /**
   * What the bass plays: the chord root, or a rolling riff on the pentatonic.
   *
   * Two different jobs, not two settings of one — a root bass is the floor under the harmony, and
   * a riff bass is the hook the bar is built on.
   */
  readonly bassMode?: 'root' | 'riff';
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

/** Loops leaning on the fourth and third, which is where the reference module's strings sit. */
const COFFEE_LOOPS = [
  [0, 3, 2, 6],
  [0, 2, 3, 0],
  [0, 3, 5, 2],
  [0, 0, 3, 2],
] as const;

// ---------------------------------------------------------------------------
// Rhythms — one bar of sixteenths, `x` where the layer plays
// ---------------------------------------------------------------------------

const TEA_PATTERNS = {
  kick: ['x.......x.......', 'x.......x...x...', 'x.......x..x....', 'x...x...x...x...'],
  hat: ['..x...x...x...x.', '..x...x...x...xx', '..x.x.x...x.x.x.', '..x...x.....x.x.'],
  bass: ['x...............', 'x.........x.....', 'x.......x.......', 'x.....x...x.....'],
  arp: ['..x..x....x..x..', '..x...x.x...x...', '....x.....x...x.', '..x..x..x..x..x.'],
} as const;

/**
 * Read off the reference module's own channels rather than invented.
 *
 * Kick four on the floor. Snare a breakbeat, not a backbeat: strongest on the two and on the last
 * sixteenth of that beat, with ghosts scattered after it. Bass continuous sixteenths — its busiest
 * channel by a factor of two, which is why the riff is the hook here.
 */
const COFFEE_PATTERNS = {
  kick: ['x...x...x...x...', 'x...x...x...x..x', 'x...x...x...x.x.', 'x...x...x..xx...'],
  snare: ['....x..x..x.x...', '....x..x....x.x.', '....x..x..xx.x..', '..x.x..x..x.x..x'],
  hat: ['..x.x.x.x.x.x.x.', '..x...x...x...x.', 'x.x.x.x.x.x.x.xx', '..x.x.x...x.x.xx'],
  bass: ['xxxxxxxxxxxxxxxx', 'xxx.xxx.xxx.xxx.', 'xxxxxxx.xxxxxxx.', 'xx.xxxx.xx.xxxx.'],
  arp: ['..x.x...x.x.x...', 'x.x.x.x.x.x.x.x.', '....x.x.....x.x.', '..x..x..x..x..x.'],
  /** Kept sparse and high in the intensity range: the strings and the riff are the tune here. */
  lead: [
    'x.......x...x...x.......x.......',
    'x.....x.....x...x...........x...',
  ],
} as const;

// ---------------------------------------------------------------------------
// Soundtracks
// ---------------------------------------------------------------------------

/** Pad, bell, bass, hats, a soft kick, an arpeggio last. Nothing hurries. */
const TEA_LAYERS = { pad: 0, bell: 0.15, bass: 0.22, hat: 0.4, kick: 0.5, arp: 0.5 };

/**
 * Comment a line out and that instrument is gone; the number is the intensity the layer needs
 * before it joins, against the mood's `intensity` below. Above every mood's intensity means muted
 * but not deleted — which is what `lead` and `arp` were until now, so neither had ever been heard.
 */
const COFFEE_LAYERS = {
  pad: 0,
  arp: 0.15,
  kick: 0.28,
  snare: 0.34,
  hat: 0.44,
  bell: 0.48,
};

/**
 * The reference's three tuned voices: a violin section on the chords, a choir for the occasional
 * held note, and a sub for the riff. The `bell` layer carries the choir — sparse, every few bars,
 * which is exactly what that layer already does.
 */
const COFFEE_VOICES = { pad: 'strings', bell: 'choir', bass: 'drive' } as const;

/**
 * The transcribed piece's layers, in the order turning the energy down should take them away.
 *
 * The hook and the pads never leave — without the sine line it is not this piece. The percussion
 * goes first, which is what a menu wants, and the buzzy sixteenth line last of all.
 */
const FOREGONE_LAYERS = {
  lead: 0,
  pad: 0,
  bass: 0.12,
  bell: 0.2,
  kick: 0.3,
  snare: 0.36,
  hat: 0.45,
  arp: 0.6,
};

/** Seven percussion samples all land on one voice, so as a group they need pulling back. */
const FOREGONE_GAINS = { hat: 0.8 } as const;

/** The arpeggio sits well back in both: texture behind the rest, not a part. */
const COFFEE_GAINS = { arp: 0.4 } as const;
const TEA_GAINS = { arp: 0.4 } as const;

export const SOUNDTRACKS = {
  /** Calm ambient techno. Music to leave on for an hour of puzzle-solving. */
  tea: {
    label: 'Tea',
    description: 'Slow pads, deep bass, room to think',
    moods: {
      menu: {
        kind: 'generated',
        bpm: 84, root: 45, scale: NATURAL_MINOR, progressions: SLOW_LOOPS,
        barsPerChord: 4, intensity: 0.2, reverb: 0.5,
        layers: TEA_LAYERS, patterns: TEA_PATTERNS, gains: TEA_GAINS,
      },
      map: {
        kind: 'generated',
        bpm: 88, root: 43, scale: DORIAN, progressions: MINOR_LOOPS,
        barsPerChord: 2, intensity: 0.38, reverb: 0.46,
        layers: TEA_LAYERS, patterns: TEA_PATTERNS, gains: TEA_GAINS,
      },
      puzzle: {
        kind: 'generated',
        bpm: 92, root: 45, scale: NATURAL_MINOR, progressions: MINOR_LOOPS,
        barsPerChord: 2, intensity: 0.55, reverb: 0.42,
        layers: TEA_LAYERS, patterns: TEA_PATTERNS, gains: TEA_GAINS,
      },
    },
  },

  /**
   * Breakbeat with strings over it, in the shape of the Impulse Tracker music of late-90s
   * shooters. Its numbers are not invented: tempo, the drum grids and the fact that the *bass* is
   * the hook were all read out of the module in `src/assets/music` with `npm run music:analyze` —
   * kick four on the floor, and a bass channel carrying twice the notes of anything else.
   *
   * Only those parameters are borrowed; no note of the reference is reproduced. `foregone` below
   * plays that module properly, and the two make the difference plain: same genre, different tune.
   */
  coffee: {
    label: 'Coffee',
    description: 'Rolling bass riff, four-to-the-floor, strings over the top',
    moods: {
      /** Strings and the riff, and the break only once the section comes round. */
      menu: {
        kind: 'generated',
        bpm: 118, root: 48, scale: NATURAL_MINOR, progressions: COFFEE_LOOPS,
        barsPerChord: 4, intensity: 0.26, reverb: 0.4, breath: 0.2, bassMode: 'riff',
        layers: COFFEE_LAYERS, patterns: COFFEE_PATTERNS, voices: COFFEE_VOICES,
        gains: COFFEE_GAINS,
      },
      map: {
        kind: 'generated',
        bpm: 125, root: 48, scale: NATURAL_MINOR, progressions: COFFEE_LOOPS,
        barsPerChord: 2, intensity: 0.5, reverb: 0.34, breath: 0.26, bassMode: 'riff',
        layers: COFFEE_LAYERS, patterns: COFFEE_PATTERNS, voices: COFFEE_VOICES,
        gains: COFFEE_GAINS,
      },
      /** Everything the piece has, and a real breakdown every sixteen bars. */
      puzzle: {
        kind: 'generated',
        bpm: 125, root: 48, scale: NATURAL_MINOR, progressions: COFFEE_LOOPS,
        barsPerChord: 2, intensity: 0.72, reverb: 0.3, breath: 0.38, bassMode: 'riff',
        layers: COFFEE_LAYERS, patterns: COFFEE_PATTERNS, voices: COFFEE_VOICES,
        gains: COFFEE_GAINS,
      },
    },
  },
  /**
   * The real piece's material, arranged rather than replayed.
   *
   * Keyed `foregone` after the module it comes from, and labelled for the player like the other
   * two; the id is what `--soundtrack=` and the saved setting use.
   *
   * `coffee` above borrows this module's tempo, key and drum grids and then invents its own notes,
   * which makes it the same genre and a different tune. This one is the third possibility: its
   * notes are the module's — 73 loops of four bars, through synth patches built from its own
   * samples' measured spectra — and its *arrangement* is generated, from the orchestrations the
   * module was really scored with. So it is that piece, and it is never quite the same run of it.
   */
  foregone: {
    label: 'Ice',
    description: 'Foregone Destruction (UT99), rearranged',
    moods: {
      /** Sits in the intro: the hook, the stabs and the low tone, and it never builds. */
      menu: {
        kind: 'loops', score: 'foregone', route: ['intro'], cellsPerStop: 4,
        intensity: 0.5, reverb: 0.36, breath: 0.1,
        layers: FOREGONE_LAYERS, gains: FOREGONE_GAINS,
      },
      /** The body, with the break coming round every fourth stop for somewhere to go. */
      map: {
        kind: 'loops', score: 'foregone', route: ['main', 'main', 'break', 'main'],
        cellsPerStop: 4, intensity: 0.75, reverb: 0.3,
        layers: FOREGONE_LAYERS, gains: FOREGONE_GAINS,
      },
      /**
       * The whole form — eight stops, about three minutes, and the only place the strings are
       * heard. Rolls its loops afresh each time round, so the second pass is the same shape and
       * not the same music.
       */
      puzzle: {
        kind: 'loops', score: 'foregone',
        route: ['intro', 'main', 'main', 'break', 'main', 'strings', 'main', 'outro'],
        cellsPerStop: 4, intensity: 1, reverb: 0.26, breath: 0.2,
        layers: FOREGONE_LAYERS, gains: FOREGONE_GAINS,
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

export const DEFAULT_SOUNDTRACK: SoundtrackId = 'tea';

export function themeOf(soundtrack: SoundtrackId, mood: MoodId): MusicTheme {
  return SOUNDTRACKS[soundtrack].moods[mood];
}
