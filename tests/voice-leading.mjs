// Checks backing.html's chorale: bar lengths, voice ranges, voice order (S ≥ A ≥ T ≥ B) and parallel
// fifths/octaves between any two voices, for all versions. Usage: node tests/voice-leading.mjs backing.html
import fs from 'fs';
const src = fs.readFileSync(process.argv[2], 'utf8');
const body = src.slice(src.indexOf('const SOPRANO'), src.indexOf('const VARIANTS'));
const { SOPRANO, PLAIN, MOVING, GRIFFIG, ZWEI } = new Function(body + '; return { SOPRANO, PLAIN, MOVING, GRIFFIG, ZWEI };')();
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const midi = n => { const [, l, o] = n.match(/^([A-G])(\d)$/); return 12 * (+o + 1) + PC[l]; };
const RANGE = { S: [60, 69], A: [59, 65], T: [52, 60], B: [48, 55] };
// ZWEI (two voices in the left hand): no alto, the upper line is checked as the tenor and may go up to E4
const zwei = ZWEI.map(([t, b]) => ['r:4', t, b]);
for (const [name, V] of [['plain', PLAIN], ['moving', MOVING], ['griffig', GRIFFIG], ['zwei', zwei]]) {
  RANGE.A[0] = name === 'griffig' ? 55 : 59;   // Griffig: the alto is in the left hand and may go down to G3
  RANGE.T[1] = name === 'zwei' ? 64 : 60;
  const voices = { S: [], A: [], T: [], B: [] };
  SOPRANO.forEach((s, bar) => {
    [['S', s], ['A', V[bar][0]], ['T', V[bar][1]], ['B', V[bar][2]]].forEach(([v, line]) => {
      let beat = bar * 4, sum = 0;
      for (const tok of line.split(/\s+/)) { const [n, len] = tok.split(':'); const m = n === 'r' ? null : midi(n);
        if (m !== null && (m < RANGE[v][0] || m > RANGE[v][1])) console.log(`${name} bar ${bar} ${v}: ${n} out of range`);
        voices[v].push({ beat, len: +len, m }); beat += +len; sum += +len; }
      if (sum !== 4) console.log(`${name} bar ${bar} ${v}: ${sum} beats`);
    });
  });
  const at = (v, b) => voices[v].find(e => e.beat <= b && b < e.beat + e.len)?.m ?? null;
  const onsets = [...new Set(Object.values(voices).flat().map(e => e.beat))].sort((a, b) => a - b);
  const order = ['S', 'A', 'T', 'B'];
  for (let i = 0; i < onsets.length; i++) {
    const b = onsets[i], where = `${name} bar ${Math.floor(b / 4)} beat ${b % 4 + 1}`;
    const sounding = order.filter(v => at(v, b) !== null);
    for (let k = 0; k + 1 < sounding.length; k++) { const hi = at(sounding[k], b), lo = at(sounding[k + 1], b);
      if (hi < lo) console.log(`${where}: ${sounding[k]} below ${sounding[k + 1]}`); }
    if (i === 0) continue;
    const a = onsets[i - 1];
    for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) {
      const [X, Y] = [order[x], order[y]];
      const x0 = at(X, a), y0 = at(Y, a), x1 = at(X, b), y1 = at(Y, b);
      if ([x0, y0, x1, y1].includes(null) || x0 === x1 || y0 === y1) continue;
      const i0 = ((x0 - y0) % 12 + 12) % 12, i1 = ((x1 - y1) % 12 + 12) % 12;
      if (i0 === i1 && (i1 === 0 || i1 === 7)) console.log(`${where}: parallel ${i1 ? 'fifths' : 'octaves/unisons'} ${X}/${Y}`);
    }
  }
}
console.log('done');
