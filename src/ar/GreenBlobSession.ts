import * as THREE from "three";
import type { ArSession } from "./ArSession";
import {
  DEFAULT_GREEN,
  detectGreenBlob,
  coverToNdc,
  anchorMatrix,
  perspectiveProjection,
  ema,
  type GreenThresholds,
} from "./green-detect";

/**
 * GreenBlobSession — desktop AR by COLOUR detection (P2.3 alt backend), an
 * `ArSession` sibling to `MindArSession`. Instead of MindAR's feature-point
 * image tracking (which a solid colour block has zero features for, so it could
 * never lock — exactly the failure seen on the first hardware test), it finds a
 * pure-green region in the camera frame and seats the cat at its on-screen
 * position, scaled by its apparent size.
 *
 * It implements the SAME `ArSession` contract as MindArSession, so the host
 * (`ThreeCatRenderer.enterAR`) reparents the EXACT same `CatModel` under
 * `anchor()` and renders over `video()` — every animation / face / petting /
 * dialogue interaction is preserved untouched. The trade-off vs MindAR: 2-DoF
 * (position + size), no 3-DoF rotation — the cat always faces the viewer, which
 * is what a pet should do anyway.
 *
 * No tfjs, no worker, no `.mind` — just a 2D canvas + per-pixel threshold, so it
 * is robust to phone-screen glare / moiré / small markers that defeat feature
 * tracking, and it works the same in dev and prod.
 */

export interface GreenBlobSessionOpts {
  facingMode?: "environment" | "user";
  thresholds?: GreenThresholds;
  /** Vertical fov (deg) of the synthetic AR camera. */
  fovDeg?: number;
  /** View-space depth (units) the cat is seated at. */
  depth?: number;
  /**
   * FIXED cat scale, independent of the detected green AREA. Tying size to the
   * blob area made the cat tiny whenever the green was muted / partly thresholded
   * (a dark green box, glare), so size is now a constant the green only POSITIONS.
   * The mount scale (?sc=) multiplies this for live fine-tuning.
   */
  baseScale?: number;
  /** Deprecated (area-coupled sizing); kept so callers passing them don't break. */
  sizeK?: number;
  sizeMin?: number;
  sizeMax?: number;
  /** EMA smoothing factor for centroid/size (0..1; higher = snappier). */
  smooth?: number;
  /** Detection-canvas width (frame is downscaled to this for speed). */
  sampleWidth?: number;
  /** Consecutive found/lost frames before the edge fires (debounce). */
  foundFrames?: number;
  lostFrames?: number;
}

const NEAR = 0.05;
const FAR = 1000;

export class GreenBlobSession implements ArSession {
  private readonly _anchor = new THREE.Group();
  private readonly _video: HTMLVideoElement;
  private readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;

  private stream: MediaStream | null = null;
  private running = false;
  private rafId = 0;
  private projMatrix: number[] | null = null;

  // smoothed tracking state
  private showing = false;
  private smU = 0.5;
  private smV = 0.5;
  private hasSample = false;
  private foundRun = 0;
  private lostRun = 0;
  // last seated viewport NDC (so the host can hit-test taps against the cat's
  // actual on-screen position instead of assuming screen-centre).
  private lastSx = 0;
  private lastSy = 0;

  private foundCb: (() => void) | null = null;
  private lostCb: (() => void) | null = null;

  private readonly facingMode: "environment" | "user";
  private readonly t: GreenThresholds;
  private readonly fovDeg: number;
  private readonly depth: number;
  private readonly baseScale: number;
  private readonly smooth: number;
  private readonly sampleWidth: number;
  private readonly foundFrames: number;
  private readonly lostFrames: number;

  private readonly _m = new THREE.Matrix4();

  constructor(opts: GreenBlobSessionOpts = {}) {
    this.facingMode = opts.facingMode ?? "environment";
    this.t = opts.thresholds ?? DEFAULT_GREEN;
    this.fovDeg = opts.fovDeg ?? 50;
    this.depth = opts.depth ?? 3;
    // Fixed prominent size (the cat fills a large share of the frame height at
    // depth 3 / fov 50), independent of how much green is detected. Bumped 1.3→2.2
    // after the first hardware test read "too small". ?sc= multiplies it via the
    // mount; ?bs= overrides this base directly (both live-tunable).
    this.baseScale = opts.baseScale ?? 2.2;
    this.smooth = opts.smooth ?? 0.35;
    this.sampleWidth = opts.sampleWidth ?? 192;
    this.foundFrames = opts.foundFrames ?? 2;
    this.lostFrames = opts.lostFrames ?? 8;

    // The loop drives anchor.matrix directly — turn OFF autoUpdate so
    // updateMatrixWorld doesn't recompose it from position/quat/scale.
    this._anchor.matrixAutoUpdate = false;
    this._anchor.visible = false;

    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.muted = true;
    v.autoplay = true;
    this._video = v;

    this.canvas = document.createElement("canvas");
  }

