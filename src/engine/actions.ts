/**
 * User-initiated actions — a move the user explicitly asked for (anim-bar button,
 * voice, chat). Ported from main.js userPlay/the composite click path. Claims the
 * semantic "oneshot" window, cancels any running routine, wakes the cat, and shows
 * the per-clip emote cue. The per-clip SFX + expression pairing live in
 * bootstrap.onAnimPlayed (fires for autonomy plays too, matching main.js playAnim).
 */
import { life, notifyLife } from "../stores/soul";
import * as composites from "../composites";
import { bumpInteract } from "./soul/life";
import { wakeForUser } from "./autonomy";
import { emote } from "./feedback";
import { EMOTE_FOR } from "./emote-art";
import type { CatController } from "./CatController";
import type { CatStateMachine } from "../anim/CatState";

let controller: CatController;
let state: CatStateMachine;

export function initActions(c: CatController, s: CatStateMachine): void {
  controller = c;
  state = s;
}

export function userPlay(name: string): void {
  bumpInteract();
  composites.cancel();                       // interrupt any running routine's pending steps
  if (name === "sleep") { life.asleep = true; notifyLife(); }
  else wakeForUser();                        // any other explicit action wakes the cat
  emote(EMOTE_FOR[name] || "");
  state.enter("oneshot", 1600);
  controller.play(name);                     // sync (three) — currentDuration is the new clip
  state.hold(controller.currentDuration() * 1000 + 400);
}

export function playComposite(name: string): void {
  bumpInteract(0.4);
  wakeForUser();                             // a composite shouldn't run under sleep
  composites.play(name);                     // claims catState via the busyUntil hook
}
