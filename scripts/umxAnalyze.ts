/**
 * Reads a tracker module out of an Unreal `.umx` package and reports what it is made of, so a
 * reference track can be measured instead of guessed at.
 *
 * Prints tempo, key, the arrangement, each channel's role, and — with `--sample=N` — the harmonic
 * spectrum of one sample, which is what a synth patch has to match to sound like it.
 *
 *   npm run music:analyze                                   # the .umx in src/assets/music
 *   npm run music:analyze -- --pattern=10 --channels=10,11,12
 *   npm run music:analyze -- --sample=31                     # harmonics of one instrument
 *   npm run music:analyze -- --arrangement                   # which channels play in which order
 *   npm run music:analyze -- --effects                       # which tracker commands are used
 *   npm run music:analyze -- --probe                         # every sample: tonal or noise, and how it decays
 *   npm run music:analyze -- --file=path.umx --extract       # also write the bare module out
 */
import { readFileSync, writeFileSync } from 'node:fs';
import {
  type ItCell, type ItSample, type ItSong, NOTES, ROWS_PER_BEAT, carveModule, defaultModuleFile,
  findPeriod, fundamentalHz, magnitudeAt, noteName, parseIt, readPcm, steadyWindow,
} from './itModule.ts';

const HARMONICS = 20;
/** Columns the reports lay out. IT allows 64; nothing from this era uses more than a fraction. */
const CHANNELS = 16;

/** IT effect letters, indexed by the command byte. `A` is 1, as the format stores them. */
const EFFECT_LETTERS = '?ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const EFFECT_NAMES: Record<string, string> = {
  A: 'set speed', B: 'jump to order', C: 'break to row', D: 'volume slide', E: 'pitch down',
  F: 'pitch up', G: 'slide to note', H: 'vibrato', I: 'tremor', J: 'arpeggio', K: 'vibrato+slide',
  L: 'porta+slide', M: 'set channel volume', N: 'channel volume slide', O: 'sample offset',
  P: 'pan slide', Q: 'retrigger', R: 'tremolo', S: 'special', T: 'tempo', U: 'fine vibrato',
  V: 'global volume', W: 'global volume slide', X: 'set pan', Y: 'panbrello', Z: 'macro',
};

/** Called at the very bottom, so every constant below is initialised before a report reads it. */
function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const module = carveModule(readFileSync(options.file));
  console.log(`${options.file}\n  ${module.format.toUpperCase()} module at byte ${module.offset},`
    + ` ${(module.data.length / 1024).toFixed(0)}kB`);
  if (module.format !== 'it') {
    console.error(`  only IT is parsed further; this is ${module.format}`);
    process.exit(1);
  }
  if (options.extract) {
    const out = options.file.replace(/\.umx$/i, `.${module.format}`);
    writeFileSync(out, module.data);
    console.log(`  wrote ${out}`);
  }

  const song = parseIt(module.data);
  reportHeader(song);
  reportSamples(song);
  reportChannels(song);
  reportKey(song);
  reportRhythm(song);
  if (options.notes) reportNotes(song);
  if (options.arrangement) reportArrangement(song);
  if (options.effects) reportEffects(song);
  if (options.probe) reportProbe(song);
  if (options.pattern !== null) reportPattern(song, options.pattern, options.channels);
  if (options.sample !== null) reportHarmonics(song, options.sample);
}


// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

interface PlayedNote extends ItCell {
  order: number;
  pattern: number;
  row: number;
  channel: number;
}

/** Every note in play order, which is what makes the arrangement readable. */
function playedNotes(song: ItSong): PlayedNote[] {
  const notes: PlayedNote[] = [];
  song.orders.forEach((patternIndex, order) => {
    const pattern = song.patterns[patternIndex];
    if (!pattern) return;
    for (let row = 0; row < pattern.rows; row++) {
      for (const [channel, cell] of Object.entries(pattern.grid[row])) {
        if (cell.note === undefined || cell.note >= 120) continue;
        notes.push({ ...cell, order, pattern: patternIndex, row, channel: +channel });
      }
    }
  });
  return notes;
}

