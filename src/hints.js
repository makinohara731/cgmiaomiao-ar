// First-time-only hint chips. Each chip has a stable id; if that id is
// in localStorage it's been seen and never shows again.
//
// Usage:
//   import { showHint, scheduleHint } from "./hints.js";
//   showHint("long-press", "试试长按摸我～");
//   scheduleHint("dance", "对我说「跳舞」看看？", 12000);

const HINTS_KEY = "miaomiao.hints.v1";

function loadSeen() {
  try { return new Set(JSON.parse(localStorage.getItem(HINTS_KEY) || "[]")); }
  catch (_) { return new Set(); }
}
function saveSeen(set) {
  try { localStorage.setItem(HINTS_KEY, JSON.stringify([...set])); } catch (_) {}
}
const seen = loadSeen();

export function hasSeen(id)  { return seen.has(id); }
export function markSeen(id) { seen.add(id); saveSeen(seen); }

function ensureHintHost() {
  let host = document.getElementById("hintHost");
  if (host) return host;
  host = document.createElement("div");
  host.id = "hintHost";
  host.setAttribute("aria-live", "polite");
  document.body.appendChild(host);
  return host;
}

// Show a hint chip. ttlMs is the auto-hide window. anchor is "top" /
// "center" / "bottom" — for where on the screen the chip floats in.
// Tapping the chip (or anywhere on it) marks it seen and hides it.
export function showHint(id, text, { ttlMs = 7000, anchor = "top" } = {}) {
  if (!id || seen.has(id)) return false;
  // Mark immediately so a re-entrant call won't spawn a duplicate.
  markSeen(id);
  const host = ensureHintHost();
  const chip = document.createElement("div");
  chip.className = `hint-chip hint-anchor-${anchor}`;
  chip.innerHTML = `<span class="hint-text">${text}</span><span class="hint-x">×</span>`;
  const dismiss = () => {
    chip.classList.add("hint-out");
    setTimeout(() => { try { chip.remove(); } catch (_) {} }, 400);
  };
  chip.addEventListener("click", dismiss);
  host.appendChild(chip);
  // Trigger CSS-driven enter animation.
  requestAnimationFrame(() => chip.classList.add("hint-in"));
  setTimeout(dismiss, ttlMs);
  return true;
}

// Same as showHint but delayed — fires once `delayMs` from now, if not
// already seen by then.
export function scheduleHint(id, text, delayMs, opts) {
  if (seen.has(id)) return;
  setTimeout(() => showHint(id, text, opts), delayMs);
}
