# Music

A generated soundtrack. No audio files: every sample is computed from a seed and a handful of
numbers. Three layers, each ignorant of the one above it.

    themes.ts      the soundtracks       — key, tempo, chord loops, layers, rhythms
    composer.ts    which notes, when     — reads a theme, emits NoteEvents
    instruments.ts how a note sounds     — oscillators, filters, envelopes
    player.ts      the clock and mixer   — notes into samples
    dsp.ts         the primitives
    musicWorker.ts renders off-thread
    music.ts       schedules chunks onto the audio clock
    ui/musicDirector.ts   which mood plays on which screen

## Soundtracks and moods

A **soundtrack** is one style in three **moods** — `menu`, `map`, `puzzle`. The player picks the
soundtrack in Settings; the screen picks the mood. `MOOD_BY_VIEW` is exhaustive over `ViewMode`, so
a new screen cannot be silent by accident (the legacy factory screen borrows `map`).

A theme is a whole style, not just a key and a tempo: it also names **which layers exist** and the
intensity each needs, **the rhythms** they choose between, and **which patch** plays them.

| `ambient` | bpm | key | bars/chord | intensity | reverb |
|---|---|---|---|---|---|
| `menu` | 84 | A natural minor | 4 | 0.2 | 0.5 |
| `map` | 88 | G dorian | 2 | 0.38 | 0.46 |
| `puzzle` | 92 | A natural minor | 2 | 0.55 | 0.42 |

| `industrial` | bpm | key | bars/chord | intensity | reverb |
|---|---|---|---|---|---|
| `menu` | 112 | E natural minor | 4 | 0.3 | 0.34 |
| `map` | 126 | E natural minor | 2 | 0.55 | 0.28 |
| `puzzle` | 138 | D natural minor | 2 | 0.78 | 0.24 |

`ambient` is pads, bells and a soft kick. `industrial` is after the Impulse Tracker music of
late-90s shooters: a driving sixteenth bass, a backbeat with ghost notes, chord stabs instead of a
wash, and a detuned lead riff — drier, and with the drums arriving much earlier in the intensity
range.

Adding a soundtrack means adding an entry to `SOUNDTRACKS`. No other file needs to change.

## How the notes are chosen

The grid is 16 steps (sixteenths) per bar. Every 16 bars is a **section**, and at each boundary a
generator seeded from `hash(seed, sectionNumber)` re-rolls the arrangement by *choosing between
written-out options*:

- a chord loop, e.g. `[0, 6, 5, 3]` = i–VII–VI–iv
- a kick pattern from four strings like `x.......x..x....`, likewise hats, bass, arpeggio
- a 2–3 note motif, restricted to the minor pentatonic so it fits every chord in the loop
- 35% chance one optional layer (bell, hat, arp) sits the section out
- 50% chance chords take their seventh

**Randomness picks the arrangement, never the notes.** Nothing chooses a pitch freely — the seed
only selects among options written in the source. That is the whole reason it stays listenable.

Which layers play comes from one number against the theme's own thresholds:

    ambient      pad 0   bell 0.15   bass 0.22   hat 0.4    kick 0.5    arp 0.62
    industrial   pad 0   bass 0.1    kick 0.25   hat 0.35   snare 0.45  lead 0.58   arp 0.72

A layer the theme does not list never plays — `ambient` has no snare or lead, `industrial` no bell.
The first 4 bars of every section subtract 0.18, so drums drop out and rebuild every 16 bars.

### Voice leading is not optional

Each layer asks for its chord root **in whichever octave is nearest its own anchor** (bass at the
root, pad an octave up, arp two). Read literally, i–VII–VI–iv in A minor climbs A2→G3→F3→D3,
because the VII is a G a *seventh above* the tonic. The anchor rule makes it step down
A2→G2→F2→D2. Without it the music sounds wrong in a way that is hard to name.

### The lead is not the bell

Two different devices. The bell's **motif** is an ornament: 2–3 pentatonic notes every fourth bar,
anchored to the key. The **riff** is a line: 5–8 degrees running every bar, relative to the chord so
it transposes under the progression, and deliberately a different length from the bar's note count
so it phases across bars instead of repeating identically.

## Instruments

The tuned patches are one voice class and seven sets of numbers; kick, snare and hat are separate,
being different signal paths rather than another patch.

