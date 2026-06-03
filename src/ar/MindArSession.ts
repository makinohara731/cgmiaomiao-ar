import * as THREE from "three";
import type { ArSession } from "./ArSession";
import { loadMindarImage } from "./mindar-runtime";

/**
 * MindArSession — desktop image-target AR (P2.3) on the vendored mind-ar 1.2.5
 * LOW-LEVEL `Controller` (NOT `MindARThree`, whose three build imports the
 * removed `sRGBEncoding` and link-errors on three ≥0.160). It owns the camera
 * stream + the tracker and exposes a single `anchor()` Object3D whose matrix it
 * drives each frame from the tracked pose; the host (ThreeCatRenderer) parents
 * the cat under it and renders over `video()` with `cameraProjectionMatrix()`.
 *
 * The tracked `worldMatrix` is the OpenGL MODEL-VIEW matrix (column-major, view
 * baked in), so the host camera sits at the origin looking -Z. We replicate
 * mindar-image-three's two reference transforms exactly:
 *   anchor.matrix = Matrix4.fromArray(worldMatrix) · postMatrix
 *   postMatrix    = compose( (w/2, h/2, 0), identity, scale w )   // per marker
 * which centres the anchor on the card and makes 1 unit == the marker width.
 *
 * Heavy (tfjs + tracker, ~2.2MB) → the runtime is lazy-loaded on `start()` only.
 * NOTE: an actual marker LOCK can't be verified headless (needs a physical card
 * + real camera); `dev/ar-smoke` verifies everything up to that point.
 */

export interface MindArSessionOpts {
  /** `.mind` marker file URL. Defaults to BASE_URL + "targets/miao-card.mind". */
  markerSrc?: string;
  /** Preferred camera facing. Default "environment" (rear). */
  facingMode?: "environment" | "user";
  /**
   * One-Euro filter min cutoff — lower = steadier when still but more lag.
   * mind-ar's default is 0.001; raise toward ~0.01 if the cat feels laggy.
   */
  filterMinCF?: number;
  /**
   * One-Euro filter beta — higher = snappier on fast motion (less smoothing).
   * mind-ar's default is 0.001; raise if the cat lags behind quick card moves.
   */
  filterBeta?: number;
}

export class MindArSession implements ArSession {
  private readonly _anchor = new THREE.Group();
  private readonly _video: HTMLVideoElement;

  private controller: any = null;
  private stream: MediaStream | null = null;
  private readonly postMatrix = new THREE.Matrix4();
  private projMatrix: number[] | null = null;
  private dims: number[] | null = null;
  private running = false;
  private prepared = false;
  /** Whether the marker is currently showing (debounces found/lost edges). */
  private showing = false;

  private foundCb: (() => void) | null = null;
  private lostCb: (() => void) | null = null;

  private readonly markerSrc: string;
  private readonly facingMode: "environment" | "user";
  private readonly filterMinCF: number;
  private readonly filterBeta: number;

  /** Scratch matrix so the per-frame onUpdate allocates nothing. */
  private readonly _scratch = new THREE.Matrix4();

  constructor(opts: MindArSessionOpts = {}) {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    this.markerSrc = opts.markerSrc ?? base + "targets/miao-card.mind";
    this.facingMode = opts.facingMode ?? "environment";
    this.filterMinCF = opts.filterMinCF ?? 0.001;
    this.filterBeta = opts.filterBeta ?? 0.001;

    // The tracker drives anchor.matrix directly each frame — turn OFF autoUpdate
    // (else updateMatrixWorld would recompose matrix from position/quat/scale and
    // clobber the tracked pose) and start hidden until the card is found.
    this._anchor.matrixAutoUpdate = false;
    this._anchor.visible = false;

    // Offscreen <video>: feeds the tracker AND is shown as the AR backdrop by the
    // host. Own it here so it never collides with main.js's passthrough #camFeed.
    const v = document.createElement("video");
    v.setAttribute("playsinline", "");
    v.muted = true;
    v.autoplay = true;
    this._video = v;
  }

