/**
 * Which notes start on this sixteenth. Knows nothing about how they will sound.
 *
 * The chord loops, drum patterns and arpeggio figures are written out below and the seed only
 * chooses *between* them: randomness picks the arrangement, never the notes.
 */
import { Random, hashSeed } from './dsp.ts';
import type { PatchName } from './instruments.ts';
import { STEPS_PER_BAR, STEPS_PER_BEAT, type NoteEvent, type NoteSource } from './notes.ts';
import type { GeneratedTheme, MusicLayer } from './themes.ts';

const BEATS_PER_BAR = STEPS_PER_BAR / STEPS_PER_BEAT;
/** Bars before the arrangement is re-rolled. */
const BARS_PER_SECTION = 16;
/** Bars at the top of each section that thin out, so the music breathes rather than churns. */
const BREATH_BARS = 4;
const DEFAULT_BREATH = 0.18;

/**
 * Layers a section may leave out. Not the pad, bass or snare, which hold it together — and not
 * the lead either: where a soundtrack has one it is the hook, and 16 bars without it is a
 * different piece rather than a variation.
 */
const OPTIONAL_LAYERS: MusicLayer[] = ['bell', 'hat', 'arp'];

/** Layers that play a pitch. The rest are drums, which have no patch. */
type TunedLayer = 'pad' | 'bass' | 'arp' | 'bell' | 'lead';
type DrumLayer = 'kick' | 'snare' | 'hat';

const DRUM_LAYERS: readonly MusicLayer[] = ['kick', 'snare', 'hat'];

function isDrumLayer(layer: MusicLayer): layer is DrumLayer {
  return DRUM_LAYERS.includes(layer);
}

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

/**
 * The five degrees a rolling bass riff moves on: root, second, third, fourth, fifth.
 *
 * A minor scale with the sixth and seventh left out. Read off the reference tracker module, whose
 * melodic content is C D E♭ F G and almost nothing else — leaving out the two degrees that would
 * date it is what makes the mode sound like this rather than like a scale being run up and down.
 */
const BASS_DEGREES = [0, 1, 2, 3, 4];

/**
 * Where a bass riff aims on each of the four beats, as indices into `BASS_DEGREES`.
 *
 * Always starting from the root, because a riff that begins anywhere else stops being the thing
 * the bar is built on.
 */
const BASS_CONTOURS = [
  [0, 0, 3, 2],
  [0, 0, 4, 3],
  [0, 2, 3, 0],
  [0, 0, 2, 4],
  [0, 3, 2, 0],
  [0, 0, 1, 3],
];

/** Steps within a bar a melody note may begin on — off the downbeat, mostly. */
const MELODY_STEPS = [0, 3, 4, 6, 8, 10, 12];

/** Octaves above the key's root, a register per layer. The bass is the root itself. */
const PAD_OCTAVE = 1;
const ARP_OCTAVE = 2;
const MELODY_OCTAVE = 2;
const LEAD_OCTAVE = 2;

/**
 * Shapes a phrase can take, as the degrees it aims for across its length.
 *
 * This is the melody's skeleton, and having one written down is the whole difference between a
 * tune and a wander. Each is four targets — where the line is at the start, a third of the way
 * through, two thirds, and at the end — and the notes are hung off them.
 */
const CONTOURS = [
  [0, 2, 4, 2],
  [4, 2, 0, 2],
  [0, 4, 7, 4],
  [2, 0, 4, 0],
  [7, 4, 2, 0],
  [0, -1, 2, 4],
];

/** How far a melody may wander from the tonic. */
const LEAD_LOW = -3;
const LEAD_HIGH = 9;

/** The arrangement for one section, re-rolled every sixteen bars. */
interface SectionPlan {
  progression: readonly number[];
  kick: string;
  snare: string;
  hat: string;
  bass: string;
  arp: string;
  /** The lead's rhythm over two bars, so a phrase has room to have a shape. */
  lead: string;
  leadIndex: Int8Array;
  /**
   * One degree per note of the phrase, twice over: the statement, then the answer that ends on
   * the tonic. Four bars of lead is `statement` then `answer` — the repetition is the point.
   */
  statement: number[];
  answer: number[];
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
  /** Steps from each lead note to the next: a sparse riff sings, a dense one is staccato. */
  leadGaps: Int8Array;
  /** The section's melodic figure: a step within the bar, and a degree of the key. */
  motif: { step: number; degree: number }[];
  /** Where the rolling bass aims on each beat, when the theme has one. */
  bassContour: number[];
  /** Which optional layer sits this section out, if any. */
  dropped: MusicLayer | null;
  /** Whether chords take their seventh — a section of colour, then a section without. */
  seventh: boolean;
}

