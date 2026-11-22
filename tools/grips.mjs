// Finds the "Griffig" accompaniment for backing.html: alto, tenor and bass all in the left hand, one chord
// per beat on backing.html's HARMONY, chosen by dynamic programming over the beats to keep each 3-button
// grip compact on the Edeophone layout (MACCANN in concertina.js) and to move as few buttons as little as
// possible from grip to grip (held notes cost nothing). Hard rules: voice ranges, S ≥ A ≥ T ≥ B, no
// parallel fifths/octaves between any two voices, A–T within an octave, the chord's third present.
// Prints the GRIFFIG table to paste into backing.html, and grip statistics for each version.
// VOICES=2: the two-voice left hand instead (an upper line and the bass under the melody, the third in
// one of the three voices), printed as the ZWEI table (per bar [upper, bass]).
// Bars whose HARMONY is '-' (the pickup) are rests.
// Usage: node tools/grips.mjs  |  VOICES=2 node tools/grips.mjs
import fs from 'fs';
const root = new URL('..', import.meta.url).pathname;
const win = {};
new Function('window', 'document', fs.readFileSync(root + 'concertina.js', 'utf8'))(win, { querySelectorAll: () => [] });
const { MACCANN, toMidi } = win.Concertina;
const html = fs.readFileSync(root + 'backing.html', 'utf8');
const body = html.slice(html.indexOf('const SOPRANO'), html.indexOf('const SECTIONS'));
const { SOPRANO, PLAIN, MOVING, HARMONY } = new Function(body.replace(/const VARIANTS[^\n]*\n/, '') + '; return { SOPRANO, PLAIN, MOVING, HARMONY };')();
const TWO = process.env.VOICES === '2';

const LEFT = new Map(MACCANN.left.map(([x, y, n]) => [toMidi(n), [x, y]]));
const dist = (a, b) => Math.hypot(LEFT.get(a)[0] - LEFT.get(b)[0], LEFT.get(a)[1] - LEFT.get(b)[1]);
const span = g => Math.max(...g.flatMap((a, i) => g.slice(i + 1).map(b => dist(a, b))));
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const name = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
function chord(sym) {   // -> { pcs, third, bass }
  const [, r, q, slash] = sym.match(/^([A-G])(m7|m|7)?(?:\/([A-G]))?$/);
  const root = PC[r], minor = q === 'm' || q === 'm7';
  const pcs = [root, (root + (minor ? 3 : 4)) % 12, (root + 7) % 12];
  if (q === '7' || q === 'm7') pcs.push((root + 10) % 12);
  return { pcs, third: pcs[1], bass: slash ? PC[slash] : root };
}
// One chord per beat
const beats = [];
HARMONY.forEach((h, bar) => {
  const names = h.split(' ');
  for (let i = 0; i < 4; i++) {
    const n = names.length === 1 ? names[0] : names[i];
    beats.push(n === '-' ? beats.at(-1) ?? null : n);
  }
});
// The melody's lowest note in each beat (null: rest), and the note sounding at the beat
const sop = [];
SOPRANO.forEach((line, bar) => { let t = bar * 4; for (const tok of line.split(' ')) { const [n, len] = tok.split(':'); sop.push({ t, len: +len, m: n === 'r' ? null : toMidi(n) }); t += +len; } });
const sopAt = b => sop.find(e => e.t <= b && b < e.t + e.len)?.m ?? null;
// Under a melody rest: the last melody note before it
const sopMin = b => Math.min(...sop.filter(e => e.m !== null && e.t < b + 1 && e.t + e.len > b).map(e => e.m)) ||
  sop.findLast(e => e.m !== null && e.t < b)?.m || 999;
const RANGE = TWO ? { T: [52, 64], B: [48, 55] } : { A: [55, 65], T: [50, 60], B: [48, 55] };   // the alto is in the left hand here, so it may go below C4
const inR = (m, v) => m >= RANGE[v][0] && m <= RANGE[v][1];

