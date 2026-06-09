/**
 * Petting — escalating reaction to taps on the cat + the three pointer modes
 * (short tap on cat = pet, long-press = continuous pet, short tap on empty space
 * = curious lookaround). Ported from main.js (petCat + the pointer handlers).
 */
import { life, notifyLife, catNameDisplay } from "../stores/soul";
import { wakeUp } from "./autonomy";
import { bumpInteract } from "./soul/life";
import { emote, sayLine, showStatus } from "./feedback";
import { flashExpression } from "./expression";
import { play, currentClip, enterState } from "./runtime";
import { baseAnim } from "./clips";
import { faceToward, catScreenCenter } from "./face-toward";
import * as audio from "../audio";
import * as particles from "../particles";
import { bus, EVT } from "../bus";
import { pickFrom, clamp01 } from "./util";

function petCat(): void {
  if (life.asleep) { wakeUp(false); audio.playMeow(); return; }
  bumpInteract();
  life.petStreak += 1;
  life.totalPets += 1;
  if (life.petTimer) clearTimeout(life.petTimer);
  life.petTimer = window.setTimeout(() => { life.petStreak = 0; }, 2600);
  notifyLife();
  if (life.totalPets % 50 === 0) showStatus(`已经摸了${catNameDisplay()} ${life.totalPets} 次啦 ✨`, 2600);

  if (life.petStreak >= 3) {
    emote(pickFrom(["❤️", "💕", "✨"]));
    if (life.petStreak >= 10) audio.playPurrLong(); else audio.playPurr();
    sayLine(pickFrom(["呼噜呼噜～最喜欢你了！", "嘿嘿，好舒服喵～", "再多摸一会儿嘛～"]));
    life.mood = clamp01(life.mood + 0.18); notifyLife();
    enterState("oneshot", 1900);
    play("headpat");
    if (life.petStreak >= 10) flashExpression(life.affection >= 60 ? "blush" : "love", 2400);
  } else if (life.petStreak === 2) {
    emote("👋"); audio.playMeow(); enterState("oneshot", 1300); play("wave");
  } else {
    emote(pickFrom(["❤️", "♪", "！"])); audio.playMeow();
    if (currentClip() === baseAnim() && Math.random() < 0.6) play("lookaround");
  }
}

// ---- pointer interaction ----
const LONG_PRESS_MS = 350;
const PET_TICK_MS = 320;
let pressTimer: number | null = null;
let pressIsLong = false;
let pressTickInterval: number | null = null;
let pressStart: number | null = null;
let pressX = 0, pressY = 0;
let lastLookAt = 0;

function isUIElement(target: any): boolean {
  return !!(target?.closest?.(".ar-btn") || target?.closest?.(".anim-btn") ||
    target?.closest?.(".round-btn") || target?.closest?.(".chat-panel") ||
    target?.closest?.(".bond-chip") || target?.closest?.(".forever-badge") ||
    target?.closest?.(".status-panel") || target?.closest?.(".cfg-panel"));
}

function isNearCat(x: number, y: number): boolean {
  const w = window.innerWidth, h = window.innerHeight;
  const c = catScreenCenter();
  if (c) return Math.hypot(x - c.x, y - c.y) < Math.min(w, h) * 0.3;
  return Math.abs(x - w / 2) < w * 0.35 && y > h * 0.25 && y < h * 0.85;
}

function triggerPetAt(x: number, y: number, continuous: boolean): void {
  faceToward(x, y);
  petCat();
  particles.burst("heart", x, y - 24, continuous ? 2 : 3);
  bus.emit(EVT.PetTapped, { x, y, continuous });
}

function triggerLookAt(x: number, y: number): void {
  lastLookAt = Date.now();
  if (life.asleep) { emote("💤"); return; }
  faceToward(x, y);
  emote("❓");
  play("lookaround");
  audio.playChirp();
  particles.burst("sparkle", x, y, 3);
}

function startPress(e: PointerEvent): void {
  if (isUIElement(e.target)) return;
  pressStart = Date.now();
  pressX = e.clientX; pressY = e.clientY;
  pressIsLong = false;
  pressTimer = window.setTimeout(() => {
    if (!isNearCat(pressX, pressY)) return;
    pressIsLong = true;
    triggerPetAt(pressX, pressY, true);
    pressTickInterval = window.setInterval(() => triggerPetAt(pressX, pressY, true), PET_TICK_MS);
  }, LONG_PRESS_MS);
}
function cancelPress(): void {
  if (pressTimer) clearTimeout(pressTimer); pressTimer = null;
  if (pressTickInterval) clearInterval(pressTickInterval); pressTickInterval = null;
  pressStart = null; pressIsLong = false;
}
function endPress(e: PointerEvent): void {
  const start = pressStart;
  const wasLong = pressIsLong;
  if (pressTimer || pressTickInterval) cancelPress();
  if (start == null) return;
  const elapsed = Date.now() - start;
  pressStart = null; pressIsLong = false;
  if (!wasLong && elapsed < LONG_PRESS_MS) {
    if (isUIElement(e.target)) return;
    if (isNearCat(e.clientX, e.clientY)) triggerPetAt(e.clientX, e.clientY, false);
    else if (Date.now() - lastLookAt > 1800) triggerLookAt(e.clientX, e.clientY);
  }
}

/** Attach the petting/look gestures to the renderer's interaction target. */
export function installPetting(target: HTMLElement): void {
  target.addEventListener("pointerdown", startPress as any);
  target.addEventListener("pointerup", endPress as any);
  target.addEventListener("pointercancel", cancelPress);
  target.addEventListener("pointerleave", cancelPress);
  target.addEventListener("pointermove", (e: PointerEvent) => {
    if (pressStart == null) return;
    if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 14) cancelPress();
  });
  // Sparkle burst riding along bond unlocks.
  bus.on(EVT.BondUnlock, () => {
    particles.burst("sparkle", window.innerWidth / 2, window.innerHeight / 2, 7);
  });
}
