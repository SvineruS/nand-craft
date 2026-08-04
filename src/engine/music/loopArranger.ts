/**
 * Builds an arrangement out of a real piece's loops. The counterpart of `composer.ts`: that one
 * invents notes from a handful of numbers, this one arranges notes it did not invent.
 *
 * The unit is a **cell** — four bars, which is how long one loop lasts. A **stop** is several cells
 * on one section of the original, and the theme's `route` is the order the stops are visited in:
 * the form of the piece, authored, while everything inside a stop is chosen by the seed.
 *
 * Three things are chosen, and none of them is a pitch:
 *
 * - which **section** — the route says, so the same form comes round every time.
 * - which **voicing** — an instrument set the original really played, picked by how loud the
 *   arrangement is meant to be. Extracted orchestration is what keeps this coherent: the arranger
 *   never decides that two kicks belong together, because it only ever picks a bar that existed.
 * - which **loop** each of those instruments plays, re-rolled every cell, so sixteen bars on one
 *   orchestration is four different bars rather than the same bar four times.
 *
 * The intensity gate then takes instruments *out* of the chosen voicing and never puts any in, so
 * turning the energy down can thin an orchestration but never invent one.
 */
import { Random, hashSeed } from './dsp.ts';
import { STEPS_PER_BEAT, type NoteEvent, type NoteSource } from './notes.ts';
import type {
  LoopCell, LoopScore, LoopSection, PlayableScore, ScoreVoice,
} from './score.ts';
import type { LoopTheme, MusicLayer } from './themes.ts';

/** IT's volume scale, and the pan range the transcriber writes. */
const MAX_VOLUME = 64;
const MAX_PAN = 64;

/** How far the arrangement drops for the cell opening each stop, unless the theme says. */
const DEFAULT_BREATH = 0.15;

/** One note of a loop, decoded. */
interface LoopNote {
  note: number;
  volume: number;
  /** Rows the note is held for. */
  rows: number;
  pan: number;
}

/** What one cell plays: instruments, and the loop each of them is on. Parallel arrays. */
interface CellPlan {
  instruments: number[];
  loops: number[];
}

/**
 * One stop's section, with its voicings already numbers so nothing is split while playing.
 *
 * The cells and the voicings are one object because they are indexed together — held apart, one is
 * reachable by a route position and the other by a score position, and the two are not the same.
 */
interface RouteStop {
  readonly cells: readonly LoopCell[];
  /** Per cell, the voicings as instrument numbers, fewest first. */
  readonly voicings: readonly (readonly number[][])[];
}

export class LoopArranger implements NoteSource {
  private theme: LoopTheme;
  private score: LoopScore;
  private voices: Readonly<Record<number, ScoreVoice>>;
  private seed: number;

  /** `notes[loop][row]` — decoded once, since one loop is played many times over. */
  private notes: LoopNote[][][];
  /** The route resolved to sections, so a stop is a lookup rather than a search. */
  private route: RouteStop[];

  private plan: CellPlan = { instruments: [], loops: [] };
  private planCell = -1;
  private random = new Random(1);

  constructor(theme: LoopTheme, playable: PlayableScore, seed: number) {
    this.theme = theme;
    this.score = playable.score;
    this.voices = playable.voices;
    this.seed = seed;
    this.notes = playable.score.loops.map(loop => decodeLoop(loop.notes, playable.score.rows));
    this.route = resolveRoute(theme.route, playable.score.sections);
  }

  get stepDuration(): number {
    return 60 / this.score.bpm / STEPS_PER_BEAT;
  }

  get beatDuration(): number {
    return 60 / this.score.bpm;
  }

  /** One cell — four bars, and where a loop was going to end anyway. */
  get stepsPerChord(): number {
    return this.score.rows;
  }

  collect(step: number, intensity: number, out: NoteEvent[]): number {
    const cell = Math.floor(step / this.score.rows);
    const row = step % this.score.rows;
    // Every stop opens by pulling the arrangement back, then filling in again.
    const opening = cell % this.theme.cellsPerStop === 0;
    const level = opening ? intensity - (this.theme.breath ?? DEFAULT_BREATH) : intensity;

    const plan = this.planFor(cell, intensity);
    let count = 0;
    for (let i = 0; i < plan.instruments.length; i++) {
      const voice = this.voices[plan.instruments[i]];
      if (!voice || !this.plays(voice.layer, level)) continue;
      for (const note of this.notes[plan.loops[i]][row]) {
        if (count >= out.length) return count;
        this.write(out[count++], note, voice, plan.loops[i], row);
      }
    }
    return count;
  }

