/**
 * Facial expression channel — the eyes are painted into the head texture atlas
 * (no eyelid mesh), so a blink/expression swaps the Head material's base-colour
 * texture. The renderer owns the texture load + swap; this owns the cadence
 * (auto-blink), the fallback chains, and the flash timing. Faithful port of
 * main.js initBlink/setExpression/setEyes/flashExpression/flashReplyFace/doBlink.
 */
import type { CatRenderer } from "../renderer/CatRenderer";
import { life } from "../stores/soul";
import { currentExpression } from "../stores/session";

let renderer: CatRenderer | null = null;
let currentExpr = "open"; // open / blink / happy / sad / surprise / love / cry / blush / think
let blinkReady = false;
let blinkTimer: number | undefined;
let expressionResetTimer: number | undefined;

const FACE_VARIANTS: Record<string, string> = {
  blink: "textures/face_blink.webp",
  happy: "textures/face_happy.webp",
  sad: "textures/face_sad.webp",
  surprise: "textures/face_surprise.webp",
  love: "textures/face_love.webp",
  cry: "textures/face_cry.webp",
  blush: "textures/face_blush.webp",
  think: "textures/face_think.webp",
};

export async function initExpression(r: CatRenderer): Promise<void> {
  renderer = r;
  try {
    await r.loadFaces({ variants: FACE_VARIANTS, headMaterial: "root.3" }); // root.3 = Head
    if (!r.hasFace("open")) return; // head material not found → eyes stay open
    blinkReady = true;
    if (life.asleep) setExpression("blink");
    scheduleBlink();
  } catch (e) {
    console.warn("expression init failed — eyes stay open:", e);
  }
}

export function setExpression(name: string): void {
  if (!renderer || !blinkReady || name === currentExpr) return;
  let resolved = name;
  if (name === "happy" && !renderer.hasFace("happy")) resolved = "blink";
  else if (name === "sad" && !renderer.hasFace("sad")) resolved = "open";
  else if (name === "surprise" && !renderer.hasFace("surprise")) resolved = "open";
  else if (name === "love" && !renderer.hasFace("love")) resolved = renderer.hasFace("happy") ? "happy" : "open";
  else if (name === "cry" && !renderer.hasFace("cry")) resolved = renderer.hasFace("sad") ? "sad" : "open";
  else if (name === "blush" && !renderer.hasFace("blush")) resolved = renderer.hasFace("love") ? "love" : "open";
  else if (name === "think" && !renderer.hasFace("think")) resolved = "blink";
  renderer.setFace(resolved);
  currentExpr = name; // track the REQUESTED name (doBlink only blinks from "open")
  currentExpression.set(name);
}

/** Hold eyes closed (sleep) / open. */
export function setEyes(closed: boolean): void {
  setExpression(closed ? "blink" : "open");
}

/** Show a transient expression, then ease back to "open" (unless asleep). */
export function flashExpression(name: string, ms = 1800): void {
  if (life.asleep || !renderer) return;
  setExpression(name);
  clearTimeout(expressionResetTimer);
  expressionResetTimer = window.setTimeout(() => {
    if (!life.asleep) setExpression("open");
  }, ms);
}

/** Reply → face: the expression follows the mood + any affectionate emoji of
 *  what the cat just said (used by chat/story in M4/M5). */
export function flashReplyFace(mood: string, glyph: string): void {
  if (life.asleep) return;
  const g = glyph || "";
  if (/[❤️💕💗💖😍🥰😻]/.test(g)) { flashExpression("love", 2200); return; }
  if (/[😳☺️😊🌸]/.test(g)) { flashExpression("blush", 2200); return; }
  if (/[😮😲😯🙀😱]/.test(g)) { flashExpression("surprise", 1600); return; }
  if (/[😢😭🥺😔]/.test(g)) { flashExpression("sad", 2000); return; }
  if (mood === "up") flashExpression("happy", 2000);
  else if (mood === "down") flashExpression("sad", 2000);
  else setExpression("open");
}

export function scheduleBlink(): void {
  clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(doBlink, 2400 + Math.random() * 4200);
}

function doBlink(): void {
  scheduleBlink();
  if (!blinkReady || life.asleep || currentExpr !== "open") return;
  const dbl = Math.random() < 0.3; // ~30% double-blinks
  setExpression("blink");
  window.setTimeout(() => {
    setExpression("open");
    if (dbl) window.setTimeout(() => {
      setExpression("blink");
      window.setTimeout(() => setExpression("open"), 110);
    }, 130);
  }, 115);
}
