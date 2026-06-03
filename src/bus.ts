// Tiny pub/sub event bus. Subsystems publish facts about what happened
// (no return values, no awaits), and other subsystems / UI / telemetry
// hook in without coupling to the publisher's call sites.
//
// Usage:
//   import { bus, EVT } from "./bus.js";
//   bus.on(EVT.BondUnlock, ({ key }) => ...);
//   bus.emit(EVT.BondUnlock, { key: "bgm" });

const handlers = new Map();   // event -> Set<fn>

function on(event, fn) {
  if (!handlers.has(event)) handlers.set(event, new Set());
  handlers.get(event).add(fn);
  return () => off(event, fn);
}

function off(event, fn) {
  const set = handlers.get(event);
  if (set) set.delete(fn);
}

function emit(event, payload) {
  const set = handlers.get(event);
  if (!set) return;
  for (const fn of set) {
    try { fn(payload); }
    catch (e) { console.warn(`[bus:${event}]`, e); }
  }
}

function once(event, fn) {
  const off1 = on(event, (p) => { off1(); fn(p); });
  return off1;
}

export const bus = { on, off, emit, once };

// Canonical event names — referenced from one place so a typo fails loudly.
export const EVT = Object.freeze({
  LifeLoaded:     "life:loaded",
  LifeChanged:    "life:changed",
  MoodChanged:    "mood:changed",
  AnimPlayed:     "anim:played",
  PetTapped:      "pet:tapped",
  PetStreak:      "pet:streak",
  BondUnlock:     "bond:unlock",
  BondStageUp:    "bond:stage_up",
  Speak:          "speak",            // { text }
  ChatStart:      "chat:start",       // { text }
  ChatChunk:      "chat:chunk",       // { delta }
  ChatEnvelope:   "chat:envelope",    // { reply, animation, emote, mood }
  ChatDone:       "chat:done",
  ChatError:      "chat:error",       // { code, message }
});
