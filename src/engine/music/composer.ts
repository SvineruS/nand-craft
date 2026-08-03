/**
 * Which notes start on this sixteenth. Knows nothing about how they will sound.
 *
 * The chord loops, drum patterns and arpeggio figures are written out below and the seed only
 * chooses *between* them: randomness picks the arrangement, never the notes.
 */
import { Random, hashSeed } from './dsp.ts';
import type { PatchName } from './instruments.ts';
import type { MusicLayer, MusicTheme } from './themes.ts';

/** The instrument an event is for: a tuned patch, or one of the drums. */
export type EventKind = PatchName | 'kick' | 'snare' | 'hat';

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

export function createEventPool(size: number): NoteEvent[] {
  return Array.from({ length: size }, () => (
    { kind: 'pad', note: 60, duration: 1, velocity: 1, pan: 0, seed: 0 } satisfies NoteEvent
  ));
}

export const STEPS_PER_BAR = 16;
const STEPS_PER_BEAT = 4;
const BEATS_PER_BAR = STEPS_PER_BAR / STEPS_PER_BEAT;
/** Bars before the arrangement is re-rolled. */
const BARS_PER_SECTION = 16;
/** Bars at the top of each section that thin out, so the music breathes rather than churns. */
const BREATH_BARS = 4;
const BREATH_INTENSITY_DROP = 0.18;

/** Layers a section may leave out — never the pad, bass or snare, which hold it together. */
const OPTIONAL_LAYERS: MusicLayer[] = ['bell', 'hat', 'arp', 'lead'];

/** Layers that play a pitch. The rest are drums, which have no patch. */
type TunedLayer = 'pad' | 'bass' | 'arp' | 'bell' | 'lead';

/** The patch each tuned layer plays unless the theme overrides it — a Record, so none is missed. */
const DEFAULT_PATCH: Record<TunedLayer, PatchName> = {
  pad: 'pad',
  bass: 'bass',
  arp: 'pluck',
  bell: 'bell',
  lead: 'lead',
};

/** Minor pentatonic: dropping the second and sixth lets one motif fit every chord in the loop. */
const MELODY_DEGREES = [0, 2, 3, 4, 6];

/** Steps within a bar a melody note may begin on — off the downbeat, mostly. */
const MELODY_STEPS = [0, 3, 4, 6, 8, 10, 12];

/** Octaves above the key's root, a register per layer. The bass is the root itself. */
const PAD_OCTAVE = 1;
const ARP_OCTAVE = 2;
const MELODY_OCTAVE = 2;
const LEAD_OCTAVE = 2;

/** Degrees a riff leaps to when it does not step: root, third, fifth, octave. */
const RIFF_ACCENTS = [0, 2, 4, 7];
/** How far a riff may wander from the chord root. */
const RIFF_LOW = -3;
const RIFF_HIGH = 7;

/** The arrangement for one section, re-rolled every sixteen bars. */
interface SectionPlan {
  progression: readonly number[];
  kick: string;
  snare: string;
  hat: string;
  bass: string;
  arp: string;
  lead: string;
  /** Scale degrees the lead riff walks, relative to the chord root. */
  riff: number[];
  leadIndex: Int8Array;
  leadHits: number;
  /** Chord tones in the order the arpeggio walks them. */
  arpShape: number[];
  /**
   * Which note of the figure each step plays, or -1 for a rest. The figure must advance per
   * *note*: indexed by position in the bar, a 3-note figure on an every-third-step pattern only
   * ever reaches two of its notes.
   */
  arpIndex: Int8Array;
  /** Notes the pattern plays per bar, so the figure carries on across the bar line. */
  arpHits: number;
  /** The section's melodic figure: a step within the bar, and a degree of the key. */
  motif: { step: number; degree: number }[];
  /** Which optional layer sits this section out, if any. */
  dropped: MusicLayer | null;
  /** Whether chords take their seventh — a section of colour, then a section without. */
  seventh: boolean;
}

export class Composer {
  private plan: SectionPlan;
  private planIndex = -1;
  /** Reseeded per step, so a step's small decisions do not depend on how it was reached. */
  private stepRandom = new Random(1);

  private out: NoteEvent[] = [];
  private count = 0;
  private theme: MusicTheme;
  private seed: number;

  constructor(theme: MusicTheme, seed: number) {
    this.theme = theme;
    this.seed = seed;
    this.plan = this.planSection(0);
    this.planIndex = 0;
  }

  /** Seconds per sixteenth — the grid everything lands on. */
  get stepDuration(): number {
    return 60 / this.theme.bpm / STEPS_PER_BEAT;
  }

