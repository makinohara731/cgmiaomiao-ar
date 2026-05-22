/* main.js — 喵喵精灵 AR · 生命行为引擎 (life behaviour engine)
 *
 * The sprite is no longer a button-driven puppet — it is driven by a small
 * "life" loop:
 *   - energy + mood state that drift over time and respond to interaction
 *   - an autonomous scheduler that interleaves ambient micro-actions
 *     (lookaround / groom / sniff / stretch …) while the sprite is idle
 *   - a drowsy → sleep cycle when it is left alone, woken by a touch
 *   - escalating reactions to taps: 喵 → 招手 → 撒娇+呼噜
 *   - emote bubbles + procedural sound that reflect its mood
 *
 * model-viewer crossfades when animation-name changes, so swapping clips
 * gives smooth transitions for free.
 */

// =====================================================================
// Config
// =====================================================================
const WORKER_URL = "https://cgmiaomiao-asr.makinohara20050410.workers.dev";
const ASR_ENDPOINT  = WORKER_URL ? `${WORKER_URL}/api/asr`  : null;
const CHAT_ENDPOINT = WORKER_URL ? `${WORKER_URL}/api/chat` : null;

// Clip registry — loop:true clips run forever; the rest play once and the
// engine returns the sprite to its base loop afterwards.
const CLIPS = {
  idle:{loop:true},  walk:{loop:true},  run:{loop:true},  sleep:{loop:true},
  attack:{loop:false},   hurt:{loop:false},   wave:{loop:false},
  happy:{loop:false},    jump:{loop:false},   spin:{loop:false},
  backflip:{loop:false}, twirl:{loop:false},
  lookaround:{loop:false}, groom:{loop:false},
  stretch:{loop:false},    sniff:{loop:false},
};
const isLoopClip = (n) => !!(CLIPS[n] && CLIPS[n].loop);

// Chinese voice keyword → animation
const VOICE_MAP = [
  { kw: /走|行走|散步|过来/,            anim: "walk" },
  { kw: /跑|奔跑|快点|加速/,            anim: "run" },
  { kw: /打|攻击|揍|出拳|咬/,           anim: "attack" },
  { kw: /疼|痛|受伤|哎呀|被打/,         anim: "hurt" },
  { kw: /招手|你好|嗨|打招呼/,          anim: "wave" },
  { kw: /撒娇|可爱|乖|抱抱|喜欢你|亲亲/, anim: "happy" },
  { kw: /蹦|跳一下|跳跳/,               anim: "jump" },
  { kw: /转圈|转一圈|旋转/,             anim: "spin" },
  { kw: /空翻|后空翻|翻跟头/,           anim: "backflip" },
  { kw: /旋跳|花式|绝技/,               anim: "twirl" },
  { kw: /睡|困|休息一下|晚安|睡觉/,     anim: "sleep" },
  { kw: /伸懒腰|懒腰|起床|醒醒/,        anim: "stretch" },
  { kw: /舔|洗脸|梳毛|理毛|打理/,       anim: "groom" },
  { kw: /看看|东张西望|四处看|找一找/,  anim: "lookaround" },
  { kw: /闻一闻|嗅|凑近|闻闻/,          anim: "sniff" },
  { kw: /停|站好|发呆|待机|安静|别动/,  anim: "idle" },
];

// =====================================================================
// DOM refs
// =====================================================================
const $ = (sel) => document.querySelector(sel);
const modelViewer = $("#catModel");
const animBar   = $("#animBar");
const micBtn    = $("#micBtn");
const chatBtn   = $("#chatBtn");
const muteBtn   = $("#muteBtn");
const statusEl  = $("#status");
const emoteEl   = $("#emote");
const chatPanel = $("#chatPanel");
const chatClose = $("#chatClose");
const chatLog   = $("#chatLog");
const chatInput = $("#chatInput");
const chatSend  = $("#chatSend");
const loaderEl     = $("#loader");
const onboardEl    = $("#onboard");
const onboardStart = $("#onboardStart");
const sayBubbleEl  = $("#sayBubble");
const sayTextEl    = $("#sayText");
const qrBtn   = $("#qrBtn");
const qrModal = $("#qrModal");
const qrClose = $("#qrClose");
const camBtn  = $("#camBtn");
const camFeed = $("#camFeed");

