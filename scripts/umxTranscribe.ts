/**
 * Takes the tracker module in `src/assets/music` apart into the loops it is built from, written out
 * as a TypeScript module the game's music engine arranges for itself.
 *
 *   npm run music:transcribe
 *   npm run music:transcribe -- --out=src/engine/music/scores/foregone.ts --name=FOREGONE
 *
 * What is kept is what a synth can act on: which note, from which instrument, how loud, and for how
 * long. What is dropped is everything that needs a sample player to mean anything — sample offsets,
 * retriggers, and the volume slides that shape a held note, which the patches' own envelopes stand
 * in for. And the running order: 44 orders of a 4-minute arrangement become 73 loops and the rules
 * for combining them, which is 28% of the notes and an arrangement that need not be the same twice.
 *
 * The module stays the source of truth; the output is derived, so a mapping decision is changed in
 * `scores.ts` and only the *reading* is re-run here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type ItSample, type ItSong, NOTE_CUT, ROWS_PER_BEAT, defaultModuleFile, loadItSong, readPcm,
} from './itModule.ts';
import type { LoopCell, LoopSection, ScoreLoop } from '../src/engine/music/score.ts';

/** Effect command bytes, as IT numbers them from `A` = 1. */
const SET_SPEED = 1;
const SET_TEMPO = 20;
/** `Sxx` with the high nibble 8 is "set pan", the only `S` this module uses. */
const SPECIAL = 19;
const SET_PAN = 0x80;

/** IT's own volume scale, and the widest a pan value gets. */
const MAX_VOLUME = 64;
const MAX_PAN = 64;
/** A note that says nothing about pan, before the channel's own is folded in. */
const PAN_UNSET = 127;

/**
 * The form of *this* module, and the one thing here that is a reading rather than a measurement.
 *
 * A section is a stretch of the order list whose **harmony holds still**, which is what makes its
 * loops freely combinable — and what a machine cannot tell from note data alone. Read off
 * `npm run music:analyze`: the hook sounds C D D♯ G in all 44 orders and the sub sounds F, so the
 * whole piece is one mode except twice. Orders 26–29 bring in a line on D E F G A, whose E is
 * foreign to the rest; orders 30–37 are a real four-chord progression under the strings, which is
 * why that one section has four cells and they play in order.
 *
 * The split into intro/main/outro is not harmonic — those three are the same mode — but textural,
 * and it earns its place by giving the arranger sparse, full and closing orchestrations to choose
 * between rather than one undifferentiated pool.
 *
 * Another module needs its own table. There is no default that means anything.
 */
const SECTIONS: SectionSpec[] = [
  { name: 'intro', cells: 1, orders: [[0, 8]] },
  { name: 'main', cells: 1, orders: [[8, 26]] },
  { name: 'break', cells: 1, orders: [[26, 30]] },
  { name: 'strings', cells: 4, orders: [[30, 38]] },
  { name: 'outro', cells: 1, orders: [[38, 44]] },
];

/** A section to extract: which order positions it spans, and its harmony's cycle in four-bar cells. */
interface SectionSpec {
  readonly name: string;
  readonly cells: number;
  /** Half-open ranges of order positions, `[from, to)`. */
  readonly orders: readonly (readonly [number, number])[];
}

/** One note of a pattern, with its channel already resolved away. */
interface PatternNote {
  readonly instrument: number;
  /** `row,note,volume,rows,pan`. */
  readonly text: string;
}

/** The module taken apart: the loops, and the sections that say what goes with what. */
interface LoopLibrary {
  readonly loops: ScoreLoop[];
  readonly sections: LoopSection[];
}

/** Longest a note is allowed to be held, in rows: past this it is a drone, not a note. */
const MAX_HELD_ROWS = 64;

/** The note a tracker plays a sample at its own recorded rate — IT's C-5. */
const MIDDLE_C = 60;

