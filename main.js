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
const TTS_ENDPOINT  = WORKER_URL ? `${WORKER_URL}/api/tts`  : null;

// Tunable behaviour — overridable from the settings panel; persisted.
const CFG_KEY = "miaomiao.cfg.v1";
const cfg = {
  personality: "default",   // default / lively / gentle / lazy — biases pool + decay
  proactive:   true,        // does it actively seek care when a need is low?
  nightSleep:  true,        // sleepier at night
  cloudVoice:  true,        // use cloud TTS (real voice); false → browser TTS only
  bgm:         false,       // ambient BGM (gated on the 熟悉 unlock)
};
try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || "{}")); } catch (_) {}
function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (_) {} }

// Personality presets bias the behaviour pool + need-decay rates.
const PERSONALITY = {
  default: { decayMul: 1.0, lively: 1.0, calm: 1.0 },
  lively:  { decayMul: 1.4, lively: 2.0, calm: 0.6 },
  gentle:  { decayMul: 0.7, lively: 0.7, calm: 1.4 },
  lazy:    { decayMul: 0.5, lively: 0.4, calm: 1.7 },
};
const personality = () => PERSONALITY[cfg.personality] || PERSONALITY.default;

// Clip registry — loop:true clips run forever; the rest play once and the
// engine returns the sprite to its base loop afterwards.
const CLIPS = {
  idle:{loop:true},  walk:{loop:true},  run:{loop:true},  sleep:{loop:true},
  attack:{loop:false},   hurt:{loop:false},   wave:{loop:false},
  happy:{loop:false},    jump:{loop:false},   spin:{loop:false},
  backflip:{loop:false}, twirl:{loop:false},
  lookaround:{loop:false}, groom:{loop:false},
  stretch:{loop:false},    sniff:{loop:false},   eat:{loop:false},
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
const camBtn     = $("#camBtn");
const camFeed    = $("#camFeed");
const camSwapBtn = $("#camSwapBtn");
const feedBtn       = $("#feedBtn");
const bondChipEl    = $("#bondChip");
const bondStageEl   = $("#bondStage");
const statusPanelEl = $("#statusPanel");
const spCloseBtn    = $("#spClose");
const choicesEl     = $("#choices");
const cfgPanelEl    = $("#cfgPanel");
const cfgCloseBtn   = $("#cfgClose");
const spOpenCfgBtn  = $("#spOpenCfg");
const diaryPanelEl    = $("#diaryPanel");
const diaryListEl     = $("#diaryList");
const diaryCloseBtn   = $("#diaryClose");
const spOpenDiaryBtn  = $("#spOpenDiary");

// =====================================================================
// Life state — the heart of the "motion ecology"
// =====================================================================
const life = {
  energy: 0.85,        // 0..1 — drains while ignored, restored by rest/care
  mood:   0.65,        // 0..1 — drains when bored, restored by play/affection
  hunger: 0.8,         // 0..1 — 1 is full; drains over time, restored by feeding
  asleep: false,       // dozing — base loop becomes "sleep"
  busyUntil: 0,        // suppresses autonomous behaviour after a user action
  lastInteract: Date.now(),
  petStreak: 0,        // consecutive taps inside the streak window
  petTimer: null,
  totalPets: 0,        // lifetime tap count (persisted)
  affection: 0,        // 0..100 — the bond meter; defines the relationship stage
  bornAt: Date.now(),  // first-met timestamp (for "days together")
  seenEvents: [],      // bond-event ids already played
  catName: "",         // the name the user gave the cat (empty = use default)
  userName: "",        // the name the user chose to be called (unlocked at bond stage 3)
  unlocks: [],         // tangible rewards unlocked at each bond stage
};

// What we show / send to the LLM when the cat doesn't have a custom name yet.
const DEFAULT_CAT_NAME = "喵喵";
const catNameDisplay = () => life.catName || DEFAULT_CAT_NAME;

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
      energy: life.energy, mood: life.mood, hunger: life.hunger,
      asleep: life.asleep, totalPets: life.totalPets,
      affection: life.affection, bornAt: life.bornAt,
      seenEvents: life.seenEvents,
      catName: life.catName, userName: life.userName,
      unlocks: life.unlocks,
      savedAt: Date.now(),
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
  life.hunger = clamp01(saved.hunger != null ? saved.hunger : 0.8);
  life.asleep = !!saved.asleep;
  life.affection  = Math.max(0, Math.min(100, saved.affection || 0));
  life.bornAt     = saved.bornAt || Date.now();
  life.seenEvents = Array.isArray(saved.seenEvents) ? saved.seenEvents : [];
  life.catName    = typeof saved.catName === "string" ? saved.catName : "";
  life.userName   = typeof saved.userName === "string" ? saved.userName : "";
  life.unlocks    = Array.isArray(saved.unlocks) ? saved.unlocks : [];

  const hoursAway = Math.max(0, (Date.now() - (saved.savedAt || Date.now())) / 3600000);
  if (hoursAway > 0.05) {
    life.mood   = clamp01(life.mood   - hoursAway * 0.05);   // misses you a bit
    life.energy = clamp01(life.energy + hoursAway * 0.12);   // but rests up
    life.hunger = clamp01(life.hunger - hoursAway * 0.16);   // and gets hungry
    if (hoursAway > 2) life.asleep = true;                   // dozed off waiting
  }
}

// =====================================================================
// Long-term memory — facts the cat has learned about its human.
//   Kept tiny on purpose so the LLM prompt stays in budget:
//   facts cap at MEM_FACT_CAP, each value truncated to MEM_VAL_MAX chars,
//   buildMemoryBlock() output capped to MEM_BLOCK_MAX chars before being
//   spliced into the system prompt by the worker.
// =====================================================================
const MEM_KEY        = "miaomiao.mem.v1";
const MEM_FACT_CAP   = 12;
const MEM_VAL_MAX    = 24;
const MEM_BLOCK_MAX  = 180;

const mem = { facts: [], topics: [] };
// facts: [{ k: "likes" | "dislikes" | "self" | "fact", v: string, ts: number }]
// topics: small ring of recent free-form noun phrases for "they were talking about X"

function loadMem() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(MEM_KEY) || "null"); } catch (_) {}
  if (!saved) return;
  mem.facts  = Array.isArray(saved.facts)  ? saved.facts.slice(-MEM_FACT_CAP)  : [];
  mem.topics = Array.isArray(saved.topics) ? saved.topics.slice(-6) : [];
}
function saveMem() {
  try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch (_) {}
}

function addFact(k, v) {
  if (!v) return;
  v = String(v).trim().slice(0, MEM_VAL_MAX);
  if (!v) return;
  // Dedupe (k,v) — if it already exists, just refresh the timestamp.
  const i = mem.facts.findIndex((f) => f.k === k && f.v === v);
  if (i >= 0) { mem.facts[i].ts = Date.now(); }
  else        { mem.facts.push({ k, v, ts: Date.now() }); }
  if (mem.facts.length > MEM_FACT_CAP) mem.facts = mem.facts.slice(-MEM_FACT_CAP);
  saveMem();
}

// Extract simple Chinese self-disclosure patterns from a user message.
// Cheap regex on every user turn — no extra LLM call.
// Longer prefixes MUST come before shorter ones (regex alternation is leftmost-first):
// "不喜欢" must precede "不", otherwise "我不喜欢香菜" matches "不" and captures "喜欢香菜".
const FACT_PATTERNS = [
  { k: "dislikes", re: /我(?:不喜欢|讨厌吃|讨厌|害怕)([^，。！？!?,.\n、~～\s]{1,20})/g },
  { k: "likes",    re: /我(?:很|超|特别|真的)?(?:喜欢|爱|想吃|想要)([^，。！？!?,.\n、~～\s]{1,20})/g },
  { k: "self",     re: /(?:我叫|我是|你叫我|叫我)([^，。！？!?,.\n、~～\s]{1,12})/g },
  { k: "fact",     re: /我(?:今天|昨天|刚刚|刚才)([^，。！？!?,.\n]{2,20})/g },
];

function extractFacts(text) {
  if (!text || typeof text !== "string") return;
  // Cap message length — long pastes shouldn't fill the fact store with junk.
  const t = text.slice(0, 200);
  for (const { k, re } of FACT_PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      addFact(k, m[1]);
      // self-nickname: also update life.userName so the LLM identity block uses it
      if (k === "self" && !life.userName) {
        life.userName = String(m[1]).slice(0, MEM_VAL_MAX);
        saveLife();
      }
    }
  }
}