// =====================================================================
// Life state — the heart of the "motion ecology"
// =====================================================================
const life = {
  energy: 0.85,        // 0..1 — drains while ignored, restored by interaction
  mood:   0.65,        // 0..1 — affection; high mood unlocks playful reactions
  asleep: false,       // dozing — base loop becomes "sleep"
  busyUntil: 0,        // suppresses autonomous behaviour after a user action
  lastInteract: Date.now(),
  petStreak: 0,        // consecutive taps inside the streak window
  petTimer: null,
  totalPets: 0,        // lifetime tap count (persisted)
};

let currentAnim   = "idle";
let isMuted       = false;
let isRecording   = false;
let mediaRecorder = null;
let recordedChunks = [];
let lastShakeAt   = 0;
let oneShotTimer  = null;
let behaviorTimer = null;
let modelReady    = false;

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const pickFrom = (arr) => arr[(Math.random() * arr.length) | 0];
function weightedPick(pairs) {
  const total = pairs.reduce((s, p) => s + p[1], 0);
  let r = Math.random() * total;
  for (const [name, w] of pairs) { if ((r -= w) <= 0) return name; }
  return pairs[0][0];
}
const baseAnim = () => (life.asleep ? "sleep" : "idle");

// =====================================================================
// Persistence — the sprite remembers its state across visits.
//   On return it is a little lonelier (mood drifts down with time away)
//   but rested; if you were gone a long while it dozed off waiting.
// =====================================================================
const LIFE_KEY = "miaomiao.life.v1";

function saveLife() {
  try {
    localStorage.setItem(LIFE_KEY, JSON.stringify({
      energy: life.energy, mood: life.mood, asleep: life.asleep,
      totalPets: life.totalPets, savedAt: Date.now(),
    }));
  } catch (_) { /* storage unavailable — run stateless */ }
}

function loadLife() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LIFE_KEY) || "null"); } catch (_) {}
  if (!saved) return;
  life.totalPets = saved.totalPets || 0;
  life.energy = clamp01(saved.energy != null ? saved.energy : 0.85);
  life.mood   = clamp01(saved.mood   != null ? saved.mood   : 0.65);
  life.asleep = !!saved.asleep;

  const hoursAway = Math.max(0, (Date.now() - (saved.savedAt || Date.now())) / 3600000);
  if (hoursAway > 0.05) {
    life.mood   = clamp01(life.mood   - hoursAway * 0.05);   // misses you a bit
    life.energy = clamp01(life.energy + hoursAway * 0.12);   // but rests up
    if (hoursAway > 2) life.asleep = true;                   // dozed off waiting
  }
}

// =====================================================================
// Status toast + emote bubble
// =====================================================================
let statusHideTimer = null;
function showStatus(msg, duration = 1800) {
  statusEl.textContent = msg;
  statusEl.classList.add("show");
  if (statusHideTimer) clearTimeout(statusHideTimer);
  statusHideTimer = setTimeout(() => statusEl.classList.remove("show"), duration);
}

let emoteTimer = null;
function emote(txt) {
  if (!txt || !emoteEl) return;
  emoteEl.textContent = txt;
  emoteEl.classList.remove("show");
  // restart the pop animation even on a back-to-back emote
  void emoteEl.offsetWidth;
  emoteEl.classList.add("show");
  if (emoteTimer) clearTimeout(emoteTimer);
  emoteTimer = setTimeout(() => emoteEl.classList.remove("show"), 1700);
}

const EMOTE_FOR = {
  lookaround: "❓", groom: "🧼", stretch: "🙆", sniff: "👃",
  happy: "❤️", spin: "✨", jump: "⤴️", wave: "👋",
  walk: "🐾", run: "💨", attack: "💢", hurt: "💧",
};