/**
 * Rate the extracted samples are stored at, and the bit depth.
 *
 * Well below the 22 kHz they were recorded at, and deliberately: these are written at G-6, which
 * plays them six times too fast, so everything audible in the result comes from below 3.5 kHz in
 * the source. Eight bits is what the era used for most samples anyway.
 */
const SAMPLE_RATE = 11025;
const SAMPLE_BITS = 8;

const options = parseArguments(process.argv.slice(2));
const { song } = loadItSong(options.file);
writeScore(song);
if (options.samples.length > 0) writeSamples(song);

function writeScore(song: ItSong): void {
  const speed = songSpeed(song);
  const bpm = (speed.tempo * 60) / (2.5 * speed.speed * ROWS_PER_BEAT);
  const library = extractLoops(song);

  const source = renderModule(song, bpm, library);
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, source);

  const notes = library.loops.reduce((sum, loop) => sum + loop.notes.split(' ').length, 0);
  const played = song.patterns.reduce(
    (sum, pattern, index) => sum + (pattern ? readPattern(song, index).length : 0), 0,
  );
  console.log(`wrote ${options.out} — ${(source.length / 1024).toFixed(0)}kB`);
  console.log(`  "${song.name}" at ${bpm.toFixed(1)} BPM (speed ${speed.speed}, tempo ${speed.tempo})`);
  console.log(`  ${library.loops.length} loops, ${notes} notes — ${played} written out flat`);
  for (const section of library.sections) {
    const voicings = section.cells.reduce((sum, cell) => sum + cell.voicings.length, 0);
    console.log(`  ${section.name}: ${section.cells.length} cells, ${voicings} voicings`);
  }
}

/**
 * The module taken apart into loops: every distinct four bars one instrument plays, plus which
 * instruments were heard together and which loops each of them was on.
 *
 * A pattern is four bars, and four bars is how long the figures in this piece are, so a pattern
 * split by instrument *is* the loop library — nothing has to be guessed at or cut to length.
 */
function extractLoops(song: ItSong): LoopLibrary {
  const loops: ScoreLoop[] = [];
  const index = new Map<string, number>();
  /** Per pattern: which loop each of its instruments is on. */
  const byPattern = song.patterns.map((pattern, at) => {
    const parts = new Map<number, number>();
    if (!pattern) return parts;

    for (const [instrument, notes] of groupByInstrument(readPattern(song, at))) {
      const text = notes.map(note => note.text).join(' ');
      let id = index.get(text);
      if (id === undefined) {
        id = loops.length;
        index.set(text, id);
        loops.push({ instrument, notes: text });
      }
      parts.set(instrument, id);
    }
    return parts;
  });

  return { loops, sections: SECTIONS.map(spec => buildSection(spec, song, byPattern)) };
}

/** One section: its cells in order, each holding the orchestrations and loops heard in it. */
function buildSection(
  spec: SectionSpec, song: ItSong, byPattern: Map<number, number>[],
): LoopSection {
  const voicings: Set<string>[] = Array.from({ length: spec.cells }, () => new Set());
  const parts: Map<number, Set<number>>[] = Array.from({ length: spec.cells }, () => new Map());

  let at = 0;
  for (const [from, to] of spec.orders) {
    for (let order = from; order < to; order++, at++) {
      const played = byPattern[song.orders[order]];
      if (!played || played.size === 0) continue;

      const cell = at % spec.cells;
      voicings[cell].add([...played.keys()].sort((a, b) => a - b).join(','));
      for (const [instrument, loop] of played) {
        if (!parts[cell].has(instrument)) parts[cell].set(instrument, new Set());
        parts[cell].get(instrument)!.add(loop);
      }
    }
  }

  const cells: LoopCell[] = voicings.map((heard, cell) => ({
    // Fewest instruments first: that is what lets the arranger index them by how full it wants it.
    voicings: [...heard].sort((a, b) => countOf(a) - countOf(b) || a.localeCompare(b)),
    parts: Object.fromEntries(
      [...parts[cell]].sort((a, b) => a[0] - b[0])
        .map(([instrument, loops]) => [instrument, [...loops].sort((a, b) => a - b)]),
    ),
  }));
  return { name: spec.name, cells };
}

