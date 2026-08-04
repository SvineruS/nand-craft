/**
 * Turns the tracker module in `src/assets/music` into a score the game's music engine can play,
 * written out as a TypeScript module.
 *
 *   npm run music:transcribe
 *   npm run music:transcribe -- --out=src/engine/music/scores/foregone.ts --name=FOREGONE
 *
 * What is kept is what a synth can act on: which note, on which channel, from which instrument,
 * how loud, and for how long. What is dropped is everything that needs a sample player to mean
 * anything — sample offsets, retriggers, and the volume slides that shape a held note, which the
 * patches' own envelopes stand in for. The module stays the source of truth; this file is derived,
 * so a mapping decision is changed in `scores.ts` and only the *reading* is re-run here.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  type ItSample, type ItSong, NOTE_CUT, ROWS_PER_BEAT, defaultModuleFile, loadItSong, readPcm,
} from './itModule.ts';

/** Effect command bytes, as IT numbers them from `A` = 1. */
const SET_SPEED = 1;
const SET_TEMPO = 20;
/** `Sxx` with the high nibble 8 is "set pan", the only `S` this module uses. */
const SPECIAL = 19;
const SET_PAN = 0x80;

/** IT's own volume scale, and the widest a pan value gets. */
const MAX_VOLUME = 64;
const MAX_PAN = 64;

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
  const patterns = song.patterns.map((_, index) => encodePattern(song, index));
  const used = new Set(song.orders);
  const notes = patterns.reduce((sum, text) => sum + (text ? text.split(' ').length : 0), 0);

  const source = renderModule(song, bpm, patterns);
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, source);

  console.log(`wrote ${options.out} — ${(source.length / 1024).toFixed(0)}kB`);
  console.log(`  "${song.name}" at ${bpm.toFixed(1)} BPM (speed ${speed.speed}, tempo ${speed.tempo})`);
  console.log(`  ${song.orders.length} orders over ${used.size} patterns, ${notes} notes`);
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
 * One pattern as `channel:row,note,instrument,volume,rows` per note, space separated.
 *
 * Text rather than nested arrays because it is a tenth of the size and parses in one pass — the
 * whole piece is a few thousand notes, and a `JSON.parse`-shaped file would be most of a megabyte.
 */
function encodePattern(song: ItSong, index: number): string {
  const pattern = song.patterns[index];
  if (!pattern) return '';

  const parts: string[] = [];
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
      const pan = panOf(cell.command, cell.param);
      parts.push([channel, row, cell.note, cell.instrument, volume, held, pan]
        .map(value => String(value)).join(','));
    }
  }
  return parts.join(' ');
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

/** The note's own pan as -64…64, or 127 for "wherever the channel sits". */
function panOf(command: number | undefined, param: number | undefined): number {
  if (command !== SPECIAL || param === undefined) return 127;
  if ((param & 0xf0) !== SET_PAN) return 127;
  // The low nibble is sixteenths of the width; centre is 8.
  return Math.round((((param & 0x0f) / 15) * 2 - 1) * MAX_PAN);
}

function renderModule(song: ItSong, bpm: number, patterns: string[]): string {
  const pans = song.channelPans.slice(0, channelCount(song))
    .map(pan => (pan >= 100 ? 0 : Math.round(((pan / MAX_PAN) * 2 - 1) * MAX_PAN)));

  return `/**
 * ${song.name} — transcribed from the tracker module in \`src/assets/music\` by
 * \`npm run music:transcribe\`. Generated: edit the transcriber, not this file.
 *
 * Notes only. Which instrument each number means, and what it sounds like, is
 * \`scores.ts\` — so the reading of the module and the interpretation of it stay apart.
 */
import type { TrackerScore } from '../score.ts';

export const ${options.name}: TrackerScore = {
  title: ${JSON.stringify(song.name)},
  bpm: ${bpm.toFixed(2)},
  rows: ${song.patterns.find(p => p)?.rows ?? 64},
  orders: [${song.orders.join(', ')}],
  /** Pan per channel, -64…64, from the module's own mix. */
  pans: [${pans.join(', ')}],
  /** One string per pattern: \`channel,row,note,instrument,volume,rows,pan\` per note. */
  patterns: [
${patterns.map(text => `    ${JSON.stringify(text)},`).join('\n')}
  ],
};
`;
}

/** How many channels the module really uses — the tables are 64 long whatever it needs. */
function channelCount(song: ItSong): number {
  let highest = 0;
  for (const pattern of song.patterns) {
    if (!pattern) continue;
    for (const row of pattern.grid) {
      for (const key of Object.keys(row)) highest = Math.max(highest, Number(key) + 1);
    }
  }
  return highest;
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