// Build a compact, ≤MEM_BLOCK_MAX-char string the worker can splice into
// the system prompt. Layout: "ta 喜欢 A、B；不喜欢 C；最近聊过 …"
function buildMemoryBlock() {
  if (!mem.facts.length && !mem.topics.length) return "";
  const by = (k) => mem.facts.filter((f) => f.k === k).slice(-4).map((f) => f.v);
  const parts = [];
  const likes = by("likes");    if (likes.length)    parts.push(`ta 喜欢${likes.join("、")}`);
  const dislikes = by("dislikes"); if (dislikes.length) parts.push(`不喜欢${dislikes.join("、")}`);
  const facts = by("fact");     if (facts.length)    parts.push(`提过：${facts.join("；")}`);
  if (mem.topics.length)        parts.push(`最近聊过${mem.topics.slice(-3).join("、")}`);
  let s = parts.join("；");
  if (s.length > MEM_BLOCK_MAX) s = s.slice(0, MEM_BLOCK_MAX - 1) + "…";
  return s;
}

// =====================================================================
// Daily roll — one mood/theme rolled per local day. Persistent so the
// cat's "today's vibe" stays consistent across reloads within one day.
// =====================================================================
const DAILY_KEY = "miaomiao.daily.v1";
const DAILY_THEMES = [
  { theme: "想吃鱼",     moodBias:  0.05 },
  { theme: "想撒娇",     moodBias:  0.10 },
  { theme: "想念你",     moodBias:  0.03 },
  { theme: "好奇宝宝",   moodBias:  0.06 },
  { theme: "懒洋洋",     moodBias: -0.02 },
  { theme: "想念星星",   moodBias:  0.00 },
  { theme: "尾巴痒",     moodBias:  0.04 },
  { theme: "做白日梦",   moodBias:  0.02 },
];
const daily = { ymd: "", theme: "", moodBias: 0 };
const localYMD = () => {
  const d = new Date();
  return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, "0")}-${d.getDate().toString().padStart(2, "0")}`;
};
function dailyRoll() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(DAILY_KEY) || "null"); } catch (_) {}
  const today = localYMD();
  if (saved && saved.ymd === today) {
    Object.assign(daily, saved);
    return;
  }
  const pick = pickFrom(DAILY_THEMES);
  Object.assign(daily, { ymd: today, theme: pick.theme, moodBias: pick.moodBias });
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(daily)); } catch (_) {}
  // Apply mood bias once per day (after the time-away decay in loadLife).
  life.mood = clamp01(life.mood + pick.moodBias);
}

// =====================================================================
// Diary — short append-only log of life moments. The cat "writes" an
// entry at bond-stage promotions, at feed milestones, and at session
// end. Capped so it stays compact and quick to render.
// =====================================================================
const DIARY_KEY = "miaomiao.diary.v1";
const DIARY_CAP = 14;
let diary = [];

function loadDiary() {
  try {
    const raw = localStorage.getItem(DIARY_KEY);
    diary = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(diary)) diary = [];
  } catch (_) { diary = []; }
}
function saveDiary() {
  try { localStorage.setItem(DIARY_KEY, JSON.stringify(diary.slice(-DIARY_CAP))); } catch (_) {}
}
function writeDiary(text, tag = "moment") {
  if (!text) return;
  const last = diary[diary.length - 1];
  // De-dupe consecutive identical entries (e.g. session-end firing twice).
  if (last && last.text === text && last.tag === tag) return;
  diary.push({ ymd: localYMD(), text: String(text).slice(0, 80), tag, ts: Date.now() });
  if (diary.length > DIARY_CAP) diary = diary.slice(-DIARY_CAP);
  saveDiary();
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
  const art = EMOTE_ART[txt];
  if (art) emoteEl.innerHTML = art;          // hand-drawn icon
  else emoteEl.textContent = txt;            // fallback (e.g. an AI-chosen emoji)
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

// ---- Hand-drawn emote icons — a cohesive custom set so the mood cues
//      read as designed art, not a sheet of generic emoji. ----
const _SVG = (inner) =>
  `<svg viewBox="0 0 48 48" width="58" height="58">${inner}</svg>`;
const _ART = {
  heart: _SVG('<path d="M24 41C9.5 31 3 23 3 15.6 3 9 8 4.5 14 4.5c4.2 0 7.7 2.3 10 6 2.3-3.7 5.8-6 10-6 6 0 11 4.5 11 11.1C45 23 38.5 31 24 41Z" fill="#ff6f91"/><ellipse cx="14.5" cy="13.5" rx="4" ry="2.5" fill="#fff" opacity=".55" transform="rotate(-38 14.5 13.5)"/>'),
  spark: _SVG('<path d="M27 3c1.1 9.7 4.3 12.9 14 14-9.7 1.1-12.9 4.3-14 14-1.1-9.7-4.3-12.9-14-14 9.7-1.1 12.9-4.3 14-14Z" fill="#ffd23f"/><path d="M12 27c.6 5 2 6.4 7 7-5 .6-6.4 2-7 7-.6-5-2-6.4-7-7 5-.6 6.4-2 7-7Z" fill="#ffe480"/>'),
  note: _SVG('<ellipse cx="16" cy="35" rx="9.5" ry="7.5" fill="#5fb95e"/><rect x="22.5" y="7" width="4.2" height="30" fill="#5fb95e"/><path d="M26.7 7c8.5 2.2 11.6 7.4 9.3 15.6 1.4-6.4-3.3-9.6-9.3-10.6Z" fill="#4a9e4a"/>'),
  moon: _SVG('<path d="M33 5a19 19 0 1 0 11.5 33.5A15 15 0 0 1 33 5Z" fill="#f6c945"/><circle cx="30" cy="14" r="2.4" fill="#fff" opacity=".6"/><circle cx="37" cy="22" r="1.6" fill="#fff" opacity=".5"/>'),
  think: _SVG('<g fill="#eef3f0"><circle cx="19" cy="21" r="10.5"/><circle cx="32" cy="17" r="8.8"/><circle cx="34" cy="28" r="8.2"/><circle cx="23" cy="30" r="8.5"/></g><circle cx="13" cy="38" r="3.6" fill="#eef3f0"/><circle cx="7.5" cy="43.5" r="2.3" fill="#eef3f0"/>'),
  question: _SVG('<circle cx="24" cy="24" r="21" fill="#5fb95e"/><text x="24" y="35.5" font-size="31" font-weight="800" text-anchor="middle" fill="#fff" font-family="-apple-system,Segoe UI,sans-serif">?</text>'),
  fish: _SVG('<path d="M31 24c0-7.2-7.2-12.5-15.5-12.5-5.2 0-9.6 2-12.5 5.2 2 3 3 5.1 3 7.3s-1 4.3-3 7.3c2.9 3.2 7.3 5.2 12.5 5.2C23.8 36.5 31 31.2 31 24Z" fill="#ff9a52"/><path d="M31 24 45 14.5v19Z" fill="#ff9a52"/><circle cx="13" cy="20.5" r="2.6" fill="#fff"/><circle cx="13" cy="20.5" r="1.2" fill="#3a2a1a"/>'),
  tear: _SVG('<path d="M24 5C24 5 39 27 39 34.5a15 15 0 0 1-30 0C9 27 24 5 24 5Z" fill="#5ab3f0"/><ellipse cx="18" cy="30" rx="3" ry="5.2" fill="#fff" opacity=".5"/>'),
  sun: _SVG('<g stroke="#f6c945" stroke-width="4.2" stroke-linecap="round"><path d="M24 3v6.5M24 38.5V45M3 24h6.5M38.5 24H45M9 9l4.6 4.6M34.4 34.4 39 39M39 9l-4.6 4.6M13.6 34.4 9 39"/></g><circle cx="24" cy="24" r="11" fill="#ffd23f"/>'),
  paw: _SVG('<g fill="#ff8fab"><ellipse cx="24" cy="33" rx="11.5" ry="9.5"/><ellipse cx="10.5" cy="20" rx="5" ry="6.6"/><ellipse cx="19.5" cy="12.5" rx="5" ry="6.8"/><ellipse cx="28.5" cy="12.5" rx="5" ry="6.8"/><ellipse cx="37.5" cy="20" rx="5" ry="6.6"/></g>'),
  exclaim: _SVG('<circle cx="24" cy="24" r="21" fill="#ff8a3d"/><text x="24" y="35.5" font-size="31" font-weight="800" text-anchor="middle" fill="#fff" font-family="-apple-system,Segoe UI,sans-serif">!</text>'),
  dizzy: _SVG('<path d="M24 24c0-3.2 2.6-5.4 5.8-5.4 5.2 0 9.2 4.2 9.2 9.8 0 8-7 14.4-15.6 14.4C13 42.8 5 34.6 5 24 5 12 14.4 3 26.4 3c8.4 0 15.6 5 19 12.4" fill="none" stroke="#b98fe0" stroke-width="4.2" stroke-linecap="round"/>'),
};
const EMOTE_ART = {
  "❤️": _ART.heart, "💕": _ART.heart, "🥺": _ART.heart, "🎈": _ART.heart,
  "✨": _ART.spark, "🧼": _ART.spark, "⤴️": _ART.spark, "💨": _ART.spark, "🙆": _ART.spark,
  "♪": _ART.note, "🌸": _ART.note, "🌿": _ART.note,
  "💤": _ART.moon, "🥱": _ART.moon,
  "💭": _ART.think,
  "❓": _ART.question, "👃": _ART.question,
  "🍖": _ART.fish, "🐟": _ART.fish, "🍽️": _ART.fish,
  "😿": _ART.tear, "💧": _ART.tear,
  "💫": _ART.dizzy, "💢": _ART.dizzy,
  "🌞": _ART.sun,
  "❗": _ART.exclaim,
  "👋": _ART.paw, "🐾": _ART.paw,
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
  if (name === "hurt")   { playHurt(); flashExpression("sad", 1900); }
  if (name === "happy")  { playTrill(); flashExpression("happy", 1900); }

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
  addAffection(0.3 * amount);
  refreshHud();
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
    life.energy = clamp01(life.energy + 0.05);    // resting recharges
    life.hunger = clamp01(life.hunger - 0.012);   // still gets a little hungry
    refreshHud();
    if (Math.random() < 0.45) emote("💤");
    return;
  }

  // awake: needs drift down between behaviours (rate × personality)
  const pm = personality();
  life.hunger = clamp01(life.hunger - 0.024 * pm.decayMul);
  life.energy = clamp01(life.energy - 0.03  * pm.decayMul);
  life.mood   = clamp01(life.mood   - 0.02  * pm.decayMul);
  if (life.hunger < 0.1) addAffection(-0.5);      // letting it starve hurts the bond
  refreshHud();

  // energy crash → doze off (more likely at night if the setting is on)
  const nightSleepy = cfg.nightSleep && timeBucket() === "night";
  const sleepEnergy = nightSleepy ? 0.36 : 0.22;
  const sleepIgnore = nightSleepy ? 12000 : 18000;
  if (life.energy < sleepEnergy && now - life.lastInteract > sleepIgnore) {
    fallAsleep();
    return;
  }

  // a low need overrides ambient life — the cat actively seeks care
  if (cfg.proactive) {
    const need = lowestNeed();
    if (need) { seekCare(need); return; }
  }

  // ambient: a spontaneous thought, a question, or an idle micro-action.
  // proactiveSpeak() decides between memory recall / time-of-day flavor /
  // bond-stage monologue / random self-narration, and self-throttles.
  const roll = Math.random();
  if (roll < 0.24) { proactiveSpeak(); return; }
  if (roll < 0.32 && life.affection >= 8 && now - lastQuestionAt > 50000) {
    askQuestion();
    return;
  }

  const pool = [
    ["lookaround", 28 * pm.calm], ["groom", 20 * pm.calm], ["sniff", 15],
    ["stretch", 11 * pm.calm], ["nothing", 11],
  ];
  if (life.mood > 0.62 && life.energy > 0.5) pool.push(["happy", 12 * pm.lively], ["spin", 6 * pm.lively]);
  if (life.energy > 0.72)                    pool.push(["jump",  6 * pm.lively]);

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
// 养成系统 (raising & bond system) — needs, affection, the cat's own
// initiative, dialogue choices and milestone story events. This is what
// turns the sprite from "a thing that reacts" into "a creature you raise".
// =====================================================================

// ---- Relationship stages, keyed by affection (0..100) ----
const STAGES = [
  { name: "初遇",     min: 0  },
  { name: "熟悉",     min: 15 },
  { name: "亲近",     min: 35 },
  { name: "黏人",     min: 60 },
  { name: "形影不离", min: 85 },
];
function stageOf(a) {
  let s = STAGES[0];
  for (const x of STAGES) if (a >= x.min) s = x;
  return s;
}

function addAffection(delta) {
  const before = stageOf(life.affection).name;
  life.affection = Math.max(0, Math.min(100, life.affection + delta));
  const after = stageOf(life.affection);
  if (delta > 0 && after.name !== before) triggerBondEvent(after);
  refreshHud();
}

// ---- HUD: the top-left bond chip + (when open) the status panel ----
function refreshHud() {
  if (bondStageEl) bondStageEl.textContent = stageOf(life.affection).name;
  if (bondChipEl) bondChipEl.style.setProperty("--aff", String(life.affection / 100));
  if (statusPanelEl && !statusPanelEl.classList.contains("hidden")) renderStatusPanel();
}

// ---- Needs: which need most wants care right now ----
function lowestNeed() {
  if (life.hunger < 0.28) return "hunger";
  if (life.mood   < 0.30) return "mood";
  if (life.energy < 0.36) return "energy";
  return null;
}

// The cat actively seeks care for a low need — it comes over, acts it
// out and asks out loud, nagging each cycle until the need is met.
function seekCare(need) {
  if (need === "hunger") {
    emote(pickFrom(["🍖", "😿", "🍽️"]));
    sayLine(pickFrom([
      "肚子饿扁了喵…喂我点东西好不好",
      "喵呜～我好想吃东西…",
      "你看我可怜兮兮的，是不是该喂我啦？",
    ]));
    playAnim(pickFrom(["sniff", "lookaround", "walk"]));
    life.mood = clamp01(life.mood - 0.02);
  } else if (need === "mood") {
    emote(pickFrom(["🎈", "🥺", "✨"]));
    sayLine(pickFrom([
      "好无聊呀…陪我玩一会儿嘛",
      "喵～你都不理我，哼！",
      "我们来玩点什么好不好？",
    ]));
    playAnim(pickFrom(["happy", "jump", "spin"]));
  } else if (need === "energy") {
    emote("🥱");
    sayLine(pickFrom(["唔…有点困了喵", "好想眯一小会儿…"]));
    playAnim("stretch");
  }
  refreshHud();
}

// ---- The cat's own passing thoughts — they shift with the bond stage ----
const THOUGHTS = {
  初遇:     ["喵？你是谁呀…", "这里是哪里呢～", "嗯…要不要相信你呢", "（小心地打量着你）"],
  熟悉:     ["今天也见到你了，喵～", "你身上的味道我记住啦", "陪着你感觉还不错", "在想等会儿玩什么呢"],
  亲近:     ["和你在一起好安心呀", "诶嘿，又是你～", "我有点点想你了…", "今天也要一起玩哦"],
  黏人:     ["最喜欢你待在我身边了", "你不许走开太久哦！", "想一直一直黏着你～", "呼噜呼噜…好幸福"],
  形影不离: ["你就是我最重要的人啦", "我们会一直在一起对吧？", "有你在，哪里都是家", "（满足地蹭了蹭你）"],
};
function spontaneousThought() {
  const pool = THOUGHTS[stageOf(life.affection).name] || THOUGHTS["初遇"];
  emote(pickFrom(["💭", "～", "·ω·", "🌸"]));
  sayLine(pickFrom(pool));
  if (Math.random() < 0.5) playAnim(pickFrom(["lookaround", "groom"]));
}

// ---- Proactive speech engine — the soul layer ----
//   The cat speaks on its own, not just when spoken to. Picks a context-
//   appropriate line (memory recall / time-of-day / bond thought / random
//   self-narration), throttled so it doesn't get noisy. The throttle
//   ring is in-memory only; resets on reload, which is fine — the cat
//   was offline anyway.
const PROACTIVE_MIN_GAP  = 90 * 1000;            // ≥90s between proactive lines
const PROACTIVE_HOUR_CAP = 4;                    // ≤4 per rolling hour
const proactiveStats = { lastAt: 0, ring: [] };

function canProactive() {
  const now = Date.now();
  if (now - proactiveStats.lastAt < PROACTIVE_MIN_GAP) return false;
  proactiveStats.ring = proactiveStats.ring.filter((t) => now - t < 3600 * 1000);
  return proactiveStats.ring.length < PROACTIVE_HOUR_CAP;
}
function markProactive() {
  const now = Date.now();
  proactiveStats.lastAt = now;
  proactiveStats.ring.push(now);
}

const PROACTIVE_TIME = {
  morning:   ["太阳出来啦，喵～该起床咯", "早上的空气真清新呢", "唔…伸个懒腰，舒服"],
  afternoon: ["午后的光好暖呀", "想找个地方蹭一蹭…", "今天的时间过得好慢喵"],
  evening:   ["天要黑了呢…你在干嘛呀？", "晚饭吃了吗喵？", "夕阳真好看，像橘子味的"],
  night:     ["你也还没睡呀…", "夜里好安静，喵～", "嘘…星星出来啦"],
};

const PROACTIVE_RANDOM = [
  "刚才我好像梦到鱼啦…",
  "诶？刚才那是什么声音？",
  "你在做什么呢？让我看看～",
  "尾巴痒痒的喵…",
  "今天的我也很可爱吧？",
  "唔…突然有点想撒娇了",
  "外面的世界…我也想看看",
  "（看着你的方向，眼睛眨了眨）",
];

// If the bond is high enough, occasionally call back to a remembered fact.
// Returns null when nothing memorable applies, so the caller can fall back.
function recallFromMemory() {
  if (life.affection < 15) return null;
  if (!mem.facts || !mem.facts.length) return null;
  const f = pickFrom(mem.facts.slice(-6));
  if (!f) return null;
  if (f.k === "likes")    return `还记得你喜欢${f.v}吗，我也想试一试喵`;
  if (f.k === "dislikes") return `${f.v}你不喜欢对吧？我也不要～`;
  if (f.k === "self" && life.userName) return `${life.userName}…你今天好不好呀？`;
  if (f.k === "fact")     return `你上次说${f.v}…后来呢？`;
  return null;
}

function proactiveSpeak() {
  // Throttle — silently fall back to a brief ambient action so the rhythm
  // of the autonomous loop is preserved without the bubble firing.
  if (!canProactive()) {
    if (Math.random() < 0.6) {
      emote(pickFrom(["♪", "～", "·ω·"]));
      playAnim(pickFrom(["lookaround", "groom"]));
    }
    return;
  }

  let line = null;
  const stage = stageOf(life.affection).name;

  // 35% recall when memories exist and bond is past 初遇
  if (Math.random() < 0.35) line = recallFromMemory();
  // 45% conditional → time-of-day flavor
  if (!line && Math.random() < 0.45) {
    const pool = PROACTIVE_TIME[timeBucket()];
    if (pool) line = pickFrom(pool);
  }
  // 50% conditional → bond-stage inner monologue (the original pool)
  if (!line && Math.random() < 0.5) {
    line = pickFrom(THOUGHTS[stage] || THOUGHTS["初遇"]);
  }
  // fallback → random self-narration
  if (!line) line = pickFrom(PROACTIVE_RANDOM);

  // If we know the user's name, sometimes lead the line with it. Don't
  // do this for memory-recall lines that already address them by name.
  if (life.userName && Math.random() < 0.3 && !line.startsWith(life.userName)) {
    line = `${life.userName}…${line}`;
  }

  emote(pickFrom(["💭", "～", "·ω·", "🌸", "♪"]));
  sayLine(line);
  if (Math.random() < 0.5) playAnim(pickFrom(["lookaround", "groom", "sniff"]));
  markProactive();
  // Once 'dream' is unlocked, occasionally jot a dream into the diary as
  // the cat speaks — a quiet side effect of being in a deeper bond stage.
  maybeWriteDream();
}

// ---- Dialogue choices — the cat asks, you pick, the bond shifts ----
let lastQuestionAt = 0;
let questionTimer = null;

const QUESTIONS = [
  { q: "今天…你是特意来看我的吗？", opts: [
    { t: "当然啦",   aff: 4,  anim: "happy",      reply: "嘿嘿…我就知道！最喜欢你了喵～" },
    { t: "顺便而已", aff: -1, anim: "hurt",       reply: "唔…顺便也好啦…（小声）" }] },
  { q: "喵～你喜欢现在的我吗？", opts: [
    { t: "超级喜欢", aff: 4, anim: "spin",        reply: "呀！我也是我也是！转个圈给你看～" },
    { t: "还行吧",   aff: 0, anim: "lookaround",  reply: "还行…那我要更努力让你喜欢我！" }] },
  { q: "如果我饿了，你会第一时间喂我吗？", opts: [
    { t: "马上喂你", aff: 3,  anim: "happy",      reply: "呼噜～有你这句话我就放心啦" },
    { t: "看心情",   aff: -1, anim: "sniff",      reply: "喵…那我得多撒娇才行了" }] },
  { q: "你今天过得开心吗？说给我听听～", opts: [
    { t: "和你说说", aff: 3, anim: "lookaround",  reply: "嗯嗯，我都听着呢，喵～" },
    { t: "保密",     aff: 1, anim: "groom",       reply: "哼，小气！那我自己玩啦" }] },
  { q: "我们…会一直在一起对不对？", opts: [
    { t: "会一直在", aff: 5,  anim: "happy",      reply: "太好啦！那我要赖着你一辈子喵～" },
    { t: "谁知道呢", aff: -2, anim: "hurt",       reply: "…别这样说嘛，我会难过的" }] },
  { q: "想不想看我表演个绝技？", opts: [
    { t: "快表演！", aff: 3, anim: "backflip",    reply: "看好咯——喵嗷！" },
    { t: "下次吧",   aff: 0, anim: "idle",        reply: "好吧…那你可要记得哦" }] },
];

function askQuestion() {
  if (!choicesEl) return;
  lastQuestionAt = Date.now();
  const q = pickFrom(QUESTIONS);
  emote("❓");
  sayLine(q.q);
  life.busyUntil = Date.now() + 60000;          // hold while waiting for the player
  choicesEl.innerHTML = "";
  q.opts.forEach((opt) => {
    const b = document.createElement("button");
    b.className = "choice-btn";
    b.textContent = opt.t;
    b.addEventListener("click", () => answerQuestion(opt), { once: true });
    choicesEl.appendChild(b);
  });
  choicesEl.classList.remove("hidden");
  clearTimeout(questionTimer);
  questionTimer = setTimeout(() => {            // ignored for too long
    if (choicesEl.classList.contains("hidden")) return;
    choicesEl.classList.add("hidden");
    choicesEl.innerHTML = "";
    life.busyUntil = Date.now() + 500;
    emote("…");
    sayLine("…你不理我，哼。");
    addAffection(-1);
  }, 22000);
}

function answerQuestion(opt) {
  clearTimeout(questionTimer);
  choicesEl.classList.add("hidden");
  choicesEl.innerHTML = "";
  life.busyUntil = Date.now() + 2000;
  life.lastInteract = Date.now();
  addAffection(opt.aff);
  if (opt.aff > 0) life.mood = clamp01(life.mood + 0.1);
  emote(opt.aff > 0 ? "❤️" : (opt.aff < 0 ? "💧" : "·ω·"));
  if (opt.anim && (modelViewer.availableAnimations || []).includes(opt.anim)) {
    playAnim(opt.anim);
  }
  sayLine(opt.reply);
}

// ---- Bond events — a special scripted moment at each new stage ----
const BOND_EVENTS = {
  熟悉: { anim: "wave", lines: [
    "唔…我好像，开始习惯有你了。",
    "以后…要常来看我哦，喵～"] },
  亲近: { anim: "happy", lines: [
    "和你在一起的时候，我最安心了。",
    "我决定啦——要一直黏着你！",
    "（轻轻蹭了蹭你的手）"] },
  黏人: { anim: "spin", lines: [
    "你不在的时候…我会偷偷想你的。",
    "好想把全世界最好的都给你呀～",
    "答应我，不要丢下我哦。"] },
  形影不离: { anim: "twirl", lines: [
    "从今天起，我和你就是一家人了。",
    "无论你去哪里，我的心都跟着你。",
    "谢谢你…一直一直陪着我。喵～"] },
};

// ---- Unlocks: tangible per-stage gifts on top of the dialogue events ----
const STAGE_UNLOCK = {
  熟悉:     { key: "bgm",      label: "BGM 开关",     gift: "我学会哼歌啦，去设置里就能听到喵～" },
  亲近:     { key: "dream",    label: "梦境日记",     gift: "我开始记得自己做的梦了，去日记里看看吧" },
  黏人:     { key: "nickname", label: "用户昵称",     gift: "我想要一个专属的称呼你的方式～" },
  形影不离: { key: "photo",    label: "永远的朋友徽章", gift: "我们的故事，已经满满一本啦" },
};
function hasUnlock(key)   { return Array.isArray(life.unlocks) && life.unlocks.includes(key); }
function grantUnlock(key) {
  if (hasUnlock(key)) return;
  life.unlocks.push(key);
  saveLife();
  refreshHud();
  // Tactile feedback — shimmer the bond chip, reveal any keepsake, sparkle.
  if (bondChipEl) {
    bondChipEl.classList.remove("bond-shimmer");
    void bondChipEl.offsetWidth;
    bondChipEl.classList.add("bond-shimmer");
  }
  if (key === "photo") {
    const badge = document.getElementById("foreverBadge");
    if (badge) badge.classList.remove("hidden");
  }
  if (key === "bgm") {
    // Reveal the BGM toggle row if the panel exists.
    document.getElementById("cfgBgmRow")?.classList.remove("hidden");
  }
  try { playSparkle(); } catch (_) {}
}
function applyUnlocksOnLoad() {
  // Replay the visible side effects of any unlocks present on load.
  if (hasUnlock("photo")) {
    document.getElementById("foreverBadge")?.classList.remove("hidden");
  }
  if (hasUnlock("bgm")) {
    document.getElementById("cfgBgmRow")?.classList.remove("hidden");
    // BGM stays opt-in across reloads — start it only if cfg.bgm is true.
    // Audio can't start until user gesture; we defer to the first gesture
    // via initOnFirstGesture (which calls ensureAudio).
  }
}

// Cat dream lines — short, oneiric, drawn from when 亲近 unlocks "dream".
const DREAMS = [
  "梦里我变成了一片云，飘呀飘…",
  "梦到一片海，海里全是鱼松软软～",
  "梦里你也在，我们一起吃了好多草莓",
  "我梦见自己长出了翅膀，喵～",
  "梦到月亮变成了一颗大鱼丸",
  "做了个奇怪的梦…里面的我是只大老虎",
];
function unlockDreamDiary() {
  // First dream entry — a one-shot to celebrate the unlock.
  writeDiary(`🌙 ${pickFrom(DREAMS)}`, "dream");
}
function maybeWriteDream() {
  // Called occasionally from proactiveSpeak when 'dream' is unlocked.
  if (!hasUnlock("dream")) return;
  if (Math.random() < 0.25) writeDiary(`🌙 ${pickFrom(DREAMS)}`, "dream");
}

function openNicknameDialog() {
  // Reuses the existing choices UI as a single-shot input flow.
  if (!choicesEl) return;
  emote("✨");
  sayLine("我想给你一个专属的称呼～你想让我叫你什么呢？");
  life.busyUntil = Date.now() + 60000;
  choicesEl.innerHTML = "";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 6;
  input.placeholder = "想被我怎么叫～";
  input.className = "choice-input";
  const submit = document.createElement("button");
  submit.className = "choice-btn";
  submit.textContent = "就这样叫我吧";
  submit.addEventListener("click", () => {
    const n = sanitizeName(input.value || "");
    if (n) {
      life.userName = n;
      saveLife();
      sayLine(`${n}！这下就是我们之间的小秘密啦～`);
      emote("❤️");
      writeDiary(`从今天起我会叫 ta「${n}」`, "bond");
    } else {
      sayLine("嗯…那我先这样叫你吧～");
    }
    choicesEl.classList.add("hidden");
    life.busyUntil = Date.now() + 1200;
  }, { once: true });
  choicesEl.appendChild(input);
  choicesEl.appendChild(submit);
  choicesEl.classList.remove("hidden");
}

function triggerBondEvent(stage) {
  const ev = BOND_EVENTS[stage.name];
  if (!ev || life.seenEvents.includes(stage.name)) return;
  life.seenEvents.push(stage.name);
  saveLife();
  writeDiary(`今天我们的关系变成「${stage.name}」啦！`, "bond");
  // Grant the stage-specific tangible unlock (if any).
  const u = STAGE_UNLOCK[stage.name];
  if (u) {
    grantUnlock(u.key);
    showStatus(`🎁 解锁 —— ${u.label}`, 4500);
  }
  life.busyUntil = Date.now() + ev.lines.length * 3400 + 2000;
  showStatus(`✨ 羁绊加深 —— ${stage.name}`, 4200);
  if (ev.anim && (modelViewer.availableAnimations || []).includes(ev.anim)) {
    playAnim(ev.anim);
  }
  let i = 0;
  const next = () => {
    if (i >= ev.lines.length) {
      // After the scripted dialogue, fire the stage-specific gift moment.
      if (u) {
        setTimeout(() => sayLine(u.gift), 600);
        setTimeout(() => {
          if (u.key === "dream")    unlockDreamDiary();
          if (u.key === "nickname") openNicknameDialog();
        }, 2400);
      }
      return;
    }
    sayLine(ev.lines[i]);
    emote(i === ev.lines.length - 1 ? "❤️" : "✨");
    i++;
    setTimeout(next, 3400);
  };
  next();
}

// ---- Feeding ----
function feedCat() {
  if (life.asleep) wakeUp(false);
  bumpInteract();
  const wasHungry = life.hunger < 0.45;
  life.hunger = clamp01(life.hunger + 0.5);
  life.mood   = clamp01(life.mood + 0.12);
  addAffection(wasHungry ? 4 : 1.5);
  life.busyUntil = Date.now() + 2400;
  emote("🐟");
  playAnim("eat");
  playEat();
  setTimeout(() => sayLine(pickFrom(wasHungry
    ? ["呜哇～太好吃了！谢谢你喵～", "嗯嗯！这个我最喜欢了！", "吃饱饱～最喜欢你了！"]
    : ["喵～虽然不太饿，还是谢谢你！", "嗯…再吃一点点也可以啦", "你对我真好喵～"])), 800);
  writeDiary(wasHungry ? "今天 ta 在我饿肚子的时候喂了我，好暖" : "ta 又给我加餐啦，嘿嘿", "feed");
  refreshHud();
}

// ---- Status panel — a GalGame-style character sheet ----
function renderStatusPanel() {
  if (!statusPanelEl) return;
  const days = Math.floor((Date.now() - life.bornAt) / 86400000) + 1;
  const setBar = (id, frac) => {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.round(clamp01(frac) * 100) + "%";
  };
  const setTxt = (id, s) => {
    const el = document.getElementById(id);
    if (el) el.textContent = s;
  };
  setTxt("spStage", stageOf(life.affection).name);
  setBar("spAff", life.affection / 100);
  setTxt("spAffNum", `好感度 ${Math.round(life.affection)} / 100`);
  setBar("spHunger", life.hunger);
  setBar("spEnergy", life.energy);
  setBar("spMood", life.mood);
  setTxt("spDays", `和${catNameDisplay()}相伴第 ${days} 天 · 摸过 ${life.totalPets} 次`);
  setTxt("spName", catNameDisplay());
  setTxt("spTheme", daily.theme ? `今日心情 · ${daily.theme}` : "");
}
function openStatusPanel() {
  renderStatusPanel();
  if (statusPanelEl) statusPanelEl.classList.remove("hidden");
}

if (feedBtn) feedBtn.addEventListener("click", feedCat);
if (bondChipEl) bondChipEl.addEventListener("click", openStatusPanel);
if (spCloseBtn) spCloseBtn.addEventListener("click", () => statusPanelEl.classList.add("hidden"));
if (statusPanelEl) {
  statusPanelEl.addEventListener("click", (e) => {
    if (e.target === statusPanelEl) statusPanelEl.classList.add("hidden");
  });
}

// ---- Settings panel (state-machine tunables) ----
function syncCfgUI() {
  if (!cfgPanelEl) return;
  cfgPanelEl.querySelectorAll(".pers-btn").forEach((b) =>
    b.classList.toggle("active", b.dataset.pers === cfg.personality));
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.checked = v; };
  set("cfgProactive",  cfg.proactive);
  set("cfgNightSleep", cfg.nightSleep);
  set("cfgCloudVoice", cfg.cloudVoice);
  set("cfgBgm",        !!cfg.bgm && hasUnlock("bgm"));
  // Show / hide the BGM row based on whether the player has unlocked it.
  const bgmRow = document.getElementById("cfgBgmRow");
  if (bgmRow) bgmRow.classList.toggle("hidden", !hasUnlock("bgm"));
}
function openCfgPanel() {
  syncCfgUI();
  if (cfgPanelEl) cfgPanelEl.classList.remove("hidden");
}
if (cfgPanelEl) {
  cfgPanelEl.querySelectorAll(".pers-btn").forEach((b) => {
    b.addEventListener("click", () => {
      cfg.personality = b.dataset.pers;
      saveCfg(); syncCfgUI();
      showStatus(`性格：${b.textContent}`, 1400);
    });
  });
  const wire = (id, key) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", () => { cfg[key] = el.checked; saveCfg(); });
  };
  wire("cfgProactive",  "proactive");
  wire("cfgNightSleep", "nightSleep");
  wire("cfgCloudVoice", "cloudVoice");
  // BGM toggle: start / stop on flip, and pick theme from current time.
  const bgmInput = document.getElementById("cfgBgm");
  if (bgmInput) {
    bgmInput.addEventListener("change", () => {
      cfg.bgm = bgmInput.checked;
      saveCfg();
      if (cfg.bgm) {
        const isNight = document.body.classList.contains("time-night");
        startBGM(isNight ? "night" : "day");
      } else {
        stopBGM();
      }
    });
  }
  cfgPanelEl.addEventListener("click", (e) => {
    if (e.target === cfgPanelEl) cfgPanelEl.classList.add("hidden");
  });
}
if (cfgCloseBtn) cfgCloseBtn.addEventListener("click", () => cfgPanelEl?.classList.add("hidden"));
if (spOpenCfgBtn) spOpenCfgBtn.addEventListener("click", () => {
  if (statusPanelEl) statusPanelEl.classList.add("hidden");
  openCfgPanel();
});

// ---- Diary panel: render entries newest-first, empty-state friendly ----
const DIARY_TAG_ICON = { day: "🌤", feed: "🐟", bond: "✨", moment: "💭", dream: "🌙" };
function renderDiary() {
  if (!diaryListEl) return;
  if (!diary.length) {
    diaryListEl.innerHTML = `<div class="diary-empty">还没有日记呢，先和喵喵多玩玩吧～</div>`;
    return;
  }
  // Newest entry first. Same-day entries grouped by date in the meta line.
  const items = [...diary].reverse().slice(0, DIARY_CAP);
  diaryListEl.innerHTML = items.map((d) => {
    const icon = DIARY_TAG_ICON[d.tag] || "💭";
    const safe = String(d.text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `<div class="diary-item"><span class="diary-meta">${icon} ${d.ymd}</span>${safe}</div>`;
  }).join("");
}
function openDiaryPanel() {
  renderDiary();
  if (diaryPanelEl) diaryPanelEl.classList.remove("hidden");
}
if (spOpenDiaryBtn) spOpenDiaryBtn.addEventListener("click", () => {
  if (statusPanelEl) statusPanelEl.classList.add("hidden");
  openDiaryPanel();
});
if (diaryCloseBtn) diaryCloseBtn.addEventListener("click", () => diaryPanelEl?.classList.add("hidden"));
if (diaryPanelEl) {
  diaryPanelEl.addEventListener("click", (e) => {
    if (e.target === diaryPanelEl) diaryPanelEl.classList.add("hidden");
  });
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
    // showered with attention → delighted; 10+ streak gets the long purr
    emote(pickFrom(["❤️", "💕", "✨"]));
    if (life.petStreak >= 10) playPurrLong();
    else                       playPurr();
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
let eyesOpenTex = null, eyesClosedTex = null, eyesHappyTex = null, eyesSadTex = null;
let headTexInfo = null;
let currentExpression = "open";     // open / blink / happy / sad
let blinkReady = false;
let blinkTimer = null;
let expressionResetTimer = null;

async function initBlink() {
  try {
    const mats = modelViewer.model && modelViewer.model.materials;
    if (!mats) return;
    const mat = mats.find((m) => m.name === "root.3") || mats[3];   // root.3 = Head
    headTexInfo = mat.pbrMetallicRoughness.baseColorTexture;
    eyesOpenTex = headTexInfo.texture;
    eyesClosedTex = await modelViewer.createTexture("textures/face_blink.webp");
    // happy + sad load best-effort; if either fails the runtime degrades gracefully
    try { eyesHappyTex = await modelViewer.createTexture("textures/face_happy.webp"); } catch (_) {}
    try { eyesSadTex   = await modelViewer.createTexture("textures/face_sad.webp"); }   catch (_) {}
    blinkReady = true;
    if (life.asleep) setExpression("blink");
    scheduleBlink();
  } catch (e) {
    console.warn("expression init failed — eyes stay open:", e);
  }
}

// Swap the face atlas. "open" = the GLB's own texture; others are
// runtime-loaded variants.
function setExpression(name) {
  if (!blinkReady || name === currentExpression) return;
  let tex = eyesOpenTex;
  if      (name === "blink") tex = eyesClosedTex;
  else if (name === "happy") tex = eyesHappyTex || eyesClosedTex;   // fallback to blink
  else if (name === "sad")   tex = eyesSadTex   || eyesOpenTex;     // fallback to open
  try {
    headTexInfo.setTexture(tex);
    currentExpression = name;
  } catch (_) { /* scene-graph API unavailable */ }
}

// Older callers still use setEyes(true|false) — keep the wrapper.
function setEyes(closed) { setExpression(closed ? "blink" : "open"); }

// Show a transient expression, then ease back to "open" (unless asleep).
function flashExpression(name, ms = 1800) {
  if (life.asleep) return;
  setExpression(name);
  clearTimeout(expressionResetTimer);
  expressionResetTimer = setTimeout(() => {
    if (!life.asleep) setExpression("open");
  }, ms);
}

function scheduleBlink() {
  clearTimeout(blinkTimer);
  blinkTimer = setTimeout(doBlink, 2400 + Math.random() * 4200);
}

function doBlink() {
  scheduleBlink();
  // only blink from a neutral open face (don't interrupt happy/sad/sleep)
  if (!blinkReady || life.asleep || currentExpression !== "open") return;
  const dbl = Math.random() < 0.3;          // ~30% are double-blinks
  setExpression("blink");
  setTimeout(() => {
    setExpression("open");
    if (dbl) setTimeout(() => {
      setExpression("blink");
      setTimeout(() => setExpression("open"), 110);
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

// ---- Sparkle: ascending twinkle for unlock moments ----
function playSparkle() {
  if (isMuted) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  [[880, 0.0], [1175, 0.07], [1568, 0.14], [2093, 0.22]].forEach(([f, t0]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0, now + t0);
    gain.gain.linearRampToValueAtTime(0.09, now + t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + t0 + 0.32);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t0); osc.stop(now + t0 + 0.36);
  });
}

// ---- Eat: short crunchy bite with a tongue-flick at the end ----
function playEat() {
  if (isMuted) return;
  const ctx = ensureAudio();
  const now = ctx.currentTime;
  // crunch: low triangle blip
  const o1 = ctx.createOscillator();
  const g1 = ctx.createGain();
  o1.type = "triangle"; o1.frequency.value = 180;
  g1.gain.setValueAtTime(0, now);
  g1.gain.linearRampToValueAtTime(0.12, now + 0.02);
  g1.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  o1.connect(g1).connect(ctx.destination);
  o1.start(now); o1.stop(now + 0.16);
  // tongue flick: quick rising sine
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

// ---- Long purr — extends playPurr for 10+ tap streaks ----
function playPurrLong() {
  if (isMuted) return;
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

// =====================================================================
// Generative BGM — soft procedural ambient. No mp3 dependency; the
// engine assembles a slow chord pad and tremolos it with an LFO so the
// loop never ends and never repeats audibly. Volume is intentionally
// quiet so the cat's voice always wins; duckBGM lowers it further
// during speech.
// =====================================================================
const BGM_CHORDS = {
  day:   [261.63, 329.63, 392.00],   // C major   (C4 E4 G4)
  night: [220.00, 261.63, 329.63],   // A minor   (A3 C4 E4)
};
const bgm = { running: false, nodes: [], master: null, theme: null, lfo: null, lfoGain: null };

function startBGM(theme = "day") {
  if (bgm.running && bgm.theme === theme) return;
  if (bgm.running) stopBGM(0);                 // crossfade-ish: just stop and restart
  if (isMuted) return;
  if (!hasUnlock("bgm")) return;               // gated on the 熟悉 unlock
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
  // Slow tremolo on the chord pad.
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
    // Per-voice gain → modulated by the shared LFO at slightly different depths.
    const g = ctx.createGain();
    g.gain.value = 0.5 - 0.08 * i;
    lfoGain.connect(g.gain);                   // tremolo modulation
    osc.connect(g).connect(filter);
    osc.start();
    return { osc, g };
  });
  Object.assign(bgm, { running: true, nodes: oscs, master, theme, lfo, lfoGain });
}

function stopBGM(fadeMs = 600) {
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

// Lower BGM volume to `level` (0..1 of the normal volume) for a short
// window — used while the cat is speaking so its voice cuts through.
function duckBGM(level = 0.3, holdMs = 1600) {
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

let cloudAudio = null;

async function speak(text) {
  if (isMuted) return;
  const clean = (text || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[\[\]{}]/g, "")
    .trim();
  if (!clean) return;

  // ---- Cloud TTS first (real Qwen-TTS voice). Falls back to the
  //      browser's SpeechSynthesis if the network or worker hiccups. ----
  if (TTS_ENDPOINT && cfg.cloudVoice) {
    try {
      const resp = await fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        if (cloudAudio) { try { cloudAudio.pause(); } catch (_) {} }
        const url = URL.createObjectURL(blob);
        cloudAudio = new Audio(url);
        cloudAudio.onended = cloudAudio.onerror = () => URL.revokeObjectURL(url);
        await cloudAudio.play();
        return;
      }
    } catch (_) { /* fall through to browser TTS */ }
  }

  // ---- Fallback: browser SpeechSynthesis ----
  if (!window.speechSynthesis) return;
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
  duckBGM(0.35, dwell);                                     // let the voice cut through
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
  if (isMuted && cloudAudio) { try { cloudAudio.pause(); } catch (_) {} cloudAudio = null; }
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
    // If BGM was on across sessions, the AudioContext is now usable.
    if (cfg.bgm && hasUnlock("bgm")) {
      const isNight = document.body.classList.contains("time-night");
      startBGM(isNight ? "night" : "day");
    }
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
function persistAll() {
  saveLife();
  saveMem();
  saveDiary();
  // Once per session, write a "today's vibe" diary line. Tagged "day" so
  // the dedupe guard in writeDiary suppresses repeat firings on flaky
  // visibilitychange events the browser sometimes emits in pairs.
  if (daily.theme) writeDiary(`今天的心情：${daily.theme}`, "day");
}
window.addEventListener("pagehide", persistAll);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") persistAll();
});

// =====================================================================
// Time of day — drives the storybook sky / sun-moon and biases the cat
// (sleepier at night, lively in the day).
// =====================================================================
function timeBucket() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}
function applyTimeOfDay() {
  const h = new Date().getHours();
  let cls = "time-day";
  if (h >= 5 && h < 7)  cls = "time-dawn";
  else if (h >= 18 && h < 20) cls = "time-dusk";
  else if (h >= 20 || h < 5)  cls = "time-night";
  for (const c of ["time-dawn", "time-day", "time-dusk", "time-night"]) {
    document.body.classList.remove(c);
  }
  document.body.classList.add(cls);
  // If BGM is on, swap the theme to match the time band.
  if (bgm.running) {
    const theme = cls === "time-night" ? "night" : "day";
    if (bgm.theme !== theme) startBGM(theme);
  }
}
applyTimeOfDay();
setInterval(applyTimeOfDay, 30 * 60 * 1000);   // re-check every 30 minutes

// =====================================================================
// Model load → greet + start the life loop
// =====================================================================
// =====================================================================
// Model load → frame the camera, hide the loader, greet, start the
// life loop. First-time players get a quick guide; the greeting waits
// for them to dismiss it so it isn't missed behind the overlay.
// =====================================================================
const ONBOARD_KEY = "miaomiao.onboarded.v1";

// Greeting reflects how the sprite is doing right now AND the time of day.
const TIME_GREET = {
  morning:   ["早上好喵～", "早安！今天也要一起呀", "唔…早晨的阳光暖暖的呢"],
  afternoon: ["喵～你来啦！", "下午好呀～", "嗨！今天想玩点什么？"],
  evening:   ["晚上好喵～", "天快黑了你才来呀", "今天过得开心吗？"],
  night:     ["这么晚还来呀，喵～", "夜深啦…我有点困了", "嘘…小声点，喵咕～"],
};

// Sanitize a user-typed name. Trim, cap at 6 grapheme-ish chars, strip
// control / quote / angle-bracket characters that could break TTS prompts
// or look weird in the speech bubble.
function sanitizeName(raw) {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/[ -<>"'`\\\n\r\t]/g, "").trim();
  // Array.from honors surrogate pairs (emoji counted as 1).
  const arr = Array.from(s);
  if (arr.length > 6) s = arr.slice(0, 6).join("");
  return s;
}

