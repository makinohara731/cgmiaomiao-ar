/* main.js — 喵喵精灵 AR interaction layer
 * Features: 5 animation buttons, AR mode, voice ASR, shake detection,
 *           Qwen LLM chat, procedural sound effects, auto-idle twitches.
 */

// =====================================================================
// Config
// =====================================================================
const WORKER_URL = "https://cgmiaomiao-asr.makinohara20050410.workers.dev";
const ASR_ENDPOINT  = WORKER_URL ? `${WORKER_URL}/api/asr`  : null;
const CHAT_ENDPOINT = WORKER_URL ? `${WORKER_URL}/api/chat` : null;

// Animation keyword mapping (Chinese voice → animation name)
const VOICE_MAP = [
  { kw: /走|行走|散步/,        anim: "walk"   },
  { kw: /跑|奔跑|快点|加速/,    anim: "run"    },
  { kw: /打|攻击|揍|出拳|咬/,   anim: "attack" },
  { kw: /疼|痛|受伤|哎呀|被打/, anim: "hurt"   },
  { kw: /停|休息|站|发呆|待机|安静/, anim: "idle"   },
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
const chatPanel = $("#chatPanel");
const chatClose = $("#chatClose");
const chatLog   = $("#chatLog");
const chatInput = $("#chatInput");
const chatSend  = $("#chatSend");

// =====================================================================
// State
// =====================================================================
let currentAnim = "idle";
let isMuted = false;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let lastShakeAt = 0;
let twitchTimer = null;

// =====================================================================
// Status toast
// =====================================================================
let statusHideTimer = null;
function showStatus(msg, duration = 1800) {
  statusEl.textContent = msg;
  statusEl.classList.add("show");
  if (statusHideTimer) clearTimeout(statusHideTimer);
  statusHideTimer = setTimeout(() => statusEl.classList.remove("show"), duration);
}

// =====================================================================
// Animation control
//   model-viewer is async (Lit web component). Setting animation-name then
//   immediately calling play() races and uses the previous animation.
//   Fix: set the ATTRIBUTE, await updateComplete, then play().
//   Refs:
//     - https://github.com/google/model-viewer/discussions/4525
//     - https://github.com/google/model-viewer/issues/3144
// =====================================================================
async function playAnim(name, options = {}) {
  if (!modelViewer.availableAnimations.includes(name)) {
    console.warn(`Animation ${name} not in list:`, modelViewer.availableAnimations);
    return;
  }
  currentAnim = name;
  // Set the HTML attribute (synced to property by Lit) and wait for it to apply.
  modelViewer.setAttribute("animation-name", name);
  await modelViewer.updateComplete;
  modelViewer.currentTime = 0;
  // play() with no options plays the clip exactly ONCE. Cyclic clips
  // (idle/walk/run) must loop explicitly via repetitions:Infinity; one-shot
  // clips (attack/hurt) play once and the timer below returns to idle.
  const isOneShot = ["attack", "hurt"].includes(name);
  modelViewer.play({ repetitions: isOneShot ? 1 : Infinity });

  // Update active button
  document.querySelectorAll(".anim-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.anim === name);
  });

  // Sound effect for one-shot animations
  if (name === "attack") playHit();
  if (name === "hurt")   playHurt();

  // After one-shot animations, return to idle
  const oneShot = ["attack", "hurt"].includes(name);
  if (oneShot && options.then !== false) {
    const dur = (modelViewer.duration || 1.0);
    setTimeout(() => { if (currentAnim === name) playAnim("idle"); }, dur * 1000);
  }
}

animBar.querySelectorAll(".anim-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const anim = btn.dataset.anim;
    const oneShot = ["attack", "hurt"].includes(anim);
    playAnim(anim, { then: oneShot });
  });
});

modelViewer.addEventListener("load", () => {
  console.log("Model loaded. Available animations:", modelViewer.availableAnimations);
  // autoplay + animation-name="idle" attributes on the <model-viewer> tag handle
  // initial playback. We don't re-trigger play() here to avoid the async race
  // described in google/model-viewer #4525 / #3144.

  // Matte override DISABLED for PBR GLB test — the new model ships with its
  // own normal map + metallic/roughness textures, and overriding them
  // (rough=1, metallic=0) destroys the PBR effect we're trying to see.
  // Re-enable this block when going back to the rigged Tripo GLB.
  // try {
  //   for (const m of modelViewer.model.materials) {
  //     const pbr = m.pbrMetallicRoughness;
  //     pbr.setRoughnessFactor(1.0);
  //     pbr.setMetallicFactor(0.0);
  //   }
  //   console.log("Materials forced to matte (roughness=1, metallic=0)");
  // } catch (e) { console.warn("material override failed:", e); }

  startTwitchTimer();
});

