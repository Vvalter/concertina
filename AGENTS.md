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
| polyphonic detection | `detectNotes(dbSpectrum, sr, fftSize, a4)`: peak-picks a 16384-point FFT, assigns peaks to the nearest note (±35 cents), then walks upward subtracting each peak's expected overtones (`OVERTONES` table). `identifyChord(midis)` template-matches against `CHORD_TYPES`. |
| staff rendering | `drawStaff(midis, flats)` draws the grand staff as SVG. Notes ≥ middle C go on treble, lower ones on bass. It handles ledger lines, second-interval head offsets, stacked accidentals, and 8va for ≥ C7. |
| Maccann keyboard | `MACCANN` holds the button positions. `drawMaccann(midis)` highlights buttons and writes the L/R legend. |
| UI state | `current` is `{type:'note', midi}` or `{type:'chord', chord, midis}`. `render(sound)` draws everything. The note-history row is also here. |
| audio | `getUserMedia` (echo cancellation, noise suppression and AGC all **off**; they wreck instrument audio). Two `AnalyserNode`s: 2048 for the monophonic path, 16384 for chords. |
| loop | Per animation frame: gate on RMS. If MPM clarity < `CHORD_CLARITY_MAX`, try chord detection first; otherwise fall back to a single note. A result must repeat for `NOTE_CONFIRM` / `CHORD_CONFIRM` frames before it is shown. |

Test hooks at the bottom of the script: `window.__detectPitch`, `window.__show(sound)` and `window.__identifyChord`.

## Maccann layout: source and caveats

- Button positions are traced from Robert Gaskins, *How to Play Chords on Any MacCann Duet Concertina* (2001), p. 3, the 46-button chart:
  http://www.concertina.com/gaskins/chords/Gaskins-How-to-Play-Chords-on-Any-MacCann-Duet-Concertina-3.pdf
  (Use plain http; https is refused. `pdftotext -bbox` gives the label coordinates.)
- Only the ~45 "core" buttons common to almost all Maccanns are included. Larger instruments (55/57/62/67/72/81 buttons) add more; see pp. 20–48 of the same PDF.
- **Unverified assumption:** Gaskins' unmarked octave is taken to be middle C (C4). That gives a left hand of C3–C5 and a right hand of G4–G6. The owner has not yet confirmed this on the real instrument. If it's off by an octave, shift every note in `MACCANN`.
- The diagram bottom is toward the hand rest (as in Gaskins' charts).

## Tuning knobs (chord / note detection)

- `OVERTONES` (semitone offset and max overtone:fundamental ratio). Higher ratios suppress more spurious notes but also swallow real notes that coincide with overtones, e.g. right hand C5/E5/G5 over left hand C3. The current values were chosen by testing two synthetic timbres (reedy: 2nd harmonic 2× the fundamental; balanced). Not yet tuned on a real concertina.
- Note thresholds inside `detectNotes`: a peak must be ≥ 12 % of the loudest peak to count as a note; peaks down to 3 % still subtract overtones.
- `CHORD_CLARITY_MAX = 0.97`: single notes have MPM clarity ≈ 1.0, chords 0.4–0.93.
- `RMS_GATE`, `CLARITY_GATE`, `*_CONFIRM` and `SILENCE_FRAMES` live in the detection-smoothing block.

## Testing (no test suite is committed; these recipes were used)

1. **Algorithms in Node:** slice the script between `const MIN_FREQ` and `// ---------- staff rendering`, then wrap it in `new Function(body + '; return {detectPitch, detectNotes, identifyChord}')`. Synthesize harmonic tones, apply a Blackman window + FFT, and convert to dB (magnitude / N) to mimic `AnalyserNode.getFloatFrequencyData`. Expect correct names for C, Am, G7, C/E, D, F (low), B♭7, Bdim and a two-hand C; single notes, two-note intervals and octaves must give no chord.
2. **Rendering:** make a copy of the page that calls `window.__show({type:'chord', chord: __identifyChord([52,55,60]), midis:[52,55,60]})`. Then run
   `google-chrome --headless=new --virtual-time-budget=3000 --window-size=760,1000 --screenshot=out.png file://…`.
3. **End-to-end with a fake mic:** launch Chrome with `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=x.wav --autoplay-policy=no-user-gesture-required --remote-debugging-port=…`. Auto-click `#start` and read `#letter` / `#alt` over the DevTools protocol (Node 24 has a global `WebSocket`). A WAV of an Am chord followed by d' was detected correctly.

Nothing has been tested with a real concertina yet. That is the most valuable next step.

## Deployment

- Repo: `git@github.com:Vvalter/concertina.git` (public), branch `main`.
- Intended host: GitHub Pages from `main` / root, at https://vvalter.github.io/concertina/.
  As of 2026-09-28 Pages was **not yet enabled**. The settings page wouldn't load for the owner, and `gh` isn't installed here. With `gh`, run:
  `gh api -X POST repos/Vvalter/concertina/pages -f "source[branch]=main" -f "source[path]=/"`.
- The microphone needs a secure context (HTTPS or `http://localhost`). For local dev: `python3 -m http.server`.

## Open ideas / follow-ups

- Verify the Maccann octave mapping and the detection thresholds on a real instrument.
- Optional German naming (H for B, B for B♭, cis/es…).
- Support larger Maccann layouts (selectable button count).
- Right-hand notes that duplicate left-hand overtones can go missing from the staff and button display (the chord name is still right).