// =====================================================================
// Animation control
//   model-viewer is async (Lit web component). Setting animation-name then
//   immediately calling play() races and uses the previous clip. Fix: set
//   the attribute, await updateComplete, then play().
//     - https://github.com/google/model-viewer/discussions/4525
//     - https://github.com/google/model-viewer/issues/3144
// =====================================================================
async function playAnim(name) {
  const avail = modelViewer.availableAnimations || [];
  if (!avail.includes(name)) {
    console.warn(`Animation "${name}" missing; falling back to idle.`, avail);
    name = avail.includes("idle") ? "idle" : avail[0];
    if (!name) return;
  }
  currentAnim = name;
  modelViewer.setAttribute("animation-name", name);
  await modelViewer.updateComplete;
  modelViewer.currentTime = 0;

  const loop = isLoopClip(name);
  modelViewer.play({ repetitions: loop ? Infinity : 1 });

  // Only move the active highlight when the clip has a matching button —
  // ambient clips (lookaround/groom…) leave the idle button lit.
  const btn = [...document.querySelectorAll(".anim-btn")]
    .find((b) => b.dataset.anim === name);
  if (btn) {
    document.querySelectorAll(".anim-btn")
      .forEach((b) => b.classList.toggle("active", b === btn));
  }

  if (name === "attack") playHit();
  if (name === "hurt")   playHurt();
  if (name === "happy")  playTrill();

  clearTimeout(oneShotTimer);
  if (!loop) {
    const dur = (modelViewer.duration || 1.2) * 1000;
    oneShotTimer = setTimeout(() => {
      if (currentAnim === name) playAnim(baseAnim());
    }, dur + 90);
  }
}

// A move the *user* explicitly asked for (button / voice / chat).
function userPlay(name) {
  bumpInteract();
  if (name === "sleep") life.asleep = true;
  if (name === "idle" || name === "walk" || name === "run") life.asleep = false;
  emote(EMOTE_FOR[name] || "");
  life.busyUntil = Date.now() + 1600;
  playAnim(name).then(() => {
    life.busyUntil = Date.now() + (modelViewer.duration || 1.2) * 1000 + 400;
  });
}

animBar.querySelectorAll(".anim-btn").forEach((btn) => {
  btn.addEventListener("click", () => userPlay(btn.dataset.anim));
});

// =====================================================================
// Interaction → mood
// =====================================================================
function bumpInteract(amount = 1) {
  life.lastInteract = Date.now();
  life.mood   = clamp01(life.mood   + 0.12 * amount);
  life.energy = clamp01(life.energy + 0.10 * amount);
}

// =====================================================================
// Autonomous behaviour scheduler — the ambient "life"
//   Every few seconds, if the sprite is resting at its base loop and the
//   user is not driving it, pick an ambient micro-action weighted by the
//   current energy/mood. This is what makes it feel alive between moves.
// =====================================================================
function scheduleBehavior() {
  clearTimeout(behaviorTimer);
  const delay = life.asleep
    ? 10000 + Math.random() * 11000   // asleep → long, lazy gaps
    : 3200  + Math.random() * 4800;   // awake  → lively cadence
  behaviorTimer = setTimeout(runBehavior, delay);
}

function runBehavior() {
  scheduleBehavior();                      // always queue the next tick
  if (!modelReady) return;

  const now = Date.now();
  // never interrupt a move in progress or a user-driven action
  if (now < life.busyUntil) return;
  if (currentAnim !== baseAnim()) return;

  if (life.asleep) {
    life.energy = clamp01(life.energy + 0.045);   // resting recharges
    if (Math.random() < 0.45) emote("💤");
    return;
  }

  // awake: slow drift of energy/mood between behaviours
  life.energy = clamp01(life.energy - 0.035);
  life.mood   = clamp01(life.mood   - 0.022);

  // run-down + ignored for a while → doze off
  if (life.energy < 0.24 && now - life.lastInteract > 20000) {
    fallAsleep();
    return;
  }

  // pick an ambient behaviour weighted by current state
  const pool = [
    ["lookaround", 30],
    ["groom",      22],
    ["sniff",      16],
    ["stretch",    12],
    ["nothing",    12],
  ];
  if (life.mood > 0.62 && life.energy > 0.5) pool.push(["happy", 12], ["spin", 6]);
  if (life.energy > 0.72)                    pool.push(["jump", 6]);

  const pick = weightedPick(pool);
  if (pick === "nothing") {
    if (Math.random() < 0.5) emote(pickFrom(["♪", "·ω·", "～", "🌿"]));
    return;
  }
  emote(EMOTE_FOR[pick] || "");
  playAnim(pick);
  if (["lookaround", "sniff", "groom"].includes(pick) && Math.random() < 0.4) {
    playChirp();                           // a soft ambient "mrrp"
  }
}