// Persist the cat's name and produce a warm "记住你叫…" beat.
function applyNaming(rawName) {
  const name = sanitizeName(rawName);
  life.catName = name;          // empty string means "use the default 喵喵"
  saveLife();
  refreshHud();
  if (name) {
    sayLine(`好哒～从今天起我就叫${name}啦`);
    emote("❤️");
  } else {
    sayLine("那就还叫我喵喵吧～");
    emote("✨");
  }
}

function doGreeting() {
  if (life.asleep) {
    emote("💤");
    setEyes(true);
    showStatus("喵喵在打盹… 戳一下叫醒它", 2800);
    playAnim("sleep");
    return;
  }
  const t = timeBucket();
  if (life.mood > 0.72) {
    emote("❤️");
    playAnim("happy");
    sayLine(pickFrom(TIME_GREET[t]));
  } else if (life.mood < 0.34) {
    emote("…");
    playAnim("lookaround");
    sayLine(pickFrom(["喵…你去哪儿了呀…", "我等你好久了啦…", "哼，才想起我呀…"]));
  } else {
    emote("👋");
    playAnim("wave");
    sayLine(pickFrom(TIME_GREET[t]));
  }
}

modelViewer.addEventListener("load", () => {
  modelReady = true;
  try { modelViewer.jumpCameraToGoal(); } catch (_) {}   // correct framing at once
  loadLife();        // restore needs / affection / sleep from the last visit
  loadMem();         // restore facts the cat has learned about its human
  loadDiary();       // restore the diary
  dailyRoll();       // pick today's mood theme (idempotent within a day)
  applyUnlocksOnLoad(); // re-reveal any unlocked keepsakes (e.g. forever badge)
  refreshHud();      // show the restored relationship stage on the HUD
  initBlink();       // load the closed-eye texture, start the blink loop
  setupDesktopAR();  // desktop has no camera-AR — offer a scan-to-phone QR
  console.log("Model loaded. Available animations:", modelViewer.availableAnimations);

  if (loaderEl) loaderEl.classList.add("hidden");

  const firstVisit = !localStorage.getItem(ONBOARD_KEY);
  if (firstVisit && onboardEl) {
    runOnboardingCutscene();                     // 4-beat narrative intro
  } else {
    setTimeout(doGreeting, 700);
  }
  scheduleBehavior();
}, { once: true });

