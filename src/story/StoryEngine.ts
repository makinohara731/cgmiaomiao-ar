/**
 * StoryEngine (P4) — the runtime singleton. Holds StoryState, persists it
 * (`miaomiao.story.v1`), exposes the thin "one line in an existing fn" host-event
 * hooks main.js calls, evaluates beat gates, and fires AT MOST ONE beat per safe
 * turn. Owns NO content (that's Route.ts) and NO globals (host fns injected via
 * configure()).
 *
 * Re-entrancy discipline (the P4 risk list): affection/bond/name changes only
 * RECORD state (route + endings) — they never play a beat synchronously, because
 * they can fire mid bond-event-chain or mid chat-stream. Beats play only via
 * `maybeBeat()` on the throttled proactive turn, and only when the cat is idle
 * (`hooks.isBusy()` false) and no choices are open. `seenBeats` + marking-seen
 * BEFORE run() prevents double-fire on big affection jumps.
 */
import type { StoryState, StoryHooks, RouteId, Beat, BeatCtx, Ending, LifeView } from "./types";
import { pickRoute, moodHintFor, BEATS, ENDINGS } from "./Route";

const STORY_KEY = "miaomiao.story.v1";

function freshState(): StoryState {
  return {
    v: 1,
    route: "日常",
    seenBeats: [],
    flags: {},
    unlockedEndings: [],
    acceptedRomance: false,
    updatedAt: 0,
  };
}

export class StoryEngine {
  state: StoryState = freshState();
  private hooks: StoryHooks | null = null;

  /** Inject host fns (mirrors audio/composites.configure). Call before load(). */
  configure(hooks: StoryHooks): void {
    this.hooks = hooks;
  }

  /** Load persisted story state (versioned + guarded like loadLife), then sync
   *  the route + already-met endings against the current life view. */
  load(): void {
    try {
      const raw = localStorage.getItem(STORY_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && p.v === 1) {
          this.state = {
            v: 1,
            route: typeof p.route === "string" ? (p.route as RouteId) : "日常",
            seenBeats: Array.isArray(p.seenBeats) ? p.seenBeats : [],
            flags: p.flags && typeof p.flags === "object" ? p.flags : {},
            unlockedEndings: Array.isArray(p.unlockedEndings) ? p.unlockedEndings : [],
            acceptedRomance: !!p.acceptedRomance,
            updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : 0,
          };
        }
      }
    } catch {
      /* corrupt → keep defaults */
    }
    this.recomputeRoute();
    this.syncEndings();
    this.save();
  }

  save(): void {
    this.state.updatedAt = Date.now();
    try {
      localStorage.setItem(STORY_KEY, JSON.stringify(this.state));
    } catch {
      /* storage full / disabled — non-fatal */
    }
  }

  route(): RouteId {
    return this.state.route;
  }

  /** The ≤120-char 【剧情】 mood hint for buildChatBody (mood label only). */
  storyHint(): string {
    if (!this.hooks) return "";
    return moodHintFor(this.state, this.hooks.life()).slice(0, 120);
  }

  /** Endings + their unlocked state, for the 回廊/gallery panel. */
  endings(): { ending: Ending; unlocked: boolean }[] {
    const l = this.hooks ? this.hooks.life() : null;
    return ENDINGS.map((e) => ({
      ending: e,
      unlocked: this.state.unlockedEndings.includes(e.id) || (!!l && e.gate(this.state, l)),
    }));
  }

  // ---- host-event entry points (one line each in an existing main.js fn) ----
  // These only RECORD (route + endings); they never play a beat synchronously.

  onAffection(_prev: number, _next: number): void {
    this.recomputeRoute();
    this.syncEndings();
    this.save();
  }

  onBondStage(_stageName: string): void {
    this.recomputeRoute();
    this.syncEndings();
    this.save();
  }

  onDailyRoll(_theme: string): void {
    this.recomputeRoute();
    this.save();
  }

  onNameLearned(_name: string): void {
    this.recomputeRoute();
    this.save();
  }

  onOnboardComplete(): void {
    this.recomputeRoute();
    this.save();
  }

  /** Try to play one gated, unseen beat — ONLY from a safe (idle) turn. Returns
   *  true iff a beat actually ran. Called from the throttled proactive path. */
  maybeBeat(_trigger?: string): boolean {
    if (!this.hooks) return false;
    if (this.hooks.isBusy() || this.hooks.choices.isOpen()) return false; // re-entrancy guard
    const l = this.hooks.life();
    const beat = BEATS.find((b) => !this.isSeen(b) && b.gate(this.state, l));
    if (!beat) return false;
    this.markSeen(beat); // mark BEFORE run so nothing double-fires
    this.runBeat(beat, l);
    return true;
  }

  /** The explicit romance accept gate (P4.4). Stubbed here. */
  offerRomanceChoice(): boolean {
    return false;
  }

  setFlag(k: string, v: boolean | number | string = true): void {
    this.state.flags[k] = v;
    this.save();
  }

  unlockEnding(id: string): void {
    if (!this.state.unlockedEndings.includes(id)) {
      this.state.unlockedEndings.push(id);
      this.save();
    }
  }

  // ---- internals ----

  private recomputeRoute(): void {
    if (!this.hooks) return;
    this.state.route = pickRoute(this.state, this.hooks.life());
  }

  private syncEndings(): void {
    if (!this.hooks) return;
    const l = this.hooks.life();
    for (const e of ENDINGS) {
      if (!this.state.unlockedEndings.includes(e.id) && e.gate(this.state, l)) {
        this.state.unlockedEndings.push(e.id);
        this.hooks.writeDiary(`解锁结局「${e.label}」`, "bond");
      }
    }
  }

  private isSeen(b: Beat): boolean {
    return b.once !== false && this.state.seenBeats.includes(b.id);
  }

  private markSeen(b: Beat): void {
    if (b.once !== false && !this.state.seenBeats.includes(b.id)) this.state.seenBeats.push(b.id);
  }

  private runBeat(beat: Beat, life: LifeView): void {
    if (!this.hooks) return;
    const ctx: BeatCtx = {
      hooks: this.hooks,
      state: this.state,
      life,
      setFlag: (k, v = true) => this.setFlag(k, v),
      unlockEnding: (id) => this.unlockEnding(id),
    };
    try {
      beat.run(ctx);
    } catch {
      /* a broken beat must not crash the autonomous loop */
    }
    this.save();
  }
}

export const story = new StoryEngine();