function candidates2(b) {
  const c = chord(beats[b]), out = [], fallback = [];
  const ms = [...LEFT.keys()], s = sopMin(b);
  for (const B of ms) for (const T of ms) {
    if (B % 12 !== c.bass || !inR(B, 'B') || !inR(T, 'T') || !c.pcs.includes(T % 12)) continue;
    if (!(B < T) || T >= s || T - B > 19) continue;
    const have = new Set([B, T, sopAt(b)].filter(x => x !== null).map(x => x % 12));
    (have.has(c.third) ? out : fallback).push([T, B]);
  }
  return out.length ? out : fallback;
}
function candidates(b) {
  if (beats[b] === null) return [null];
  if (TWO) return candidates2(b);
  const c = chord(beats[b]), out = [];
  const ms = [...LEFT.keys()];
  for (const B of ms) for (const T of ms) for (const A of ms) {
    if (B % 12 !== c.bass || !inR(B, 'B') || !inR(T, 'T') || !inR(A, 'A')) continue;
    if (!c.pcs.includes(T % 12) || !c.pcs.includes(A % 12)) continue;
    if (!(B < T && T < A) || A - T > 12) continue;
    const s = sopMin(b);
    if (A > s) continue;
    const have = new Set([B, T, A, sopAt(b)].filter(x => x !== null).map(x => x % 12));
    if (!have.has(c.third)) continue;
    if (c.pcs.length === 4 && !have.has(c.pcs[3]) && beats[b].includes('7')) continue;   // 7th chords keep the 7th
    out.push([A, T, B]);
  }
  return out;
}
const parallel = (p, q, sp, sq) => {
  if (!p || !q) return false;
  const v = [[sp, ...p], [sq, ...q]];   // S A T B (S T B with two voices)
  for (let x = 0; x < v[0].length; x++) for (let y = x + 1; y < v[0].length; y++) {
    const [x0, y0, x1, y1] = [v[0][x], v[0][y], v[1][x], v[1][y]];
    if ([x0, y0, x1, y1].includes(null) || x0 === x1 || y0 === y1) continue;
    const i0 = ((x0 - y0) % 12 + 12) % 12, i1 = ((x1 - y1) % 12 + 12) % 12;
    if (i0 === i1 && (i1 === 0 || i1 === 7)) return true;
  }
  return false;
};
// Playability on a Maccann: each finger takes its own column, so a grip is easy when its buttons are in
// different columns, within four neighbouring columns (3 gaps of ~54 pt) and not stretched far vertically.
// Two buttons in one column (one finger for two, or crossed fingers) is the main thing to avoid.
const COL = 54, ROW = 57, W_Y = Number(process.env.W_Y ?? 4);
function gripInfo(g) {
  const pts = g.map(m => LEFT.get(m)), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  // Pairs in one column: neighbours (a fifth apart) are manageable, with a button between them they are not
  let near = 0, far = 0;
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
    if (Math.abs(xs[i] - xs[j]) > 5) continue;
    if (Math.abs(ys[i] - ys[j]) < 1.5 * ROW) near++; else far++;
  }
  return { cols: Math.round((Math.max(...xs) - Math.min(...xs)) / COL) + 1, ySpan: Math.max(...ys) - Math.min(...ys), near, far };
}
const gripCost = g => {
  if (!g) return 0;
  const low = TWO && g[0] < 55 ? 40 : 0;   // two voices: an upper line below G3 sounds thick over the bass
  return low + gripCost3(g);
};
const gripCost3 = g => {
  const { cols, ySpan, near, far } = gripInfo(g);
  return 250 * far + 30 * near + 80 * Math.max(0, cols - 4) + W_Y * Math.max(0, ySpan - 2 * ROW) + 0.3 * span(g);
};
const moveCost = (p, q) => !p || !q ? 0 : p.reduce((s, m, i) => s + (m === q[i] ? 0 : 25 + dist(m, q[i])), 0);
// DP
const cand = beats.map((_, b) => candidates(b));
let prev = cand[0].map(g => ({ cost: gripCost(g), path: [g] }));
for (let b = 1; b < beats.length; b++) {
  const next = [];
  for (const g of cand[b]) {
    let best = null;
    for (const p of prev) {
      const last = p.path.at(-1);
      if (parallel(last, g, sopAt(b - 0.01), sopAt(b))) continue;   // the melody note just before this beat
      const c = p.cost + moveCost(last, g);
      if (!best || c < best.c) best = { c, p };
    }
    if (best) next.push({ cost: best.c + gripCost(g), path: [...best.p.path, g] });
  }
  if (!next.length) throw new Error(`no voicing at beat ${b} (${beats[b]}): ${cand[b].length} candidates, ${prev.length} paths into it, e.g. ${JSON.stringify(cand[b].slice(0, 4))} after ${JSON.stringify(prev.slice(0, 4).map(p => p.path.at(-1)))}, S ${sopAt(b - 1)}→${sopAt(b)}`);
  prev = next;
}
const best = prev.reduce((a, b) => (a.cost < b.cost ? a : b)).path;
// Back to per-bar lines, holding a repeated note within the bar
const lines = [];
for (let bar = 0; bar < SOPRANO.length; bar++) {
  lines.push((TWO ? [0, 1] : [0, 1, 2]).map(v => {
    const toks = [];
    for (let i = 0; i < 4; i++) {
      const m = best[bar * 4 + i]?.[v] ?? null;
      if (toks.length && toks.at(-1).m === m) toks.at(-1).len++; else toks.push({ m, len: 1 });
    }
    return toks.map(t => `${t.m === null ? 'r' : name(t.m)}:${t.len}`).join(' ');
  }));
}
console.log(`  const ${TWO ? 'ZWEI' : 'GRIFFIG'} = [`);
for (const l of lines) console.log(`    [${l.map(x => `'${x}'`).join(', ')}],`);
console.log('  ];');
// Statistics: per version, the left hand's grips at each beat (all three voices left)
function stats(V) {
  const grips = [];
  V.forEach((bar, i) => {
    const at = (line, beat) => { let t = 0; for (const tok of line.split(' ')) { const [n, len] = tok.split(':'); if (t <= beat && beat < t + +len) return n === 'r' ? undefined : toMidi(n); t += +len; } };
    for (let k = 0; k < 4; k++) grips.push(bar.map(line => at(line, k)));
  });
  for (let i = grips.length - 1; i >= 0; i--) if (grips[i].includes(undefined)) grips.splice(i, 1);
  const info = grips.map(gripInfo), spans = grips.map(span), moves = grips.slice(1).map((g, i) => g.filter((m, j) => m !== grips[i][j]).length);
  return `same column with a gap: ${info.filter(i => i.far).length} beats, same column neighbours: ${info.filter(i => i.near).length}, wider than 4 columns: ${info.filter(i => i.cols > 4).length}, ` +
    `vertical stretch > 2 rows: ${info.filter(i => i.ySpan > 2 * ROW).length}, mean span ${(spans.reduce((a, b) => a + b) / spans.length).toFixed(0)} pt, ` +
    `buttons changed per beat ${(moves.reduce((a, b) => a + b) / moves.length).toFixed(2)}`;
}
if (!TWO) console.error('plain  :', stats(PLAIN));
console.error(TWO ? 'zwei   :' : 'griffig:', stats(lines));
if (process.env.WIDE) best.forEach((g, b) => { if (g && gripInfo(g).far || gripInfo(g).ySpan > 2 * ROW) console.error(`beat ${b} bar ${Math.floor(b / 4)}.${b % 4 + 1} ${beats[b]}: ${g.map(name).join(' ')} span ${span(g).toFixed(0)} ${JSON.stringify(gripInfo(g))}`); });
