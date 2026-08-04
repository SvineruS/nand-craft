# Music

Three soundtracks, two of which are generated from a handful of numbers and a seed, and one of
which is a real tracker module played note for note. Each layer is ignorant of the one above it.

    themes.ts      the soundtracks       — which are generated, which are written down
    notes.ts       NoteEvent, NoteSource — the seam the player sees
    composer.ts    which notes, when     — makes them up from a theme and a seed
    score.ts       which notes, when     — reads them off a transcribed module
    scores.ts      what a score's instruments are; scores/ is generated data
    instruments.ts how a note sounds     — oscillators, filters, envelopes, and a sample player
    samples.ts     the few sounds carried as audio rather than synthesised
    player.ts      the clock and mixer   — notes into samples
    dsp.ts         the primitives
    musicWorker.ts renders off-thread
    music.ts       schedules chunks onto the audio clock
    ui/musicDirector.ts   which mood plays on which screen

## Soundtracks and moods

A **soundtrack** is one style in three **moods** — `menu`, `map`, `puzzle`. The player picks the
soundtrack in Settings; the screen picks the mood. `MOOD_BY_VIEW` is exhaustive over `ViewMode`, so
a new screen cannot be silent by accident (the legacy factory screen borrows `map`).

| id | shown as | what it is |
|---|---|---|
| `tea` | Tea | calm ambient techno — generated |
| `coffee` | Coffee | breakbeat with strings — generated |
| `foregone` | Ice | a transcribed tracker module — written down |

`MusicTheme` is a union of the two kinds, and they share only what the player needs — `intensity`,
`reverb` and the per-layer `gains`. Everything else differs, so nothing is a setting on a struct
that half the soundtracks ignore.

Adding a soundtrack means adding an entry to `SOUNDTRACKS`. No other file needs to change.

### The generated ones

A generated theme is a whole style, not just a key and a tempo: it also names **which layers
exist** and the intensity each needs, **the rhythms** they choose between, and **which patch**
plays them.

| `tea` | bpm | key | bars/chord | intensity | reverb |
|---|---|---|---|---|---|
| `menu` | 84 | A natural minor | 4 | 0.2 | 0.5 |
| `map` | 88 | G dorian | 2 | 0.38 | 0.46 |
| `puzzle` | 92 | A natural minor | 2 | 0.55 | 0.42 |

| `coffee` | bpm | key | bars/chord | intensity | reverb | breath |
|---|---|---|---|---|---|---|
| `menu` | 118 | C natural minor | 4 | 0.26 | 0.4 | 0.2 |
| `map` | 125 | C natural minor | 2 | 0.5 | 0.34 | 0.26 |
| `puzzle` | 125 | C natural minor | 2 | 0.72 | 0.3 | 0.38 |

`tea` is pads, bells and a soft kick.

`coffee` is breakbeat, after the Impulse Tracker music of late-90s shooters. Its tempo, drum grids
and the fact that the *bass* is the hook were read off the reference module rather than invented.
Nothing melodic is copied; the riffs come from the same tables and seed as every other generated
soundtrack's — which is why it is the same genre and a different tune from `foregone` below.

What makes the genre is the two-step break — kick on the one and on the second half of beat three,
snare on two and four — a reese under it, long minor pads over the top, and a lead line that sings
rather than chatters. Its `breath` is much deeper than `tea`'s: a 16-bar breakdown that strips back
to pad and sub before the break returns is the shape the genre runs on.

### The written one

`foregone` is *Foregone Destruction*, the Impulse Tracker module in `src/assets/music`, transcribed:
3850 notes at 168 BPM over 44 orders, four minutes of it. A mood is a **stretch of that one
arrangement** rather than a different piece — `menu` loops the sparse intro, `map` the middle,
`puzzle` the whole thing.

The grid lines up for free. A tracker at four rows to the beat *is* sixteenths, so one row is one
step and nothing has to be resampled in time.

