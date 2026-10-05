// End-to-end tests: the real index.html in headless Chrome, with the recordings in samples/ played into
// it as a fake microphone (several at once for chords), and the play mode's output measured.
// Cases run in parallel, one Chrome per worker, since every recording has to play in real time.
//
//   node tests/run.mjs                 all cases
//   node tests/run.mjs chord practice  only cases whose group or name contains one of the words
//   node tests/run.mjs -j 4            number of parallel Chrome instances (default 6)
//
// Needs Node 22+ (global WebSocket) and Google Chrome (or set CHROME=/path/to/chrome).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const jIdx = args.indexOf('-j');
const JOBS = jIdx >= 0 ? Number(args.splice(jIdx, 2)[1]) : 6;
const filters = args;

// ---------- cases ----------
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const sharp = n => n.replace(/^([A-G])b/, (_, l) => NAMES[(PC[l] + 11) % 12]);  // Eb -> D#, as displayed with sharps
// File names: <links|rechts>_Spalte<col>_<row>_<note><octave: none = 4, 1 = 5, 2 = 6, -1 = 3>
const sampleMidi = name => {
  const [, l, a, o] = name.split('_')[3].match(/^([A-G])(#|b)?(-?\d)?$/);
  return 12 * (5 + Number(o || 0)) + PC[l] + (a === '#' ? 1 : a === 'b' ? -1 : 0);
};
const samples = fs.readdirSync(path.join(ROOT, 'samples')).filter(f => f.endsWith('.m4a')).map(f => f.slice(0, -4)).sort();

// Chords mixed from single recordings: [expected chord (sharps; '-' = no chord), samples, known failure]
const CHORDS = [
  ['C', 'rechts_Spalte2_1_C rechts_Spalte3_2_E rechts_Spalte2_2_G'],
  ['C', 'links_Spalte2_1_C-1 links_Spalte2_2_G-1 links_Spalte3_4_E'],
  ['C', 'links_Spalte2_1_C-1 rechts_Spalte2_1_C rechts_Spalte3_2_E rechts_Spalte2_2_G'],
  ['C', 'links_Spalte2_1_C-1 rechts_Spalte3_2_E rechts_Spalte2_2_G rechts_Spalte2_3_C1'],
  ['C/E', 'links_Spalte3_2_E-1 rechts_Spalte2_1_C rechts_Spalte2_2_G'],
  ['Am', 'links_Spalte3_3_A-1 links_Spalte2_3_C links_Spalte3_4_E'],
  ['Am', 'links_Spalte3_3_A-1 rechts_Spalte3_3_A rechts_Spalte2_3_C1 rechts_Spalte3_4_E1'],
  ['F', 'links_Spalte5_1_F-1 links_Spalte3_3_A-1 links_Spalte2_3_C'],
  ['F', 'links_Spalte5_1_F-1 rechts_Spalte5_1_F rechts_Spalte3_3_A rechts_Spalte2_3_C1',
    'the C5 reed has a weak fundamental and is subtracted as the 3rd harmonic of F3'],
  ['G', 'links_Spalte2_2_G-1 links_Spalte5_2_B-1 rechts_Spalte4_1_D'],
  ['G7', 'links_Spalte2_2_G-1 rechts_Spalte5_2_B rechts_Spalte4_3_D1 rechts_Spalte5_3_F1'],
  ['G7', 'rechts_Spalte2_2_G rechts_Spalte5_2_B rechts_Spalte4_3_D1 rechts_Spalte5_3_F1'],
  ['D', 'rechts_Spalte4_1_D rechts_Spalte6_1_F# rechts_Spalte3_3_A'],
  ['Dm', 'rechts_Spalte4_1_D rechts_Spalte5_1_F rechts_Spalte3_3_A'],
  ['Em', 'rechts_Spalte3_2_E rechts_Spalte2_2_G rechts_Spalte5_2_B'],
  ['D#', 'rechts_Spalte3_1_Eb rechts_Spalte2_2_G rechts_Spalte6_2_Bb'],
  ['A#', 'links_Spalte6_2_Bb-1 rechts_Spalte4_1_D rechts_Spalte5_1_F'],
  ['Bdim', 'links_Spalte5_2_B-1 rechts_Spalte4_1_D rechts_Spalte5_1_F'],
  ['A', 'rechts_Spalte3_3_A rechts_Spalte1_3_C#1 rechts_Spalte3_4_E1'],
  ['C', 'rechts_Spalte2_3_C1 rechts_Spalte3_4_E1 rechts_Spalte2_4_G1'],
  ['-', 'rechts_Spalte2_1_C rechts_Spalte3_2_E'],
  ['-', 'rechts_Spalte2_1_C rechts_Spalte2_2_G'],
  ['-', 'links_Spalte2_1_C-1 rechts_Spalte2_1_C'],
];
const chordLabel = files => files.map(f => noteName(sampleMidi(f))).join('+');

// shown: the display states while sounding, as { text, chord }
const fmt = shown => shown.map(s => s.text + (s.chord ? ' (chord)' : '')).join(', ') || 'nothing';
const cases = [];
const SETTINGS = { helm: false, flats: false };  // displayed as C#4 / C#m, easy to compare

for (const f of samples) {
  const want = noteName(sampleMidi(f));
  cases.push({ group: 'single', name: f, settings: SETTINGS, files: [f], check: ({ shown }) =>
    shown.length && shown.every(s => !s.chord && s.text === want) ? null : `expected only ${want}, shown: ${fmt(shown)}` });
}
for (const [want, list, known] of CHORDS) {
  const files = list.split(' ');
  cases.push({ group: 'chord', name: `${want} ${chordLabel(files)}`, settings: SETTINGS, files, known, check: ({ shown }) => {
    const chords = shown.filter(s => s.chord);
    if (want === '-') return chords.length ? `expected no chord, shown: ${fmt(shown)}` : null;
    return chords.length && chords.every(c => c.text === want) ? null : `expected ${want}, shown: ${fmt(shown)}`;
  } });
}
// "Notes only" switches chord detection off
for (const [want, list] of CHORDS.filter(c => c[0] !== '-').slice(0, 6)) {
  const files = list.split(' ');
  cases.push({ group: 'notes-only', name: `${want} ${chordLabel(files)}`, settings: { ...SETTINGS, chords: false }, files,
    check: ({ shown }) => shown.some(s => s.chord) ? `expected no chord, shown: ${fmt(shown)}` : null });
}
// Practice mode: the expected message must appear, and a "Falsch" only where one is expected
const PRACTICE = [
  ['C-Dur', CHORDS[0][1], /^Richtig/], ['C-Dur', CHORDS[1][1], /^Richtig/], ['C-Dur', CHORDS[2][1], /^Richtig/],
  ['C-Dur', 'rechts_Spalte2_1_C', /^Gut so weit – es fehlt noch: E G$/], ['C-Dur', CHORDS[20][1], /^Gut so weit – es fehlt noch: G$/],
  ['C-Dur', CHORDS[5][1], /^Falsch: A3 /], ['C-Dur', 'rechts_Spalte6_1_F#', /^Falsch: F♯4 /],
  ['a-Moll', CHORDS[5][1], /^Richtig/], ['a-Moll', CHORDS[6][1], /^Richtig/], ['a-Moll', CHORDS[0][1], /^Falsch: G4 /],
  ['G7', CHORDS[11][1], /^Richtig/], ['G7', CHORDS[10][1], /^Richtig/], ['G7', CHORDS[9][1], /^Gut so weit – es fehlt noch: F$/],
];
for (const [chord, list, want] of PRACTICE) {
  const files = list.split(' ');
  cases.push({ group: 'practice', name: `${chord} ← ${chordLabel(files)}`, settings: { ...SETTINGS, practice: chord }, files,
    check: ({ msgs }) => msgs.some(m => want.test(m)) && (/Falsch/.test(want.source) || !msgs.some(m => /^Falsch/.test(m)))
      ? null : `expected ${want}, messages: ${msgs.join(' / ')}` });
}
// Every single note against C-Dur: chord tones are "so far so good", the rest are "wrong" (and red)
for (const f of samples) {
  const m = sampleMidi(f), inC = [0, 4, 7].includes(m % 12);
  cases.push({ group: 'practice-single', name: f, settings: { ...SETTINGS, practice: 'C-Dur' }, files: [f], check: ({ msgs, good, bad }) => {
    const n = noteName(m).replace('#', '♯');
    return inC ? (msgs.every(x => /^Gut so weit/.test(x)) && good.join() === n ? null : `messages: ${msgs.join(' / ')}, green: ${good}`)
      : (msgs.every(x => /^Falsch/.test(x)) && bad.join() === n && !good.length ? null : `messages: ${msgs.join(' / ')}, red: ${bad}, green: ${good}`);
  } });
}
cases.push({ group: 'play', name: 'tap buttons', settings: SETTINGS, play: true });

const selected = cases.filter(c => !filters.length || filters.some(w => c.group.includes(w) || c.name.includes(w)));

// ---------- static server for the repo ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.m4a': 'audio/mp4', '.css': 'text/css', '.pdf': 'application/pdf' };
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://localhost:${server.address().port}`;

// ---------- Chrome workers ----------
// Fake microphone (plays recordings, several at once) and a tap on the play mode's output
const INJECT = `
  window.__micCtx = null; window.__micDest = null;
  navigator.mediaDevices.getUserMedia = async () => {
    window.__micCtx = new AudioContext(); window.__micDest = window.__micCtx.createMediaStreamDestination();
    return window.__micDest.stream;
  };
  window.__play = async names => {
    const ctx = window.__micCtx;
    const bufs = await Promise.all(names.map(async n =>
      ctx.decodeAudioData(await (await fetch('samples/' + encodeURIComponent(n) + '.m4a')).arrayBuffer())));
    const t = ctx.currentTime + 0.05;
    await Promise.all(bufs.map(b => new Promise(r => {
      const s = ctx.createBufferSource(); s.buffer = b; s.connect(window.__micDest); s.onended = r; s.start(t);
    })));
  };
  const origCompressor = AudioContext.prototype.createDynamicsCompressor;
  AudioContext.prototype.createDynamicsCompressor = function () {
    const c = origCompressor.call(this), a = this.createAnalyser();
    a.fftSize = 2048; c.connect(a); window.__out = a; window.__outCtx = this; return c;
  };
  // Record every distinct display state
  window.__log = [];
  addEventListener('DOMContentLoaded', () => {
    const txt = id => document.getElementById(id).textContent;
    const cls = c => [...document.querySelectorAll('.maccann .btn.' + c + ' text')].map(t => t.textContent).join(' ');
    new MutationObserver(() => {
      const s = { chord: document.getElementById('letter').classList.contains('chord'), letter: txt('letter').replace(/♯/g, '#').replace(/♭/g, 'b'), stale: document.getElementById('nameBox').classList.contains('stale'),
        msg: document.getElementById('practiceMsg').hidden ? '' : txt('practiceMsg'), good: cls('good'), bad: cls('bad'), on: cls('on') };
      const last = window.__log.at(-1);
      if (!last || JSON.stringify(last) !== JSON.stringify(s)) window.__log.push(s);
    }).observe(document.querySelector('main'), { subtree: true, attributes: true, childList: true, characterData: true });
  });`;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CHROME = process.env.CHROME || 'google-chrome';

async function startWorker(n) {
  const port = 9400 + n + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'concertina-test-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 100 && !target; i++) {
    await sleep(100);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page'); } catch { }
  }
  if (!target) throw new Error(`Chrome did not start (${CHROME})`);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });
  let id = 0; const pend = new Map(); const errors = [];
  ws.onmessage = m => {
    const d = JSON.parse(m.data);
    if (d.id && pend.has(d.id)) { pend.get(d.id)(d); pend.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
  };
  const cdp = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async expr => {
    const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result.result.value;
  };
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('Page.addScriptToEvaluateOnNewDocument', { source: INJECT });
  const open = async () => {
    await cdp('Page.navigate', { url: `${ORIGIN}/index.html` });
    for (let i = 0; i < 100 && await ev('document.readyState').catch(() => '') !== 'complete'; i++) await sleep(20);
  };
  await open();
  const close = () => { ws.close(); proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500); };
  return { ev, open, errors, close };
}