function reportHeader(song: ItSong): void {
  const bpm = (song.tempo * 60) / (2.5 * song.speed * ROWS_PER_BEAT);
  console.log(`\n"${song.name}"`);
  console.log(`  speed ${song.speed} ticks/row, tempo ${song.tempo}`
    + ` => ${bpm.toFixed(1)} BPM at ${ROWS_PER_BEAT} rows/beat`);
  const rowsPerPattern = song.patterns.find(p => p)?.rows ?? 64;
  console.log(`  ${song.orders.length} orders of ${rowsPerPattern} rows`
    + ` = ${rowsPerPattern / (ROWS_PER_BEAT * 4)} bars each`);
  console.log(`  order list: ${song.orders.join(' ')}`);
}

function reportSamples(song: ItSong): void {
  console.log('\nsamples:');
  for (const sample of song.samples) {
    if (!sample.length) continue;
    const kind = [`${sample.bits}bit`, sample.stereo && 'stereo', sample.compressed && 'PACKED']
      .filter(Boolean).join(' ');
    console.log(`  ${String(sample.index + 1).padStart(2)}: ${sample.name.padEnd(28)}`
      + ` ${String(sample.length).padStart(7)} frames  C5=${String(sample.c5Speed).padStart(6)}Hz`
      + `  ${kind}`);
  }
}

function reportChannels(song: ItSong): void {
  const roles = new Map<number, { count: number; pitches: Set<number>; instruments: Set<number> }>();
  for (const note of playedNotes(song)) {
    const role = roles.get(note.channel)
      ?? { count: 0, pitches: new Set<number>(), instruments: new Set<number>() };
    role.count++;
    role.pitches.add(note.note!);
    if (note.instrument) role.instruments.add(note.instrument);
    roles.set(note.channel, role);
  }
  console.log('\nchannels — one pitch means percussion, many means a part:');
  for (const [channel, role] of [...roles].sort((a, b) => a[0] - b[0])) {
    const pitches = [...role.pitches].sort((a, b) => a - b);
    console.log(`  ch${String(channel + 1).padStart(2)}: ${String(role.count).padStart(5)} notes`
      + `  ${String(pitches.length).padStart(2)} pitches`
      + `  ${noteName(pitches[0])}..${noteName(pitches[pitches.length - 1])}`
      + `  ins ${[...role.instruments].join(',')}`);
  }
}

/** Pitch classes over the parts that have more than one pitch, so drums do not swamp the key. */
function reportKey(song: ItSong): void {
  const melodic = new Set<number>();
  const pitchesPerChannel = new Map<number, Set<number>>();
  for (const note of playedNotes(song)) {
    const set = pitchesPerChannel.get(note.channel) ?? new Set<number>();
    set.add(note.note!);
    pitchesPerChannel.set(note.channel, set);
  }
  for (const [channel, pitches] of pitchesPerChannel) if (pitches.size > 2) melodic.add(channel);

  const classes = new Array(12).fill(0);
  for (const note of playedNotes(song)) {
    if (melodic.has(note.channel)) classes[note.note! % 12]++;
  }
  const peak = Math.max(...classes);
  console.log(`\npitch classes over channels ${[...melodic].map(c => c + 1).join(',')}:`);
  classes.forEach((count, index) => {
    console.log(`  ${NOTES[index]} ${String(count).padStart(5)}`
      + ` ${'#'.repeat(Math.round((count / peak) * 44))}`);
  });
}

/** Each instrument's hits folded onto one bar, which is how a drum grid becomes readable. */
function reportRhythm(song: ItSong): void {
  const stepsPerBar = ROWS_PER_BEAT * 4;
  const byInstrument = new Map<number, { hits: number[]; bars: Set<string>; pitches: Set<number> }>();
  for (const note of playedNotes(song)) {
    if (!note.instrument) continue;
    const entry = byInstrument.get(note.instrument)
      ?? { hits: new Array(stepsPerBar).fill(0), bars: new Set<string>(), pitches: new Set<number>() };
    entry.hits[note.row % stepsPerBar]++;
    entry.bars.add(`${note.order}:${Math.floor(note.row / stepsPerBar)}`);
    entry.pitches.add(note.note!);
    byInstrument.set(note.instrument, entry);
  }

  console.log(`\nrhythm per instrument, folded onto one bar of ${stepsPerBar} steps`
    + ' (0-9 = share of its bars that hit that step):');
  const ordered = [...byInstrument].sort((a, b) => b[1].bars.size - a[1].bars.size);
  for (const [instrument, entry] of ordered) {
    const name = song.samples[instrument - 1]?.name ?? '';
    const grid = entry.hits
      .map(count => Math.min(9, Math.round((count / entry.bars.size) * 9)))
      .join('');
    console.log(`  ins ${String(instrument).padStart(2)} ${grid}`
      + `  ${String(entry.pitches.size).padStart(2)}p  ${name}`);
  }
}