See [the transcription](#transcription) below for how the notes and instruments were derived, and
why almost none of it could be read off the module at face value.

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

    tea       pad 0   bell 0.15   bass 0.22   hat 0.4     kick 0.5    arp 0.5
    coffee    pad 0   arp 0.15    kick 0.28   snare 0.34  hat 0.44    bell 0.48
    foregone  pad 0   lead 0      bass 0.12   bell 0.2    kick 0.3    snare 0.36  hat 0.45  arp 0.6

A layer the theme does not list never plays — `tea` has no snare or lead. A threshold set above
every mood's own intensity is a layer that only appears when the game turns `energy` up.

`foregone` uses the same gate, with each of the module's instruments assigned a layer: its seven
percussion samples are all `hat`, its two kicks `kick`, and the sine that carries the hook `lead` at
threshold 0 — so turning the energy down strips a written piece back in the same order it strips a
generated one, and the hook is the last thing to go. The first bars of each section subtract the theme's `breath`, so
the arrangement drops and rebuilds every 16 bars.

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

Lead notes are held until just before the next one in the pattern, so how legato the line is falls
out of how sparse its rhythm is — no per-theme note length to set. A section may drop the bell, hat
or arp, but never the lead: where a soundtrack has one it is the hook.

## Transcription

`foregone`'s notes are generated data, produced offline and committed. Nothing reads the 2 MB
`.umx` at run time.

    src/assets/music/*.umx
       ├── npm run music:analyze     reports only — tempo, arrangement, spectra, sounding pitch
       └── npm run music:transcribe  → scores/foregone.ts        3850 notes, 74 kB
                                     → scores/foregoneSamples.ts three sounds, 106 kB

`scores/` is the module's notes and nothing else. `scores.ts` is the *reading* of them — which
patch plays each instrument, in which register, how loud. The two are apart on purpose: a mapping
decision changes one file, re-reading the module changes the other.

### Almost nothing can be taken at face value

Every number in `scores.ts` was measured, because the obvious reading is wrong in four separate
ways — and each one on its own is enough to make it a different piece of music.

**The header tempo is a lie.** It says 125 BPM. The module sets `A05`/`T140` on its first row and
runs at 168, so reading the header puts the whole thing 35% slow.

**A note is a rate, not a pitch.** A tracker plays a sample faster to raise it, so what you hear
depends on the sample's own tone. The hook is written around D♯7 and sounds around G4 — nineteen
semitones down. The low tones are written at F-5 and sound three octaves lower. Read literally,
the parts land in the wrong registers relative to each other and the key comes out a fifth wrong.
Each `transpose` was measured by rendering the module with every other channel muted and reading
the pitches that actually came out.

**A note does not last until the next note.** It lasts until the sample runs out, and the sample
runs out sooner the higher it is played: a 2.35-second sample written at G-6 is over in 0.39. The
transcriber caps every one-shot note by its own length at its own pitch. Without it, stabs ring for
seconds after the original has gone quiet.

**A sample's spectrum can lie too.** Read off the raw data, `33-HI`'s first three harmonics look
equal. Rendered alone, its fundamental is a *tenth* of the two above it — a missing fundamental,
which a synth given the full one plays an octave too low and far too thick.

### Synthesised, except three

19 of the 22 instruments are synth patches built from measured spectra. Three are the module's
actual audio, at 8-bit/11 kHz, because no patch could stand in for them: they are *chords*,
recorded whole, so there is no single tone to match. Given the one note the pattern writes, an
oscillator plays a bare note where the original plays a triad — heard as the wrong chord rather
than a plainer one.

They are stored well below the 22 kHz they were recorded at, and deliberately: written at G-6 they
play six times too fast, so everything audible in the result comes from below 3.5 kHz in the source.

`EventKind` is a union of three key spaces — patch names, drum names and sample names — told apart
by name alone. `check:invariants` asserts every voice names something in exactly one of them, since
a name in none would be a silent silence rather than an error.

### What is dropped

Sample offsets, retriggers, portamento (1353 notes carry a slide-to-note) and volume slides (3663
of them), which the patches' own envelopes stand in for. The nine-pitch kick plays at one pitch.

### How close it is

`openmpt123` renders the real module; `npm run music:render` renders this one; comparing
semitone-binned spectra window by window gives a number rather than an opinion. Currently **0.79**
mean cosine over the full four minutes, with the pitch-class profiles nearly identical.

## Instruments

The tuned patches are one voice class and seven sets of numbers; kick, snare and hat are separate,
being different signal paths rather than another patch.

- **pad** — 3 saws detuned 11 cents, 1.1 s attack, 2.8 s release, filtered at 780 Hz
- **riff** — a sine and a whisper of sub: the transcribed piece's hook, which has no timbre to
  speak of because the sample it came from is a sine and almost nothing else
- **hollow** — a missing fundamental, from a measured spectrum: the octave and twelfth carry it
- **subhit** — a low stab, second harmonic loudest and the odd ones nearly gone
- **bass** — triangle plus a sine an octave down, mostly sub
- **pluck** — short filtered square, heavily into the delay
- **bell** — sine phase-modulated at ratio 3.5, clang decaying in 0.35 s
- **stab** — chords as short hits, for a style with a backbeat
- **drive** — short square bass for sixteenth lines, where a sub would smear into one note
- **reese** — 3 saws detuned 26 cents taken right down by the filter, over a sub: what is left is
  the beating between them
- **lead** — 3 saws detuned 19 cents, resonant filter wide open at the attack
- **kick** — sine falling 132→47 Hz in 28 ms, plus a 4 ms noise click
- **snare** — a band of noise for the crack plus a fast sine for the body; noise alone is a hiss
- **hat** — noise through a highpass at 7–8.6 kHz

32 tuned voices, 2 kicks, 3 snares, 4 hats, 6 sample players; the quietest is stolen when they run
out. A sample player is a recording read back at whatever rate the note asks for, with no filter
and no envelope but a release — the recording already has its own attack and decay, and shaping it
again is how a sampled instrument stops sounding like itself. All mix into
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

    npm run music:render                          # 90s of tea/puzzle to a wav
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
