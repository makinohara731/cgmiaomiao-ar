/**
 * Clip registry — loop:true clips run forever; the rest play once and the engine
 * returns the cat to its base loop afterwards. Single source of truth for "is
 * this clip a loop?" (ported verbatim from main.js).
 *
 * A NEW clip must be registered here AND in the emote map + VOICE_MAP + AnimBar +
 * the autonomy idle pool (+ the worker ANIMATIONS allowlist only if the LLM
 * should be allowed to choose it).
 */
import { life } from "../stores/soul";

export const CLIPS: Record<string, { loop: boolean }> = {
  idle: { loop: true }, walk: { loop: true }, run: { loop: true }, sleep: { loop: true },
  attack: { loop: false }, hurt: { loop: false }, wave: { loop: false },
  happy: { loop: false }, jump: { loop: false }, spin: { loop: false },
  backflip: { loop: false }, twirl: { loop: false },
  lookaround: { loop: false }, groom: { loop: false },
  stretch: { loop: false }, sniff: { loop: false }, eat: { loop: false },
  // v5
  headtilt: { loop: false }, sit: { loop: false }, lickpaw: { loop: false },
  pounce: { loop: false }, playbow: { loop: false },
  // v6 galgame
  nod: { loop: false }, shy: { loop: false }, ponder: { loop: false },
  adore: { loop: false }, headpat: { loop: false },
};

export const isLoopClip = (n: string): boolean => !!(CLIPS[n] && CLIPS[n].loop);

/** The loop the cat rests at: sleep while dozing, else idle. */
export const baseAnim = (): "idle" | "sleep" => (life.asleep ? "sleep" : "idle");
