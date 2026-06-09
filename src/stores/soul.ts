/**
 * Soul state — the persisted "life" of the cat.
 *
 * Faithful port of main.js's model: each domain is a PLAIN mutable object (the
 * source of truth, mutated imperatively by the engine), mirrored into a Svelte
 * store that the UI subscribes to. The `notify*()` fns push the latest object to
 * subscribers — they are the new `refreshHud()` seam. (Svelte's safe_not_equal
 * treats objects as always-changed, so `set(sameObject)` still notifies.)
 *
 * Persistence is IMPERATIVE (engine calls save*); never via store.subscribe —
 * an auto-persist would fire during the saves.withSuppressed() rehydrate window
 * and clobber a just-restored slot.
 */
import { writable, derived } from "svelte/store";

// ---- life ----
export interface Life {
  energy: number; mood: number; hunger: number; asleep: boolean;
  lastInteract: number; petStreak: number; petTimer: number | null;
  totalPets: number; affection: number; bornAt: number;
  seenEvents: string[]; catName: string; userName: string; unlocks: string[];
}
export const life: Life = {
  energy: 0.85, mood: 0.65, hunger: 0.8, asleep: false,
  lastInteract: Date.now(), petStreak: 0, petTimer: null,
  totalPets: 0, affection: 0, bornAt: Date.now(),
  seenEvents: [], catName: "", userName: "", unlocks: [],
};
export const lifeStore = writable<Life>(life);
/** Push mutated `life` to subscribers (the new refreshHud). */
export function notifyLife(): void { lifeStore.set(life); }

// ---- cfg (settings) ----
export interface Cfg {
  personality: "default" | "lively" | "gentle" | "lazy";
  proactive: boolean; nightSleep: boolean; cloudVoice: boolean; bgm: boolean;
}
export const cfg: Cfg = {
  personality: "default", proactive: true, nightSleep: true, cloudVoice: true, bgm: false,
};
export const cfgStore = writable<Cfg>(cfg);
export function notifyCfg(): void { cfgStore.set(cfg); }

// ---- long-term memory ----
export interface Fact { k: "likes" | "dislikes" | "self" | "fact"; v: string; ts: number; }
export const mem: { facts: Fact[]; topics: string[] } = { facts: [], topics: [] };

// ---- diary (held in an object so the array can be replaced without rebinding) ----
export interface DiaryEntry { ymd: string; text: string; tag: string; ts: number; }
export const diary: { entries: DiaryEntry[] } = { entries: [] };
export const diaryStore = writable<DiaryEntry[]>(diary.entries);
export function notifyDiary(): void { diaryStore.set(diary.entries); }

// ---- daily roll ----
export const daily: { ymd: string; theme: string; moodBias: number; diarized: boolean } = {
  ymd: "", theme: "", moodBias: 0, diarized: false,
};

// ---- naming + relationship stages ----
export const DEFAULT_CAT_NAME = "喵喵";
/** Imperative getter (empty catName === use default). */
export const catNameDisplay = (): string => life.catName || DEFAULT_CAT_NAME;

export interface Stage { name: string; min: number; }
export const STAGES: Stage[] = [
  { name: "初遇", min: 0 }, { name: "熟悉", min: 15 }, { name: "亲近", min: 35 },
  { name: "黏人", min: 60 }, { name: "形影不离", min: 85 },
];
export function stageOf(a: number): Stage {
  let s = STAGES[0];
  for (const x of STAGES) if (a >= x.min) s = x;
  return s;
}

// ---- derived (reactive) views for the UI ----
export const catName = derived(lifeStore, ($l) => $l.catName || DEFAULT_CAT_NAME);
export const stage = derived(lifeStore, ($l) => stageOf($l.affection));
