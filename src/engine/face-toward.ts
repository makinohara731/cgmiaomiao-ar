/**
 * Face-toward — the cat swivels its whole body to face where you tapped, holds,
 * then eases back. Layered on the playing clip (it's the model's orientation,
 * not an animation). Ported from main.js (tickFace / faceToward / catScreenCenter).
 * catScreenCenter returns the AR-tracked position (M6); null off-AR → screen centre.
 */
import { setOrientation } from "./runtime";

let faceYawTarget = 0, faceYawCurrent = 0;
let facePitchTarget = 0, facePitchCurrent = 0;
let faceRAF: number | null = null;
let faceReturnTimer: number | undefined;

/** The cat's on-screen centre — AR sessions override this (M6); null elsewhere. */
let screenCenterFn: () => { x: number; y: number } | null = () => null;
export function setScreenCenterFn(fn: () => { x: number; y: number } | null): void { screenCenterFn = fn; }
export function catScreenCenter(): { x: number; y: number } | null { return screenCenterFn(); }

function tickFace(): void {
  faceYawCurrent += (faceYawTarget - faceYawCurrent) * 0.16;
  facePitchCurrent += (facePitchTarget - facePitchCurrent) * 0.16;
  if (Math.abs(faceYawTarget - faceYawCurrent) < 0.25) faceYawCurrent = faceYawTarget;
  if (Math.abs(facePitchTarget - facePitchCurrent) < 0.25) facePitchCurrent = facePitchTarget;
  setOrientation(faceYawCurrent, facePitchCurrent);
  const settled = faceYawCurrent === faceYawTarget && facePitchCurrent === facePitchTarget;
  faceRAF = settled ? null : requestAnimationFrame(tickFace);
}

export function faceToward(clientX: number, clientY?: number): void {
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  const c = catScreenCenter();
  const cx = c ? c.x : w / 2;
  const rx = (clientX - cx) / (w / 2);
  faceYawTarget = Math.max(-32, Math.min(32, rx * 34));
  if (typeof clientY === "number") {
    const ry = (clientY / h) * 2 - 1;
    facePitchTarget = Math.max(-14, Math.min(14, -ry * 16));
  }
  clearTimeout(faceReturnTimer);
  faceReturnTimer = window.setTimeout(() => {
    faceYawTarget = 0; facePitchTarget = 0;
    if (faceRAF === null) tickFace();
  }, 1700);
  if (faceRAF === null) tickFace();
}
