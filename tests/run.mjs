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
  // Jazz and blues: a 9th chord is complete without its 5th, and the 5th isn't wrong either
  ['C9', 'rechts_Spalte2_1_C rechts_Spalte3_2_E rechts_Spalte6_2_Bb rechts_Spalte4_3_D1', /^Richtig/],
  ['C9', 'rechts_Spalte2_1_C rechts_Spalte3_2_E rechts_Spalte2_2_G rechts_Spalte6_2_Bb rechts_Spalte4_3_D1', /^Richtig/],
  ['C9', 'rechts_Spalte2_1_C rechts_Spalte3_2_E', /^Gut so weit – es fehlt noch: B D$/],
  ['Hm7♭5', 'rechts_Spalte5_2_B rechts_Spalte5_1_F', /^Gut so weit – es fehlt noch: D A$/],
  ['A9', 'rechts_Spalte3_3_A', /^Gut so weit – es fehlt noch: Cis G H$/],
  ['Cmaj7', 'rechts_Spalte2_1_C rechts_Spalte3_2_E rechts_Spalte2_2_G rechts_Spalte5_2_B', /^Richtig/],
  ['Cmaj7', CHORDS[12][1].replace('rechts_Spalte6_1_F#', 'rechts_Spalte6_2_Bb'), /^Falsch/],
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
cases.push({ group: 'practice', name: 'staff and Anhören', settings: { ...SETTINGS, practice: 'C9' }, hear: true });
cases.push({ group: 'mic', name: 'paused and lost microphone', settings: SETTINGS, mic: true });
cases.push({ group: 'song', name: 'Hänschen klein', settings: SETTINGS, song: true });
cases.push({ group: 'song', name: 'Hänschen klein – Duett', settings: SETTINGS, duet: true });

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
    if (!document.getElementById('nameBox')) return;  // only the main page
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

// Close every Chrome even when the run is interrupted (Ctrl-C, timeout), so none are left running
const chromes = new Set();
process.on('exit', () => { for (const c of chromes) c.kill(); });
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(130));

async function startWorker(n) {
  const port = 9400 + n + Math.floor(Math.random() * 400);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'concertina-test-'));
  const proc = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--autoplay-policy=no-user-gesture-required', '--no-first-run', '--mute-audio', 'about:blank'], { stdio: 'ignore' });
  chromes.add(proc);
  proc.on('exit', () => chromes.delete(proc));
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
  const open = async (page = 'index.html') => {
    await cdp('Page.navigate', { url: `${ORIGIN}/${page}` });
    for (let i = 0; i < 100 && await ev('document.readyState').catch(() => '') !== 'complete'; i++) await sleep(20);
  };
  await open();
  const close = () => { ws.close(); proc.kill(); setTimeout(() => fs.rmSync(profile, { recursive: true, force: true }), 500); };
  return { ev, open, errors, close };
}