/** All of one pattern's notes, with the channel resolved away — see `readPattern`. */
function groupByInstrument(notes: PatternNote[]): Map<number, PatternNote[]> {
  const byInstrument = new Map<number, PatternNote[]>();
  for (const note of notes) {
    if (!byInstrument.has(note.instrument)) byInstrument.set(note.instrument, []);
    byInstrument.get(note.instrument)!.push(note);
  }
  return byInstrument;
}

function countOf(voicing: string): number {
  return voicing.split(',').length;
}

/**
 * Writes the named instruments' actual audio out beside the score.
 *
 * A synth patch is a spectrum and an envelope, and for most of this module that is enough. It is
 * not enough for a sample that is a *chord*, or one whose character is its noise: there is no
 * spectrum to match because there is no single tone. For those, the recording is the only honest
 * answer, so it gets carried along — downsampled hard, because of how fast they are played.
 */
function writeSamples(song: ItSong): void {
  const entries = options.samples.map(index => encodeSample(song, index));
  const total = entries.reduce((sum, entry) => sum + entry.frames, 0);

  const source = `/**
 * Audio for the few instruments of ${song.name} that a synth patch cannot stand in for,
 * taken from the module in \`src/assets/music\` by \`npm run music:transcribe\`.
 * Generated: edit the transcriber, not this file.
 *
 * ${SAMPLE_BITS}-bit at ${SAMPLE_RATE} Hz, which is well below what they were recorded at — they
 * are written at G-6 and so play six times too fast, putting everything audible in the result
 * below 3.5 kHz in the source.
 */
import type { RawSample } from '../samples.ts';

export const FOREGONE_SAMPLES: Record<string, RawSample> = {
${entries.map(entry => `  ${entry.name}: {
    /** ${entry.label} */
    rate: ${SAMPLE_RATE},
    /** The note it plays at its stored rate, so any other note is a ratio away from it. */
    root: ${MIDDLE_C},
    frames: ${entry.frames},
    pcm: '${entry.base64}',
  },`).join('\n')}
};
`;
  writeFileSync(options.samplesOut, source);
  console.log(`wrote ${options.samplesOut} — ${(source.length / 1024).toFixed(0)}kB,`
    + ` ${entries.length} samples, ${total} frames at ${SAMPLE_RATE}Hz`);
}

interface EncodedSample {
  name: string;
  label: string;
  frames: number;
  base64: string;
}

/** One sample, resampled down and quantised to bytes, as base64. */
function encodeSample(song: ItSong, index: number): EncodedSample {
  const sample = song.samples[index - 1];
  const pcm = readPcm(song, sample);
  if (!pcm) throw new Error(`sample ${index} is packed and cannot be read`);

  const ratio = sample.c5Speed / SAMPLE_RATE;
  const frames = Math.floor(sample.length / ratio);
  const bytes = Buffer.alloc(frames);
  let peak = 0;
  for (const value of pcm) peak = Math.max(peak, Math.abs(value));
  const normalise = peak > 0 ? 1 / peak : 1;

  for (let i = 0; i < frames; i++) {
    // Linear interpolation on the way down. The source is band-limited well above what is kept.
    const at = i * ratio;
    const low = Math.floor(at);
    const value = pcm[low] + ((pcm[low + 1] ?? pcm[low]) - pcm[low]) * (at - low);
    bytes[i] = Math.max(0, Math.min(255, Math.round(value * normalise * 127) + 128));
  }

  return {
    name: `sample${index}`,
    label: `${sample.name} — instrument ${index}, ${(sample.length / sample.c5Speed).toFixed(2)}s`,
    frames,
    base64: bytes.toString('base64'),
  };
}

/**
 * The speed the song actually runs at, not the one in the header.
 *
 * A module sets its real tempo with an `Axx`/`Txx` on the first row it plays, and this one does:
 * the header's 125 BPM lasts a single row. Taking the header at its word puts the whole
 * transcription 35% slow, which is the sort of error that sounds like a different piece.
 */
