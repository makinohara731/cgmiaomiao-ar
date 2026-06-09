/**
 * Life core — needs/affection/mood mutators over the `life` store object.
 * Ported from main.js (bumpInteract / addAffection / lowestNeed / personality).
 * Bond-event firing is injected (wired in M3) so addAffection stays self-contained.
 */
import { life, cfg, STAGES, notifyLife, type Stage } from "../../stores/soul";
import { story } from "../../story/StoryEngine";
import { clamp01 } from "../util";

const PERSONALITY: Record<string, { decayMul: number; lively: number; calm: number }> = {
  default: { decayMul: 1.0, lively: 1.0, calm: 1.0 },
  lively: { decayMul: 1.4, lively: 2.0, calm: 0.6 },
  gentle: { decayMul: 0.7, lively: 0.7, calm: 1.4 },
  lazy: { decayMul: 0.5, lively: 0.4, calm: 1.7 },
};
export const personality = () => PERSONALITY[cfg.personality] || PERSONALITY.default;

export const hasUnlock = (name: string): boolean => life.unlocks.includes(name);

// Bond events (the ladder + unlocks + diary) are wired in M3; until then this is
// a no-op so a stage-boundary cross still advances affection cleanly.
let bondEventHandler: (st: Stage) => void = () => {};
export function setBondEventHandler(fn: (st: Stage) => void): void { bondEventHandler = fn; }

export function addAffection(delta: number): void {
  const prev = life.affection;
  life.affection = Math.max(0, Math.min(100, prev + delta));
  story.onAffection(prev, life.affection); // recompute route + sync endings (records only)
  if (delta > 0) {
    // Fire a bond event for EVERY stage boundary crossed, ascending.
    for (const st of STAGES) {
      if (st.min > prev && st.min <= life.affection) bondEventHandler(st);
    }
  }
  notifyLife();
}

export function bumpInteract(amount = 1): void {
  life.lastInteract = Date.now();
  life.mood = clamp01(life.mood + 0.12 * amount);
  life.energy = clamp01(life.energy + 0.10 * amount);
  addAffection(0.3 * amount); // calls notifyLife
}

/** Which need most wants care right now (null = content). */
export function lowestNeed(): "hunger" | "mood" | "energy" | null {
  if (life.hunger < 0.28) return "hunger";
  if (life.mood < 0.30) return "mood";
  if (life.energy < 0.36) return "energy";
  return null;
}
