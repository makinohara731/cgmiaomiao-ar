/**
 * Soft global error boundary — log it, show a gentle toast (throttled), never
 * crash the pet. Faithful port of main.js softError + the two window listeners.
 */
import { showStatus } from "./feedback";

let lastErrorAt = 0;
function softError(label: string, info: unknown): void {
  const now = Date.now();
  console.warn(`[${label}]`, info);
  if (now - lastErrorAt < 4000) return; // throttle — don't toast-spam a crash loop
  lastErrorAt = now;
  try { showStatus("有点小问题，喵继续陪着你～", 2200); } catch { /* */ }
}

export function installErrorBoundary(): void {
  window.addEventListener("error", (e) => softError("error", e.message || (e.error as Error | undefined)?.message));
  window.addEventListener("unhandledrejection", (e) => softError("reject", (e.reason as Error | undefined)?.message || e.reason));
}