function songSpeed(song: ItSong): { speed: number; tempo: number } {
  const result = { speed: song.speed, tempo: song.tempo };
  const pattern = song.patterns[song.orders[0]];
  if (!pattern) return result;
  for (const row of pattern.grid.slice(0, 1)) {
    for (const cell of Object.values(row)) {
      if (cell.command === SET_SPEED && cell.param) result.speed = cell.param;
      if (cell.command === SET_TEMPO && cell.param) result.tempo = cell.param;
    }
  }
  return result;
}

/**
 * One pattern's notes as `row,note,volume,rows,pan`, in row order.
 *
 * The channel does not survive this, and does not need to: it decided two things, and both are
 * resolved here. Its fader is already folded into the volume, and its pan is folded in for any note
 * that does not set its own — so a loop carries where it sits rather than a reference to a mixer.
 *
 * Text rather than nested arrays because it is a tenth of the size and parses in one pass.
 */
function readPattern(song: ItSong, index: number): PatternNote[] {
  const pattern = song.patterns[index];
  if (!pattern) return [];

  const notes: PatternNote[] = [];
  for (let row = 0; row < pattern.rows; row++) {
    for (const [key, cell] of Object.entries(pattern.grid[row])) {
      const channel = Number(key);
      if (cell.note === undefined || cell.note >= NOTE_CUT || !cell.instrument) continue;
      const sample = song.samples[cell.instrument - 1];
      if (!sample || !sample.length) continue;

      const held = Math.min(
        heldRows(pattern, channel, row),
        sampleRows(song, sample, cell.note),
      );
      const volume = effectiveVolume(song, cell.volume, cell.instrument, channel);
      const own = panOf(cell.command, cell.param);
      const pan = own === PAN_UNSET ? channelPan(song, channel) : own;
      notes.push({
        instrument: cell.instrument,
        text: [row, cell.note, volume, held, pan].map(value => String(value)).join(','),
      });
    }
  }
  return notes;
}

/**
 * How many rows the sample itself lasts at the pitch it is played, or the pattern's length for a
 * looped one, which can sound indefinitely.
 *
 * A tracker note does not hold until the next note — it plays a sample, and a one-shot sample
 * stops when it runs out. The rate is the pitch, so this is not a fixed number per instrument: a
 * 2.35 second sample written at G-6 plays six times too fast and is over in 0.39 seconds. Holding
 * such a note until the next one instead leaves it ringing for seconds after the reference has
 * gone quiet, which is heard as a wash where the original has a stab.
 */
function sampleRows(song: ItSong, sample: ItSample, note: number): number {
  const pattern = song.patterns.find(p => p);
  const rows = pattern?.rows ?? MAX_HELD_ROWS;
  if (sample.loopEnd > sample.loopStart) return rows;

  const speed = songSpeed(song);
  const rowsPerSecond = (speed.tempo * 2) / 5 / speed.speed;
  const seconds = (sample.length / sample.c5Speed) * 2 ** (-(note - MIDDLE_C) / 12);
  return Math.max(1, Math.ceil(seconds * rowsPerSecond));
}

/** Rows until this channel plays or releases something else — how long the note is held. */
function heldRows(
  pattern: NonNullable<ItSong['patterns'][number]>, channel: number, from: number,
): number {
  for (let row = from + 1; row < pattern.rows; row++) {
    const cell = pattern.grid[row][channel];
    if (cell?.note !== undefined) return row - from;
  }
  // Runs past the end of the pattern, where the next one takes over; capped, not extended.
  return Math.min(MAX_HELD_ROWS, pattern.rows - from);
}

/**
 * The note's level with the module's whole mix desk folded in, 0…64.
 *
 * A tracker's loudness is four numbers multiplied together — the volume column, the sample's own
 * default volume, its global volume, and the channel's fader — and only the first is written next
 * to the note. Leaving the other three out mixes the piece by accident.
 */
