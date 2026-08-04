/**
 * Writes a copy of the tracker module with only some of it audible, so one part can be heard and
 * measured on its own.
 *
 *   npm run music:solo -- --instruments=15,16,17 --out=/tmp/stabs.it
 *   npm run music:solo -- --channels=10,11,12 --out=/tmp/riff.it
 *   openmpt123 --render --samplerate 48000 /tmp/stabs.it
 *
 * Then `npm run music:render -- --soundtrack=foregone --instruments=15,16,17` renders our version
 * of the same part, and `npm run music:compare` says how far apart they are. That loop is how
 * every `transpose` in `scores.ts` was established, and how the one part that sounded wrong was
 * found — measuring the whole mix hides a single bad instrument almost completely.
 *
 * Prefer `--instruments`: several instruments here share channels, so a few have no channel where
 * they play alone and `--channels` cannot isolate them at all.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { carveModule, defaultModuleFile } from './itModule.ts';

/** IT header: 64 channel pans at 64 (bit 7 mutes), 64 channel volumes at 128. */
const CHANNEL_PANS = 64;
const CHANNEL_VOLUMES = 128;
const MAX_CHANNELS = 64;
const MUTED = 128;

/** Sample header: global volume, then default volume. Zeroing both silences the instrument. */
const SAMPLE_GLOBAL_VOLUME = 17;
const SAMPLE_VOLUME = 19;

main();

function main(): void {
  const options = parseArguments(process.argv.slice(2));
  const module = carveModule(readFileSync(options.file));
  if (module.format !== 'it') throw new Error(`only IT is handled; this is ${module.format}`);

  const data = Buffer.from(module.data);
  if (options.channels.length > 0) keepChannels(data, options.channels);
  if (options.instruments.length > 0) keepInstruments(data, options.instruments);

  writeFileSync(options.out, data);
  const kept = [
    options.instruments.length ? `instruments ${options.instruments.join(',')}` : '',
    options.channels.length ? `channels ${options.channels.join(',')}` : '',
  ].filter(Boolean).join(' and ');
  console.log(`wrote ${options.out} — only ${kept || 'everything'} audible`);
}

function keepChannels(data: Buffer, keep: number[]): void {
  for (let channel = 0; channel < MAX_CHANNELS; channel++) {
    if (keep.includes(channel + 1)) continue;
    data[CHANNEL_PANS + channel] |= MUTED;
    data[CHANNEL_VOLUMES + channel] = 0;
  }
}

/** Silences whole samples, which reaches parts that share a channel with something else. */
function keepInstruments(data: Buffer, keep: number[]): void {
  const orderCount = data.readUInt16LE(32);
  const instrumentCount = data.readUInt16LE(34);
  const sampleCount = data.readUInt16LE(36);
  const cursor = 192 + orderCount + instrumentCount * 4;

  for (let index = 0; index < sampleCount; index++) {
    const offset = data.readUInt32LE(cursor + index * 4);
    if (!offset || keep.includes(index + 1)) continue;
    data[offset + SAMPLE_GLOBAL_VOLUME] = 0;
    data[offset + SAMPLE_VOLUME] = 0;
  }
}

interface Options {
  file: string;
  out: string;
  instruments: number[];
  channels: number[];
}

function parseArguments(args: string[]): Options {
  const flags = new Map<string, string>();
  for (const arg of args) {
    const match = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    if (match) flags.set(match[1], match[2] ?? '');
  }
  const numbers = (name: string) =>
    (flags.get(name) ?? '').split(',').filter(Boolean).map(Number);

  return {
    file: flags.get('file') ?? defaultModuleFile(),
    out: flags.get('out') ?? 'solo.it',
    instruments: numbers('instruments'),
    channels: numbers('channels'),
  };
}
