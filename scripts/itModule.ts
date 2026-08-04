/**
 * Reading an Impulse Tracker module out of an Unreal `.umx` package: the format, and nothing about
 * what to do with it. `umxAnalyze.ts` reports on what this returns; `umxTranscribe.ts` turns it
 * into a score the game's music engine can play.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const MUSIC_DIR = 'src/assets/music';

/** Every module format that turns up in a .umx, by the magic that starts it. */
const MODULE_MAGICS = [
  { magic: 'IMPM', format: 'it', at: 0 },
  { magic: 'SCRM', format: 's3m', at: 44 },
  { magic: 'Extended Module:', format: 'xm', at: 0 },
];

export const NOTES = ['C-', 'C#', 'D-', 'D#', 'E-', 'F-', 'F#', 'G-', 'G#', 'A-', 'A#', 'B-'];
export const noteName = (n: number) => (n >= 120 ? '===' : NOTES[n % 12] + Math.floor(n / 12));

/** Trackers do not record this; four is what nearly everything is written on. */
export const ROWS_PER_BEAT = 4;

/** IT note values past the playable range: the two ways a note ends. */
export const NOTE_CUT = 254;
export const NOTE_OFF = 255;

/** Channels IT allows. Only the first handful are ever used, but the mix tables are all 64 long. */
const MAX_CHANNELS = 64;

export interface Module {
  format: string;
  offset: number;
  data: Buffer;
}

/** A .umx is an Unreal package with the module embedded whole; find it and take it from there. */
export function carveModule(raw: Buffer): Module {
  for (const { magic, format, at } of MODULE_MAGICS) {
    const found = raw.indexOf(magic, 0, 'latin1');
    if (found < 0) continue;
    const offset = found - at;
    if (offset < 0) continue;
    return { format, offset, data: raw.subarray(offset) };
  }
  throw new Error('no tracker module found in this file');
}

/** The one module sitting in the assets folder, so the common case needs no arguments. */
export function defaultModuleFile(): string {
  const candidates = readdirSync(MUSIC_DIR).filter(name => /\.umx$/i.test(name));
  if (candidates.length === 0) throw new Error(`no .umx in ${MUSIC_DIR}`);
  return join(MUSIC_DIR, candidates[0]);
}

/** Read a `.umx` and hand back the IT module inside it, refusing anything else. */
export function loadItSong(file: string): { module: Module; song: ItSong } {
  const module = carveModule(readFileSync(file));
  if (module.format !== 'it') throw new Error(`only IT is parsed; this is ${module.format}`);
  return { module, song: parseIt(module.data) };
}

// ---------------------------------------------------------------------------
// The format
// ---------------------------------------------------------------------------

export interface ItSample {
  index: number;
  name: string;
  /** 16-bit, stereo, compressed, looped — the flag byte's bits. */
  bits: number;
  stereo: boolean;
  compressed: boolean;
  signed: boolean;
  /** The sample's own level, 0…64, and the instrument-wide one over it. Half the module's mix. */
  volume: number;
  globalVolume: number;
  /** Default pan, 0…64, and whether the sample asks for it at all. */
  defaultPan: number;
  panned: boolean;
  length: number;
  loopStart: number;
  loopEnd: number;
  c5Speed: number;
  pointer: number;
}

export interface ItCell {
  note?: number;
  instrument?: number;
  volume?: number;
  command?: number;
  param?: number;
}

export interface ItPattern {
  rows: number;
  /** `grid[row][channel]`. */
  grid: Record<number, ItCell>[];
}

export interface ItSong {
  data: Buffer;
  name: string;
  /** Ticks per row and ticks per minute — together they are the tempo. */
  speed: number;
  tempo: number;
  globalVolume: number;
  orders: number[];
  /** The module's own mix desk: one volume (0…64) and one pan (0…64) per channel. */
  channelVolumes: number[];
  channelPans: number[];
  samples: ItSample[];
  patterns: (ItPattern | null)[];
}

