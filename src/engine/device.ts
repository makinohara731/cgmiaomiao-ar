/**
 * Device wiring — first-gesture lazy init (unlock WebAudio, resume a cross-
 * session BGM, request motion permission) + shake detection. Faithful port of
 * main.js initOnFirstGesture/handleMotion/requestMotionPermission.
 */
import * as audio from "../audio";
import { life, cfg, notifyLife } from "../stores/soul";
import { hasUnlock } from "./soul/life";
import { wakeUp } from "./autonomy";
import { emote, showStatus } from "./feedback";
import { flashExpression } from "./expression";
import { play, enterState } from "./runtime";
import { clamp01 } from "./util";

// ---- shake → reaction (wakes a sleeping sprite, startled) ----
let lastShakeAt = 0;
function handleMotion(event: DeviceMotionEvent): void {
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
    notifyLife();
    const reaction = Math.random() < 0.65 ? "hurt" : "attack";
    showStatus("被你晃到啦！", 1500);
    enterState("react", 1500);
    emote("💫");
    play(reaction);
    flashExpression("surprise", 1500); // startled wide eyes
  }
}

async function requestMotionPermission(): Promise<boolean> {
  if (typeof DeviceMotionEvent === "undefined") return false;
  const req = (DeviceMotionEvent as any).requestPermission;
  if (typeof req === "function") {
    try {
      const state = await req.call(DeviceMotionEvent);
      return state === "granted";
    } catch (e) { console.warn("Motion permission denied:", e); return false; }
  }
  return true;
}

export function initFirstGesture(): void {
  const unlock = async (): Promise<void> => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
    try { audio.ensureAudio(); } catch { /* audio unavailable */ }
    // If BGM was on across sessions, the AudioContext is now usable.
    if (cfg.bgm && hasUnlock("bgm")) {
      try {
        const isNight = document.body.classList.contains("time-night");
        audio.startBGM(isNight ? "night" : "day");
      } catch { /* audio unavailable */ }
    }
    const ok = await requestMotionPermission();
    if (ok) window.addEventListener("devicemotion", handleMotion);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}