// ---- Onboarding cutscene driver ----
//   4 beats: drifting → arrival → seeing you → name input. Each tap on the
//   overlay advances to the next beat with a CSS opacity cross-fade. The
//   last beat reveals the name input and the "交个朋友吧" button; clicking
//   it (handled below by onboardStart) hides the overlay and runs the
//   naming ceremony.
let onboardBeat = 1;
function runOnboardingCutscene() {
  if (!onboardEl) return;
  onboardBeat = 1;
  onboardEl.classList.remove("hidden");
  onboardEl.classList.remove("is-last");
  syncOnboardBeats();
  // Wire the tap-to-advance handler only once per session.
  onboardEl.addEventListener("click", onOnboardTap);
}
function syncOnboardBeats() {
  const beats = onboardEl.querySelectorAll(".beat");
  beats.forEach((el) => {
    const n = Number(el.dataset.beat);
    el.classList.toggle("hidden", n !== onboardBeat);
  });
  if (onboardBeat === 4) onboardEl.classList.add("is-last");
}
function onOnboardTap(e) {
  // Don't intercept clicks inside the final card (name input + button).
  if (onboardBeat === 4) return;
  if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "BUTTON")) return;
  onboardBeat = Math.min(4, onboardBeat + 1);
  syncOnboardBeats();
}

