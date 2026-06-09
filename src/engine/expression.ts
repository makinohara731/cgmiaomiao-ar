/**
 * Facial expression channel (head-texture swap) — blink loop + flash + sleep eyes.
 *
 * M1: minimal stub (the cat renders + animates without it). The real blink loop,
 * FACE_VARIANTS load, flashExpression, and sleep-eye hold are ported in M2/M3
 * (faithful to main.js initBlink/setExpression/flashExpression/doBlink/setEyes).
 */
import type { CatRenderer } from "../renderer/CatRenderer";

let renderer: CatRenderer | null = null;

export function initExpression(r: CatRenderer): void {
  renderer = r;
  // M2: renderer.loadFaces({ variants: FACE_VARIANTS, headMaterial: "root.3" })
  //     then start the blink loop.
}

/** Hold eyes closed (sleep) / open. M2 fills this in. */
export function setEyes(_closed: boolean): void {
  /* M2 */
}

export function scheduleBlink(): void {
  /* M2 */
}

/** Briefly show an expression, then revert. M2/M3 fills this in. */
export function flashExpression(_name: string, _ms = 1800): void {
  /* M2/M3 */
}

export function setExpression(_name: string): void {
  /* M2 */
}

export function _renderer(): CatRenderer | null { return renderer; }
