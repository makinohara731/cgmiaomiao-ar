/**
 * Persistence — imperative save/load of the soul-layer localStorage keys, keeping
 * the EXACT key names + shapes so src/story/saves.ts snapshots them unchanged.
 * Every save* no-ops while saves.isSuppressed() (mid slot-restore). persistAll
 * runs on pagehide (sync) + visibilitychange:hidden. Never auto-persist from a
 * store subscription (would clobber a restore window).
 */
import { life, cfg, mem, diary, daily, notifyLife, notifyCfg, notifyDiary } from "../stores/soul";
import { story } from "../story/StoryEngine";
import * as saves from "../story/saves";
import { writeDiary } from "./soul/diary";
import { clamp01, localYMD } from "./util";
import { applyTimeOfDay } from "./time-of-day";
import { scheduleBehavior, stopBehavior } from "./autonomy";

const LIFE_KEY = "miaomiao.life.v1";
const MEM_KEY = "miaomiao.mem.v1";
const DIARY_KEY = "miaomiao.diary.v1";
const DAILY_KEY = "miaomiao.daily.v1";
const CFG_KEY = "miaomiao.cfg.v1";
const MEM_FACT_CAP = 12;

export function saveLife(): void {
  if (saves.isSuppressed()) return;
  try {
    localStorage.setItem(LIFE_KEY, JSON.stringify({
      energy: life.energy, mood: life.mood, hunger: life.hunger, asleep: life.asleep,
      totalPets: life.totalPets, affection: life.affection, bornAt: life.bornAt,
      seenEvents: life.seenEvents, catName: life.catName, userName: life.userName,
      unlocks: life.unlocks, savedAt: Date.now(),
    }));
  } catch { /* storage unavailable */ }
}

export function loadLife(): void {
  let s: any = null;
  try { s = JSON.parse(localStorage.getItem(LIFE_KEY) || "null"); } catch { /* */ }
  if (!s) return;
  life.totalPets = s.totalPets || 0;
  life.energy = clamp01(s.energy != null ? s.energy : 0.85);
  life.mood = clamp01(s.mood != null ? s.mood : 0.65);
  life.hunger = clamp01(s.hunger != null ? s.hunger : 0.8);
  life.asleep = !!s.asleep;
  life.affection = Math.max(0, Math.min(100, s.affection || 0));
  life.bornAt = s.bornAt || Date.now();
  life.seenEvents = Array.isArray(s.seenEvents) ? s.seenEvents : [];
  life.catName = typeof s.catName === "string" ? s.catName : "";   // "" = use default
  life.userName = typeof s.userName === "string" ? s.userName : "";
  life.unlocks = Array.isArray(s.unlocks) ? s.unlocks : [];
  const hoursAway = Math.max(0, (Date.now() - (s.savedAt || Date.now())) / 3600000);
  if (hoursAway > 0.05) {
    life.mood = clamp01(life.mood - hoursAway * 0.05);
    life.energy = clamp01(life.energy + hoursAway * 0.12);
    life.hunger = clamp01(life.hunger - hoursAway * 0.16);
    if (hoursAway > 2) life.asleep = true;
  }
  notifyLife();
}

export function saveCfg(): void { if (saves.isSuppressed()) return; try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* */ } }
export function loadCfg(): void { try { Object.assign(cfg, JSON.parse(localStorage.getItem(CFG_KEY) || "{}")); } catch { /* */ } notifyCfg(); }

export function saveMem(): void { if (saves.isSuppressed()) return; try { localStorage.setItem(MEM_KEY, JSON.stringify(mem)); } catch { /* */ } }
export function loadMem(): void {
  let s: any = null;
  try { s = JSON.parse(localStorage.getItem(MEM_KEY) || "null"); } catch { /* */ }
  if (!s) return;
  mem.facts = Array.isArray(s.facts) ? s.facts.slice(-MEM_FACT_CAP) : [];
  mem.topics = Array.isArray(s.topics) ? s.topics.slice(-6) : [];
}

export function saveDiary(): void { if (saves.isSuppressed()) return; try { localStorage.setItem(DIARY_KEY, JSON.stringify(diary.entries)); } catch { /* */ } }
export function loadDiary(): void {
  let s: any = null;
  try { s = JSON.parse(localStorage.getItem(DIARY_KEY) || "null"); } catch { /* */ }
  if (Array.isArray(s)) { diary.entries = s; notifyDiary(); }
}

export function saveDaily(): void { try { localStorage.setItem(DAILY_KEY, JSON.stringify(daily)); } catch { /* */ } }
export function loadDaily(): void {
  let s: any = null;
  try { s = JSON.parse(localStorage.getItem(DAILY_KEY) || "null"); } catch { /* */ }
  if (s) Object.assign(daily, s);
}

export function persistAll(): void {
  if (saves.isSuppressed()) return;
  saveLife(); saveMem(); saveDiary(); story.save();
  // Once-per-day "今天的心情" diary line, gated by the daily.diarized flag
  // (dailyRoll resets it on a new day).
  if (daily.theme && daily.ymd === localYMD() && !daily.diarized) {
    writeDiary(`今天的心情：${daily.theme}`, "day");
    daily.diarized = true;
    saveDaily();
  }
}

export function installPersistence(): void {
  const onIdle = (fn: () => void): void => {
    const w = window as any;
    if (w.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 1500 });
    else window.setTimeout(fn, 200);
  };
  window.setInterval(() => onIdle(saveLife), 15000);
  window.addEventListener("pagehide", persistAll);            // sync — page dying
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { persistAll(); stopBehavior(); }
    else { applyTimeOfDay(); scheduleBehavior(); }
  });
}