async function runCase(w, c) {
  await w.ev(`localStorage.setItem('noteListener.settings', ${JSON.stringify(JSON.stringify(c.settings))})`);
  if (c.song) await w.ev(`localStorage.setItem('noteListener.songTempo', '160')`);
  if (c.duet) await w.ev(`localStorage.setItem('noteListener.duetTempo', '160')`);
  await w.open(c.song ? 'song.html' : c.duet ? 'duet.html' : 'index.html');
  w.errors.length = 0;
  if (c.play) return runPlayCase(w);
  if (c.mic) return runMicCase(w);
  if (c.hear) return runHearCase(w);
  if (c.song) return runSongCase(w);
  if (c.duet) return runDuetCase(w);
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

// A phone pausing the microphone (screen lock, another app) or ending it: the page must say so, stop
// showing the old note, and listen again after a tap or with a new stream
async function runMicCase(w) {
  const problems = [];
  const status = () => w.ev(`document.getElementById('status').textContent`);
  const letter = () => w.ev(`document.getElementById('nameBox').classList.contains('stale') ? 'stale' :
    document.getElementById('letter').textContent`);
  const playNote = async (file, want, when) => {
    await w.ev(`window.__log.length = 0`);
    await w.ev(`window.__play(${JSON.stringify([file])})`);
    const seen = await w.ev(`window.__log.filter(s => !s.stale).map(s => s.letter)`);
    if (!seen.includes(want)) problems.push(`${when}: expected ${want}, shown: ${seen.join(', ') || 'nothing'}`);
  };
  await w.ev(`document.getElementById('start').click()`);
  await sleep(150);
  await playNote('rechts_Spalte2_1_C', 'C4', 'before the pause');

  await w.ev(`window.__mic().ctx.suspend()`);
  await sleep(100);
  if (!/paused/.test(await status())) problems.push(`suspended: status is "${await status()}"`);
  if (await letter() !== 'stale') problems.push('suspended: the old note is still shown as current');
  await w.ev(`document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))`);
  await sleep(150);
  if (!/Listening/.test(await status())) problems.push(`after a tap: status is "${await status()}"`);
  await playNote('rechts_Spalte2_2_G', 'G4', 'after resuming');

  const oldStream = await w.ev(`(window.__oldStream = window.__mic().stream, true)`);
  await w.ev(`window.__mic().stream.getAudioTracks()[0].dispatchEvent(new Event('ended'))`);
  await sleep(300);
  if (!oldStream || await w.ev(`window.__mic().stream === window.__oldStream || !window.__mic().ctx`))
    problems.push('ended track: no new microphone stream');
  await playNote('rechts_Spalte3_2_E', 'E4', 'after the track ended');
  if (w.errors.length) problems.push(`page error: ${w.errors[0]}`);
  return problems.join('; ') || null;
}

// Chord practice: the chord's grip is on the staff, heard grip notes turn green there, and the
// "Anhören" button sounds the chord only while it is held down
async function runHearCase(w) {
  const problems = [];
  const staff = () => w.ev(`[...document.querySelectorAll('#staff .head')].map(h => h.getAttribute('class').trim()).join(',')`);
  const letter = await w.ev(`document.getElementById('letter').textContent`);
  if (letter !== 'C9') problems.push(`top shows ${letter}, expected C9`);
  if (await staff() !== 'head,head,head,head,head,head,head,head') problems.push(`staff before playing: ${await staff()}`);
  await w.ev(`document.getElementById('start').click()`);
  await sleep(150);
  await w.ev(`window.__play(['rechts_Spalte3_2_E']).then(() => window.__done = true), true`);
  await sleep(700);
  // The grip is C3 E3 B♭3 D4 C4 E4 B♭4 D5: E4, the 6th head, is green, the rest plain
  const lit = await staff();
  if (lit !== 'head,head,head,head,head,head good,head,head') problems.push(`staff while E4 sounds: ${lit}`);
  while (!await w.ev('window.__done')) await sleep(100);
  await w.ev(`document.getElementById('start').click()`);  // stop listening

  const hear = await w.ev(`document.getElementById('practiceHear')`).then(() => true).catch(() => false);
  if (!hear) problems.push('no Anhören button');
  const rms = () => w.ev(`(async () => {
    const buf = new Float32Array(2048); let m = 0;
    for (let i = 0; i < 8; i++) { window.__out.getFloatTimeDomainData(buf); m = Math.max(m, window.__detectPitch(buf, window.__outCtx.sampleRate).rms); await new Promise(r => setTimeout(r, 25)); }
    return m;
  })()`);
  const press = type => w.ev(`document.getElementById('practiceHear').dispatchEvent(new PointerEvent('${type}', { bubbles: true, pointerId: 1 }))`);
  await press('pointerdown');
  await sleep(800);
  const held = await rms();
  if (!(held > 0.01)) problems.push(`held: output level ${held}`);
  await press('pointerup');
  await sleep(300);
  const after = await rms();
  if (after > 0.001) problems.push(`released: still sounding (${after})`);
  if (w.errors.length) problems.push(`page error: ${w.errors[0]}`);
  return problems.join('; ') || null;
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

// Song page: start from the 3rd line ("A-ber Mut-ter wei-net sehr, hat ja nun kein …") and check that each
// highlighted note is the one sounding, in order, and that its button is lit
const SONG_FROM = 24, SONG_MELODY = [62, 62, 62, 62, 62, 64, 65, 64, 64, 64, 64, 64, 65, 67];
// Pitch of the output by autocorrelation (the song page has no pitch detector of its own)
const PITCH_JS = `(buf, sr) => {
  let rms = 0; for (const v of buf) rms += v * v; rms = Math.sqrt(rms / buf.length);
  const acf = lag => { let a = 0, m = 0; for (let i = 0; i + lag < buf.length; i++) { a += buf[i] * buf[i + lag]; m += buf[i] * buf[i] + buf[i + lag] * buf[i + lag]; } return m ? 2 * a / m : 0; };
  const lo = Math.floor(sr / 1500), hi = Math.ceil(sr / 70), r = [];
  for (let l = lo; l <= hi; l++) r[l] = acf(l);
  const top = Math.max(...r.slice(lo));
  for (let l = lo + 1; l < hi; l++) if (r[l] >= 0.9 * top && r[l] >= r[l - 1] && r[l] >= r[l + 1]) return { rms, freq: sr / l, clarity: r[l] };
  return { rms, freq: 0, clarity: 0 };
}`;
async function runSongCase(w) {
  const count = await w.ev(`(() => { const all = [...document.querySelectorAll('.score .note')];
    all[${SONG_FROM}].dispatchEvent(new MouseEvent('click', { bubbles: true })); return all.length; })()`);
  if (count !== 49) return `expected 49 notes, found ${count}`;
  const seen = await w.ev(`(async () => {
    const all = [...document.querySelectorAll('.score .note')], buf = new Float32Array(2048), seen = [];
    const pitch = ${PITCH_JS};
    for (let i = 0; i < 110; i++) {
      await new Promise(r => setTimeout(r, 40));
      if (!window.__out) continue;
      window.__out.getFloatTimeDomainData(buf);
      const p = pitch(buf, window.__outCtx.sampleRate);
      seen.push({ k: all.findIndex(n => n.classList.contains('now')),
        on: [...document.querySelectorAll('.maccann .btn.on text')].map(t => t.textContent).join(), ...p });
    }
    document.getElementById('play').click();
    return seen;
  })()`);
  const problems = [];
  const order = seen.map(s => s.k).filter((k, i, a) => k >= 0 && k !== a[i - 1]);
  const want = Array.from({ length: order.length }, (_, i) => SONG_FROM + i);
  if (order.length < 8 || order.join() !== want.join()) problems.push(`highlight order ${order.join(' ')}`);
  // The sounding pitch must match the highlighted note (skipping each note's first frames)
  let checked = 0;
  for (let i = 2; i < seen.length; i++) {
    const s = seen[i];
    // only the middle of a note: the highlight can lag the sound by a frame when the machine is busy
    if (s.k < SONG_FROM || s.k !== seen[i - 1].k || s.k !== seen[i - 2].k || s.k !== seen[i + 1]?.k || s.clarity < 0.9 || s.rms < 0.02) continue;
    const midi = Math.round(69 + 12 * Math.log2(s.freq / 440));
    checked++;
    if (midi !== SONG_MELODY[s.k - SONG_FROM]) problems.push(`note ${s.k}: heard ${midi}, expected ${SONG_MELODY[s.k - SONG_FROM]}`);
  }
  if (checked < 8) problems.push(`only ${checked} frames could be checked`);
  const lit = new Set(seen.filter(s => s.k >= SONG_FROM).map(s => s.on));
  if (![...lit].every(b => ['D4', 'E4', 'F4', 'G4'].includes(b))) problems.push(`lit buttons: ${[...lit].join(' ')}`);
  if (w.errors.length) problems.push(`page error: ${w.errors[0]}`);
  return [...new Set(problems)].join('; ') || null;
}

// Duet page: from "eilt nach Haus ge-" to the end. Both hands' buttons must light up as written, the
// bellows-shake bar (E4 G4 C5 over C3 G3) must pulse at about 7 Hz, and playback must stop at the end.
async function runDuetCase(w) {
  await w.ev(`[...document.querySelectorAll('.score .ev')].find(g => g.textContent === 'eilt')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }))`);
  const seen = await w.ev(`(async () => {
    const seen = [], buf = new Float32Array(256);
    const lit = () => [...document.querySelectorAll('.maccann .btn')].map((g, i) => g.classList.contains('on') ? (i < 25 ? 'L' : 'R') + g.querySelector('text').textContent : '').filter(Boolean).sort().join(' ');
    const t0 = performance.now();
    while (performance.now() - t0 < 9000) {
      await new Promise(r => setTimeout(r, 8));
      if (!window.__out) continue;
      window.__out.fftSize = 256;
      window.__out.getFloatTimeDomainData(buf);
      let e = 0; for (const v of buf) e += v * v;
      seen.push({ t: performance.now() - t0, rms: Math.sqrt(e / buf.length), lit: lit(), section: document.getElementById('nowSection').textContent,
        playing: document.getElementById('play').classList.contains('listening') });
    }
    return seen;
  })()`);
  const problems = [];
  const chords = [...new Set(seen.map(s => s.lit))];
  for (const want of ['LC3 LG3 RC5 RE4 RG4', 'LC3 LC4 LG3 RC6 RE5 RG5', 'LC4 LE3 RC5 RE5'])
    if (!chords.includes(want)) problems.push(`never lit: ${want}`);
  // Bellows shake: loudness swings several times per second during the held chord
  const held = seen.filter(s => s.lit === 'LC3 LG3 RC5 RE4 RG4' && s.rms > 0.005);
  if (held.length < 20) problems.push(`shake bar too short (${held.length} frames)`);
  else {
    const r = held.slice(5).map(s => s.rms), mean = r.reduce((a, b) => a + b) / r.length;
    let crossings = 0;
    for (let i = 1; i < r.length; i++) if ((r[i - 1] - mean) * (r[i] - mean) < 0) crossings++;
    const dur = (held.at(-1).t - held[5].t) / 1000, hz = crossings / 2 / dur;
    const depth = (Math.max(...r) - Math.min(...r)) / mean;
    if (hz < 4 || hz > 11 || depth < 0.4) problems.push(`no bellows shake: ${hz.toFixed(1)} Hz, depth ${depth.toFixed(2)}`);
  }
  if (!seen.some(s => s.section === 'Balgtremolo')) problems.push('section label Balgtremolo never shown');
  if (seen.at(-1).playing) problems.push('still playing after the end');
  if (w.errors.length) problems.push(`page error: ${w.errors[0]}`);
  return problems.join('; ') || null;
}

// ---------- run ----------
const t0 = Date.now();
console.log(`${selected.length} cases on ${Math.min(JOBS, selected.length)} Chrome instances…`);
const queue = [...selected];
const results = new Map();
await Promise.all(Array.from({ length: Math.min(JOBS, selected.length) }, async (_, n) => {
  let w = await startWorker(n);
  try {
    for (let c; (c = queue.shift());) {
      let err, timer;
      // A case that hangs (e.g. a stuck Chrome) fails after a minute; its Chrome is replaced
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timed out after 60 s')), 60000); });
      try { err = await Promise.race([runCase(w, c), timeout]); } catch (e) { err = String(e.message || e); }
      clearTimeout(timer);
      if (err === 'timed out after 60 s') { w.close(); w = await startWorker(n); }
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