export function parseIt(data: Buffer): ItSong {
  const orderCount = data.readUInt16LE(32);
  const instrumentCount = data.readUInt16LE(34);
  const sampleCount = data.readUInt16LE(36);
  const patternCount = data.readUInt16LE(38);

  let cursor = 192 + orderCount;
  cursor += instrumentCount * 4;
  const sampleOffsets: number[] = [];
  for (let i = 0; i < sampleCount; i++) sampleOffsets.push(data.readUInt32LE(cursor + i * 4));
  cursor += sampleCount * 4;
  const patternOffsets: number[] = [];
  for (let i = 0; i < patternCount; i++) patternOffsets.push(data.readUInt32LE(cursor + i * 4));

  return {
    data,
    name: text(data, 4, 26),
    speed: data[50],
    tempo: data[51],
    globalVolume: data[48],
    orders: [...data.subarray(192, 192 + orderCount)].filter(order => order < 254),
    // Pan 100 means "surround" and 128 and up means the channel is muted; neither is a position.
    channelPans: [...data.subarray(64, 64 + MAX_CHANNELS)],
    channelVolumes: [...data.subarray(128, 128 + MAX_CHANNELS)],
    samples: sampleOffsets.map((offset, index) => readSampleHeader(data, offset, index)),
    patterns: patternOffsets.map(offset => unpackPattern(data, offset)),
  };
}

function text(data: Buffer, at: number, length: number): string {
  return data.subarray(at, at + length).toString('latin1').replace(/\0.*$/, '').trim();
}

function readSampleHeader(data: Buffer, offset: number, index: number): ItSample {
  if (!offset) {
    return {
      index, name: '', bits: 0, stereo: false, compressed: false, signed: false,
      volume: 0, globalVolume: 0, defaultPan: 32, panned: false,
      length: 0, loopStart: 0, loopEnd: 0, c5Speed: 0, pointer: 0,
    };
  }
  const flags = data[offset + 18];
  const pan = data[offset + 47];
  return {
    index,
    name: text(data, offset + 20, 26),
    bits: flags & 2 ? 16 : 8,
    stereo: !!(flags & 4),
    compressed: !!(flags & 8),
    // Cvt bit 0: samples are signed rather than unsigned.
    signed: !!(data[offset + 46] & 1),
    globalVolume: data[offset + 17],
    volume: data[offset + 19],
    // The high bit is what says the sample wants its pan used at all; the rest is the position.
    panned: !!(pan & 128),
    defaultPan: pan & 127,
    length: data.readUInt32LE(offset + 48),
    loopStart: data.readUInt32LE(offset + 52),
    loopEnd: data.readUInt32LE(offset + 56),
    c5Speed: data.readUInt32LE(offset + 60),
    pointer: data.readUInt32LE(offset + 72),
  };
}

/** IT packs patterns per row: a channel byte, a mask, then only the fields the mask names. */
function unpackPattern(data: Buffer, offset: number): ItPattern | null {
  if (!offset) return null;
  const packedLength = data.readUInt16LE(offset);
  const rows = data.readUInt16LE(offset + 2);
  let p = offset + 8;
  const end = p + packedLength;

  const grid: Record<number, ItCell>[] = Array.from({ length: rows }, () => ({}));
  const lastMask = new Uint8Array(MAX_CHANNELS);
  const lastNote = new Uint8Array(MAX_CHANNELS);
  const lastInstrument = new Uint8Array(MAX_CHANNELS);
  const lastVolume = new Uint8Array(MAX_CHANNELS);
  const lastCommand = new Uint8Array(MAX_CHANNELS);
  const lastParam = new Uint8Array(MAX_CHANNELS);

  let row = 0;
  while (row < rows && p < end) {
    const channelByte = data[p++];
    if (channelByte === 0) {
      row++;
      continue;
    }
    const channel = (channelByte - 1) & 63;
    if (channelByte & 128) lastMask[channel] = data[p++];
    const mask = lastMask[channel];

    if (mask & 1) lastNote[channel] = data[p++];
    if (mask & 2) lastInstrument[channel] = data[p++];
    if (mask & 4) lastVolume[channel] = data[p++];
    if (mask & 8) {
      lastCommand[channel] = data[p++];
      lastParam[channel] = data[p++];
    }

    const cell: ItCell = {};
    if (mask & (1 | 16)) cell.note = lastNote[channel];
    if (mask & (2 | 32)) cell.instrument = lastInstrument[channel];
    if (mask & (4 | 64)) cell.volume = lastVolume[channel];
    if (mask & (8 | 128)) {
      cell.command = lastCommand[channel];
      cell.param = lastParam[channel];
    }
    grid[row][channel] = cell;
  }
  return { rows, grid };
}