function effectiveVolume(
  song: ItSong, column: number | undefined, instrument: number, channel: number,
): number {
  const sample = song.samples[instrument - 1];
  // Anything above 64 in that column is one of IT's little commands, not a level.
  const written = column !== undefined && column <= MAX_VOLUME ? column : sample.volume;
  const scaled = (written / MAX_VOLUME)
    * (sample.globalVolume / MAX_VOLUME)
    * (song.channelVolumes[channel] / MAX_VOLUME);
  return Math.round(scaled * MAX_VOLUME);
}

/** The note's own pan as -64…64, or `PAN_UNSET` for "wherever the channel sits". */
function panOf(command: number | undefined, param: number | undefined): number {
  if (command !== SPECIAL || param === undefined) return PAN_UNSET;
  if ((param & 0xf0) !== SET_PAN) return PAN_UNSET;
  // The low nibble is sixteenths of the width; centre is 8.
  return Math.round((((param & 0x0f) / 15) * 2 - 1) * MAX_PAN);
}

/** Where a channel's fader sits, -64…64. Anything from 100 up is IT's surround, which is centre. */
function channelPan(song: ItSong, channel: number): number {
  const pan = song.channelPans[channel];
  return pan >= 100 ? 0 : Math.round(((pan / MAX_PAN) * 2 - 1) * MAX_PAN);
}

function renderModule(song: ItSong, bpm: number, library: LoopLibrary): string {
  return `/**
 * ${song.name} — the loops of the tracker module in \`src/assets/music\`, extracted by
 * \`npm run music:transcribe\`. Generated: edit the transcriber, not this file.
 *
 * The module taken apart, not played back: every distinct four bars one instrument plays, plus
 * which instruments were heard together and where the harmony moves. \`loopArranger.ts\` builds
 * arrangements out of it; what each instrument *sounds* like is \`scores.ts\` — so the reading of
 * the module and the interpretation of it stay apart.
 */
import type { LoopScore } from '../score.ts';

export const ${options.name}: LoopScore = {
  title: ${JSON.stringify(song.name)},
  bpm: ${bpm.toFixed(2)},
  rows: ${song.patterns.find(p => p)?.rows ?? 64},
  /** \`row,note,volume,rows,pan\` per note, space separated. */
  loops: [
${library.loops.map(renderLoop).join('\n')}
  ],
  sections: [
${library.sections.map(renderSection).join('\n')}
  ],
};
`;
}

function renderLoop(loop: ScoreLoop, index: number): string {
  return `    /* ${String(index).padStart(2)} */ `
    + `{ instrument: ${loop.instrument}, notes: ${JSON.stringify(loop.notes)} },`;
}

function renderSection(section: LoopSection): string {
  const cells = section.cells.map(cell => [
    '        {',
    '          voicings: [',
    ...cell.voicings.map(voicing => `            ${JSON.stringify(voicing)},`),
    '          ],',
    `          parts: { ${Object.entries(cell.parts)
      .map(([instrument, loops]) => `${instrument}: [${loops.join(', ')}]`).join(', ')} },`,
    '        },',
  ].join('\n'));

  return [
    '    {',
    `      name: ${JSON.stringify(section.name)},`,
    '      cells: [',
    ...cells,
    '      ],',
    '    },',
  ].join('\n');
}

interface Options {
  file: string;
  out: string;
  name: string;
  /** Instrument numbers whose audio is carried along rather than synthesised. */
  samples: number[];
  samplesOut: string;
}

function parseArguments(args: string[]): Options {
  const flags = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? '');
  }
  return {
    file: flags.get('file') ?? defaultModuleFile(),
    out: flags.get('out') ?? 'src/engine/music/scores/foregone.ts',
    name: flags.get('name') ?? 'FOREGONE',
    samples: (flags.get('samples') ?? '').split(',').filter(Boolean).map(Number),
    samplesOut: flags.get('samplesout') ?? 'src/engine/music/scores/foregoneSamples.ts',
  };
}