export class Composer implements NoteSource {
  private plan: SectionPlan;
  private planIndex = -1;
  /** Reseeded per step, so a step's small decisions do not depend on how it was reached. */
  private stepRandom = new Random(1);

  private out: NoteEvent[] = [];
  private count = 0;
  private theme: GeneratedTheme;
  private seed: number;

  constructor(theme: GeneratedTheme, seed: number) {
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
    const breath = this.theme.breath ?? DEFAULT_BREATH;
    const level = barInSection < BREATH_BARS ? intensity - breath : intensity;

    const chordRoot = this.chordRootAt(bar);
    if (this.plays('pad', level)) this.addPad(bar, stepInBar, chordRoot);
    if (this.plays('bass', level)) this.addBass(stepInBar, chordRoot);
    if (this.plays('kick', level)) this.addKick(stepInBar);
    if (this.plays('snare', level)) this.addSnare(stepInBar);
    if (this.plays('hat', level)) this.addHat(stepInBar, level);
    if (this.plays('arp', level)) this.addArp(bar, stepInBar, chordRoot);
    if (this.plays('lead', level)) this.addLead(bar, stepInBar);
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
      this.emit('pad', root + interval, duration, 0.85, 0);
    }
  }

  private addBass(stepInBar: number, chordRoot: number): void {
    if (this.plan.bass[stepInBar] !== 'x') return;
    if (this.theme.bassMode === 'riff') {
      this.addBassRiff(stepInBar, chordRoot);
      return;
    }

    const isDownbeat = stepInBar === 0;
    // An octave up now and then off the beat: what stops a sixteenth line being one long note.
    const octave = !isDownbeat && this.stepRandom.chance(0.22) ? 12 : 0;
    this.emit(
      'bass',
      this.rootNear(chordRoot, this.theme.root) + octave,
      (isDownbeat ? 1.6 : 0.7) * this.beatDuration,
      isDownbeat ? 1 : 0.72,
      0,
    );
  }

  /**
   * A rolling bass: sixteenths that keep moving, and the hook rather than the foundation.
   *
   * The beat carries the contour's note; between beats the line jumps the octave and steps to a
   * neighbour, which is what makes sixteen notes a riff instead of one note sixteen times. Read
   * off the reference module, whose bass is its busiest channel by a factor of two.
   */
  private addBassRiff(stepInBar: number, chordRoot: number): void {
    const beat = Math.floor(stepInBar / STEPS_PER_BEAT);
    const sub = stepInBar % STEPS_PER_BEAT;
    const target = this.plan.bassContour[beat % this.plan.bassContour.length];

    let degree = BASS_DEGREES[target];
    if (sub === 1) degree += this.theme.scale.length;
    else if (sub === 3) degree = BASS_DEGREES[(target + 1) % BASS_DEGREES.length];

    this.emit(
      'bass',
      this.rootNear(chordRoot, this.theme.root) + this.degreeInterval(chordRoot, degree),
      1.1 * this.stepDuration,
      sub === 0 ? 1 : this.stepRandom.range(0.72, 0.88),
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
      'arp',
      root + intervals[shape % intervals.length],
      this.stepDuration,
      this.stepRandom.range(0.7, 1),
      this.stepRandom.range(-0.4, 0.4),
    );
  }

  /**
   * The tune. A two-bar phrase, stated and then answered, and the same four bars every time it
   * comes round — a melody is remembered because it repeats, not because it varies.
   *
   * Fixed against the key rather than transposed under the chords, so the line stays itself while
   * the harmony moves beneath it. That is the difference between a melody and an arpeggio.
   */
  private addLead(bar: number, stepInBar: number): void {
    const phraseStep = (bar % 2) * STEPS_PER_BAR + stepInBar;
    const noteIndex = this.plan.leadIndex[phraseStep];
    if (noteIndex < 0) return;

    // Bars 0-1 of each four state the phrase, bars 2-3 answer it.
    const answering = Math.floor(bar / 2) % 2 === 1;
    const degrees = answering ? this.plan.answer : this.plan.statement;
    this.emit(
      'lead',
      this.noteOf(degrees[noteIndex], LEAD_OCTAVE),
      // Held until just before the next note, so the line is as legato as its rhythm is sparse.
      0.92 * this.plan.leadGaps[phraseStep] * this.stepDuration,
      this.stepRandom.range(0.88, 1),
      this.stepRandom.range(-0.12, 0.12),
    );
  }

  /** The motif, played every fourth bar. The same figure each time, over whatever chord is up. */
  private addBell(bar: number, stepInBar: number): void {
    if (bar % 4 !== 0) return;
    for (const note of this.plan.motif) {
      if (note.step !== stepInBar) continue;
      this.emit(
        'bell',
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
      leadGaps: countGaps(lead),
      ...this.rollMelody(random, lead),
      bassContour: random.pick(BASS_CONTOURS).slice(),
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
   * The phrase, as one degree per note of its rhythm.
   *
   * Hung off a contour rather than walked. A note on a beat *is* the contour's target, so the
   * shape is what the ear hears on the beats; a note off the beat steps towards the next target,
   * so the movement between them leads somewhere instead of milling about. A random walk gives
   * neither, which is why it sounds like random notes however carefully its steps are weighted.
   *
   * The statement ends unresolved on the fifth and the answer ends on the tonic. Otherwise the
   * two are the *same notes* — repetition is what makes a tune a tune.
   */
  private rollMelody(random: Random, rhythm: string): { statement: number[]; answer: number[] } {
    const onBeat: boolean[] = [];
    for (let step = 0; step < rhythm.length; step++) {
      if (rhythm[step] === 'x') onBeat.push(step % STEPS_PER_BEAT === 0);
    }

    const contour = random.pick(CONTOURS);
    // Lifted or dropped an octave now and then, so two sections on one contour still differ.
    const shift = random.chance(0.25) ? (random.chance(0.5) ? 7 : -7) : 0;

    const statement: number[] = [];
    for (let i = 0; i < onBeat.length; i++) {
      const index = Math.min(contour.length - 1, Math.floor((i * contour.length) / onBeat.length));
      const target = contour[index];
      const next = contour[Math.min(contour.length - 1, index + 1)];
      // Off the beat, lean towards wherever the line is going next.
      const lean = next === target ? (random.chance(0.5) ? 1 : -1) : Math.sign(next - target);
      const degree = (onBeat[i] ? target : target + lean) + shift;
      statement.push(Math.max(LEAD_LOW, Math.min(LEAD_HIGH, degree)));
    }

    const answer = statement.slice();
    statement[statement.length - 1] = 4 + shift;
    answer[answer.length - 1] = shift;
    return { statement, answer };
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

  /** Semitones from a chord's root up to the degree `offset` above it, staying in the key. */
  private degreeInterval(chordRoot: number, offset: number): number {
    return this.noteOf(chordRoot + offset, 0) - this.noteOf(chordRoot, 0);
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

  /**
   * Takes the layer rather than the patch, so which instrument plays it and how loud it sits are
   * both resolved here — the theme's `gains` are a mix, and a mix belongs in one place.
   */
  private emit(
    layer: MusicLayer, note: number, duration: number, velocity: number, pan: number,
  ): void {
    if (this.count >= this.out.length) return;
    const event = this.out[this.count++];
    event.kind = isDrumLayer(layer) ? layer : this.patchFor(layer);
    event.note = note;
    event.duration = duration;
    event.velocity = velocity * (this.theme.gains?.[layer] ?? 1);
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

/** Steps from each hit to the next one, wrapping at the bar. Zero where nothing plays. */
function countGaps(pattern: string): Int8Array {
  const gaps = new Int8Array(pattern.length);
  for (let step = 0; step < pattern.length; step++) {
    if (pattern[step] !== 'x') continue;
    let gap = 1;
    while (gap < pattern.length && pattern[(step + gap) % pattern.length] !== 'x') gap++;
    gaps[step] = gap;
  }
  return gaps;
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