/**
 * Which notes each instrument is written on, commonest first.
 *
 * Together with `--probe`'s sounding pitch this is what fixes an instrument's octave: the written
 * range says where the tracker put it, the sounding pitch says how far the sample moves it, and a
 * transcription needs both or it plays the right tune in the wrong register.
 */
function reportNotes(song: ItSong): void {
  const perInstrument = new Map<number, Map<number, number>>();
  for (const note of playedNotes(song)) {
    if (!note.instrument) continue;
    const counts = perInstrument.get(note.instrument) ?? new Map<number, number>();
    counts.set(note.note!, (counts.get(note.note!) ?? 0) + 1);
    perInstrument.set(note.instrument, counts);
  }

  console.log('\nnotes written per instrument, commonest first:');
  for (const [instrument, counts] of [...perInstrument].sort((a, b) => a[0] - b[0])) {
    const ranked = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8);
    console.log(`  ins ${String(instrument).padStart(2)} ${(song.samples[instrument - 1]?.name ?? '').padEnd(26)}`
      + ranked.map(([note, count]) => ` ${noteName(note)}x${count}`).join(''));
  }
}

/**
 * The song's shape: one line per order, one column per channel.
 *
 * A digit is that channel's notes in that order, capped at 9. This is the arrangement — where the
 * drums come in, where everything drops out — which is the one thing a folded-onto-one-bar rhythm
 * grid cannot show.
 */
function reportArrangement(song: ItSong): void {
  const perOrder = song.orders.map(() => new Array(CHANNELS).fill(0));
  for (const note of playedNotes(song)) perOrder[note.order][note.channel]++;

  console.log('\narrangement — notes per channel per order (. = silent, 9 = 9 or more):');
  console.log(`      ${[...Array(CHANNELS)].map((_, c) => String((c + 1) % 10)).join('')}`);
  perOrder.forEach((counts, order) => {
    const row = counts.map(count => (count === 0 ? '.' : String(Math.min(9, count)))).join('');
    const total = counts.reduce((sum, count) => sum + count, 0);
    console.log(`  ${String(order).padStart(2)} p${String(song.orders[order]).padStart(2)} ${row}`
      + ` ${String(total).padStart(4)}`);
  });
}

/**
 * Which tracker commands the module leans on, so a transcription knows what it is throwing away.
 *
 * Volume-column commands are counted apart from effect-column ones: in IT the volume column is
 * itself a small command set, and a module can do all its dynamics there.
 */