  // -------------------------------------------------------------------------
  // The plan
  // -------------------------------------------------------------------------

  /**
   * What this cell plays, held until the cell changes.
   *
   * The voicing is seeded from the *stop* and the loops from the cell, which is the whole shape of
   * the thing: the orchestration holds still long enough to be heard as an arrangement while the
   * figures inside it move every four bars.
   */
  private planFor(cell: number, intensity: number): CellPlan {
    if (cell === this.planCell) return this.plan;
    this.planCell = cell;

    const stop = Math.floor(cell / this.theme.cellsPerStop);
    const at = this.route[stop % this.route.length];
    // A section's cells are its progression, so they advance whatever the stop is long.
    const index = (cell % this.theme.cellsPerStop) % at.cells.length;

    // The voicing first: it reseeds too, and from the stop, which would undo the cell's own seed.
    const voicing = this.pickVoicing(at.voicings[index], stop, intensity);
    this.random.reseed(hashSeed(this.seed, cell, 0x10f5));
    this.plan = { instruments: [], loops: [] };
    for (const instrument of voicing) {
      const options = at.cells[index].parts[instrument];
      if (!options || options.length === 0) continue;
      this.plan.instruments.push(instrument);
      this.plan.loops.push(this.random.pick(options));
    }
    return this.plan;
  }

  /**
   * An orchestration the original really played, chosen by how full the arrangement should be.
   *
   * The voicings arrive fewest-instruments-first, so intensity indexes them directly — which is
   * what makes the energy control shape the *arrangement* rather than only gate layers off it.
   */
  private pickVoicing(
    options: readonly number[][], stop: number, intensity: number,
  ): readonly number[] {
    const span = options.length - 1;
    if (span <= 0) return options[0] ?? [];

    this.random.reseed(hashSeed(this.seed, stop, 0x2c3b));
    const wanted = Math.round(clamp(intensity, 0, 1) * span) + this.random.int(3) - 1;
    return options[clamp(wanted, 0, span)];
  }

  // -------------------------------------------------------------------------
  // Notes
  // -------------------------------------------------------------------------

  /** A layer plays if this theme lists it and the intensity has reached it. */
  private plays(layer: MusicLayer, intensity: number): boolean {
    const threshold = this.theme.layers[layer];
    return threshold !== undefined && intensity >= threshold;
  }

  private write(
    event: NoteEvent, note: LoopNote, voice: ScoreVoice, loop: number, row: number,
  ): void {
    event.kind = voice.kind;
    event.note = note.note + voice.transpose;
    event.duration = voice.ring ?? note.rows * this.stepDuration;
    event.velocity = (note.volume / MAX_VOLUME) * voice.gain
      * (this.theme.gains?.[voice.layer] ?? 1);
    event.pan = clamp(note.pan / MAX_PAN, -1, 1);
    // Fixed per position in the loop rather than random, so one bar is the same bar every time.
    event.seed = hashSeed(loop, row, note.note) >>> 1;
  }
}

/** `row,note,volume,rows,pan` per note, space separated, into rows. */
function decodeLoop(text: string, rowCount: number): LoopNote[][] {
  const rows: LoopNote[][] = Array.from({ length: rowCount }, () => []);
  if (text.length === 0) return rows;

  for (const part of text.split(' ')) {
    const [row, note, volume, held, pan] = part.split(',').map(Number);
    rows[row].push({ note, volume, rows: held, pan });
  }
  return rows;
}

/**
 * The theme's route as stops, with each section's voicings decoded once however often it is
 * visited.
 *
 * A name no section answers to is dropped, and a route left with nothing falls back to the first
 * section — `check:invariants` is what catches the typo, since a route is written by hand against
 * names a generator chose.
 */
function resolveRoute(route: readonly string[], sections: readonly LoopSection[]): RouteStop[] {
  const stops = new Map<string, RouteStop>();
  for (const section of sections) {
    stops.set(section.name, {
      cells: section.cells,
      voicings: section.cells.map(cell => cell.voicings.map(parseVoicing)),
    });
  }

  const found = route
    .map(name => stops.get(name))
    .filter((stop): stop is RouteStop => stop !== undefined);
  return found.length > 0 ? found : [...stops.values()].slice(0, 1);
}

function parseVoicing(text: string): number[] {
  return text.length === 0 ? [] : text.split(',').map(Number);
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}