// ---------------------------------------------------------------------------
// Sample audio
// ---------------------------------------------------------------------------

/** The sample's PCM as floats in -1…1. Packed samples are not decoded. */
export function readPcm(song: ItSong, sample: ItSample): Float32Array | null {
  if (sample.compressed) return null;
  const frames = sample.length;
  const step = (sample.bits === 16 ? 2 : 1) * (sample.stereo ? 2 : 1);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const at = sample.pointer + i * step;
    if (at + step > song.data.length) break;
    if (sample.bits === 16) {
      const raw = sample.signed ? song.data.readInt16LE(at) : song.data.readUInt16LE(at) - 32768;
      out[i] = raw / 32768;
    } else {
      const raw = sample.signed ? song.data.readInt8(at) : song.data[at] - 128;
      out[i] = raw / 128;
    }
  }
  return out;
}

/** Lags searched, in frames — about 12 Hz to 2 kHz at any rate these samples are played back at. */
const MIN_LAG = 20;
const MAX_LAG = 3000;
/** How close to the best correlation an earlier peak must come before it is preferred. */
const PEAK_TOLERANCE = 0.9;

/**
 * Period in frames, by *normalised* autocorrelation over the plausible pitch range.
 *
 * Two things make this reliable where a raw correlation is not. Dividing by the energy of both
 * windows stops a decaying sample from scoring every short lag highest simply because the signal
 * was louder there. And taking the *first* peak that comes within `PEAK_TOLERANCE` of the best one,
 * rather than the best itself, resolves the octave ambiguity in the right direction: correlation is
 * just as happy at two or three times the period, so the earliest strong peak is the fundamental.
 *
 * Scores are checked for being finite: a window running past the end of the data gives NaN, and
 * `NaN > best` is false, so without the check it silently reports no period at all.
 */
export function findPeriod(pcm: Float32Array, from: number, length: number): number {
  const maxLag = Math.min(MAX_LAG, Math.floor(length / 2));
  if (maxLag <= MIN_LAG) return 0;

  const scores = new Float64Array(maxLag + 1);
  for (let lag = MIN_LAG; lag <= maxLag; lag++) {
    let sum = 0;
    let energyA = 0;
    let energyB = 0;
    for (let i = 0; i < length - lag; i++) {
      const a = pcm[from + i];
      const b = pcm[from + i + lag];
      sum += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const value = sum / Math.sqrt(energyA * energyB);
    scores[lag] = Number.isFinite(value) ? value : 0;
  }

  let best = 0;
  for (let lag = MIN_LAG; lag <= maxLag; lag++) if (scores[lag] > scores[best]) best = lag;
  if (best === 0 || scores[best] <= 0) return 0;

  const threshold = scores[best] * PEAK_TOLERANCE;
  for (let lag = MIN_LAG + 1; lag < best; lag++) {
    if (scores[lag] >= threshold && scores[lag] >= scores[lag - 1] && scores[lag] >= scores[lag + 1]) {
      return lag;
    }
  }
  return best;
}

/** Where a steady tone can be measured: inside the loop if there is one, else past the attack. */
export function steadyWindow(sample: ItSample, pcm: Float32Array): { from: number; length: number } {
  const start = sample.loopEnd > sample.loopStart ? sample.loopStart : Math.floor(sample.length / 3);
  const from = Math.min(start, Math.max(0, pcm.length - 512));
  return { from, length: Math.max(128, Math.min(8192, pcm.length - from)) };
}

/** Magnitude at a frequency, by Goertzel — cheaper than a whole FFT for a few harmonics. */
export function magnitudeAt(
  pcm: Float32Array, from: number, length: number, cyclesPerSample: number,
): number {
  const w = 2 * Math.PI * cyclesPerSample;
  const coefficient = 2 * Math.cos(w);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < length; i++) {
    const s0 = pcm[from + i] + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coefficient * s1 * s2)) / length;
}

/** The fundamental a sample plays at its own C5 rate, or 0 when nothing periodic is found. */
export function fundamentalHz(song: ItSong, sample: ItSample): number {
  const pcm = readPcm(song, sample);
  if (!pcm) return 0;
  const { from, length } = steadyWindow(sample, pcm);
  const period = findPeriod(pcm, from, length);
  return period === 0 ? 0 : sample.c5Speed / period;
}