  /** Seconds per beat. */
  get beatDuration(): number {
    return 60 / this.theme.bpm;
  }

  /** Sixteenths a chord lasts — where the music can be interrupted without it showing. */
  get stepsPerChord(): number {
    return STEPS_PER_BAR * this.theme.barsPerChord;
  }

  /** Fill `out` with the notes starting on `step` and return how many. */
  collect(step: number, intensity: number, out: NoteEvent[]): number {
    this.out = out;
    this.count = 0;
    this.stepRandom.reseed(hashSeed(this.seed, step, 0x51ed));

    const bar = Math.floor(step / STEPS_PER_BAR);
    const stepInBar = step % STEPS_PER_BAR;
    this.ensurePlan(bar);

    // Every section opens by pulling the arrangement back, then filling in again.
    const barInSection = bar % BARS_PER_SECTION;
    const level = barInSection < BREATH_BARS ? intensity - BREATH_INTENSITY_DROP : intensity;

    const chordRoot = this.chordRootAt(bar);
    if (this.plays('pad', level)) this.addPad(bar, stepInBar, chordRoot);
    if (this.plays('bass', level)) this.addBass(stepInBar, chordRoot);
    if (this.plays('kick', level)) this.addKick(stepInBar);
    if (this.plays('snare', level)) this.addSnare(stepInBar);
    if (this.plays('hat', level)) this.addHat(stepInBar, level);
    if (this.plays('arp', level)) this.addArp(bar, stepInBar, chordRoot);
    if (this.plays('lead', level)) this.addLead(bar, stepInBar, chordRoot);
    if (this.plays('bell', level)) this.addBell(bar, stepInBar);

    return this.count;
  }

  // -------------------------------------------------------------------------
  // Layers
  // -------------------------------------------------------------------------

  /** The chord itself, held for as long as it lasts so that consecutive chords overlap. */
  private addPad(bar: number, stepInBar: number, chordRoot: number): void {
    if (stepInBar !== 0 || bar % this.theme.barsPerChord !== 0) return;

    const duration = this.theme.barsPerChord * BEATS_PER_BAR * this.beatDuration;
    // An octave above the bass; any lower and the chord fights it for the same few dozen hertz.
    const root = this.rootNear(chordRoot, this.theme.root + PAD_OCTAVE * 12);
    for (const interval of this.chordIntervals(chordRoot, this.plan.seventh)) {
      this.emit(this.patchFor('pad'), root + interval, duration, 0.85, 0);
    }
  }

  private addBass(stepInBar: number, chordRoot: number): void {
    if (this.plan.bass[stepInBar] !== 'x') return;
    const isDownbeat = stepInBar === 0;
    // An octave up now and then off the beat: what stops a sixteenth line being one long note.
    const octave = !isDownbeat && this.stepRandom.chance(0.22) ? 12 : 0;
    this.emit(
      this.patchFor('bass'),
      this.rootNear(chordRoot, this.theme.root) + octave,
      (isDownbeat ? 1.6 : 0.7) * this.beatDuration,
      isDownbeat ? 1 : 0.72,
      0,
    );
  }

  private addKick(stepInBar: number): void {
    if (this.plan.kick[stepInBar] !== 'x') return;
    this.emit('kick', 0, 0, stepInBar === 0 ? 1 : 0.85, 0);
  }

  /** Backbeat, with the off-beat hits played as ghost notes. */
  private addSnare(stepInBar: number): void {
    if (this.plan.snare[stepInBar] !== 'x') return;
    const onBeat = stepInBar % STEPS_PER_BEAT === 0;
    this.emit('snare', 0, 0, onBeat ? 1 : this.stepRandom.range(0.45, 0.6), 0);
  }

  private addHat(stepInBar: number, level: number): void {
    if (this.plan.hat[stepInBar] !== 'x') return;
    // Grows with intensity rather than switching on: quiet and closed first, opening up later.
    const velocity = this.stepRandom.range(0.5, 0.8) * Math.min(1, level + 0.3);
    const pan = this.stepRandom.range(-0.35, 0.35);
    this.emit('hat', 0, this.hatRelease(stepInBar, level), velocity, pan);
  }