if (onboardStart) {
  onboardStart.addEventListener("click", (e) => {
    e.stopPropagation();                         // don't bubble back to overlay tap
    onboardEl.classList.add("hidden");
    onboardEl.removeEventListener("click", onOnboardTap);
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch (_) {}
    ensureAudio();                               // explicit gesture — unlock audio
    const nameField = document.getElementById("catNameInput");
    const hasNameField = nameField && !life.catName;
    if (hasNameField) {
      setTimeout(() => applyNaming(nameField.value || ""), 400);
    } else {
      setTimeout(doGreeting, 400);
    }
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
let camFacing = "environment";   // "environment" (rear) or "user" (front)

async function enterCamMode() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showStatus("此设备不支持摄像头", 2400);
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing } }, audio: false,
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
  initVision().then(() => { if (camMode) startVisionLoop(); });
}

function exitCamMode() {
  camMode = false;
  document.body.classList.remove("cam-mode", "cam-front");
  camFacing = "environment";
  if (camBtn) { camBtn.textContent = "📸"; camBtn.classList.remove("active"); }
  modelViewer.setAttribute("shadow-intensity", "0.55");
  if (visionRAF) { cancelAnimationFrame(visionRAF); visionRAF = null; }
  lastGestureName = "";
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  if (camFeed) camFeed.srcObject = null;
}