// =====================================================================
// Random idle "twitches" — adds liveliness during idle
// =====================================================================
function startTwitchTimer() {
  if (twitchTimer) clearTimeout(twitchTimer);
  const delay = 8000 + Math.random() * 8000; // 8-16 seconds
  twitchTimer = setTimeout(() => {
    if (currentAnim === "idle") {
      // Brief ear/head twitch by toggling to hurt for ~200ms then back
      // We don't actually want hurt — instead just bump current time to vary
      // For now, just keep idle but flash status
      showStatus("喵～ 😺", 1000);
    }
    startTwitchTimer();
  }, delay);
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
  // "Mraow!" — pitch sweeps up then down, with vibrato
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(800, now + 0.15);
  osc.frequency.exponentialRampToValueAtTime(500, now + 0.45);

  lfo.frequency.value = 12;  // vibrato rate
  lfoGain.gain.value = 25;   // vibrato depth (Hz)
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
  // Short percussive thud
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
  // Descending whine
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

// =====================================================================
// Click on the character → random meow
// =====================================================================
modelViewer.addEventListener("click", (e) => {
  // Don't trigger when the user clicked on a UI overlay child
  if (e.target.closest(".ar-btn") || e.target.closest(".anim-btn")) return;
  playMeow();
  showStatus("喵～", 800);
});

// =====================================================================
// Mute toggle
// =====================================================================
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  muteBtn.textContent = isMuted ? "🔇" : "🔊";
  muteBtn.classList.toggle("muted", isMuted);
  showStatus(isMuted ? "已静音" : "已开声", 1000);
});

// =====================================================================
// Shake detection → random reaction
// =====================================================================
function handleMotion(event) {
  const acc = event.accelerationIncludingGravity || event.acceleration;
  if (!acc) return;
  const mag = Math.sqrt((acc.x||0)**2 + (acc.y||0)**2 + (acc.z||0)**2);
  // Threshold ~25 m/s^2 (a vigorous shake; gravity baseline is ~9.8)
  if (mag > 25 && Date.now() - lastShakeAt > 1500) {
    lastShakeAt = Date.now();
    // Random reaction: 70% hurt, 30% attack
    const reaction = Math.random() < 0.7 ? "hurt" : "attack";
    showStatus("被你晃到啦！", 1500);
    playAnim(reaction, { then: true });
  }
}

async function requestMotionPermission() {
  if (typeof DeviceMotionEvent === "undefined") return false;
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    // iOS 13+
    try {
      const state = await DeviceMotionEvent.requestPermission();
      return state === "granted";
    } catch (e) { console.warn("Motion permission denied:", e); return false; }
  }
  // Android / older iOS — no permission needed
  return true;
}

// =====================================================================
// Lazy init: audio + motion permission on first user gesture
//   iOS requires DeviceMotionEvent.requestPermission() from a user gesture,
//   so we hook it to the first touch/click anywhere on the page. After that
//   the listener removes itself.
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

// Welcome meow once the model is in
modelViewer.addEventListener("load", () => { setTimeout(playMeow, 800); }, { once: true });

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
      stream.getTracks().forEach(t => t.stop());
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
      const oneShot = ["attack", "hurt"].includes(anim);
      playAnim(anim, { then: oneShot });
      return true;
    }
  }
  // No keyword matched → treat as chat
  if (CHAT_ENDPOINT) sendChat(text);
  return false;
}

// Mic: press to start, release to stop. Also support tap-to-toggle on desktop.
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

function appendMsg(role, text, cls="") {
  const div = document.createElement("div");
  div.className = `chat-msg ${role} ${cls}`;
  div.textContent = text;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return div;
}

async function sendChat(text) {
  if (!text || !text.trim()) return;
  appendMsg("user", text);
  if (!CHAT_ENDPOINT) {
    appendMsg("cat", "（聊天功能未配置，部署 Cloudflare Workers 后启用）");
    return;
  }
  const thinking = appendMsg("cat", "思考中...", "thinking");
  try {
    const r = await fetch(CHAT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text })
    });
    const data = await r.json();
    thinking.remove();
    const reply = data.reply || "喵？";
    appendMsg("cat", reply);
    // If LLM suggested an animation, trigger it
    if (data.animation && modelViewer.availableAnimations.includes(data.animation)) {
      const oneShot = ["attack", "hurt"].includes(data.animation);
      playAnim(data.animation, { then: oneShot });
    } else {
      playMeow();
    }
  } catch (e) {
    thinking.remove();
    appendMsg("cat", "（连不上服务器）");
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
    navigator.serviceWorker.register("sw.js").catch(err => console.log("SW reg failed:", err));
  });
}

console.log("喵喵精灵 AR loaded ✓");
