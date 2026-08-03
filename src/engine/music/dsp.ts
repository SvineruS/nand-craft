/**
 * Sample-level DSP. No Web Audio nodes, so the same code runs in the browser and in Node
 * (`npm run music:render`).
 */

/** Frequency of a MIDI note number. 69 is A4 = 440 Hz. */
export function midiToHz(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

/** Detune in cents as a frequency multiplier. */
export function centsToRatio(cents: number): number {
  return 2 ** (cents / 1200);
}

/** Equal-power pan gains, `pan` -1 left … +1 right. Split in two to avoid allocating a pair. */
export function panLeftGain(pan: number): number {
  return Math.cos((pan + 1) * Math.PI * 0.25);
}

export function panRightGain(pan: number): number {
  return Math.sin((pan + 1) * Math.PI * 0.25);
}

/** xorshift32. Not `Math.random`, because a seed has to mean one piece of music. */
export class Random {
  private state: number;

  constructor(seed: number) {
    // A zero state is a fixed point of xorshift and would return 0 forever.
    this.state = (seed | 0) || 0x9e3779b9;
  }

  /** Reuse one generator instead of allocating per use. */
  reseed(seed: number): void {
    this.state = (seed | 0) || 0x9e3779b9;
  }

  /** Next value in 0…1. */
  next(): number {
    let x = this.state;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.state = x | 0;
    return (x >>> 0) / 0x100000000;
  }

  /** Integer in 0…count-1. */
  int(count: number): number {
    return Math.min(count - 1, Math.floor(this.next() * count));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  range(low: number, high: number): number {
    return low + (high - low) * this.next();
  }
}

/** A seed per section, so a section sounds the same however the player reached it. */
export function hashSeed(seed: number, a: number, b = 0): number {
  let h = (seed ^ 0x9e3779b9) | 0;
  h = Math.imul(h ^ a, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13) ^ b, 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

// ---------------------------------------------------------------------------
// Oscillators
// ---------------------------------------------------------------------------

export type Waveform = 'sine' | 'triangle' | 'saw' | 'square';

/**
 * One sample, `phase` 0…1 and `increment` the step per sample. Saw and square are PolyBLEP
 * band-limited; without it their steps alias into a metallic buzz. Sine and triangle don't jump.
 */
export function oscillator(wave: Waveform, phase: number, increment: number): number {
  switch (wave) {
    case 'sine':
      return Math.sin(phase * Math.PI * 2);
    case 'triangle':
      return 1 - 4 * Math.abs(((phase + 0.75) % 1) - 0.5);
    case 'saw':
      return 2 * phase - 1 - polyBlep(phase, increment);
    case 'square': {
      // Two saws half a cycle apart: their steps cancel into a square, blep and all.
      const shifted = (phase + 0.5) % 1;
      const rising = 2 * phase - 1 - polyBlep(phase, increment);
      const falling = 2 * shifted - 1 - polyBlep(shifted, increment);
      return rising - falling;
    }
  }
}

/** The PolyBLEP correction around a unit step at phase 0. */
function polyBlep(phase: number, increment: number): number {
  if (phase < increment) {
    const t = phase / increment;
    return t + t - t * t - 1;
  }
  if (phase > 1 - increment) {
    const t = (phase - 1) / increment;
    return t * t + t + t + 1;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Envelope
// ---------------------------------------------------------------------------

type EnvelopeStage = 'idle' | 'attack' | 'hold' | 'release';

/**
 * Attack, hold, exponential release. No sustain stage and no note-off: the composer writes each
 * note's length, so a voice knows when to let go before it starts.
 */
export class Envelope {
  level = 0;

  private stage: EnvelopeStage = 'idle';
  private attackStep = 0;
  private holdSamples = 0;
  private releaseCoefficient = 0;
  private peak = 1;

  get active(): boolean {
    return this.stage !== 'idle';
  }

  /** Times in samples. `release` is the 60 dB time of the tail, not its end. */
  trigger(attack: number, hold: number, release: number, peak: number): void {
    this.peak = peak;
    this.attackStep = attack > 0 ? peak / attack : peak;
    this.holdSamples = hold;
    this.releaseCoefficient = Math.exp(-6.9078 / Math.max(1, release));
    this.level = 0;
    this.stage = 'attack';
  }

  /** Let go now over `release` samples — what a note gets instead of being cut off. */
  releaseIn(release: number): void {
    if (this.stage === 'idle') return;
    this.releaseCoefficient = Math.exp(-6.9078 / Math.max(1, release));
    this.stage = 'release';
  }

  /** Level for this sample, advancing the envelope by one. */
  next(): number {
    switch (this.stage) {
      case 'attack':
        this.level += this.attackStep;
        if (this.level >= this.peak) {
          this.level = this.peak;
          this.stage = 'hold';
        }
        return this.level;
      case 'hold':
        if (--this.holdSamples <= 0) this.stage = 'release';
        return this.level;
      case 'release':
        this.level *= this.releaseCoefficient;
        // Cut the tail once it is 80 dB down: inaudible, and it frees the voice.
        if (this.level < 1e-4) {
          this.level = 0;
          this.stage = 'idle';
        }
        return this.level;
      case 'idle':
        return 0;
    }
  }
}

// ---------------------------------------------------------------------------
// Filter
// ---------------------------------------------------------------------------

/**
 * State-variable filter, Simper's trapezoidal form: all three responses from one pass, and
 * stable at any cutoff — the Chamberlin SVF falls apart above sr/6, where the hats live.
 */
export class Svf {
  low = 0;
  band = 0;
  high = 0;

  private ic1 = 0;
  private ic2 = 0;
  private a1 = 1;
  private a2 = 0;
  private a3 = 0;
  private k = 1;

  /** Costs a `tan`, so it runs per control block while `process` runs per sample. */
  setCutoff(cutoffHz: number, q: number, sampleRate: number): void {
    const clamped = Math.min(Math.max(cutoffHz, 20), sampleRate * 0.47);
    const g = Math.tan((Math.PI * clamped) / sampleRate);
    this.k = 1 / Math.max(0.5, q);
    this.a1 = 1 / (1 + g * (g + this.k));
    this.a2 = g * this.a1;
    this.a3 = g * this.a2;
  }

  /** Run one sample; the three outputs are then readable as `low` / `band` / `high`. */
  process(x: number): void {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3;
    const v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1;
    this.ic2 = 2 * v2 - this.ic2;
    this.low = v2;
    this.band = v1;
    this.high = x - this.k * v1 - v2;
  }

  reset(): void {
    this.ic1 = 0;
    this.ic2 = 0;
  }
}

/** One-pole lowpass, for damping a feedback path where a full SVF would be overkill. */
export class OnePole {
  private store = 0;

  /** `damp` 0…1: 0 passes everything, 0.9 is a dull thud. */
  process(x: number, damp: number): number {
    this.store = x * (1 - damp) + this.store * damp;
    return this.store;
  }
}

// ---------------------------------------------------------------------------
// Delay-based effects
// ---------------------------------------------------------------------------

/** A ring buffer of samples, read at a whole-sample delay. */
export class DelayLine {
  private buffer: Float32Array;
  private index = 0;

  constructor(lengthSamples: number) {
    this.buffer = new Float32Array(Math.max(1, Math.ceil(lengthSamples)));
  }

  read(delaySamples: number): number {
    const length = this.buffer.length;
    const offset = Math.min(length - 1, Math.max(0, Math.round(delaySamples)));
    return this.buffer[(this.index - offset + length) % length];
  }

  write(x: number): void {
    this.buffer[this.index] = x;
    this.index = (this.index + 1) % this.buffer.length;
  }
}

/** Each channel feeds back into the other, so an echo bounces left-right-left. */
export class PingPongDelay {
  outLeft = 0;
  outRight = 0;

  private left: DelayLine;
  private right: DelayLine;
  private dampLeft = new OnePole();
  private dampRight = new OnePole();
  private delaySamples: number;
  private sampleRate: number;
  private feedback: number;
  private damp: number;

  constructor(sampleRate: number, maxSeconds = 2, feedback = 0.45, damp = 0.35) {
    this.sampleRate = sampleRate;
    this.feedback = feedback;
    this.damp = damp;
    this.left = new DelayLine(sampleRate * maxSeconds);
    this.right = new DelayLine(sampleRate * maxSeconds);
    this.delaySamples = sampleRate * 0.375;
  }

  /** Echo spacing, set from the tempo so the delay is part of the groove. */
  setTime(seconds: number): void {
    this.delaySamples = Math.min(this.sampleRate * 2 - 1, seconds * this.sampleRate);
  }

  process(inputLeft: number, inputRight: number): void {
    this.outLeft = this.left.read(this.delaySamples);
    this.outRight = this.right.read(this.delaySamples);
    this.left.write(inputLeft + this.dampLeft.process(this.outRight, this.damp) * this.feedback);
    this.right.write(inputRight + this.dampRight.process(this.outLeft, this.damp) * this.feedback);
  }
}

/** Comb filter with a lowpass in the feedback — one of Freeverb's eight. */
class DampedComb {
  private buffer: Float32Array;
  private index = 0;
  private store = 0;

  constructor(lengthSamples: number) {
    this.buffer = new Float32Array(Math.max(1, Math.round(lengthSamples)));
  }

  process(x: number, feedback: number, damp: number): number {
    const out = this.buffer[this.index];
    this.store = out * (1 - damp) + this.store * damp;
    this.buffer[this.index] = x + this.store * feedback;
    if (++this.index >= this.buffer.length) this.index = 0;
    return out;
  }
}

/** Allpass filter — smears the comb bank's output without colouring it. */
class Allpass {
  private buffer: Float32Array;
  private index = 0;

  constructor(lengthSamples: number) {
    this.buffer = new Float32Array(Math.max(1, Math.round(lengthSamples)));
  }

  process(x: number, feedback: number): number {
    const buffered = this.buffer[this.index];
    this.buffer[this.index] = x + buffered * feedback;
    if (++this.index >= this.buffer.length) this.index = 0;
    return buffered - x;
  }
}

/** Comb lengths in samples at 44.1 kHz, from Freeverb — mutually prime, so the tail is smooth. */
const COMB_LENGTHS = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_LENGTHS = [556, 441, 341, 225];
/** Right channel's combs are this much longer than the left's, which is what makes it wide. */
const STEREO_SPREAD = 23;
const TUNING_SAMPLE_RATE = 44100;

/**
 * Freeverb — eight damped combs into four allpasses, per channel. The tail is what joins sparse
 * pads and bells into something continuous; a convolution reverb would mean shipping a sample.
 */
export class Reverb {
  outLeft = 0;
  outRight = 0;

  private combsLeft: DampedComb[];
  private combsRight: DampedComb[];
  private allpassLeft: Allpass[];
  private allpassRight: Allpass[];
  /** 0…1, how long the tail runs. */
  private roomSize: number;
  /** 0…1, how quickly the tail loses its highs. */
  private damp: number;

  constructor(sampleRate: number, roomSize = 0.86, damp = 0.28) {
    this.roomSize = roomSize;
    this.damp = damp;
    const scale = sampleRate / TUNING_SAMPLE_RATE;
    this.combsLeft = COMB_LENGTHS.map(n => new DampedComb(n * scale));
    this.combsRight = COMB_LENGTHS.map(n => new DampedComb((n + STEREO_SPREAD) * scale));
    this.allpassLeft = ALLPASS_LENGTHS.map(n => new Allpass(n * scale));
    this.allpassRight = ALLPASS_LENGTHS.map(n => new Allpass((n + STEREO_SPREAD) * scale));
  }

  process(inputLeft: number, inputRight: number): void {
    // Both sides driven by the sum; the width comes from the comb lengths.
    const input = (inputLeft + inputRight) * 0.5;
    const feedback = this.roomSize;

    let left = 0;
    let right = 0;
    for (let i = 0; i < COMB_LENGTHS.length; i++) {
      left += this.combsLeft[i].process(input, feedback, this.damp);
      right += this.combsRight[i].process(input, feedback, this.damp);
    }
    for (let i = 0; i < ALLPASS_LENGTHS.length; i++) {
      left = this.allpassLeft[i].process(left, 0.5);
      right = this.allpassRight[i].process(right, 0.5);
    }
    // The comb bank sums eight unity-gain paths; this brings it back to roughly its input level.
    this.outLeft = left * 0.12;
    this.outRight = right * 0.12;
  }
}

/** Soft saturation on the master, so stacked pads never clip hard. */
export function softClip(x: number): number {
  return Math.tanh(x);
}