  // ---- ArSession ----

  async start(): Promise<void> {
    if (this.running) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: this.facingMode } },
      });
      // stop() may have run during the getUserMedia await.
      if (!this.stream) return;
      this._video.srcObject = this.stream;
      await this._video.play().catch(() => undefined);
      await this.waitForVideoDimensions();
      if (!this.stream) return; // stopped while waiting

      // Size the downscaled detection canvas to the camera aspect.
      const aspect = this._video.videoWidth / Math.max(1, this._video.videoHeight) || 4 / 3;
      this.canvas.width = this.sampleWidth;
      this.canvas.height = Math.max(1, Math.round(this.sampleWidth / aspect));
      this.ctx = this.canvas.getContext("2d", { willReadFrequently: true });

      this.projMatrix = perspectiveProjection(this.fovDeg, 1, NEAR, FAR);
      this.running = true;
      this.loop();
    } catch (e) {
      await this.stop(); // never leak the camera on a failed start
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (!this.running && !this.stream) return;
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((tr) => tr.stop());
      this.stream = null;
    }
    this._video.srcObject = null;
    this.ctx = null;
    this.showing = false;
    this.hasSample = false;
    this.foundRun = 0;
    this.lostRun = 0;
    this._anchor.visible = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  anchor(): THREE.Object3D {
    return this._anchor;
  }

  video(): HTMLVideoElement | null {
    return this._video;
  }

  cameraProjectionMatrix(): number[] | null {
    return this.projMatrix;
  }

  /** The cat's current on-screen position in VIEWPORT PIXELS (centre of the
   *  tracked green), or null when nothing is locked. The host uses this to
   *  hit-test taps/pets against where the cat actually is (it follows the green
   *  anywhere on screen), not the model-viewer-era screen-centre assumption. */
  screenPos(): { x: number; y: number } | null {
    if (!this.showing) return null;
    const w = window.innerWidth || 1;
    const h = window.innerHeight || 1;
    return { x: ((this.lastSx + 1) / 2) * w, y: ((1 - this.lastSy) / 2) * h };
  }

  onFound(cb: () => void): void {
    this.foundCb = cb;
  }

  onLost(cb: () => void): void {
    this.lostCb = cb;
  }

  // ---- internals ----

  private loop = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    this.step();
  };

  /** One detection frame: sample → threshold → smooth → seat the anchor. */
  private step(): void {
    const ctx = this.ctx;
    const vw = this._video.videoWidth;
    const vh = this._video.videoHeight;
    if (!ctx || vw === 0 || vh === 0 || this._video.readyState < 2) return;

    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.drawImage(this._video, 0, 0, cw, ch);
    const { data } = ctx.getImageData(0, 0, cw, ch);
    const blob = detectGreenBlob(data, cw, ch, this.t);

    if (!blob.found) {
      this.foundRun = 0;
      if (this.showing && ++this.lostRun >= this.lostFrames) {
        this.showing = false;
        this.hasSample = false; // next acquisition SNAPS, not eases from the stale spot
        this._anchor.visible = false;
        this.lostCb?.();
      }
      return;
    }

    // Confirm the marker via the found-debounce BEFORE showing anything, so a
    // one-frame stray green can't flash the cat on screen (visibility is gated on
    // the confirmed `showing` state, not the raw per-frame detection).
    this.lostRun = 0;
    if (!this.showing) {
      if (++this.foundRun < this.foundFrames) return; // still warming up — stay hidden
      this.showing = true;
      this.foundCb?.();
    }

    // Smooth the centroid (snap on the first sample so it doesn't ease in from the
    // last/centre position). Size is FIXED (baseScale) — the green only positions.
    if (!this.hasSample) {
      this.smU = blob.u;
      this.smV = blob.v;
      this.hasSample = true;
    } else {
      this.smU = ema(this.smU, blob.u, this.smooth);
      this.smV = ema(this.smV, blob.v, this.smooth);
    }

    // Map the centroid to viewport NDC through the object-fit: cover crop, then
    // seat the anchor at that screen point at the fixed scale.
    const portW = window.innerWidth || cw;
    const portH = window.innerHeight || ch;
    const { sx, sy } = coverToNdc(this.smU, this.smV, vw, vh, portW, portH);
    this.lastSx = sx;
    this.lastSy = sy;
    const m = anchorMatrix(sx, sy, this.depth, this.fovDeg, portW / portH, this.baseScale);
    this._anchor.matrix.copy(this._m.fromArray(m));
    this._anchor.matrixWorldNeedsUpdate = true;
    this._anchor.visible = true;
  }

  private waitForVideoDimensions(): Promise<void> {
    if (this._video.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this._video.removeEventListener("loadedmetadata", done);
        resolve();
      };
      this._video.addEventListener("loadedmetadata", done);
    });
  }
}