function fallAsleep() {
  life.asleep = true;
  emote("💤");
  playYawn();
  setEyes(true);
  showStatus("喵喵打盹了… 戳一下叫醒它", 2600);
  playAnim("stretch");   // a yawn first; when it ends baseAnim() is "sleep"
}

function wakeUp(startled) {
  if (!life.asleep) return;
  life.asleep = false;
  setEyes(false);
  scheduleBlink();
  life.energy = clamp01(life.energy + 0.45);
  life.lastInteract = Date.now();
  life.busyUntil = Date.now() + 1400;
  if (startled) {
    emote("❗"); playHurt(); playAnim("hurt");
  } else {
    emote("🌞"); playChirp(); playAnim("stretch");
  }
}

// =====================================================================
// Petting — escalating reaction to taps on the sprite
// =====================================================================
function petCat() {
  const now = Date.now();

  if (life.asleep) {                       // a touch wakes it gently
    wakeUp(false);
    playMeow();
    return;
  }

  bumpInteract();
  life.petStreak += 1;
  life.totalPets += 1;
  clearTimeout(life.petTimer);
  life.petTimer = setTimeout(() => { life.petStreak = 0; }, 2600);
  if (life.totalPets % 50 === 0) {
    showStatus(`已经摸了喵喵 ${life.totalPets} 次啦 ✨`, 2600);
  }

  if (life.petStreak >= 3) {
    // showered with attention → delighted
    emote(pickFrom(["❤️", "💕", "✨"]));
    playPurr();
    sayLine(pickFrom(["呼噜呼噜～最喜欢你了！", "嘿嘿，好舒服喵～", "再多摸一会儿嘛～"]));
    life.mood = clamp01(life.mood + 0.18);
    life.busyUntil = now + 1900;
    playAnim("happy");
  } else if (life.petStreak === 2) {
    emote("👋");
    playMeow();
    life.busyUntil = now + 1300;
    playAnim("wave");
  } else {
    emote(pickFrom(["❤️", "♪", "！"]));
    playMeow();
    if (currentAnim === baseAnim() && Math.random() < 0.6) {
      playAnim("lookaround");              // a quick glance toward you
    }
  }
}

// =====================================================================
// Turn toward the tap — the sprite swivels its whole body to face where
// you touched, holds a beat, then eases back to front. This is layered
// on top of whatever clip is playing (it is the model's orientation, not
// an animation), so "it noticed me" reads on every interaction.
// =====================================================================
let faceTarget = 0;          // desired yaw, degrees
let faceCurrent = 0;
let faceRAF = null;
let faceReturnTimer = null;

function tickFace() {
  faceCurrent += (faceTarget - faceCurrent) * 0.16;
  if (Math.abs(faceTarget - faceCurrent) < 0.25) faceCurrent = faceTarget;
  modelViewer.setAttribute("orientation", `0deg 0deg ${faceCurrent.toFixed(1)}deg`);
  faceRAF = (faceCurrent === faceTarget) ? null : requestAnimationFrame(tickFace);
}

function faceToward(clientX) {
  const w = window.innerWidth || modelViewer.clientWidth || 1;
  const rel = (clientX / w) * 2 - 1;            // -1 (left) … +1 (right)
  // capped so the sprite turns clearly toward you but keeps its face visible
  faceTarget = Math.max(-32, Math.min(32, rel * 34));
  clearTimeout(faceReturnTimer);
  faceReturnTimer = setTimeout(() => {          // ease back to facing front
    faceTarget = 0;
    if (!faceRAF) tickFace();
  }, 1700);
  if (!faceRAF) tickFace();
}

// A tap anywhere in the scene pets the sprite. Precise mesh hit-testing
// was too easy to miss on a small mobile target, so any non-UI tap counts.
modelViewer.addEventListener("click", (e) => {
  if (e.target.closest(".ar-btn") || e.target.closest(".anim-btn") ||
      e.target.closest(".round-btn") || e.target.closest(".chat-panel")) return;
  faceToward(e.clientX);
  petCat();
});

// =====================================================================
// Blink — the eyes are painted into the texture atlas (no eyelid mesh),
// so a blink swaps the Head material's base-colour texture for a closed-
// eye variant. The sprite blinks on its own at a natural cadence and
// keeps its eyes shut while it sleeps.
// =====================================================================
let eyesOpenTex = null, eyesClosedTex = null, headTexInfo = null;
let eyesClosed = false, blinkReady = false, blinkTimer = null;