- **pad** — 3 saws detuned 11 cents, 1.1 s attack, 2.8 s release, filtered at 780 Hz
- **bass** — triangle plus a sine an octave down, mostly sub
- **pluck** — short filtered square, heavily into the delay
- **bell** — sine phase-modulated at ratio 3.5, clang decaying in 0.35 s
- **stab** — chords as short hits, for a style with a backbeat
- **drive** — short square bass for sixteenth lines, where a sub would smear into one note
- **lead** — 3 saws detuned 19 cents, resonant filter wide open at the attack
- **kick** — sine falling 132→47 Hz in 28 ms, plus a 4 ms noise click
- **snare** — a band of noise for the crack plus a fast sine for the body; noise alone is a hiss
- **hat** — noise through a highpass at 7–8.6 kHz

24 tuned voices, 2 kicks, 3 snares, 4 hats; the quietest is stolen when they run out. All mix into
a dry bus plus two sends: a ping-pong delay spaced to a dotted eighth (pulling against the beat)
and a Freeverb. The kick ducks pad and bass by 34%, which is what leaves room for it. Master gain
0.62, then `tanh`.

Work happens in **32-sample control blocks**: filter coefficients and the step clock update per
block, oscillators per sample.

## How it is played

Buffered, but generated on demand — real-time generation with a one-second cushion.

The worker renders **0.25 s chunks** and transfers them back as two `Float32Array`s. The page
copies each into an `AudioBuffer` and calls `start(t)` at an exact time on the audio clock, where
`t` is precisely where the previous chunk ended — so consecutive chunks are one continuous signal
with no seam. A 150 ms timer tops the queue up to a **1 s lookahead**, max 6 chunks in flight.

The timer never affects playback timing; it only asks for audio in good time. Only being late by
more than the lookahead costs anything, and then `queuedUntil` resyncs to `now + 0.05` — one seam
rather than every later chunk inheriting the delay.

**Why not an AudioWorklet**, which is where this belongs: a worklet's global scope has no module
loader, so its file must arrive with every import inlined. Vite's production build does that; its
dev server serves ESM with live imports, and `worker.format: 'iife'` does not change it. It would
work built and fail in `npm run dev`. A module worker is bundled in production and natively
imported in dev — the same code both ways. It also cannot go on the main thread: generation costs
2–3% of a core, but in bursts, and one landing in the canvas frame loop is a dropped frame.

## Changing it while it plays

Two mechanisms, neither of which interrupts anything.

`setMusicParams({ energy, brightness, tempo, space })` — modifiers over whatever theme is playing,
defaults meaning "the theme as written", which is what lets them outlive a theme change. Each
glides over ~2 s. `brightness` is read per block, not stored per note, so turning it moves the
eleven-second pad already sounding.

`playMusic(soundtrack, mood)` — hands over at the end of the current chord, with no fade. The old
key's notes are *released* over 0.5 s rather than cut, and the new theme's bar 0 is itself a chord
boundary, which fills the gap (and is why the chord must not also be triggered by hand — it would
play twice, 6 dB loud). Changing soundtrack in Settings goes through the same path, so it is the
same seamless hand-over even though tempo, key, layers and patches all change at once.

Both are heard about a second later, since that much audio is already queued. Fine for mood
following game state; wrong for a sound answering a click — that is what `sfx.ts` is for.

## Tools

    npm run music:render                          # 90s of ambient/puzzle to a wav
    npm run music:render -- --all                 # every soundtrack and mood, one file each
    npm run music:render -- --soundtrack=industrial --sweep
    npm run music:render -- --mood=menu --seconds=45 --seed=7 --out=/tmp/menu.wav

The seed is fixed (`0x1a7e`), so it is the same piece every session and the renderer writes exactly
what a player hears. `--sweep` is how the live controls get judged by ear.

`npm run check:invariants` phase 9 pins what a generated soundtrack has no golden output for. Over
every soundtrack × mood: renders finite, audible, unclipped stereo, and every layer it declares has
a rhythm (one without would silently never play). Plus: one seed is one piece of music; the clock
keeps time over eight bars whatever block size it is rendered in; and changing the music mid-render
— including across soundtracks, the switch with the most to go wrong — leaves no 100 ms window
below −46 dB.

Volumes live on separate buses — defaults are music 20%, effects 60%, both persisted.
