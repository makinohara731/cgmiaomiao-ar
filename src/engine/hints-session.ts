/**
 * One-time gesture-tip chips — wires the kept src/hints.ts (seen-state in
 * miaomiao.hints.v1) to the session: two scheduled tips after onboarding, a
 * composites tip on the 2nd animation, a bond-chip tip on the first unlock.
 * Faithful port of main.js scheduleSessionHints + the two bus-driven hints.
 */
import * as hints from "../hints";
import { bus, EVT } from "../bus";

function scheduleSessionHints(): void {
  hints.scheduleHint("long-press", "试试长按摸我 —— 我会一直撒娇喵～", 8000, { anchor: "bottom" });
  hints.scheduleHint("tap-empty", "点空白处我会看过去哦", 18000, { anchor: "top" });
}

export function installHints(): void {
  // Returning users get the session tips; first-timers are busy onboarding
  // (the flag isn't written until the cutscene completes — old-app behaviour:
  // no tips compete with the intro on the very first visit).
  window.setTimeout(() => {
    if (localStorage.getItem("miaomiao.onboarded.v1")) scheduleSessionHints();
  }, 1500);

  // After the 2nd animation the user clearly likes the buttons — point at the
  // composites further down the tray.
  let animPlaysSeen = 0;
  bus.on(EVT.AnimPlayed, () => {
    animPlaysSeen += 1;
    if (animPlaysSeen === 2) {
      hints.showHint("composites", "动画栏往右滑，还有跳舞、看星星这些哦", { anchor: "bottom", ttlMs: 9000 });
    }
  });

  // First bond unlock → point at the bond chip (after the event dialogue).
  bus.on(EVT.BondUnlock, () => {
    setTimeout(() => hints.showHint("bond-chip", "点左上角心心，看看我们一起走过的日子", { anchor: "top", ttlMs: 8000 }), 4500);
  });
}