// Swap between rear (environment) and front (user) cameras while in cam mode.
async function swapCamera() {
  if (!camMode || !navigator.mediaDevices?.getUserMedia) return;
  camFacing = camFacing === "environment" ? "user" : "environment";
  if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing } }, audio: false,
    });
    camFeed.srcObject = camStream;
    await camFeed.play().catch(() => {});
    document.body.classList.toggle("cam-front", camFacing === "user");
    showStatus(camFacing === "user" ? "前置镜头：让喵喵看你 🙂" : "后置镜头", 1700);
  } catch (_) {
    showStatus("打不开摄像头", 1800);
  }
}

if (camBtn && camFeed) {
  camBtn.addEventListener("click", () => {
    if (camMode) exitCamMode(); else enterCamMode();
  });
}
if (camSwapBtn) camSwapBtn.addEventListener("click", swapCamera);
window.addEventListener("pagehide", () => { if (camMode) exitCamMode(); });

// =====================================================================
// Camera vision — hand gestures + facial expression. While the camera
// is open, MediaPipe reads the live feed and the sprite reacts to your
// waves, thumbs-up, victory signs and smiles. Loaded lazily on the
// first camera session so it never costs anything until used.
// =====================================================================
let gestureRecognizer = null;
let faceLandmarker = null;
let visionLoading = false;
let visionReady = false;
let visionRAF = null;
let lastVisionAt = 0;
let visionTick = 0;
let lastGestureName = "";
let visionCooldownUntil = 0;

