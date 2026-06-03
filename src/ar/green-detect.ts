/**
 * Green-blob detection + AR placement math (P2.3 alt backend).
 *
 * Pure, THREE-free helpers so they can be unit-tested in node (the camera lock
 * itself still needs a real device). The strategy: instead of MindAR's
 * feature-point image tracking — which a SOLID colour block has zero features
 * for and so can never match — we detect a pure-green region by colour and
 * place the cat at its on-screen position, scaled by its apparent size. This
 * gives 2-DoF (position + size), not 6-DoF (no rotation), which is exactly
 * right for a pet that should always face the viewer.
 *
 * Coordinate conventions used throughout:
 *   - (u, v): centroid normalized to the camera frame, u∈[0,1] left→right,
 *     v∈[0,1] TOP→bottom (image convention).
 *   - (sx, sy): VIEWPORT NDC, both ∈[-1,1], y UP (GL/three convention).
 *   - matrices: 16-element COLUMN-MAJOR (three's Matrix4.elements order).
 */

export interface GreenThresholds {
  /** Min green channel (0..255) — rejects dark pixels. */
  minG: number;
  /** Green must be ≥ red·ratio and ≥ blue·ratio — rejects grey/white/yellow. */
  ratio: number;
  /** Green minus the smaller of {red,blue} must exceed this — rejects pale tints. */
  minDelta: number;
  /** Fraction of frame pixels that must be green to count as "found". */
  minAreaFrac: number;
}

/** Defaults for a phone SCREEN showing pure green seen through a webcam. NOTE:
 *  the camera does NOT capture #00FF00 — white balance + the display desaturate
 *  it toward a medium, slightly cyan-shifted green (e.g. ~(60,160,90)), so the
 *  ratio must stay LOOSE or the real captured green is rejected. Background-green
 *  robustness comes from the largest-connected-component pass below (which
 *  ignores everything but the dominant blob), NOT from an aggressive threshold.
 *  All four are tunable on hardware via ?gmin=&grat=&gdel=&gar=. */
export const DEFAULT_GREEN: GreenThresholds = {
  minG: 65,
  ratio: 1.35,
  minDelta: 30,
  minAreaFrac: 0.004, // ~0.4% of the frame — a small held-up card still passes
};

/** Is this RGB pixel "green" per the thresholds? */
export function isGreen(r: number, g: number, b: number, t: GreenThresholds): boolean {
  return (
    g >= t.minG &&
    g >= r * t.ratio &&
    g >= b * t.ratio &&
    g - Math.min(r, b) >= t.minDelta
  );
}

export interface BlobResult {
  /** Whether enough green was found to count as a marker. */
  found: boolean;
  /** Centroid x, normalized 0..1 (left→right). 0.5 when not found. */
  u: number;
  /** Centroid y, normalized 0..1 (top→bottom). 0.5 when not found. */
  v: number;
  /** Linear size fraction sqrt(greenPixels / totalPixels), 0..1. */
  sizeFrac: number;
  /** Raw green-pixel count (debug / thresholding). */
  count: number;
}

/**
 * Scan RGBA pixel data for the LARGEST connected green region's centroid +
 * apparent size. `data` is a row-major RGBA buffer (4 bytes/pixel) of a `w`×`h`
 * frame (e.g. canvas `getImageData`).
 *
 * Uses the largest 4-connected component, NOT a global centroid over all green
 * pixels — so background green (a plant, a green book, screen glare) can't bias
 * the result toward itself or, worse, park the cat in the empty gap BETWEEN two
 * green regions. The found-threshold applies to that dominant blob, so scattered
 * green specks don't sum up to a false lock either.
 */