  private addArp(bar: number, stepInBar: number, chordRoot: number): void {
    const noteIndex = this.plan.arpIndex[stepInBar];
    if (noteIndex < 0) return;

    // Carries on across the bar line rather than restarting, so the figure is heard as a figure.
    const { arpShape, arpHits } = this.plan;
    const shape = arpShape[(bar * arpHits + noteIndex) % arpShape.length];
    const intervals = this.chordIntervals(chordRoot, false);
    const root = this.rootNear(chordRoot, this.theme.root + ARP_OCTAVE * 12);
    this.emit(
      this.patchFor('arp'),
      root + intervals[shape % intervals.length],
      this.stepDuration,
      this.stepRandom.range(0.7, 1),
      this.stepRandom.range(-0.4, 0.4),
    );
  }

  /**
   * The riff. Unlike the bell's motif it is a line, not an ornament: it runs every bar and its
   * degrees are relative to the chord, so it transposes under the progression.
   */
  private addLead(bar: number, stepInBar: number, chordRoot: number): void {
    const noteIndex = this.plan.leadIndex[stepInBar];
    if (noteIndex < 0) return;

    const { riff, leadHits } = this.plan;
    const offset = riff[(bar * leadHits + noteIndex) % riff.length];
    const root = this.rootNear(chordRoot, this.theme.root + LEAD_OCTAVE * 12);
    this.emit(
      this.patchFor('lead'),
      root + this.degreeInterval(chordRoot, offset),
      1.5 * this.stepDuration,
      this.stepRandom.range(0.82, 1),
      this.stepRandom.range(-0.15, 0.15),
    );
  }

  /** The motif, played every fourth bar. The same figure each time, over whatever chord is up. */
  private addBell(bar: number, stepInBar: number): void {
    if (bar % 4 !== 0) return;
    for (const note of this.plan.motif) {
      if (note.step !== stepInBar) continue;
      this.emit(
        this.patchFor('bell'),
        this.noteOf(note.degree, MELODY_OCTAVE),
        2 * this.beatDuration,
        this.stepRandom.range(0.75, 1),
        this.stepRandom.range(-0.3, 0.3),
      );
    }
  }

  // -------------------------------------------------------------------------
  // The plan
  // -------------------------------------------------------------------------

  /** Seeded from the section number, not a running stream, so adding a layer shifts nothing. */
  private planSection(section: number): SectionPlan {
    const random = new Random(hashSeed(this.seed, section, 0x9d2c));
    const progression = random.pick(this.theme.progressions);
    const arp = this.pickPattern(random, 'arp');
    const lead = this.pickPattern(random, 'lead');

    return {
      progression,
      kick: this.pickPattern(random, 'kick'),
      snare: this.pickPattern(random, 'snare'),
      hat: this.pickPattern(random, 'hat'),
      bass: this.pickPattern(random, 'bass'),
      arp,
      arpIndex: countNoteIndexes(arp),
      arpHits: countHits(arp),
      arpShape: this.rollArpShape(random),
      lead,
      leadIndex: countNoteIndexes(lead),
      leadHits: countHits(lead),
      riff: this.rollRiff(random),
      motif: this.rollMotif(random),
      dropped: random.chance(0.35) ? random.pick(OPTIONAL_LAYERS) : null,
      seventh: random.chance(0.5),
    };
  }

  /** A rhythm for a layer, or an empty bar for a layer this theme does not have. */
  private pickPattern(random: Random, layer: MusicLayer): string {
    const patterns = this.theme.patterns[layer];
    return patterns && patterns.length > 0 ? random.pick(patterns) : EMPTY_BAR;
  }

  /**
   * Five to eight degrees, mostly stepping, occasionally leaping to a strong one.
   *
   * Its length is deliberately not the number of notes in the bar, so the figure phases across
   * bars instead of repeating identically — a riff that develops out of one short cell.
   */
  private rollRiff(random: Random): number[] {
    const length = 5 + random.int(4);
    const riff: number[] = [];
    let degree = 0;
    for (let i = 0; i < length; i++) {
      riff.push(degree);
      degree = random.chance(0.25)
        ? random.pick(RIFF_ACCENTS)
        : degree + (random.chance(0.5) ? 1 : -1) * (1 + random.int(2));
      degree = Math.max(RIFF_LOW, Math.min(RIFF_HIGH, degree));
    }
    // Land on the root, so the figure sounds finished rather than cut off.
    riff[riff.length - 1] = 0;
    return riff;
  }

  /** The order the arpeggio walks the chord, as indices: up, down, or up with a turn at the top. */
  private rollArpShape(random: Random): number[] {
    const shapes = [[0, 1, 2], [2, 1, 0], [0, 1, 2, 1], [0, 2, 1, 2]];
    return random.pick(shapes).slice();
  }