const GESTURE_REACTION = {
  Open_Palm:   { anim: "wave",       emote: "👋", line: "你好呀～我也跟你招手！" },
  Thumb_Up:    { anim: "happy",      emote: "❤️", line: "嘿嘿，被你夸啦，好开心！", aff: 2 },
  Victory:     { anim: "twirl",      emote: "✨", line: "耶～看我转个圈圈！",        aff: 1 },
  Closed_Fist: { anim: "jump",       emote: "⤴️", line: "出拳？那我蹦一个给你看！" },
  Pointing_Up: { anim: "lookaround", emote: "❓", line: "嗯？那边有什么吗喵～" },
  ILoveYou:    { anim: "happy",      emote: "❤️", line: "我也最爱你啦！呼噜呼噜～",  aff: 3 },
};

async function initVision() {
  if (visionReady || visionLoading) return;
  visionLoading = true;
  try {
    const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision");
    const { GestureRecognizer, FaceLandmarker, FilesetResolver } = vision;
    const files = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
    gestureRecognizer = await GestureRecognizer.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO", numHands: 1,
    });
    faceLandmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
    });
    visionReady = true;
    showStatus("手势 + 表情识别已开启 ✨", 2600);
  } catch (e) {
    console.warn("vision init failed:", e);
    showStatus("手势识别没能加载，仍可正常互动", 2800);
  }
  visionLoading = false;
}

