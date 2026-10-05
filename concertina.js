// Shared by the pages: note naming, the owner's Edeophone keyboard, and its recordings in samples/.
// Exposes window.Concertina.
(() => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- note naming ----------
  const LETTERS = 'CDEFGAB';
  // [letter index, accidental] per pitch class
  const SHARP_MAP = [[0,0],[0,1],[1,0],[1,1],[2,0],[3,0],[3,1],[4,0],[4,1],[5,0],[5,1],[6,0]];
  const FLAT_MAP  = [[0,0],[1,-1],[1,0],[2,-1],[2,0],[3,0],[4,-1],[4,0],[5,-1],[5,0],[6,-1],[6,0]];
  const ACC = { '-1': '♭', '0': '', '1': '♯' };

  function spell(midi, flats) {
    const pc = ((midi % 12) + 12) % 12;
    const octave = Math.floor(midi / 12) - 1;
    const [li, acc] = (flats ? FLAT_MAP : SHARP_MAP)[pc];
    // Helmholtz / German octave names: c = kleine Oktave (C3), c' = eingestrichen (C4),
    // c'' = zweigestrichen, C = große Oktave (C2), C₁ = Kontra, C₂ = Subkontra
    const helmLetter = octave >= 3 ? LETTERS[li].toLowerCase() : LETTERS[li];
    const primes = octave >= 4 ? "'".repeat(octave - 3) : '';
    const sub = octave <= 1 ? '₀₁₂₃'[2 - octave] || '' : '';
    return {
      letter: LETTERS[li], letterIndex: li, acc, octave,
      text: LETTERS[li] + ACC[acc] + octave,
      helmLetter, primes, sub,
      helmText: helmLetter + ACC[acc] + primes + sub,
    };
  }
  const label = (sp, helm) => helm ? sp.helmText : sp.text;

  // ---------- Maccann duet keyboard ----------
  // The owner's instrument: Lachenal Edeophone (Maccann system), 55 keys, Nr. 2570, traced from
  // Lachenal_Edeophone_55key_Nr2570-3.pdf. [x, y, note] in the PDF's coordinates (points);
  // the bottom of each hand is toward the hand rest. Chart octave marks: none = 4, ¹ = 5, ² = 6, ⁻¹ = 3.
  const MACCANN = {
    left: [
      [66.6,314.1,'G#4'], [66.6,370.8,'C#4'], [66.6,427.5,'G#3'], [66.6,484.2,'C#3'],
      [120.5,297.1,'G4'], [120.5,353.8,'C4'], [120.5,410.5,'G3'], [120.5,467.2,'C3'],
      [174.3,280.1,'B4'], [174.3,336.8,'E4'], [174.3,393.5,'A3'], [174.3,450.2,'E3'], [174.3,506.9,'Eb3'],
      [228.2,257.4,'Bb4'], [228.2,314.1,'A4'], [228.2,370.8,'D4'], [228.2,427.5,'Eb4'], [228.2,484.2,'D3'],
      [282.0,297.1,'C5'], [282.0,353.8,'F4'], [282.0,410.5,'B3'], [282.0,467.2,'F3'],
      [335.9,368.0,'F#4'], [335.9,424.7,'Bb3'], [335.9,481.4,'F#3'],
    ],
    right: [
      [506.0,257.4,'Eb6'], [506.0,314.1,'G#5'], [506.0,370.8,'C#5'], [506.0,427.5,'G#4'], [506.0,484.2,'C#4'],
      [559.8,240.4,'D6'], [559.8,297.1,'G5'], [559.8,353.8,'C5'], [559.8,410.5,'G4'], [559.8,467.2,'C4'],
      [613.7,223.4,'E6'], [613.7,280.1,'B5'], [613.7,336.8,'E5'], [613.7,393.5,'A4'], [613.7,450.2,'E4'], [613.7,506.9,'Eb4'],
      [667.6,257.4,'Bb5'], [667.6,314.1,'A5'], [667.6,370.8,'D5'], [667.6,427.5,'Eb5'], [667.6,484.2,'D4'],
      [721.4,240.4,'F6'], [721.4,297.1,'C6'], [721.4,353.8,'F5'], [721.4,410.5,'B4'], [721.4,467.2,'F4'],
      [775.3,311.3,'C#6'], [775.3,368.0,'F#5'], [775.3,424.7,'Bb4'], [775.3,481.4,'F#4'],
    ],
  };
  const AIR_BUTTON = [452, 506.6];
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const toMidi = n => {
    const [, l, a, o] = n.match(/^([A-G])(#|b)?(\d)$/);
    return 12 * (+o + 1) + PC[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0);
  };
  // Draws the keyboard into `svg`; returns the buttons as { midi, hand, g, t } (t: the label, filled in by the page)
  function buildMaccann(svg) {
    const buttons = [];
    const svgEl = (name, attrs, parent = svg) => {
      const e = document.createElementNS(SVG_NS, name);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      parent.appendChild(e);
      return e;
    };
    const X = x => (x - 20) * 1.25, Y = y => (y - 200) * 1.25 + 60;
    svgEl('text', { class: 'hand', x: X(201), y: 30 }).textContent = 'Left hand';
    svgEl('text', { class: 'hand', x: X(641), y: 30 }).textContent = 'Right hand';
    svgEl('text', { class: 'hint', x: X(201), y: 512 }).textContent = '↓ hand rest';
    svgEl('text', { class: 'hint', x: X(641), y: 512 }).textContent = '↓ hand rest';
    const air = svgEl('g', { class: 'air' });
    svgEl('circle', { cx: X(AIR_BUTTON[0]), cy: Y(AIR_BUTTON[1]), r: 20 }, air);
    svgEl('text', { x: X(AIR_BUTTON[0]), y: Y(AIR_BUTTON[1]) }, air).textContent = 'AIR';
    for (const hand of ['left', 'right']) {
      for (const [x, y, note] of MACCANN[hand]) {
        const midi = toMidi(note);
        const g = svgEl('g', { class: 'btn' + (note.length > 2 ? ' accidental' : '') });
        svgEl('circle', { cx: X(x), cy: Y(y), r: 27 }, g);
        const t = svgEl('text', { x: X(x), y: Y(y) }, g);
        svgEl('title', {}, g);
        buttons.push({ midi, g, t, hand });
      }
    }
    return buttons;
  }

  // ---------- recordings ----------
  // One recording per button of the owner's Edeophone (samples/), named
  // <links|rechts>_Spalte<column>_<row>_<note><octave: none = 4, 1 = 5, 2 = 6, -1 = 3>.
  const SAMPLE_FILES = `links_Spalte1_1_C#-1 links_Spalte1_2_G#-1 links_Spalte1_3_C# links_Spalte1_4_G#
    links_Spalte2_1_C-1 links_Spalte2_2_G-1 links_Spalte2_3_C links_Spalte2_4_G links_Spalte3_1_Eb-1
    links_Spalte3_2_E-1 links_Spalte3_3_A-1 links_Spalte3_4_E links_Spalte3_5_B links_Spalte5_1_F-1
    links_Spalte5_2_B-1 links_Spalte5_3_F links_Spalte5_4_C1 links_Spalte6_1_F#-1 links_Spalte6_2_Bb-1
    links_Spalte6_3_F# rechts_Spalte1_1_C# rechts_Spalte1_2_G# rechts_Spalte1_3_C#1 rechts_Spalte1_4_G#1
    rechts_Spalte1_5_Eb2 rechts_Spalte2_1_C rechts_Spalte2_2_G rechts_Spalte2_3_C1 rechts_Spalte2_4_G1
    rechts_Spalte2_5_D2 rechts_Spalte3_1_Eb rechts_Spalte3_2_E rechts_Spalte3_3_A rechts_Spalte3_4_E1
    rechts_Spalte3_5_B1 rechts_Spalte3_6_E2 rechts_Spalte4_1_D rechts_Spalte4_2_Eb1 rechts_Spalte4_3_D1
    rechts_Spalte4_4_A1 rechts_Spalte4_5_Bb1 rechts_Spalte5_1_F rechts_Spalte5_2_B rechts_Spalte5_3_F1
    rechts_Spalte5_4_C2 rechts_Spalte5_5_F2 rechts_Spalte6_1_F# rechts_Spalte6_2_Bb rechts_Spalte6_3_F#1
    rechts_Spalte6_4_C#2`.split(/\s+/).map(name => {
      const [hand, , , note] = name.split('_');
      const [, n, oct] = note.match(/^([A-G][#b]?)(-?\d)?$/);
      return { name, hand: hand === 'links' ? 'left' : 'right', midi: toMidi(n + (4 + Number(oct || 0))) };
    });
  // Buttons without their own recording use the same note from the other hand, or else the nearest
  // recording of the same hand, re-pitched.
  function sampleFor(b) {
    const same = SAMPLE_FILES.find(f => f.hand === b.hand && f.midi === b.midi) ||
      SAMPLE_FILES.find(f => f.midi === b.midi);
    if (same) return { file: same, rate: 1 };
    const near = SAMPLE_FILES.filter(f => f.hand === b.hand)
      .sort((x, y) => Math.abs(x.midi - b.midi) - Math.abs(y.midi - b.midi))[0];
    return { file: near, rate: Math.pow(2, (b.midi - near.midi) / 12) };
  }

  // The steady part of a recording: the longest stretch at >= 60 % of the peak loudness, attack and
  // release cut off (at most 1.3 s), with its loudness evened out.
  function steadyPart(x, sr) {
    const hop = Math.round(sr * 0.01), win = Math.round(sr * 0.05);
    const env = [];
    for (let i = 0; i + win <= x.length; i += hop) {
      let e = 0;
      for (let j = i; j < i + win; j++) e += x[j] * x[j];
      env.push(Math.sqrt(e / win));
    }
    const peak = Math.max(...env);
    let run = [0, 0];
    for (let i = 0; i < env.length;) {
      if (env[i] < 0.6 * peak) { i++; continue; }
      let j = i;
      while (j < env.length && env[j] >= 0.6 * peak) j++;
      if (j - i > run[1] - run[0]) run = [i, j];
      i = j;
    }
    const s0 = (run[0] + 5) * hop, s1 = Math.min(x.length, (run[1] - 5) * hop + win, s0 + Math.round(sr * 1.3));
    const loudness = i => {  // envelope at sample i, interpolated between analysis windows
      const p = Math.max(0, (i - win / 2) / hop), k = Math.min(env.length - 1, Math.floor(p));
      const k2 = Math.min(env.length - 1, k + 1), f = Math.min(1, p - k);
      return Math.max(1e-4, env[k] * (1 - f) + env[k2] * f);
    };
    const y = new Float32Array(Math.max(0, s1 - s0));
    for (let i = 0; i < y.length; i++) y[i] = x[s0 + i] / loudness(s0 + i);
    return y;
  }

  // Similarity of y[a..] and y[b..] over n samples (normalised correlation, every `step`-th sample)
  function match(y, a, b, n, step = 1) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i += step) { const u = y[a + i], v = y[b + i]; ab += u * v; aa += u * u; bb += v * v; }
    return ab / Math.sqrt(aa * bb || 1);
  }

  // A seamless loop from a recording, about `seconds` long. Repeating one short stretch is audible
  // (some recordings are steady for only ~0.5 s and still change slowly), so the loop is a chain of
  // 0.15-0.3 s pieces from random places in the steady part. Each piece starts where its waveform
  // matches the sound it replaces (best of a few places, aligned within one period), cross-faded over 60 ms; the last
  // piece is cut so that it also flows into the first. Returns samples at a common loudness.
  function makeLoop(x, sr, seconds = 3) {
    const y = steadyPart(x, sr);
    const fade = Math.round(sr * 0.06), CANDIDATES = 6;
    // Period of the tone (first autocorrelation peak near the highest), to know how far to search
    const mid = Math.max(0, (y.length >> 1) - 1024), n = Math.min(2048, y.length - mid - Math.ceil(sr / 60));
    const lo = Math.floor(sr / 1500), hi = Math.ceil(sr / 60), acf = [];
    for (let lag = lo; lag <= hi; lag++) acf[lag] = match(y, mid, mid + lag, n, 2);
    const top = Math.max(...acf.slice(lo));
    let period = Math.round(sr / 200);
    for (let lag = lo + 1; lag < hi; lag++) {
      if (acf[lag] >= 0.9 * top && acf[lag] >= acf[lag - 1] && acf[lag] >= acf[lag + 1]) { period = lag; break; }
    }
    let seed = 12345;
    const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const minG = Math.round(sr * 0.15), maxG = Math.round(sr * 0.3);
    const room = y.length - fade - period;   // a piece y[q .. q + len + fade) must fit
    if (room < minG + period) {              // too short to cut up: loop it as a whole
      const len = y.length - fade, out = new Float32Array(len);
      for (let i = 0; i < len; i++) out[i] = i < fade ? y[i] * (i / fade) + y[len + i] * (1 - i / fade) : y[i];
      return normalise(out);
    }
    // Start for continuing from y[from..]: the best-matching of a few random places, each aligned
    // within one period
    const bestStart = from => {
      let best = 0, bc = -2;
      for (let k = 0; k < CANDIDATES; k++) {
        const q = Math.floor(random() * (room - minG));
        for (let c = Math.max(0, q - period); c <= Math.min(room - minG, q + period); c++) {
          const v = match(y, from, c, fade, 3);
          if (v > bc) { bc = v; best = c; }
        }
      }
      return best;
    };
    const pieces = [];  // [source start, length]
    let total = 0, q = Math.floor(random() * (room - minG));
    const target = Math.round(sr * seconds);
    while (true) {
      let len = Math.min(minG + Math.floor(random() * (maxG - minG)), room - q);
      if (total + len >= target - minG) {
        // Last piece: end where its continuation matches the first piece's start
        let best = len, bc = -2;
        for (let L = Math.max(minG >> 1, len - period); L <= Math.min(room - q, len + period); L++) {
          const v = match(y, q + L, pieces[0][0], fade, 3);
          if (v > bc) { bc = v; best = L; }
        }
        pieces.push([q, best]);
        total += best;
        break;
      }
      pieces.push([q, len]);
      total += len;
      // Next piece: random place, aligned with what would have followed this one
      q = bestStart(q + len);
    }
    const out = new Float32Array(total);
    let pos = 0;
    for (const [src, len] of pieces) {
      for (let i = 0; i < len + fade; i++) {
        const w = i < fade ? i / fade : i >= len ? 1 - (i - len) / fade : 1;
        out[(pos + i) % total] += y[src + i] * w;
      }
      pos += len;
    }
    return normalise(out);
  }

  function normalise(out) {
    let rms = 0;
    for (const v of out) rms += v * v;
    const gain = 0.12 / Math.sqrt(rms / out.length || 1);
    for (let i = 0; i < out.length; i++) out[i] *= gain;
    return out;
  }

  // The loop for one of SAMPLE_FILES, as an AudioBuffer of `ctx`
  async function loadLoop(ctx, file) {
    const res = await fetch('samples/' + encodeURIComponent(file.name) + '.m4a');
    const buf = await ctx.decodeAudioData(await res.arrayBuffer());
    const loop = makeLoop(buf.getChannelData(0), buf.sampleRate);
    const out = ctx.createBuffer(1, loop.length, buf.sampleRate);
    out.copyToChannel(loop, 0);
    return out;
  }

  // Loops for one AudioContext, made on first use; a failed load is tried again next time
  function loopCache(ctx) {
    const loops = new Map();
    return file => {
      if (!loops.has(file.name)) loops.set(file.name, loadLoop(ctx, file).catch(err => { loops.delete(file.name); throw err; }));
      return loops.get(file.name);
    };
  }

  // Plays a loop from time `t` to `end` into `dest` at `level`, with short fades so notes don't click.
  // Returns { src, gain } so the note can be cut off early.
  function playNote(ctx, dest, buffer, rate, t, end, level = 1) {
    const src = ctx.createBufferSource(), gain = ctx.createGain();
    src.buffer = buffer;
    src.loop = true;
    src.playbackRate.value = rate;
    const fade = Math.min(0.03, (end - t) / 4);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + fade);
    gain.gain.setValueAtTime(level, end - fade);
    gain.gain.linearRampToValueAtTime(0, end);
    src.connect(gain).connect(dest);
    src.start(t);
    src.stop(end + 0.05);
    return { src, gain };
  }

  window.Concertina = {
    SVG_NS, LETTERS, ACC, spell, label, MACCANN, toMidi, buildMaccann, SAMPLE_FILES, sampleFor, makeLoop, loadLoop, loopCache, playNote,
  };
})();
