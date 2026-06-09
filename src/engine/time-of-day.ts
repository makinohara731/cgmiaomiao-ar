/**
 * Time-of-day — drives the storybook sky (body time-* class) and biases the cat
 * (sleepier at night). Swaps the BGM theme to match. Ported from main.js.
 */
import * as audio from "../audio";

export function timeBucket(): "morning" | "afternoon" | "evening" | "night" {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "morning";
  if (h >= 11 && h < 17) return "afternoon";
  if (h >= 17 && h < 22) return "evening";
  return "night";
}

export function applyTimeOfDay(): void {
  const h = new Date().getHours();
  let cls = "time-day";
  if (h >= 5 && h < 7) cls = "time-dawn";
  else if (h >= 18 && h < 20) cls = "time-dusk";
  else if (h >= 20 || h < 5) cls = "time-night";
  for (const c of ["time-dawn", "time-day", "time-dusk", "time-night"]) {
    document.body.classList.remove(c);
  }
  document.body.classList.add(cls);
  if (audio.bgmRunning()) {
    const theme = cls === "time-night" ? "night" : "day";
    if (audio.bgmTheme() !== theme) audio.startBGM(theme);
  }
}

let todInterval: number | undefined;
export function startTimeOfDay(): void {
  applyTimeOfDay();
  todInterval = window.setInterval(applyTimeOfDay, 30 * 60 * 1000);
}
export function stopTimeOfDay(): void {
  if (todInterval) clearInterval(todInterval);
}
