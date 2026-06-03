/**
 * Story layer types (P4) — the local, scripted galgame route/event/ending system
 * layered on the soul engine. Everything is deterministic + saveable; the LLM
 * only ever receives a short 【剧情】 mood hint, never the scripted text and never
 * the branching.
 *
 * Design mirrors the codebase's `configure()` injection pattern (audio/composites):
 * the engine owns NO globals — main.js injects the real host functions via
 * `StoryHooks`, so `src/story/*` never imports back into main.js.
 */

export type RouteId = "日常" | "羁绊" | "浪漫";

/** Persisted as `miaomiao.story.v1`. */
export interface StoryState {
  v: 1;
  /** Highest currently-unlocked route; recomputed on each host event. */
  route: RouteId;
  /** Beat ids already fired (the one-shot gate; parallel to life.seenEvents). */
  seenBeats: string[];
  /** Scratch story flags set by beats. */
  flags: Record<string, boolean | number | string>;
  /** Unlocked ending ids. */
  unlockedEndings: string[];
  /** True ONLY when the player taps the explicit 接受 choice — the hard 浪漫 gate. */
  acceptedRomance: boolean;
  updatedAt: number;
}

/** A read-only view of the soul-layer state the engine inspects, built fresh each
 *  check by main.js from `life` + the daily theme. */
export interface LifeView {
  affection: number;
  stage: string; // 初遇/熟悉/亲近/黏人/形影不离
  catName: string;
  userName: string; // "" if the cat doesn't know it yet
  hasUnlock(k: string): boolean;
  seenEvent(name: string): boolean; // life.seenEvents (bond stages) — NOT story.seenBeats
  dailyTheme: string;
}

export interface ChoiceItem {
  label: string;
  [k: string]: any;
}

/** The host functions main.js injects via `story.configure()`. */
export interface StoryHooks {
  life(): LifeView;
  sayLine(text: string): void;
  emote(glyph: string): void;
  playAnim(name: string): void;
  flashExpression(name: string, ms: number): void;
  choices: {
    show(items: ChoiceItem[], onPick: (item: ChoiceItem, index: number) => void, opts?: any): void;
    isOpen(): boolean;
  };
  /** Claim the cat as busy for ms (catState.enter("dialogue", ms)). */
  busy(ms: number): void;
  /** Whether the cat is busy right now (re-entrancy guard for beats). */
  isBusy(): boolean;
  writeDiary(text: string, tag: string): void;
  addAffection(delta: number): void;
}

/** What a beat's `run()` gets. */
export interface BeatCtx {
  hooks: StoryHooks;
  state: StoryState;
  life: LifeView;
  setFlag(k: string, v?: boolean | number | string): void;
  unlockEnding(id: string): void;
}

export interface Beat {
  id: string;
  route: RouteId;
  /** Fire at most once (default true). */
  once?: boolean;
  /** Eligibility gate, checked against fresh state + life. */
  gate(s: StoryState, l: LifeView): boolean;
  /** The scripted beat — uses ctx.hooks to speak/emote/choose. */
  run(ctx: BeatCtx): void;
}

export interface Ending {
  id: string;
  label: string;
  route: RouteId;
  icon: string;
  blurb: string;
  gate(s: StoryState, l: LifeView): boolean;
}
