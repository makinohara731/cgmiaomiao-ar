/**
 * Autonomous behaviour scheduler — the ambient "life" loop. Every few seconds,
 * if the cat is resting at its base loop and the user isn't driving it, pick a
 * personality-weighted micro-action (or a multi-clip composite routine). Ported
 * from main.js runBehavior; the proactive-speech / question / seek-care branches
 * are added in M3 (this M1 version is the motion ecology + sleep/wake + decay).
 */
import type { CatController } from "./CatController";
import { life, cfg, notifyLife } from "../stores/soul";
import { personality } from "./soul/life";
import { baseAnim } from "./clips";
import { timeBucket } from "./time-of-day";
import { clamp01, pickFrom, weightedPick } from "./util";
import * as composites from "../composites";
import * as audio from "../audio";
import { emote, showStatus } from "./feedback";
import { setEyes, scheduleBlink } from "./expression";
import { EMOTE_FOR } from "./emote-art";

let controller: CatController | null = null;
let behaviorTimer: number | undefined;
let modelReady = false;

export function initAutonomy(c: CatController): void { controller = c; }
export function setModelReady(v: boolean): void { modelReady = v; }

export function scheduleBehavior(): void {
  clearTimeout(behaviorTimer);
  const delay = life.asleep
    ? 10000 + Math.random() * 11000   // asleep → long, lazy gaps
    : 2200 + Math.random() * 3600;    // awake → snappier cadence
  behaviorTimer = window.setTimeout(runBehavior, delay);
}
export function stopBehavior(): void { clearTimeout(behaviorTimer); }

function runBehavior(): void {
  scheduleBehavior();                         // always queue the next tick
  if (!modelReady || !controller) return;

  const now = Date.now();
  if (controller.isBusy(now)) return;         // never interrupt a move / user action
  if (controller.current !== baseAnim()) return;

  if (life.asleep) {
    life.energy = clamp01(life.energy + 0.05);
    life.hunger = clamp01(life.hunger - 0.012);
    notifyLife();
    if (Math.random() < 0.45) emote("💤");
    return;
  }

  // awake: needs drift down (rate × personality)
  const pm = personality();
  life.hunger = clamp01(life.hunger - 0.024 * pm.decayMul);
  life.energy = clamp01(life.energy - 0.03 * pm.decayMul);
  life.mood = clamp01(life.mood - 0.02 * pm.decayMul);
  notifyLife();

  // energy crash → doze off (more likely at night if the setting is on)
  const nightSleepy = cfg.nightSleep && timeBucket() === "night";
  const sleepEnergy = nightSleepy ? 0.36 : 0.22;
  const sleepIgnore = nightSleepy ? 12000 : 18000;
  if (life.energy < sleepEnergy && now - life.lastInteract > sleepIgnore) {
    fallAsleep();
    return;
  }

  // M3: proactive speech (roll<0.24) / question (roll<0.32) / seekCare(lowestNeed)

  // Personality-biased multi-clip routine.
  const routineChance = clamp01(0.18 * pm.lively + 0.10 * pm.calm);
  if (Math.random() < routineChance) {
    const calmRoutines = ["routine_groom", "routine_cozy", "routine_curious"];
    const livelyRoutines = ["routine_hunt", "routine_zoom", "routine_play"];
    const goLively = life.energy > 0.5 && life.mood > 0.55 && Math.random() < 0.5 * pm.lively;
    composites.play(pickFrom(goLively ? livelyRoutines : calmRoutines));
    return;
  }

  const pool: [string, number][] = [
    ["lookaround", 26 * pm.calm], ["groom", 16 * pm.calm], ["sniff", 13],
    ["stretch", 10 * pm.calm], ["nothing", 10],
    ["headtilt", 14 * pm.calm], ["lickpaw", 12 * pm.calm], ["sit", 8 * pm.calm],
    ["ponder", 9 * pm.calm], ["shy", 6 * pm.calm],
  ];
  if (life.mood > 0.62 && life.energy > 0.5) {
    pool.push(["happy", 12 * pm.lively], ["spin", 6 * pm.lively], ["playbow", 6 * pm.lively], ["adore", 7 * pm.lively]);
  }
  if (life.energy > 0.72) pool.push(["jump", 6 * pm.lively], ["pounce", 6 * pm.lively]);

  const pick = weightedPick(pool);
  if (pick === "nothing") {
    if (Math.random() < 0.5) emote(pickFrom(["♪", "·ω·", "～", "🌿"]));
    return;
  }
  emote(EMOTE_FOR[pick] || "");
  controller.play(pick);
  if (["lookaround", "sniff", "groom"].includes(pick) && Math.random() < 0.4) audio.playChirp();
}

export function fallAsleep(): void {
  life.asleep = true; notifyLife();
  emote("💤"); audio.playYawn(); setEyes(true);
  showStatus("喵喵打盹了… 戳一下叫醒它", 2600);
  controller?.play("stretch");   // a yawn; when it ends baseAnim() is "sleep"
}

export function wakeUp(startled: boolean): void {
  if (!life.asleep) return;
  life.asleep = false; setEyes(false); scheduleBlink();
  life.energy = clamp01(life.energy + 0.45);
  life.lastInteract = Date.now();
  notifyLife();
  if (startled) { emote("❗"); audio.playHurt(); controller?.play("hurt"); }
  else { emote("🌞"); audio.playChirp(); controller?.play("stretch"); }
}

/** Wake quietly for an explicit user action — no wake clip (the caller plays its own). */
export function wakeForUser(): void {
  if (!life.asleep) return;
  life.asleep = false; setEyes(false); scheduleBlink();
  life.energy = clamp01(life.energy + 0.3);
  life.lastInteract = Date.now();
  notifyLife();
}
