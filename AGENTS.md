# Agent notes: Note Listener (concertina)

A single-page web app that listens to an instrument through the microphone and shows:
- the note being played (letter name, Helmholtz `c'` style or scientific `C4` style) and how far it is off in cents,
- chords (name, e.g. `Am`, `G7`, `C/E`, and the individual notes),
- the notes on a grand staff (treble + bass clef),
- which button(s) to press on a **Maccann duet concertina**.

The owner plays a Maccann duet concertina and is German-speaking (hence the Helmholtz notation: c' = "eingestrichenes c").

## Layout

No build step, no dependencies, no npm packages. The only external resource is the Noto Music font from Google Fonts (clefs and ♯/♭ glyphs); it falls back to local fonts.

- `index.html`: the Note Listener (inline CSS and one inline `<script>` IIFE, sections below).
- `song.html`: plays "Hänschen klein" from the recordings, highlights each note in the score (with lyrics) and its right-hand button, and shows the next button dashed. Tempo slider (remembered), click a note to start there, space bar plays/stops. The song is the `SONG.notes` string (`<note><octave>:<quarters>:<syllable>`, bars split by `|`); more songs can use the same format. Uses the ♯/♭ and c'/C4 choice saved by the main page.
- `duet.html`: "Hänschen klein – Duett", an arrangement for duet concertina. The melody is an octave up in the right hand, the left hand plays an oom-pah bass (C/G7). The middle part is soft, in thirds over held chords, then a crescendo; the last verse is loud with a ritardando. The final note and the ending chord use a bellows shake (7 Hz tremolo). It is drawn on a grand staff (R treble, L bass); both hands' buttons light up, the next ones dashed. The arrangement is the `BARS` table (one line per bar per hand; `+` for chords, `r` for rests), plus `LEVEL` (bellows level per bar), `SLOW` (ritardando) and `SHAKE` per bar. Both hands play through one "bellows" gain: a swell over each two-bar phrase and a short dip at each bellows reversal.
- `concertina.js` (`window.Concertina`): shared by both pages. Contains note naming (`spell`, `label`), the Edeophone layout (`MACCANN`, `buildMaccann(svg)`), and the recordings (`SAMPLE_FILES`, `sampleFor`, `makeLoop`, `loadLoop(ctx, file)`, `loopCache(ctx)`, `playNote(...)`).
- `concertina.css`: shared colours, layout basics, controls and the button-diagram styles.
- `samples/`: one recording per button (see Testing for the names). Play mode and the song page need them deployed too.

Both pages load the shared files as `concertina.js?v=V5` / `concertina.css?v=V5`. **Update that query together with the version label**, so GitHub Pages' cache can't pair a new page with old shared files.

`index.html` script sections, in order (search for `// ----------`):

| Section | What it does |
|---|---|
| note naming | `spell(midi, flats)` gives the letter, accidental, octave and Helmholtz name. `label(sp, helm)` picks the display style. |
| pitch detection | `detectPitch(buf, sr)`: McLeod Pitch Method (NSDF) on a 2048-sample time buffer. Returns `{rms, freq, clarity}`. |
| polyphonic detection | `detectNotes(dbSpectrum, sr, fftSize, a4)`: peak-picks a 16384-point FFT, assigns peaks to the nearest note (±35 cents), then walks upward subtracting each peak's expected overtones (`OVERTONES` table). Notes on a 2nd–10th harmonic of a lower peak are flagged `overtone`. `findChord(notes)` needs at least two pitch classes from unflagged notes and only uses flagged octaves/fifths to complete a chord. `identifyChord(midis)` template-matches against `CHORD_TYPES`. |
| staff rendering | `drawStaff(midis, flats)` draws the grand staff as SVG. Notes ≥ middle C go on treble, lower ones on bass. It handles ledger lines, second-interval head offsets, stacked accidentals, and 8va for ≥ C7. |
| Maccann keyboard | `MACCANN` holds the button positions (Edeophone 55-key). `drawMaccann(midis)` highlights buttons and writes the L/R legend. |
| UI state | `current` is `{type:'note', midi}` or `{type:'chord', chord, midis}`. `render(sound)` draws everything. The note-history row is also here. |
| chord practice | "Akkord üben" dropdown (`PRACTICE_CHORDS`, German names). `startPractice` outlines a close root-position grip per hand (left from octave 3, right from octave 4); `drawMaccann` defers to `drawPractice` while practising. `setPracticeHeard` turns heard buttons green/red and writes the German verdict; while notes only drop out the verdict stays. Exit with × Beenden, "– aus –" or Esc. |
| settings | `saveSettings()` stores ♯/♭, c'/C4, chords on/off, A4, practice chord and mode in `localStorage` (`noteListener.settings`); restored at the end of the script. |
| audio | `getUserMedia` (echo cancellation, noise suppression and AGC all **off**; they wreck instrument audio). Two `AnalyserNode`s: 2048 for the monophonic path, 16384 for chords. |
| play mode | "Microphone / Play buttons" switch. Tapping a diagram button toggles a looped recording from `samples/` (`SAMPLE_FILES`; buttons without one borrow the other hand's or a re-pitched neighbour). `makeLoop` (concertina.js) builds a ~3 s loop per note: from the longest steady stretch (loudness flattened) it chains 0.15–0.3 s pieces taken from random places, each joined where the waveform matches best (60 ms crossfade), so no short pattern repeats. About 30 ms per note; 50 loops are ~26 MB of audio. Needs http(s): browsers block `fetch` on `file://`. |
| loop | Per animation frame: gate on RMS. If chords are on (`useChords`, the "Notes + chords / Notes only" switch) and MPM clarity < `CHORD_CLARITY_MAX`, try chord detection first; otherwise fall back to a single note. A result must repeat for `NOTE_CONFIRM` / `CHORD_CONFIRM` frames before it is shown. |

The version label (`#version`, currently `V5`) is in the `<h1>`. **Bump it with every change that gets pushed.** It shows the owner which version is loaded, and it drives the update check: on load, and when the tab becomes visible again (at most once a minute), the page re-fetches itself with `fetch(location.href, {cache: 'reload'})`. That bypasses GitHub Pages' 10-minute `max-age` and refreshes the browser cache. If the fetched `#version` differs, it shows a "new version available – Reload" bar. It is skipped on `file://`.

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

## Testing

`node tests/run.mjs` (about a minute; `-j N` sets parallel Chrome instances, default 6; extra words filter cases by group or name, e.g. `node tests/run.mjs chord practice`). It serves the repo, opens the unmodified `index.html` in headless Chrome, and plays recordings from `samples/` into it as a fake microphone (several at once for chords). Groups:
- `single`: each of the 50 recordings must show only its own note.
- `chord`: 23 chords and intervals mixed from recordings must show the right chord, intervals no chord. One known failure: F3 + F4/A4/C5 (the C5 reed's weak fundamental is subtracted as F3's 3rd harmonic).
- `notes-only`: with chord detection off, no chord is shown.
- `practice`, `practice-single`: practice-mode verdicts and green/red buttons.
- `play`: tapped buttons sound at the right pitch until tapped again; switching to Microphone stops them.
- `song`: song.html highlights the notes in order, the right button is lit, and the right pitch sounds.
- `song` (Duett): duet.html lights both hands' buttons, the bellows-shake bar pulses at ~7 Hz, and playback stops at the end.

Sample names: `<links|rechts>_Spalte<col>_<row>_<note><octave>` (no octave suffix = 4, `1` = 5, `2` = 6, `-1` = 3). The left hand's column 4 (D3, E♭4, D4, A4, B♭4) has no recordings. Needs Node 22+ and Google Chrome (`CHROME=` to override).

For a quick algorithm check without a browser, slice the script between `const MIN_FREQ` and `// ---------- staff rendering` and wrap it in `new Function(body + '; return {detectPitch, detectNotes, findChord, identifyChord}')`.

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