async function initBlink() {
  try {
    const mats = modelViewer.model && modelViewer.model.materials;
    if (!mats) return;
    const mat = mats.find((m) => m.name === "root.3") || mats[3];   // root.3 = Head
    headTexInfo = mat.pbrMetallicRoughness.baseColorTexture;
    eyesOpenTex = headTexInfo.texture;
    eyesClosedTex = await modelViewer.createTexture("textures/face_blink.webp");
    blinkReady = true;
    if (life.asleep) setEyes(true);
    scheduleBlink();
  } catch (e) {
    console.warn("blink init failed — eyes stay open:", e);
  }
}

function setEyes(closed) {
  if (!blinkReady || closed === eyesClosed) return;
  try {
    headTexInfo.setTexture(closed ? eyesClosedTex : eyesOpenTex);
    eyesClosed = closed;
  } catch (_) { /* scene-graph API unavailable */ }
}

function scheduleBlink() {
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(doBlink, 2400 + Math.random() * 4200);
}

function doBlink() {
  scheduleBlink();
  if (!blinkReady || life.asleep || eyesClosed) return;
  const dbl = Math.random() < 0.3;          // ~30% are double-blinks
  setEyes(true);
  setTimeout(() => {
    setEyes(false);
    if (dbl) setTimeout(() => {
      setEyes(true);
      setTimeout(() => setEyes(false), 110);
    }, 130);
  }, 115);
}

// =====================================================================
// Procedural sound effects (Web Audio API)
// =====================================================================
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
  return audioCtx;
}

function playMeow() {
  if (isMuted) return;
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
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);

  osc.connect(gain).connect(ctx.destination);
  osc.start(now); lfo.start(now);
  osc.stop(now + 0.6); lfo.stop(now + 0.6);
}

function playHit() {
  if (isMuted) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const noise = ctx.createBufferSource();
  const buffer = ctx.createBuffer(1, 4410, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / 800);
  noise.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass"; filter.frequency.value = 250;
  const gain = ctx.createGain();
  gain.gain.value = 0.45;
  noise.connect(filter).connect(gain).connect(ctx.destination);
  noise.start(now); noise.stop(now + 0.2);
}

function playHurt() {
  if (isMuted) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(180, now + 0.4);
  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.5);
}

// Contented purr — a low rumble with a fast tremolo flutter.
function playPurr() {
  if (isMuted) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const trem = ctx.createOscillator();
  const tremGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();

  osc.type = "sawtooth";
  osc.frequency.value = 32;
  filter.type = "lowpass"; filter.frequency.value = 340;

  trem.type = "sine";
  trem.frequency.value = 23;          // purr flutter rate
  tremGain.gain.value = 0.09;
  trem.connect(tremGain).connect(gain.gain);

  gain.gain.setValueAtTime(0.0, now);
  gain.gain.linearRampToValueAtTime(0.15, now + 0.15);
  gain.gain.setValueAtTime(0.15, now + 1.0);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.55);

  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now); trem.start(now);
  osc.stop(now + 1.6); trem.stop(now + 1.6);
}

// Sleepy yawn — a soft breathy tone that rises then falls.
function playYawn() {
  if (isMuted) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  osc.type = "sine";
  osc.frequency.setValueAtTime(330, now);
  osc.frequency.linearRampToValueAtTime(520, now + 0.35);
  osc.frequency.linearRampToValueAtTime(240, now + 0.95);
  filter.type = "lowpass"; filter.frequency.value = 900;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(0.16, now + 0.25);
  gain.gain.linearRampToValueAtTime(0.13, now + 0.6);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);
  osc.connect(filter).connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 1.05);
}

// Soft "mrrp" chirp — two quick rising blips.
function playChirp() {
  if (isMuted) return;
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

// Delighted trill — a fast-fluttering rising tone.
function playTrill() {
  if (isMuted) return;
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
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now); osc.stop(now + 0.6);
  lfo.start(now); lfo.stop(now + 0.6);
}

// =====================================================================
// Voice — the sprite speaks its replies aloud. Browser SpeechSynthesis,
// tuned to a small, high, slightly-fast voice. Respects the mute toggle;
// the on-screen speech bubble always shows so it works muted too.
// =====================================================================
let ttsVoices = [];
function loadVoices() {
  if (window.speechSynthesis) ttsVoices = window.speechSynthesis.getVoices() || [];
}
if (window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
}