function startVisionLoop() {
  if (!visionReady || visionRAF) return;
  const loop = () => {
    if (!camMode) { visionRAF = null; return; }
    visionRAF = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastVisionAt < 130) return;        // throttle to ~7-8 fps
    lastVisionAt = now;
    if (!camFeed || camFeed.readyState < 2) return;
    visionTick++;
    try {
      if (visionTick % 2 === 0) {
        handleGestures(gestureRecognizer.recognizeForVideo(camFeed, now));
      } else {
        handleFace(faceLandmarker.detectForVideo(camFeed, now));
      }
    } catch (_) { /* a dropped frame — ignore */ }
  };
  visionRAF = requestAnimationFrame(loop);
}

// React to a recognised hand gesture (debounced: hold-and-release).
function handleGestures(result) {
  if (!result || !result.gestures || !result.gestures.length) {
    lastGestureName = "";
    return;
  }
  const top = result.gestures[0][0];
  if (!top || top.categoryName === "None" || top.score < 0.55) {
    lastGestureName = "";
    return;
  }
  const name = top.categoryName;
  if (name === lastGestureName) return;          // same gesture still held
  lastGestureName = name;
  if (Date.now() < visionCooldownUntil) return;
  const r = GESTURE_REACTION[name];
  if (!r) return;
  visionCooldownUntil = Date.now() + 3000;
  life.busyUntil = Date.now() + 2200;
  life.lastInteract = Date.now();
  if (r.aff) addAffection(r.aff);
  emote(r.emote);
  playAnim(r.anim);
  sayLine(r.line);
}

// React to face landmarks: track the user's face (eye-contact) + smile.
function handleFace(result) {
  if (!result) return;

  // ---- Eye tracking: turn the cat's whole body to face the user ----
  if (result.faceLandmarks && result.faceLandmarks.length) {
    const lm = result.faceLandmarks[0];
    let sx = 0;
    for (const p of lm) sx += p.x;
    const cx = sx / lm.length;              // 0..1, face centre X in the image
    const targetYaw = Math.max(-30, Math.min(30, (cx - 0.5) * 56));
    faceTarget = targetYaw;
    clearTimeout(faceReturnTimer);
    faceReturnTimer = setTimeout(() => {    // ease back to front when face leaves
      faceTarget = 0; if (!faceRAF) tickFace();
    }, 1600);
    if (!faceRAF) tickFace();
  }

  // ---- Smile detection ----
  if (result.faceBlendshapes && result.faceBlendshapes.length) {
    let smile = 0;
    for (const c of result.faceBlendshapes[0].categories) {
      if (c.categoryName === "mouthSmileLeft" || c.categoryName === "mouthSmileRight") {
        smile = Math.max(smile, c.score);
      }
    }
    if (smile > 0.45 && Date.now() >= visionCooldownUntil) {
      visionCooldownUntil = Date.now() + 5000;
      life.busyUntil = Date.now() + 2000;
      life.lastInteract = Date.now();
      addAffection(1.5);
      life.mood = clamp01(life.mood + 0.12);
      emote("❤️");
      playAnim("happy");
      sayLine(pickFrom(["你笑起来真好看喵～", "看到你笑我也好开心！", "嘿嘿，对着我笑啦～"]));
    }
  }
}

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
  // Mine the user message for facts BEFORE the request so the worker
  // already sees the newest fact in the memory block.
  extractFacts(text);
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
        memory: buildMemoryBlock(),                  // long-term facts about the user
        state: {                                     // so the LLM answers in-state
          mood:   Math.round(life.mood * 100) / 100,
          energy: Math.round(life.energy * 100) / 100,
          asleep: life.asleep,
          activity: currentAnim,
          catName: catNameDisplay(),
          userName: life.userName || "",
          dailyTheme: daily.theme || "",
        },
      }),
    });
    if (r.status === 429) {
      thinking.remove();
      appendMsg("cat", "（喵…太快啦，让我喘口气）");
      showStatus("请稍候再试 ♪", 1800);
      return;
    }
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

// =====================================================================
// Global error boundary — never let a stray exception or unhandled
// promise rejection wipe the entire UI. Show a tiny status toast and
// keep the cat alive. Suppresses noise from intermittent
// CDN/network issues that we cannot recover from anyway.
// =====================================================================
let lastErrorAt = 0;
function softError(label, info) {
  const now = Date.now();
  console.warn(`[${label}]`, info);
  // Throttle the toast so we don't spam the player.
  if (now - lastErrorAt < 4000) return;
  lastErrorAt = now;
  try { showStatus("有点小问题，喵继续陪着你～", 2200); } catch (_) {}
}
window.addEventListener("error", (e) => softError("error", e.message || e.error?.message));
window.addEventListener("unhandledrejection", (e) => softError("reject", e.reason?.message || e.reason));

console.log("喵喵精灵 AR · 生命行为引擎 loaded ✓");