export function detectGreenBlob(
  data: Uint8ClampedArray | number[],
  w: number,
  h: number,
  t: GreenThresholds = DEFAULT_GREEN
): BlobResult {
  const total = w * h;
  const minPix = total * t.minAreaFrac;

  // 1) build the green mask.
  const mask = new Uint8Array(total);
  let greenTotal = 0;
  for (let p = 0, i = 0; p < total; p++, i += 4) {
    if (isGreen(data[i], data[i + 1], data[i + 2], t)) {
      mask[p] = 1;
      greenTotal++;
    }
  }
  if (greenTotal === 0 || greenTotal < minPix) {
    return { found: false, u: 0.5, v: 0.5, sizeFrac: 0, count: 0 };
  }

  // 2) largest 4-connected component via iterative flood fill (destructive on
  //    the mask; each pixel is pushed once, so the stack never exceeds `total`).
  const stack = new Int32Array(total);
  let bestCount = 0;
  let bestSumX = 0;
  let bestSumY = 0;
  for (let start = 0; start < total; start++) {
    if (!mask[start]) continue;
    let top = 0;
    stack[top++] = start;
    mask[start] = 0;
    let cnt = 0;
    let sx = 0;
    let sy = 0;
    while (top > 0) {
      const q = stack[--top];
      const x = q % w;
      const y = (q / w) | 0;
      cnt++;
      sx += x;
      sy += y;
      if (x > 0 && mask[q - 1]) { mask[q - 1] = 0; stack[top++] = q - 1; }
      if (x < w - 1 && mask[q + 1]) { mask[q + 1] = 0; stack[top++] = q + 1; }
      if (y > 0 && mask[q - w]) { mask[q - w] = 0; stack[top++] = q - w; }
      if (y < h - 1 && mask[q + w]) { mask[q + w] = 0; stack[top++] = q + w; }
    }
    if (cnt > bestCount) {
      bestCount = cnt;
      bestSumX = sx;
      bestSumY = sy;
    }
  }

  if (bestCount < minPix) {
    return { found: false, u: 0.5, v: 0.5, sizeFrac: 0, count: bestCount };
  }
  return {
    found: true,
    u: bestSumX / bestCount / w,
    v: bestSumY / bestCount / h,
    sizeFrac: Math.sqrt(bestCount / total),
    count: bestCount,
  };
}

/**
 * Map a normalized camera-frame point (u, v) to VIEWPORT NDC (sx, sy),
 * accounting for `object-fit: cover` of a `vw`×`vh` video into a `cw`×`ch`
 * viewport. Cover scales the video to fill the viewport (cropping the
 * overflowing axis), so the displayed position of a frame point is shifted —
 * and the cat must land where the green APPEARS, not where it is in the raw
 * frame. Returns NDC that can exceed [-1,1] when the point is in the cropped
 * (off-screen) band.
 */
export function coverToNdc(
  u: number,
  v: number,
  vw: number,
  vh: number,
  cw: number,
  ch: number
): { sx: number; sy: number } {
  const s = Math.max(cw / vw, ch / vh); // object-fit: cover scale
  const kx = (vw * s) / cw;
  const ky = (vh * s) / ch;
  return {
    sx: (u - 0.5) * 2 * kx,
    sy: -(v - 0.5) * 2 * ky, // flip: image-y down → NDC-y up
  };
}

/**
 * Build the anchor's model-view matrix (column-major 16) that seats a unit at
 * viewport NDC (sx, sy), at view-space depth `depth` in front of an origin
 * camera with vertical fov `fovDeg` and viewport `aspect`, uniformly scaled by
 * `scale`. The AR camera sits at the origin looking −Z (matching the ArSession
 * contract), so view space == world space and this matrix IS the anchor's
 * world transform.
 *
 * Derivation: for a three perspective matrix, NDC.x = (f/aspect)·X / (−Z·−1)
 * with f = 1/tan(fov/2); solving for X at Z = −depth gives
 * X = sx·depth·aspect·tan(fov/2) = sx·halfW. Likewise Y = sy·halfH.
 */
export function anchorMatrix(
  sx: number,
  sy: number,
  depth: number,
  fovDeg: number,
  aspect: number,
  scale: number
): number[] {
  const t = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const halfH = depth * t;
  const halfW = halfH * aspect;
  const X = sx * halfW;
  const Y = sy * halfH;
  const Z = -depth;
  // column-major: scale on the diagonal, translation in the last column.
  return [scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, X, Y, Z, 1];
}

/**
 * A column-major perspective projection (three's Matrix4.elements layout) for
 * the AR camera. Only elements [5], [10], [14], [11] are consumed by the host's
 * `applyArProjection` (it re-derives fov/near/far and sets aspect itself), so
 * `aspect` here only affects [0] and is otherwise irrelevant — kept for shape.
 */
export function perspectiveProjection(
  fovDeg: number,
  aspect: number,
  near: number,
  far: number
): number[] {
  const f = 1 / Math.tan((fovDeg * Math.PI) / 180 / 2);
  const nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ];
}

/** Exponential moving average — smooths centroid/size jitter frame to frame. */
export function ema(prev: number, next: number, alpha: number): number {
  return prev + (next - prev) * alpha;
}