function speak(text) {
  if (isMuted || !window.speechSynthesis) return;
  // strip emoji / brackets so the synthesiser reads only the words
  const clean = (text || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[\[\]{}]/g, "")
    .trim();
  if (!clean) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "zh-CN";
    u.pitch = 1.7;          // small, cute voice
    u.rate = 1.08;
    const zh = ttsVoices.find((v) => /zh|cmn|chinese|中文|普通话/i.test(v.lang + " " + v.name));
    if (zh) u.voice = zh;
    window.speechSynthesis.speak(u);
  } catch (_) { /* speech unavailable — the bubble still carries it */ }
}

// The sprite "says" a line: on-screen speech bubble + spoken voice.
let sayTimer = null;
function sayLine(text) {
  if (!text) return;
  if (sayTextEl) sayTextEl.textContent = text;
  if (sayBubbleEl) sayBubbleEl.classList.add("show");
  clearTimeout(sayTimer);
  const dwell = Math.min(7000, 2200 + text.length * 180);   // time to read
  sayTimer = setTimeout(() => {
    if (sayBubbleEl) sayBubbleEl.classList.remove("show");
  }, dwell);
  speak(text);
}

// =====================================================================
// Mute toggle
// =====================================================================
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "🔇" : "🔊";
  muteBtn.classList.toggle("muted", isMuted);
  if (isMuted && window.speechSynthesis) window.speechSynthesis.cancel();
  showStatus(isMuted ? "已静音" : "已开声", 1000);
});

// =====================================================================
// Shake detection → reaction (wakes a sleeping sprite, startled)
// =====================================================================
function handleMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc) return;
  const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
  if (mag > 25 && Date.now() - lastShakeAt > 1500) {
    lastShakeAt = Date.now();
    life.lastInteract = Date.now();
    if (life.asleep) {
      wakeUp(true);
      showStatus("把喵喵摇醒了！", 1500);
      return;
    }
    life.mood = clamp01(life.mood - 0.1);
    const reaction = Math.random() < 0.65 ? "hurt" : "attack";
    showStatus("被你晃到啦！", 1500);
    life.busyUntil = Date.now() + 1500;
    emote("💫");
    playAnim(reaction);
  }
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === "undefined") return false;
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    try {
      const state = await DeviceMotionEvent.requestPermission();
      return state === "granted";
    } catch (e) { console.warn("Motion permission denied:", e); return false; }
  }
  return true;
}

// =====================================================================
// Lazy init: audio + motion permission on first user gesture
// =====================================================================
function initOnFirstGesture() {
  const handler = async () => {
    document.removeEventListener("touchstart", handler);
    document.removeEventListener("click", handler);
    ensureAudio();
    const ok = await requestMotionPermission();
    if (ok) window.addEventListener("devicemotion", handleMotion);
  };
  document.addEventListener("touchstart", handler, { once: true });
  document.addEventListener("click", handler, { once: true });
}
initOnFirstGesture();

// =====================================================================
// Persist the sprite's state — periodically and whenever the page hides.
// =====================================================================
setInterval(saveLife, 15000);
window.addEventListener("pagehide", saveLife);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") saveLife();
});

// =====================================================================
// Model load → greet + start the life loop
// =====================================================================
// =====================================================================
// Model load → frame the camera, hide the loader, greet, start the
// life loop. First-time players get a quick guide; the greeting waits
// for them to dismiss it so it isn't missed behind the overlay.
// =====================================================================
const ONBOARD_KEY = "miaomiao.onboarded.v1";

// Greeting reflects how the sprite is doing right now — and it speaks.
function doGreeting() {
  if (life.asleep) {
    emote("💤");
    setEyes(true);
    showStatus("喵喵在打盹… 戳一下叫醒它", 2800);
    playAnim("sleep");
    return;
  }
  if (life.mood > 0.72) {
    emote("❤️");
    playAnim("happy");
    sayLine(pickFrom(["喵～你终于来啦！", "好想你呀，呼噜呼噜～", "嘿嘿，又见面啦！"]));
  } else if (life.mood < 0.34) {
    emote("…");
    playAnim("lookaround");
    sayLine(pickFrom(["喵…你去哪儿了呀…", "我等你好久了啦…", "哼，才想起我呀…"]));
  } else {
    emote("👋");
    playAnim("wave");
    sayLine(pickFrom(["喵～你好呀！", "嗨！今天玩点什么？", "喵呜～来啦来啦！"]));
  }
}