  /**
   * Set up the camera + tracker WITHOUT starting the tracking loop: open the
   * camera, lazy-load the runtime, build the Controller at the camera
   * resolution, load the marker (→ post-matrix), and snapshot the projection.
   * Idempotent. Split out from `start()` so a host can warm up ahead of time —
   * and so the GPU/video-independent wiring (everything but the kernel warmup)
   * is verifiable headless (`dev/ar-smoke`), where a fake camera produces no
   * capturable frames for the tfjs warmup.
   */
  async prepare(): Promise<void> {
    if (this.prepared) return;

    // 1) camera — rejects if the user denies permission (host handles it).
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: this.facingMode } },
    });
    this._video.srcObject = this.stream;
    await this._video.play().catch(() => undefined);
    await this.waitForVideoDimensions();

    const inputWidth = this._video.videoWidth;
    const inputHeight = this._video.videoHeight;

    // 2) lazy-load the vendored runtime (tfjs + tracker stay out of the bundle).
    const { Controller } = await loadMindarImage();

    // 3) build the controller at the camera's native resolution.
    this.controller = new Controller({
      inputWidth,
      inputHeight,
      maxTrack: 1,
      filterMinCF: this.filterMinCF,
      filterBeta: this.filterBeta,
      onUpdate: (data: any) => this.onControllerUpdate(data),
    });

    // 4) load the marker → its pixel dimensions drive the post-matrix.
    const { dimensions } = await this.controller.addImageTargets(this.markerSrc);
    const dim = dimensions?.[0];
    if (!dim) throw new Error("MindArSession: marker has no targets");
    const [markerWidth, markerHeight] = dim;
    this.dims = [markerWidth, markerHeight];
    // mindar-image-three's per-target post-matrix: centre the anchor on the card
    // and make 1 unit == the marker width.
    this.postMatrix.compose(
      new THREE.Vector3(markerWidth / 2, markerWidth / 2 + (markerHeight - markerWidth) / 2, 0),
      new THREE.Quaternion(),
      new THREE.Vector3(markerWidth, markerWidth, markerWidth)
    );

    // 5) projection is constant once targets are loaded — snapshot it for the host.
    this.projMatrix = Array.from(this.controller.getProjectionMatrix() as ArrayLike<number>);
    this.prepared = true;
  }

  async start(): Promise<void> {
    if (this.running) return;
    try {
      await this.prepare();
      // stop() may have run during the prepare() awaits → controller is gone.
      if (!this.controller) return;
      // Warm up the GPU kernels (slow first build), then start the tracking loop.
      await this.controller.dummyRun(this._video);
      if (!this.controller) return; // stopped while warming up
      this.controller.processVideo(this._video);
      this.running = true;
    } catch (e) {
      // prepare() can already have opened the camera + built the Controller
      // before the failure (e.g. the tfjs kernel warmup throwing). Release them
      // so a failed start() never leaks the camera/worker, then rethrow. stop()'s
      // guard makes this a no-op when getUserMedia itself was what rejected.
      await this.stop();
      throw e;
    }
  }

  async stop(): Promise<void> {
    if (!this.running && !this.prepared && !this.stream) return;
    this.running = false;
    this.prepared = false;
    this.showing = false;
    if (this.controller) {
      try {
        this.controller.stopProcessVideo();
      } catch {
        /* ignore */
      }
      try {
        this.controller.dispose();
      } catch {
        /* ignore */
      }
      this.controller = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this._video.srcObject = null;
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

  /** The tracked marker's [width, height] in mind-ar's pixel units (the post-
   *  matrix scale), or null before `prepare()`. Handy for sizing/debug. */
  markerDimensions(): number[] | null {
    return this.dims;
  }

  onFound(cb: () => void): void {
    this.foundCb = cb;
  }

  onLost(cb: () => void): void {
    this.lostCb = cb;
  }

  // ---- internals ----

  private onControllerUpdate(data: any): void {
    // The controller also emits {type:"processDone"} every frame — ignore it.
    if (!data || data.type !== "updateMatrix") return;
    const worldMatrix = data.worldMatrix as number[] | null;
    if (worldMatrix) {
      // anchor.matrix = worldMatrix(model-view) · postMatrix, both column-major.
      this._scratch.fromArray(worldMatrix).multiply(this.postMatrix);
      this._anchor.matrix.copy(this._scratch);
      this._anchor.matrixWorldNeedsUpdate = true; // autoUpdate is off
      this._anchor.visible = true;
      if (!this.showing) {
        this.showing = true;
        this.foundCb?.();
      }
    } else if (this.showing) {
      this.showing = false;
      this._anchor.visible = false;
      this.lostCb?.();
    }
  }

  /** Resolve once the camera reports real frame dimensions (needed before the
   *  Controller is constructed at the input resolution). */
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