async function runCase(w, c) {
  await w.ev(`localStorage.setItem('noteListener.settings', ${JSON.stringify(JSON.stringify(c.settings))})`);
  await w.open();
  w.errors.length = 0;
  if (c.play) return runPlayCase(w);
  await w.ev(`document.getElementById('start').click()`);
  await sleep(150);
  await w.ev(`window.__play(${JSON.stringify(c.files)})`);
  await sleep(450);  // let the page notice the silence
  const log = await w.ev('window.__log');
  const shown = [];
  for (const s of log) {
    if (s.stale || s.letter === '–') continue;
    const last = shown.at(-1);
    if (!last || last.text !== s.letter || last.chord !== s.chord) shown.push({ text: s.letter, chord: s.chord });
  }
  const msgs = [...new Set(log.map(s => s.msg).filter(m => m && !/: links /.test(m)))];
  const lit = key => [...new Set(log.flatMap(s => s[key].split(' ')).filter(Boolean))];
  const err = c.check({ shown, msgs, good: lit('good'), bad: lit('bad') });
  return w.errors.length ? `page error: ${w.errors[0]}` : err;
}

// Play mode: each tapped button must sound at its pitch until tapped again
async function runPlayCase(w) {
  await w.ev(`document.getElementById('btnPlay').click()`);
  const tap = (hand, sci) => w.ev(`[...document.querySelectorAll('.maccann .btn')]
    .find((g, i) => (i < 25) === ${hand === 'L'} && g.querySelector('text').textContent === ${JSON.stringify(sci)})
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  const measure = () => w.ev(`(async () => {
    const buf = new Float32Array(2048), out = [];
    for (let i = 0; i < 12; i++) { window.__out.getFloatTimeDomainData(buf); out.push(window.__detectPitch(buf, window.__outCtx.sampleRate)); await new Promise(r => setTimeout(r, 25)); }
    const f = out.filter(o => o.freq > 0).map(o => o.freq).sort((a, b) => a - b);
    return { rms: Math.max(...out.map(o => o.rms)), freq: f[f.length >> 1] || 0, clarity: Math.min(...out.map(o => o.clarity)) };
  })()`);
  const problems = [];
  // C3 and C5 have recordings, D3 doesn't (re-pitched), F6 is the top button
  for (const [hand, sci, midi] of [['L', 'C3', 48], ['L', 'D3', 50], ['L', 'C5', 72], ['R', 'F6', 89]]) {
    await tap(hand, sci);
    await sleep(500);
    const m = await measure();
    const cents = 1200 * Math.log2(m.freq / (440 * 2 ** ((midi - 69) / 12)));
    if (!(Math.abs(cents) < 20) || m.clarity < 0.95) problems.push(`${sci}: ${m.freq.toFixed(1)} Hz (${cents.toFixed(0)}¢), clarity ${m.clarity.toFixed(3)}`);
    await tap(hand, sci);
    await sleep(250);
    if ((await measure()).rms > 0.001) problems.push(`${sci} still sounding after the second tap`);
  }
  await tap('R', 'C4'); await tap('R', 'E4'); await tap('R', 'G4');
  await sleep(300);
  const shown = await w.ev(`document.getElementById('letter').textContent`);
  if (shown !== 'C') problems.push(`C4+E4+G4 shows ${shown}, expected C`);
  await w.ev(`document.getElementById('btnListen').click()`);
  await sleep(250);
  if ((await measure()).rms > 0.001) problems.push('still sounding after switching to Microphone');
  if (w.errors.length) problems.push(`page error: ${w.errors[0]}`);
  return problems.join('; ') || null;
}

// ---------- run ----------
const t0 = Date.now();
console.log(`${selected.length} cases on ${Math.min(JOBS, selected.length)} Chrome instances…`);
const queue = [...selected];
const results = new Map();
await Promise.all(Array.from({ length: Math.min(JOBS, selected.length) }, async (_, n) => {
  const w = await startWorker(n);
  try {
    for (let c; (c = queue.shift());) {
      let err;
      try { err = await runCase(w, c); } catch (e) { err = String(e.message || e); }
      results.set(c, err);
      process.stdout.write(err ? (c.known ? 'x' : 'F') : '.');
    }
  } finally { w.close(); }
}));
server.close();

console.log('\n');
let failed = 0, known = 0;
for (const c of selected) {
  const err = results.get(c);
  if (!err) continue;
  if (c.known) { known++; console.log(`known  [${c.group}] ${c.name}: ${err}\n         (${c.known})`); }
  else { failed++; console.log(`FAIL   [${c.group}] ${c.name}: ${err}`); }
}
console.log(`\n${selected.length - failed - known} passed, ${failed} failed, ${known} known failures` +
  ` in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
process.exit(failed ? 1 : 0);
