/**
 * CatController — the SINGLE source of truth for "what clip is the cat playing".
 *
 * Replaces main.js's three informal owners (`currentAnim` global, `catState`,
 * `life.asleep`) and the `oneShotTimer = setTimeout(dur+90, …)` race that caused
 * the amplitude-damping bug: the autonomous loop + the timer would re-enter the
 * LOOPED idle action (CatModel.playClip's fadeIn/fadeOut branch) ON TOP of a
 * still-peaking one-shot, blending near-rest idle into the peak frames.
 *
 * Two invariants make that bug structurally impossible:
 *   1. Return-to-idle is driven by the mixer's 'finished' event (renderer
 *      .onClipFinished), NEVER a timer.
 *   2. A loop-clip fade-in is FORBIDDEN while a one-shot is unfinished
 *      (`_oneShotPending`): such requests are QUEUED as the post-finish target,
 *      so they can never fade idle in over a peaking one-shot. The only thing
 *      that interrupts an unfinished one-shot is another explicit one-shot
 *      (a user tap) → CatModel's HARD-CUT branch (other.stop()), damping-free.
 *
 * CatStateMachine is still entered by callers for the *semantic window*
 * (oneshot/composite/dialogue/chat); it and CatController have non-overlapping
 * jobs. isBusy() ORs the mixer truth with the semantic window.
 */
import type { CatRenderer } from "../renderer/CatRenderer";
import type { CatStateMachine } from "../anim/CatState";

export interface CatControllerDeps {
  renderer: CatRenderer;
  state: CatStateMachine;
  isLoopClip: (name: string) => boolean;
  baseClip: () => string;                       // life.asleep ? "sleep" : "idle"
  onAnimPlayed?: (name: string, loop: boolean) => void;
}

export class CatController {
  private _current = "idle";
  private _oneShotPending = false;
  private _queuedTarget: string | null = null;
  private _ready = false;
  private _disposeFinished?: () => void;

  constructor(private readonly d: CatControllerDeps) {}

  /** Wire the mixer 'finished' listener — the ONLY return-to-idle trigger.
   *  Call once the renderer reports the model ready. */
  attach(): void {
    if (this._ready) return;
    this._ready = true;
    this._disposeFinished = this.d.renderer.onClipFinished((finishedName) => {
      if (!this._oneShotPending) return;
      // A newer clip superseded the one that just finished — ignore the stale event.
      if (finishedName && finishedName !== this._current) return;
      this._oneShotPending = false;
      const target = this._queuedTarget ?? this.d.baseClip();
      this._queuedTarget = null;
      this.playLoopNow(target);
    });
  }

  get current(): string { return this._current; }
  get oneShotPending(): boolean { return this._oneShotPending; }

  /** True while a one-shot is still playing OR the semantic state holds the cat. */
  isBusy(now = Date.now()): boolean {
    return this._oneShotPending || this.d.state.isBusy(now);
  }

  /** Play any clip; loop vs one-shot is decided by the CLIPS registry. */
  play(name: string): void {
    if (!this._ready) return;
    const avail = this.d.renderer.getClips();
    if (!avail.includes(name)) name = avail.includes("idle") ? "idle" : avail[0];
    if (!name) return; // degraded no-clips mode: no-op gracefully

    if (this.d.isLoopClip(name)) {
      // INVARIANT 2: never fade a loop in over an unfinished one-shot.
      if (this._oneShotPending) { this._queuedTarget = name; return; }
      this.playLoopNow(name);
    } else {
      this.playOneShotNow(name);
    }
  }

  /** Explicit, gated return to the base loop. Deferred if a one-shot is mid-flight. */
  returnToIdle(): void {
    const base = this.d.baseClip();
    if (this._oneShotPending) { this._queuedTarget = base; return; }
    this.playLoopNow(base);
  }

  /** Layered orientation (face-toward) — a separate channel, never gated. */
  faceToward(yawDeg: number, pitchDeg: number): void {
    this.d.renderer.setOrientation(yawDeg, pitchDeg);
  }

  /** Seconds — duration of the clip currently playing. */
  currentDuration(): number {
    return this.d.renderer.currentDuration();
  }

  dispose(): void {
    this._disposeFinished?.();
    this._disposeFinished = undefined;
    this._ready = false;
  }

  // ---- internals ----
  private playLoopNow(name: string): void {
    this._oneShotPending = false;
    this._queuedTarget = null;
    this._current = name;
    void this.d.renderer.playClip(name, true); // loop branch (cross-fade) — safe: no one-shot pending
    this.d.onAnimPlayed?.(name, true);
  }

  private playOneShotNow(name: string): void {
    this._current = name;
    this._oneShotPending = true;               // set BEFORE play so a same-tick finished can't underflow
    this._queuedTarget = null;
    void this.d.renderer.playClip(name, false); // HARD-CUT branch (other.stop()) — damping-free
    this.d.onAnimPlayed?.(name, false);
  }
}