function reportEffects(song: ItSong): void {
  const commands = new Map<string, number>();
  const volumes = new Map<string, number>();
  const params = new Map<string, Set<number>>();
  for (const pattern of song.patterns) {
    if (!pattern) continue;
    for (const row of pattern.grid) {
      for (const cell of Object.values(row)) {
        if (cell.command) {
          const letter = EFFECT_LETTERS[cell.command] ?? `#${cell.command}`;
          commands.set(letter, (commands.get(letter) ?? 0) + 1);
          params.set(letter, (params.get(letter) ?? new Set()).add(cell.param ?? 0));
        }
        if (cell.volume !== undefined) {
          const kind = volumeColumnKind(cell.volume);
          volumes.set(kind, (volumes.get(kind) ?? 0) + 1);
        }
      }
    }
  }

  console.log('\neffect column:');
  for (const [letter, count] of [...commands].sort((a, b) => b[1] - a[1])) {
    const seen = [...(params.get(letter) ?? [])].sort((a, b) => a - b).slice(0, 12);
    console.log(`  ${letter}xx ${String(count).padStart(5)}  ${(EFFECT_NAMES[letter] ?? '').padEnd(16)}`
      + ` params ${seen.join(' ')}`);
  }
  console.log('volume column:');
  for (const [kind, count] of [...volumes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(12)} ${String(count).padStart(5)}`);
  }
}

/** The volume column holds a volume, a pan, or one of eight little commands, by range. */
function volumeColumnKind(value: number): string {
  if (value <= 64) return 'volume';
  if (value <= 74) return 'fine vol up';
  if (value <= 84) return 'fine vol down';
  if (value <= 94) return 'vol slide up';
  if (value <= 104) return 'vol slide down';
  if (value <= 114) return 'pitch down';
  if (value <= 124) return 'pitch up';
  if (value >= 128 && value <= 192) return 'pan';
  if (value <= 202) return 'slide to note';
  if (value <= 212) return 'vibrato';
  return `raw ${value}`;
}

/**
 * What each sample *is*, which the header cannot say: a tone, a noise burst, or a loop.
 *
 * `tonal` is the best normalised autocorrelation found — near 1 is a pitched instrument, near 0 is
 * percussion. `bright` is zero crossings per second, which separates a hat from a kick without a
 * spectrum. `decay` is how long the envelope takes to fall 20 dB from its peak: a stab and a pad
 * differ by that number more than by anything else.
 */
function reportProbe(song: ItSong): void {
  console.log('\nsamples probed — tonal 0…1, bright = zero crossings/s, decay = peak to -20dB:');
  for (const sample of song.samples) {
    if (!sample.length) continue;
    const pcm = readPcm(song, sample);
    if (!pcm) {
      console.log(`  ${label(sample)} packed, not decoded`);
      continue;
    }
    const seconds = sample.length / sample.c5Speed;
    const looped = sample.loopEnd > sample.loopStart;
    console.log(`  ${label(sample)} ${seconds.toFixed(2)}s  tonal ${tonality(pcm).toFixed(2)}`
      + `  bright ${String(Math.round(brightness(pcm, sample.c5Speed))).padStart(5)}`
      + `  attack ${(attackSeconds(pcm, sample.c5Speed) * 1000).toFixed(0).padStart(4)}ms`
      + `  decay ${decaySeconds(pcm, sample.c5Speed).toFixed(2)}s`
      + `  ${soundingPitch(song, sample)}`
      + (looped ? '  looped' : ''));
  }
}

function label(sample: ItSample): string {
  return `${String(sample.index + 1).padStart(2)}: ${sample.name.padEnd(26)}`;
}

/**
 * What a written C-5 on this instrument actually sounds like, as a MIDI note.
 *
 * A tracker note is a playback *rate*, not a pitch: C-5 plays the sample at its `c5Speed`, and what
 * comes out is whatever that sample's own fundamental then is. Two instruments a transcription
 * writes on the same row can be an octave and a fifth apart, and without this number a synth
 * playing the written notes plays the wrong tune.
 */
function soundingPitch(song: ItSong, sample: ItSample): string {
  const hz = fundamentalHz(song, sample);
  if (hz === 0) return 'unpitched';
  const midi = 69 + 12 * Math.log2(hz / 440);
  return `C5 sounds ${noteName(Math.round(midi))} (${hz.toFixed(1)}Hz, ${(midi - 60).toFixed(1)}st)`;
}

/** Best normalised autocorrelation over the plausible pitch range, measured past the attack. */
function tonality(pcm: Float32Array): number {
  const from = Math.floor(pcm.length / 3);
  const length = Math.min(4096, pcm.length - from);
  if (length < 256) return 0;

  let energy = 0;
  for (let i = 0; i < length; i++) energy += pcm[from + i] * pcm[from + i];
  if (energy <= 0) return 0;

  let best = 0;
  for (let lag = 20; lag < Math.min(1500, length / 2); lag++) {
    let sum = 0;
    for (let i = 0; i < length - lag; i++) sum += pcm[from + i] * pcm[from + i + lag];
    best = Math.max(best, (sum / (length - lag)) * (length / energy));
  }
  return Math.max(0, Math.min(1, best));
}

function brightness(pcm: Float32Array, rate: number): number {
  let crossings = 0;
  for (let i = 1; i < pcm.length; i++) if ((pcm[i - 1] < 0) !== (pcm[i] < 0)) crossings++;
  return (crossings * rate) / Math.max(1, pcm.length);
}

function attackSeconds(pcm: Float32Array, rate: number): number {
  let peak = 0;
  let at = 0;
  for (let i = 0; i < pcm.length; i++) {
    const value = Math.abs(pcm[i]);
    if (value > peak) {
      peak = value;
      at = i;
    }
  }
  return at / rate;
}

/** Time from the envelope's peak until it has fallen 20 dB, measured on a 256-frame RMS. */
function decaySeconds(pcm: Float32Array, rate: number): number {
  const window = 256;
  const envelope: number[] = [];
  for (let i = 0; i + window <= pcm.length; i += window) {
    let sum = 0;
    for (let j = 0; j < window; j++) sum += pcm[i + j] * pcm[i + j];
    envelope.push(Math.sqrt(sum / window));
  }
  if (envelope.length === 0) return 0;

  const peak = Math.max(...envelope);
  const peakAt = envelope.indexOf(peak);
  const floor = peak * 0.1;
  for (let i = peakAt; i < envelope.length; i++) {
    if (envelope[i] < floor) return ((i - peakAt) * window) / rate;
  }
  return ((envelope.length - peakAt) * window) / rate;
}

function reportPattern(song: ItSong, index: number, channels: number[]): void {
  const pattern = song.patterns[index];
  if (!pattern) {
    console.log(`\npattern ${index} is empty`);
    return;
  }
  console.log(`\npattern ${index}, ${pattern.rows} rows:`);
  console.log(`row  ${channels.map(c => `ch${String(c).padStart(2)}       `).join('')}`);
  for (let row = 0; row < pattern.rows; row++) {
    // `grid` is indexed row first, then channel — the other way round silently reads nothing.
    const cells = channels.map(channel => {
      const cell = pattern.grid[row][channel - 1];
      if (!cell || cell.note === undefined) return '...        ';
      const effect = cell.command ? EFFECT_LETTERS[cell.command] + toHex(cell.param ?? 0) : '   ';
      return `${noteName(cell.note)}${String(cell.instrument ?? '').padStart(3)}${effect} `;
    });
    console.log(`${row % ROWS_PER_BEAT === 0 ? '>' : ' '}${String(row).padStart(2)}  ${cells.join('')}`);
  }
}


function reportHarmonics(song: ItSong, sampleNumber: number): void {
  const sample = song.samples[sampleNumber - 1];
  if (!sample || !sample.length) {
    console.log(`\nsample ${sampleNumber} is empty`);
    return;
  }
  const pcm = readPcm(song, sample);
  console.log(`\nsample ${sampleNumber} "${sample.name}"`);
  if (!pcm) {
    console.log('  packed (IT214) — decompression not implemented, so no spectrum');
    return;
  }

  const { from, length: window } = steadyWindow(sample, pcm);
  const period = findPeriod(pcm, from, window);
  if (period === 0) {
    console.log('  no periodicity found — probably percussion or noise');
    return;
  }
  const fundamental = sample.c5Speed / period;
  console.log(`  period ${period} frames => ${fundamental.toFixed(1)}Hz at its C5 rate`
    + ` (window ${window} frames from ${from})`);

  const magnitudes: number[] = [];
  for (let harmonic = 1; harmonic <= HARMONICS; harmonic++) {
    magnitudes.push(magnitudeAt(pcm, from, window, harmonic / period));
  }
  const peak = Math.max(...magnitudes);
  console.log('  harmonics, relative to the strongest:');
  magnitudes.forEach((magnitude, index) => {
    const relative = magnitude / peak;
    console.log(`   ${String(index + 1).padStart(2)}: ${relative.toFixed(3)}`
      + ` ${'#'.repeat(Math.round(relative * 40))}`);
  });
  console.log(`  as a table: [${magnitudes.map(m => (m / peak).toFixed(3)).join(', ')}]`);
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Options {
  file: string;
  pattern: number | null;
  channels: number[];
  sample: number | null;
  extract: boolean;
  arrangement: boolean;
  effects: boolean;
  probe: boolean;
  notes: boolean;
}

function parseArguments(args: string[]): Options {
  const flags = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? '');
  }
  const file = flags.get('file') ?? defaultModuleFile();
  const pattern = flags.has('pattern') ? Number(flags.get('pattern')) : null;
  return {
    file,
    pattern,
    channels: (flags.get('channels') ?? '1,2,3,4').split(',').map(Number),
    sample: flags.has('sample') ? Number(flags.get('sample')) : null,
    extract: flags.has('extract'),
    arrangement: flags.has('arrangement'),
    effects: flags.has('effects'),
    probe: flags.has('probe'),
    notes: flags.has('notes'),
  };
}

/** Two hex digits, the way a tracker writes an effect parameter. */
function toHex(value: number): string {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

main();