modelViewer.addEventListener("load", () => {
  modelReady = true;
  try { modelViewer.jumpCameraToGoal(); } catch (_) {}   // correct framing at once
  loadLife();        // restore mood / energy / sleep from the last visit
  initBlink();       // load the closed-eye texture, start the blink loop
  setupDesktopAR();  // desktop has no camera-AR — offer a scan-to-phone QR
  console.log("Model loaded. Available animations:", modelViewer.availableAnimations);

  if (loaderEl) loaderEl.classList.add("hidden");

  const firstVisit = !localStorage.getItem(ONBOARD_KEY);
  if (firstVisit && onboardEl) {
    onboardEl.classList.remove("hidden");        // greeting waits for dismissal
  } else {
    setTimeout(doGreeting, 700);
  }
  scheduleBehavior();
}, { once: true });

if (onboardStart) {
  onboardStart.addEventListener("click", () => {
    onboardEl.classList.add("hidden");
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (_) {}
    ensureAudio();                       // explicit gesture — unlock audio
    setTimeout(doGreeting, 400);
  });
}

// Safety net: never trap the player on the loading screen.
setTimeout(() => {
  if (!modelReady && loaderEl) loaderEl.classList.add("hidden");
}, 15000);
modelViewer.addEventListener("error", () => {
  if (loaderEl) loaderEl.classList.add("hidden");
  showStatus("模型加载失败，请刷新重试", 4000);
});

// =====================================================================
// Desktop AR entry — a PC browser cannot open camera-AR, so when the
// device can't activate AR we surface a QR code instead: scan it to
// open this same page on a phone, where AR works.
// =====================================================================
function setupDesktopAR() {
  // canActivateAR is false on desktop and AR-incapable browsers
  if (!qrBtn) return;
  if (!modelViewer.canActivateAR) qrBtn.style.display = "flex";
}
if (qrBtn && qrModal) {
  qrBtn.addEventListener("click", () => qrModal.classList.remove("hidden"));
}
if (qrClose && qrModal) {
  qrClose.addEventListener("click", () => qrModal.classList.add("hidden"));
}
if (qrModal) {
  qrModal.addEventListener("click", (e) => {
    if (e.target === qrModal) qrModal.classList.add("hidden");
  });
}

// =====================================================================
// AR interaction mode — camera passthrough. The live rear-camera feed
// sits behind the transparent 3D scene, so the sprite appears in the
// real world while every web interaction (tap, AI chat, voice, the
// whole behaviour engine) keeps running — unlike the native AR viewers,
// which can only replay baked clips.
// =====================================================================
let camStream = null;
let camMode = false;

async function enterCamMode() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStatus("此设备不支持摄像头", 2400);
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } }, audio: false,
    });
  } catch (e) {
    showStatus("打不开摄像头，请允许相机权限", 2800);
    return;
  }
  camFeed.srcObject = camStream;
  try { await camFeed.play(); } catch (_) {}
  camMode = true;
  document.body.classList.add("cam-mode");
  camBtn.textContent = "✕";
  camBtn.classList.add("active");
  modelViewer.setAttribute("shadow-intensity", "0");   // a floating spirit — skip the fake ground shadow
  bumpInteract();
  emote("✨");
  sayLine(pickFrom(["喵～带我看看你那边！", "哇，这是哪里呀？", "嘿嘿，我出来啦！"]));
}

function exitCamMode() {
  camMode = false;
  document.body.classList.remove("cam-mode");
  if (camBtn) { camBtn.textContent = "📸"; camBtn.classList.remove("active"); }
  modelViewer.setAttribute("shadow-intensity", "0.55");
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  if (camFeed) camFeed.srcObject = null;
}

if (camBtn && camFeed) {
  camBtn.addEventListener("click", () => {
    if (camMode) exitCamMode(); else enterCamMode();
  });
}
window.addEventListener("pagehide", () => { if (camMode) exitCamMode(); });

