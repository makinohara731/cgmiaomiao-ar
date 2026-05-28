// All procedural audio — SFX synthesizers + generative BGM.
//
// The module is "pure": it doesn't reach into globals. The host wires
// dependencies via configure(); after that, every play* function just
// reads from the local closures.
//
// Why a module-level config object rather than a class? The play*
// functions are called from many places in main.js; making them plain
// functions keeps call-site noise minimal while still letting the host
// swap mute state / unlock state without re-importing.

const cfg = {
  isMuted:   () => false,
  hasBgmUnlock: () => false,
};

let audioCtx = null;

export function configure(opts) {
  if (typeof opts.isMuted === "function")      cfg.isMuted = opts.isMuted;
  if (typeof opts.hasBgmUnlock === "function") cfg.hasBgmUnlock = opts.hasBgmUnlock;
}

export function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}
export function getAudioCtx() { return audioCtx; }

// =====================================================================
// One-shot SFX
// =====================================================================

export function playMeow() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.45);
  lfo.frequency.value = 12;
  lfoGain.gain.value = 25;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
  gain.gain.setValueAtTime(0.18, now + 0.3);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.65);
  lfo.start(now); lfo.stop(now + 0.65);
}

export function playHit() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const bufSize = ctx.sampleRate * 0.2;
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufSize);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 800;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  src.connect(filter).connect(gain).connect(ctx.destination);
  src.start(now);
}

export function playHurt() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.4);
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.55);
}

export function playPurr() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  osc.type = "sawtooth"; osc.frequency.value = 32;
  lfo.frequency.value = 23; lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.18, now + 0.2);
  gain.gain.setValueAtTime(0.18, now + 1.2);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 1.65);
  lfo.start(now); lfo.stop(now + 1.65);
}

export function playYawn() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(330, now);
  osc.frequency.exponentialRampToValueAtTime(520, now + 0.4);
  osc.frequency.exponentialRampToValueAtTime(240, now + 1.0);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.13, now + 0.15);
  gain.gain.linearRampToValueAtTime(0.001, now + 1.05);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 1.08);
}

export function playChirp() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  [[680, 0.0], [880, 0.085]].forEach(([freq, t0]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + t0);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.18, now + t0 + 0.07);
    gain.gain.setValueAtTime(0, now + t0);
    gain.gain.linearRampToValueAtTime(0.13, now + t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t0 + 0.1);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t0); osc.stop(now + t0 + 0.12);
  });
}

export function playSparkle() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  [[880, 0.0], [1175, 0.07], [1568, 0.14], [2093, 0.22]].forEach(([f, t0]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine"; osc.frequency.value = f;
    gain.gain.setValueAtTime(0, now + t0);
    gain.gain.linearRampToValueAtTime(0.09, now + t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t0 + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t0); osc.stop(now + t0 + 0.36);
  });
}

export function playEat() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const o1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  o1.type = "triangle"; o1.frequency.value = 180;
  g1.gain.setValueAtTime(0, now);
  g1.gain.linearRampToValueAtTime(0.12, now + 0.02);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  o1.connect(g1).connect(ctx.destination);
  o1.start(now); o1.stop(now + 0.16);
  const o2 = ctx.createOscillator();
  const g2 = ctx.createGain();
  o2.type = "sine";
  o2.frequency.setValueAtTime(420, now + 0.18);
  o2.frequency.exponentialRampToValueAtTime(720, now + 0.32);
  g2.gain.setValueAtTime(0, now + 0.18);
  g2.gain.linearRampToValueAtTime(0.07, now + 0.21);
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.34);
  o2.connect(g2).connect(ctx.destination);
  o2.start(now + 0.18); o2.stop(now + 0.36);
}

export function playPurrLong() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  osc.type = "sawtooth"; osc.frequency.value = 32;
  lfo.frequency.value = 21; lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.3);
  gain.gain.setValueAtTime(0.16, now + 2.4);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 3.4);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 3.5);
  lfo.start(now); lfo.stop(now + 3.5);
}

export function playTrill() {
  if (cfg.isMuted()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(520, now);
  osc.frequency.exponentialRampToValueAtTime(960, now + 0.4);
  lfo.frequency.value = 28;
  lfoGain.gain.value = 55;
  lfo.connect(lfoGain).connect(osc.frequency);
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.55);
  lfo.start(now); lfo.stop(now + 0.55);
}

// =====================================================================
// Generative BGM — see ar/CHANGELOG.md v3.
// =====================================================================
const BGM_CHORDS = {
  day:   [261.63, 329.63, 392.00],
  night: [220.00, 261.63, 329.63],
};
const bgm = { running: false, nodes: [], master: null, theme: null, lfo: null, lfoGain: null };

export function startBGM(theme = "day") {
  if (bgm.running && bgm.theme === theme) return;
  if (bgm.running) stopBGM(0);
  if (cfg.isMuted()) return;
  if (!cfg.hasBgmUnlock()) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(0.06, now + 1.2);
  master.connect(ctx.destination);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = theme === "night" ? 900 : 1400;
  filter.Q.value = 0.4;
  filter.connect(master);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.18;
  lfoGain.gain.value = 0.4;
  lfo.connect(lfoGain);
  lfo.start();
  const chord = BGM_CHORDS[theme] || BGM_CHORDS.day;
  const oscs = chord.map((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.5 - 0.08 * i;
    lfoGain.connect(g.gain);
    osc.connect(g).connect(filter);
    osc.start();
    return { osc, g };
  });
  Object.assign(bgm, { running: true, nodes: oscs, master, theme, lfo, lfoGain });
}

export function stopBGM(fadeMs = 600) {
  if (!bgm.running || !bgm.master) { bgm.running = false; return; }
  const ctx = audioCtx;
  if (!ctx) return;
  const now = ctx.currentTime;
  const fade = Math.max(0, fadeMs / 1000);
  try {
    bgm.master.gain.cancelScheduledValues(now);
    bgm.master.gain.setValueAtTime(bgm.master.gain.value, now);
    bgm.master.gain.linearRampToValueAtTime(0.0001, now + fade);
  } catch (_) {}
  setTimeout(() => {
    try { bgm.nodes.forEach(({ osc }) => { osc.stop(); osc.disconnect(); }); } catch (_) {}
    try { bgm.lfo?.stop(); bgm.lfo?.disconnect(); } catch (_) {}
    try { bgm.master?.disconnect(); } catch (_) {}
    bgm.running = false; bgm.nodes = []; bgm.master = null;
  }, fadeMs + 50);
}

export function duckBGM(level = 0.3, holdMs = 1600) {
  if (!bgm.running || !bgm.master || !audioCtx) return;
  const now = audioCtx.currentTime;
  const base = 0.06;
  try {
    bgm.master.gain.cancelScheduledValues(now);
    bgm.master.gain.setValueAtTime(bgm.master.gain.value, now);
    bgm.master.gain.linearRampToValueAtTime(base * level, now + 0.15);
    bgm.master.gain.linearRampToValueAtTime(base, now + 0.15 + holdMs / 1000);
  } catch (_) {}
}

export function bgmRunning() { return bgm.running; }
export function bgmTheme()   { return bgm.theme; }
