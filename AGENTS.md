# Agent notes: Note Listener (concertina)

A single-page web app that listens to an instrument through the microphone and shows:
- the note being played (letter name, Helmholtz `c'` style or scientific `C4` style) and how far it is off in cents,
- chords (name, e.g. `Am`, `G7`, `C/E`, and the individual notes),
- the notes on a grand staff (treble + bass clef),
- which button(s) to press on a **Maccann duet concertina**.

The owner plays a Maccann duet concertina and is German-speaking (hence the Helmholtz notation: c' = "eingestrichenes c").

## Layout

Everything is in `index.html`: inline CSS and one inline `<script>` IIFE. There is no build step, there are no dependencies, and there are no npm packages.
The only external resource is the Noto Music font from Google Fonts (used for the clefs and ♯/♭ glyphs). It falls back to local fonts.

Script sections, in order (search for `// ----------`):

| Section | What it does |
|---|---|
| note naming | `spell(midi, flats)` gives the letter, accidental, octave and Helmholtz name. `label(sp, helm)` picks the display style. |
| pitch detection | `detectPitch(buf, sr)`: McLeod Pitch Method (NSDF) on a 2048-sample time buffer. Returns `{rms, freq, clarity}`. |
| polyphonic detection | `detectNotes(dbSpectrum, sr, fftSize, a4)`: peak-picks a 16384-point FFT, assigns peaks to the nearest note (±35 cents), then walks upward subtracting each peak's expected overtones (`OVERTONES` table). Notes on a 2nd–10th harmonic of a lower peak are flagged `overtone`. `findChord(notes)` needs at least two pitch classes from unflagged notes and only uses flagged octaves/fifths to complete a chord. `identifyChord(midis)` template-matches against `CHORD_TYPES`. |
| staff rendering | `drawStaff(midis, flats)` draws the grand staff as SVG. Notes ≥ middle C go on treble, lower ones on bass. It handles ledger lines, second-interval head offsets, stacked accidentals, and 8va for ≥ C7. |
| Maccann keyboard | `MACCANN` holds the button positions (Edeophone 55-key). `drawMaccann(midis)` highlights buttons and writes the L/R legend. |
| UI state | `current` is `{type:'note', midi}` or `{type:'chord', chord, midis}`. `render(sound)` draws everything. The note-history row is also here. |
| audio | `getUserMedia` (echo cancellation, noise suppression and AGC all **off**; they wreck instrument audio). Two `AnalyserNode`s: 2048 for the monophonic path, 16384 for chords. |
| loop | Per animation frame: gate on RMS. If MPM clarity < `CHORD_CLARITY_MAX`, try chord detection first; otherwise fall back to a single note. A result must repeat for `NOTE_CONFIRM` / `CHORD_CONFIRM` frames before it is shown. |

The version label (`#version`, currently `V3`) is in the `<h1>`. **Bump it with every change that gets pushed.** It shows the owner which version is loaded, and it drives the update check: on load, and when the tab becomes visible again (at most once a minute), the page re-fetches itself with `fetch(location.href, {cache: 'reload'})`. That bypasses GitHub Pages' 10-minute `max-age` and refreshes the browser cache. If the fetched `#version` differs, it shows a "new version available – Reload" bar. It is skipped on `file://`.

Test hooks at the bottom of the script: `window.__detectPitch`, `window.__show(sound)` and `window.__identifyChord`.

## Maccann layout: source and caveats

- The keyboard is the owner's own instrument: a **Lachenal Edeophone, 55 keys, Nr. 2570** (Maccann system). There are 25 buttons on the left and 30 on the right, plus an air button.
  Source: `Lachenal_Edeophone_55key_Nr2570-3.pdf` in this repo. `MACCANN` holds the PDF's label-centre coordinates (points), extracted with `pdftotext -bbox`. `buildMaccann` scales them with `X = (x-20)*1.25` and `Y = (y-200)*1.25+60`.
- Octave marks in the chart: none = 4, ¹ = 5, ² = 6, ⁻¹ = 3. That gives a left hand of C3–C5 and a right hand of C4–F6. **Still unverified on the real instrument.** If it's off by an octave, shift every note in `MACCANN`.
- The diagram bottom is assumed to be toward the hand rest (as in Gaskins' Maccann charts).
- Background on Maccann layouts in general: Robert Gaskins, *How to Play Chords on Any MacCann Duet Concertina* (2001),
  http://www.concertina.com/gaskins/chords/Gaskins-How-to-Play-Chords-on-Any-MacCann-Duet-Concertina-3.pdf (use plain http).

## Tuning knobs (chord / note detection)

- `OVERTONES` (semitone offset and max overtone:fundamental ratio). Higher ratios suppress more spurious notes but also swallow real notes that coincide with overtones, e.g. right hand C5/E5/G5 over left hand C3. The current values were chosen by testing two synthetic timbres (reedy: 2nd harmonic 2× the fundamental; balanced). Measured on the owner's Edeophone (`samples/`), harmonics are often 1–5× the fundamental and up to 13× (left C5). So the ratios can't separate overtones from notes; `HARMONICS` / `findChord` do that instead.
- Note thresholds inside `detectNotes`: a peak must be ≥ 12 % of the loudest peak to count as a note; peaks down to 3 % still subtract overtones.
- `CHORD_CONFIRM = 6`: when a single note is released, up to 3 frames can look like a chord.
- `CHORD_CLARITY_MAX = 0.97`: single notes have MPM clarity ≈ 1.0, chords 0.4–0.93.
- `RMS_GATE`, `CLARITY_GATE`, `*_CONFIRM` and `SILENCE_FRAMES` live in the detection-smoothing block.

## Testing (no test suite is committed; these recipes were used)

1. **Algorithms in Node:** slice the script between `const MIN_FREQ` and `// ---------- staff rendering`, then wrap it in `new Function(body + '; return {detectPitch, detectNotes, identifyChord}')`. Synthesize harmonic tones, apply a Blackman window + FFT, and convert to dB (magnitude / N) to mimic `AnalyserNode.getFloatFrequencyData`. Expect correct names for C, Am, G7, C/E, D, F (low), B♭7, Bdim and a two-hand C; single notes, two-note intervals and octaves must give no chord.
2. **Rendering:** make a copy of the page that calls `window.__show({type:'chord', chord: __identifyChord([52,55,60]), midis:[52,55,60]})`. Then run
   `google-chrome --headless=new --virtual-time-budget=3000 --window-size=760,1000 --screenshot=out.png file://…`.
3. **End-to-end with a fake mic:** launch Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=x.wav --autoplay-policy=no-user-gesture-required --remote-debugging-port=…`. Auto-click `#start` and read `#letter` / `#alt` over the DevTools protocol (Node 24 has a global `WebSocket`). A WAV of an Am chord followed by d' was detected correctly.

4. **Real samples:** `samples/` has one recording per button of the owner's Edeophone, named `<links|rechts>_Spalte<col>_<row>_<note><octave>` (no octave suffix = 4, `1` = 5, `2` = 6, `-1` = 3). Play each one through the page as a fake mic (override `getUserMedia` with a `MediaStreamDestination` stream), and expect only that note. Chords can be tested by mixing samples with `ffmpeg -filter_complex amix=inputs=N:normalize=0`. As of V3: all 50 single notes are correct, and 22 of 23 mixed chords/intervals are correct. The miss is F3 + F4/A4/C5: the C5 reed's fundamental is weak and is subtracted as F3's 3rd harmonic.

## Deployment

- Repo: `git@github.com:Vvalter/concertina.git` (public), branch `main`.
- Intended host: GitHub Pages from `main` / root, at https://vvalter.github.io/concertina/.
  As of 2026-09-28 Pages was **not yet enabled**. The settings page wouldn't load for the owner, and `gh` isn't installed here. With `gh`, run:
  `gh api -X POST repos/Vvalter/concertina/pages -f "source[branch]=main" -f "source[path]=/"`.
- The microphone needs a secure context (HTTPS or `http://localhost`). For local dev: `python3 -m http.server`.

## Open ideas / follow-ups

- Verify the Maccann octave mapping and the detection thresholds on a real instrument.
- Optional German naming (H for B, B for B♭, cis/es…).
- Optionally allow other Maccann layouts (e.g. the standard 46-button one from Gaskins) via a selector.
- Right-hand notes that duplicate left-hand overtones can go missing from the staff and button display (the chord name is still right).