// =====================================================================
// Voice (ASR) — long-press mic to record, release to send
// =====================================================================
async function startRecording() {
  if (!ASR_ENDPOINT) {
    showStatus("语音功能未配置，请用按钮操作", 2200);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      stream.getTracks().forEach((t) => t.stop());
      await sendToASR(blob);
    };
    mediaRecorder.start();
    isRecording = true;
    micBtn.classList.add("recording");
    showStatus("正在听...", 5000);
  } catch (e) {
    console.error("Mic error:", e);
    showStatus("无法访问麦克风", 2000);
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    micBtn.classList.remove("recording");
  }
}

async function sendToASR(blob) {
  showStatus("识别中...", 5000);
  try {
    const fd = new FormData();
    fd.append("audio", blob, "voice.webm");
    const r = await fetch(ASR_ENDPOINT, { method: "POST", body: fd });
    const data = await r.json();
    const text = data.text || "";
    console.log("ASR text:", text);
    if (text) {
      showStatus(`你说: ${text}`, 2200);
      handleVoiceCommand(text);
    } else {
      showStatus("没听清，再说一遍", 1800);
    }
  } catch (e) {
    console.error("ASR error:", e);
    showStatus("识别失败：" + e.message, 2200);
  }
}

function handleVoiceCommand(text) {
  for (const { kw, anim } of VOICE_MAP) {
    if (kw.test(text)) {
      userPlay(anim);
      return true;
    }
  }
  if (CHAT_ENDPOINT) sendChat(text);
  return false;
}

micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); startRecording(); });
micBtn.addEventListener("touchend",   (e) => { e.preventDefault(); stopRecording(); });
micBtn.addEventListener("mousedown",  () => startRecording());
micBtn.addEventListener("mouseup",    () => stopRecording());
micBtn.addEventListener("mouseleave", () => { if (isRecording) stopRecording(); });

// =====================================================================
// Chat (Qwen LLM)
// =====================================================================
chatBtn.addEventListener("click", () => { chatPanel.classList.remove("hidden"); chatInput.focus(); });
chatClose.addEventListener("click", () => { chatPanel.classList.add("hidden"); });

function appendMsg(role, text, cls = "") {
  const div = document.createElement("div");
  div.className = `chat-msg ${role} ${cls}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

// Recent conversation turns, sent to the worker for multi-turn coherence.
let chatHistory = [];

async function sendChat(text) {
  if (!text || !text.trim()) return;
  text = text.trim();
  appendMsg("user", text);
  bumpInteract(0.5);
  if (!CHAT_ENDPOINT) {
    appendMsg("cat", "（聊天功能未配置，部署 Cloudflare Workers 后启用）");
    return;
  }
  const thinking = appendMsg("cat", "喵喵在想…", "thinking");
  emote("💭");                                       // the sprite visibly thinks
  try {
    const r = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: text,
        history: chatHistory.slice(-6),
        state: {                                     // so the LLM answers in-state
          mood:   Math.round(life.mood * 100) / 100,
          energy: Math.round(life.energy * 100) / 100,
          asleep: life.asleep,
          activity: currentAnim,
        },
      }),
    });
    const data = await r.json();
    thinking.remove();
    const reply = data.reply || "喵？";
    appendMsg("cat", reply);

    chatHistory.push({ role: "user", content: text },
                     { role: "assistant", content: reply });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

    if (life.asleep) wakeUp(false);                  // a reply rouses a dozing cat
    if (data.mood === "up")   life.mood = clamp01(life.mood + 0.15);
    if (data.mood === "down") life.mood = clamp01(life.mood - 0.12);

    const anim = data.animation;
    if (anim && (modelViewer.availableAnimations || []).includes(anim)) {
      userPlay(anim);
    }
    emote(data.emote || "💬");                       // LLM's emote wins over the clip's
    sayLine(reply);                                  // speech bubble + spoken voice
  } catch (e) {
    thinking.remove();
    appendMsg("cat", "（连不上服务器，喵…）");
    console.error("Chat error:", e);
  }
}

chatSend.addEventListener("click", () => { const t = chatInput.value; chatInput.value = ""; sendChat(t); });
chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); chatSend.click(); }
});

// =====================================================================
// Service Worker registration (PWA installable)
// =====================================================================
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.log("SW reg failed:", err));
  });
}

console.log("喵喵精灵 AR · 生命行为引擎 loaded ✓");
