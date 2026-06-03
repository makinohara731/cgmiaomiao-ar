/**
 * CatState — the cat's behavioural state machine (the "busy" owner).
 *
 * Before P1.4, "is the cat busy?" was a single `life.busyUntil` timestamp that
 * ~two dozen call sites wrote directly (`life.busyUntil = Date.now() + ms`), and
 * the autonomous loop read with `now < life.busyUntil`. That scattered the one
 * rule — "don't let ambient behaviour barge in while something is playing" —
 * across the whole file.
 *
 * This collects that into one owner. Every claim now also names *what* is busy
 * (a one-shot clip, a composite sequence, a chat reply, a dialogue hold, a
 * sensor reaction), so later phases can reason about it.
 *
 * For P1.4 the contract is deliberately **behaviour-preserving**: `enter`/`hold`
 * set the busy window to exactly `now + ms` (last write wins, same as the old
 * direct assignment), and `isBusy(now)` is exactly the old `now < busyUntil`
 * gate. Priority / interrupt / a one-slot queue are the state machine's eventual
 * job (see `docs/计划.md`) and land with the renderer + dialogue work in P2/P3 —
 * they are intentionally NOT here yet, so this stays a pure, verifiable refactor.
 *
 * Out of scope here: the base loop (idle/walk/run) and sleep stay encoded by
 * `currentAnim` / `life.asleep` in main.js; the autonomous loop's second gate
 * (`currentAnim !== baseAnim()`) is unchanged. Face-toward (orientation) is a
 * separate channel and never goes through here.
 */

/** What is currently occupying the cat (and thus suppressing ambient behaviour). */
export type CatStateName =
  | "idle"       // nothing claimed — ambient behaviour free to run
  | "oneshot"    // a single clip: button / voice / pet / feed / wake / answer
  | "composite"  // a choreographed composite sequence (src/composites)
  | "dialogue"   // a question / nickname / bond-event hold
  | "react"      // a sensor reaction (shake, hand gesture, smile)
  | "chat";      // a chat request in flight + its reply dwell

export class CatStateMachine {
  private _state: CatStateName = "idle";
  private _busyUntil = 0;

  /** Injectable clock so the machine is unit-testable without real time. */
  constructor(private readonly now: () => number = () => Date.now()) {}

  /** The current state label. */
  get state(): CatStateName {
    return this._state;
  }

  /** The timestamp (ms epoch) the current claim frees up at. */
  get busyUntil(): number {
    return this._busyUntil;
  }

  /**
   * Claim the cat for `ms` from now, naming the activity. Last write wins — a
   * fresh claim (longer OR shorter) replaces the window, exactly as the old
   * `life.busyUntil = Date.now() + ms` did.
   */
  enter(state: CatStateName, ms: number): number {
    this._state = state;
    this._busyUntil = this.now() + ms;
    return this._busyUntil;
  }

  /**
   * Retime the *current* activity's window to `now + ms` without relabelling —
   * used to extend a hold, or shrink to a short read-tail (e.g. a chat terminal
   * resets to ~400ms so the loop is released once the reply has landed).
   */
  hold(ms: number): number {
    this._busyUntil = this.now() + ms;
    return this._busyUntil;
  }

  /** Free immediately and fall back to idle. */
  release(): void {
    this._state = "idle";
    this._busyUntil = this.now();
  }

  /**
   * Is the cat busy right now? When true the autonomous loop stays quiet.
   * Pass the caller's `now` to gate against the exact same timestamp it uses
   * elsewhere in the same tick.
   */
  isBusy(now: number = this.now()): boolean {
    return now < this._busyUntil;
  }
}