  /** Two or three notes that stay inside the pentatonic, so they fit every chord in the loop. */
  private rollMotif(random: Random): { step: number; degree: number }[] {
    const length = 2 + random.int(2);
    const notes: { step: number; degree: number }[] = [];
    let index = random.int(MELODY_DEGREES.length);
    let stepIndex = random.int(3);

    for (let i = 0; i < length; i++) {
      notes.push({ step: MELODY_STEPS[stepIndex], degree: MELODY_DEGREES[index] });
      // Steps rather than leaps, and always forward in time.
      const direction = random.chance(0.5) ? 1 : -1;
      index = Math.max(0, Math.min(MELODY_DEGREES.length - 1, index + direction));
      stepIndex = Math.min(MELODY_STEPS.length - 1, stepIndex + 1 + random.int(2));
    }
    return notes;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Re-roll the arrangement if `bar` has crossed into a new section. */
  private ensurePlan(bar: number): void {
    const section = Math.floor(bar / BARS_PER_SECTION);
    if (section === this.planIndex) return;
    this.plan = this.planSection(section);
    this.planIndex = section;
  }

  /** A layer plays if the theme has it, the intensity has reached it, and the section kept it. */
  private plays(layer: MusicLayer, level: number): boolean {
    const threshold = this.theme.layers[layer];
    return threshold !== undefined && level >= threshold && this.plan.dropped !== layer;
  }

  /** The patch a layer plays: the theme's choice, or the default for that layer. */
  private patchFor(layer: TunedLayer): PatchName {
    return this.theme.voices?.[layer] ?? DEFAULT_PATCH[layer];
  }

  /** Semitones from a chord's root to the degree `offset` above it, staying in the key. */
  private degreeInterval(chordRoot: number, offset: number): number {
    return this.noteOf(chordRoot + offset, 0) - this.noteOf(chordRoot, 0);
  }

  /**
   * A chord root in whichever octave sits nearest `anchor` — the voice leading, and not optional:
   * voiced by degree, i–VII–VI–iv in A minor climbs A2, G3, F3, D3 instead of stepping down.
   * The window leans low (a fifth below against a major third above) so a root that could go
   * either way goes down.
   */
  private rootNear(degree: number, anchor: number): number {
    let note = this.noteOf(degree, 0);
    while (note - anchor > 4) note -= 12;
    while (anchor - note > 7) note += 12;
    return note;
  }

  /** Ascending semitones from a chord's root, read off the scale so it needs no chord quality. */
  private chordIntervals(degree: number, seventh: boolean): number[] {
    const tones = seventh ? [0, 2, 4, 6] : [0, 2, 4];
    const root = this.noteOf(degree, 0);
    return tones.map(tone => this.noteOf(degree + tone, 0) - root);
  }

  /** Scale degree the chord on this bar is built from. */
  private chordRootAt(bar: number): number {
    const { progression } = this.plan;
    const index = Math.floor(bar / this.theme.barsPerChord) % progression.length;
    return progression[index];
  }

  /** A degree as a MIDI note. Degrees run past the octave, so a chord is `root, +2, +4, +6`. */
  private noteOf(degree: number, octave: number): number {
    const { root, scale } = this.theme;
    const size = scale.length;
    const wrapped = ((degree % size) + size) % size;
    return root + 12 * (octave + Math.floor(degree / size)) + scale[wrapped];
  }

  /** An open hat at the end of a bar, when there is enough going on to want one. */
  private hatRelease(stepInBar: number, level: number): number {
    const open = stepInBar >= STEPS_PER_BAR - 2 && level > 0.6 && this.stepRandom.chance(0.5);
    return open ? 0.17 : 0.045;
  }

  private emit(
    kind: EventKind, note: number, duration: number, velocity: number, pan: number,
  ): void {
    if (this.count >= this.out.length) return;
    const event = this.out[this.count++];
    event.kind = kind;
    event.note = note;
    event.duration = duration;
    event.velocity = velocity;
    event.pan = pan;
    event.seed = this.stepRandom.next() * 0x7fffffff;
  }
}

/** A bar a layer sits out. */
const EMPTY_BAR = '................';

/** Notes in a one-bar pattern. */
function countHits(pattern: string): number {
  let hits = 0;
  for (const char of pattern) if (char === 'x') hits++;
  return hits;
}

/** Each step's index among the pattern's notes, or -1 where it rests. */
function countNoteIndexes(pattern: string): Int8Array {
  const indexes = new Int8Array(pattern.length).fill(-1);
  let played = 0;
  for (let step = 0; step < pattern.length; step++) {
    if (pattern[step] === 'x') indexes[step] = played++;
  }
  return indexes;
}
