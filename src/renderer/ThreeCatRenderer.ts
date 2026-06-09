import type { CatRenderer, FaceConfig } from "./CatRenderer";
import type { ArSession } from "../ar/ArSession";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CatModel } from "./CatModel";

/**
 * ThreeCatRenderer — the three.js backend for CatRenderer (the desktop default
 * since P2.4d). It owns the SCENE INFRASTRUCTURE (renderer / scene / neutral
 * lighting / camera / OrbitControls / contact-shadow ground / render loop) and
 * holds a `CatModel` for the cat itself, forwarding the CatRenderer clip / face /
 * orientation calls to it.
 *
 * The cat lives in `CatModel` (P2.3) so the AR path (`MindArSession`) reuses the
 * exact same animated/expressive cat by parenting `cat.object3D` to a marker
 * anchor instead of this scene — only the scene infrastructure differs.
 *
 * Visual defaults match the model-viewer config this replaced (tone-mapping
 * "aces", exposure 1.15, environment "neutral", fov 30°); framing tuned in P2.4d.
 */

const FOV = 30; // deg — matches model-viewer field-of-view
const EXPOSURE = 1.15; // matches model-viewer exposure
// Camera framing — tuned (P2.4d) so the default view matches model-viewer's
// (idle facing + size). Dev-overridable via ?az=&ph=&mg= for tuning sweeps.
const VIEW_AZIMUTH_DEG = 66; // azimuth around the model (was 90 = too side-on)
const VIEW_POLAR_DEG = 85; // polar from +Y, == model-viewer camera-orbit phi
const FIT_MARGIN = 1.6; // >1 pulls the camera back so the cat isn't cropped

/** How to seat the cat on the tracked marker (P2.3). All tunable on real
 *  hardware — the marker frame's exact axes can't be verified headless. */
export interface EnterArOpts {
  /**
   * Cat height as a fraction of the marker-card width (the post-matrix makes
   * 1 unit == 1 card width and the model is ~1.9 units, so apparent height ≈
   * 1.9·scale card-widths). 0.5 ⇒ roughly one card-width tall.
   */
  scale?: number;
  /**
   * Degrees about X to stand the Y-up model up onto the card. +90 maps model-up
   * (+Y) → the card normal (+Z). Flip the sign if the cat ends up upside-down /
   * sunk into the card on real hardware.
   */
  rotXDeg?: number;
  /** Degrees about Y (yaw) if the cat faces away from the viewer on the card. */
  rotYDeg?: number;
  /** Lift along the card normal (+Z, card-width units) so the feet sit on top. */
  lift?: number;
}

export interface ThreeCatRendererOpts {
  /** GLB url. Defaults to the app's character GLB under BASE_URL. */
  src?: string;
  /** Draco decoder dir (must end with "/"). Defaults to BASE_URL + "draco/". */
  dracoPath?: string;
  /** Extra WebGL context attributes (e.g. preserveDrawingBuffer for screenshots). */
  glAttributes?: Partial<WebGLContextAttributes>;
  /** Mouse-orbit (OrbitControls). Default true; AR mode passes false. */
  enableControls?: boolean;
  /** Called once the model + clips are ready. */
  onReady?: () => void;
  /** Called if the GLB fails to load. */
  onError?: (err: unknown) => void;
}

export class ThreeCatRenderer implements CatRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly cat: CatModel;

  private controls: OrbitControls | null = null;
  private readonly target = new THREE.Vector3();
  private readonly enableControls: boolean;
  private readonly viewAzimuth: number;
  private readonly viewPolar: number;
  private readonly fitMargin: number;
  private rafId = 0;
  private readonly onResize = () => this.resize();

  // AR mode (P2.3): when active, the cat is reparented under the tracked anchor
  // and the camera renders over the live feed using the session's projection.
  private arSession: ArSession | null = null;
  private arEntering = false; // enterAR() is awaiting start() (sync re-entrancy guard)
  private arMount: THREE.Group | null = null;
  private readonly savedCamPos = new THREE.Vector3();
  private readonly savedCamQuat = new THREE.Quaternion();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: ThreeCatRendererOpts = {}
  ) {
    this.enableControls = opts.enableControls !== false;
    // Dev tuning overrides: ?az=<azimuth>&ph=<polar>&mg=<fit-margin>.
    const q = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
    this.viewAzimuth = q.has("az") ? Number(q.get("az")) : VIEW_AZIMUTH_DEG;
    this.viewPolar = q.has("ph") ? Number(q.get("ph")) : VIEW_POLAR_DEG;
    this.fitMargin = q.has("mg") ? Number(q.get("mg")) : FIT_MARGIN;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true, // transparent bg so a camera/AR feed can show through later
      powerPreference: "high-performance",
      ...opts.glAttributes,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = EXPOSURE;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    // Neutral image-based lighting — model-viewer's environment-image="neutral".
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    pmrem.dispose();
    roomEnv.dispose();
    // Explicit fill so the cat is lit on GPUs where the IBL render-target is weak
    // (e.g. headless swiftshader). Kept gentle.
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c2cc, 1.2);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.6, 1.4, 1.0);
    this.scene.add(key);

    this.camera = new THREE.PerspectiveCamera(FOV, this.aspect(), 0.01, 100);

    this.cat = new CatModel({
      src: opts.src,
      dracoPath: opts.dracoPath,
      onReady: () => {
        this.onCatReady();
        opts.onReady?.();
      },
      onError: opts.onError,
    });

    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  // ---- CatRenderer (forwarded to the CatModel) ----

  getClips(): string[] {
    return this.cat.getClips();
  }
  hasClip(name: string): boolean {
    return this.cat.hasClip(name);
  }
  playClip(name: string, loop: boolean): Promise<void> {
    this.cat.playClip(name, loop);
    return Promise.resolve();
  }
  currentDuration(): number {
    return this.cat.currentDuration();
  }
  isReady(): boolean {
    return this.cat.isReady();
  }
  setOrientation(yawDeg: number, pitchDeg: number): void {
    this.cat.setOrientation(yawDeg, pitchDeg);
  }
  getInteractionTarget(): HTMLElement {
    return this.canvas;
  }
  loadFaces(config: FaceConfig): Promise<void> {
    return this.cat.loadFaces(config);
  }
  hasFace(name: string): boolean {
    return this.cat.hasFace(name);
  }
  setFace(name: string): void {
    this.cat.setFace(name);
  }
  onClipFinished(cb: (clipName: string) => void): () => void {
    return this.cat.onClipFinished(cb);
  }

  // ---- internals ----

  private onCatReady(): void {
    this.scene.add(this.cat.object3D);
    const { centre, maxDim } = this.cat.bounds();
    this.frameTo(centre, maxDim);
    this.setupControls();
    this.start();
  }

  /** Place the camera to frame the cat, mirroring model-viewer's view angle. */
  private frameTo(centre: THREE.Vector3, maxDim: number): void {
    const fitDist = (maxDim * 0.5) / Math.tan((FOV * 0.5 * Math.PI) / 180);
    const r = fitDist * this.fitMargin;
    const theta = THREE.MathUtils.degToRad(this.viewAzimuth);
    const phi = THREE.MathUtils.degToRad(this.viewPolar);
    this.camera.position.set(
      centre.x + r * Math.sin(phi) * Math.sin(theta),
      centre.y + r * Math.cos(phi),
      centre.z + r * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(centre);
    this.camera.updateProjectionMatrix();
    this.target.copy(centre);
  }

  /** Mouse-orbit around the cat (model-viewer's `camera-controls` equivalent). */
  private setupControls(): void {
    if (!this.enableControls) return;
    const c = new OrbitControls(this.camera, this.canvas);
    c.target.copy(this.target);
    c.enablePan = false;
    c.enableDamping = true;
    c.dampingFactor = 0.08;
    const dist = this.camera.position.distanceTo(this.target);
    c.minDistance = dist * 0.55;
    c.maxDistance = dist * 2.2;
    c.update();
    this.controls = c;
  }

  private aspect(): number {
    const w = this.canvas.clientWidth || window.innerWidth || 1;
    const h = this.canvas.clientHeight || window.innerHeight || 1;
    return w / h;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth || 1;
    const h = this.canvas.clientHeight || window.innerHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private start(): void {
    if (this.rafId) return;
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.cat.update(this.clock.getDelta());
      this.controls?.update();
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  // ---- AR mode (P2.3) ----

  /** Whether AR mode is currently active. */
  isAR(): boolean {
    return this.arSession !== null;
  }

  /** Debug/introspection: the camera's current framing (handy when tuning AR
   *  alignment against a real card, and asserted by the AR smoke harness). */
  cameraState(): { fov: number; near: number; far: number; isAR: boolean } {
    return {
      fov: this.camera.fov,
      near: this.camera.near,
      far: this.camera.far,
      isAR: this.isAR(),
    };
  }

  /**
   * Enter image-target AR: start the tracker, then reparent THIS cat under the
   * tracked anchor and switch to the AR camera (at the origin, projection from
   * the session — the tracked worldMatrix bakes in the view). `start()` runs
   * FIRST so a permission denial / load failure rejects with the fallback view
   * still intact (the cat isn't reparented until tracking is live; the session
   * releases its own camera/tracker on failure, and we belt-and-suspenders
   * `stop()` it anyway). The `arEntering` flag is a SYNCHRONOUS re-entrancy guard
   * so a double-tap on the AR button can't pass the guard twice during the
   * multi-second `start()` await; exitAR()/dispose() during that await cancel it.
   * The host shows `session.video()` behind the (transparent) canvas as the AR
   * backdrop.
   */
  async enterAR(session: ArSession, opts: EnterArOpts = {}): Promise<void> {
    if (this.arSession || this.arEntering) return; // already in / entering AR
    this.arEntering = true;
    try {
      await session.start(); // throws on denial/failure — fallback view untouched
    } catch (e) {
      this.arEntering = false;
      void session.stop(); // release anything start() opened before it threw
      throw e;
    }
    // exitAR()/dispose() during the await cleared the flag → honour the cancel:
    // don't enter, and release the now-started session.
    if (!this.arEntering) {
      void session.stop();
      return;
    }
    this.arSession = session;
    this.arEntering = false;

    // Drop mouse-orbit; the camera is now driven by the tracked pose.
    this.controls?.dispose();
    this.controls = null;

    // Mount that seats the Y-up cat on the card: stand up (rotX) + optional yaw,
    // scaled to a fraction of the card width, lifted along the card normal.
    const scale = opts.scale ?? 0.5;
    const mount = new THREE.Group();
    mount.rotation.set(
      THREE.MathUtils.degToRad(opts.rotXDeg ?? 90),
      THREE.MathUtils.degToRad(opts.rotYDeg ?? 0),
      0
    );
    mount.scale.setScalar(scale);
    mount.position.set(0, 0, opts.lift ?? 0);

    // Reparent the SAME CatModel (keeps its animation/face state) into the anchor.
    this.scene.remove(this.cat.object3D);
    mount.add(this.cat.object3D);
    const anchor = session.anchor();
    anchor.add(mount);
    this.scene.add(anchor);
    this.arMount = mount;

    // Hide the contact shadow when the cat stands upright (colour-marker AR): the
    // horizontal shadow plane would be edge-on to the level camera with no ground
    // under it. Keep it for the laid-flat card case (rotX≈90, MindAR).
    this.cat.setContactShadowVisible(Math.abs(opts.rotXDeg ?? 90) > 45);

    // AR camera: origin, looking -Z (GL convention the worldMatrix assumes).
    this.savedCamPos.copy(this.camera.position);
    this.savedCamQuat.copy(this.camera.quaternion);
    this.camera.position.set(0, 0, 0);
    this.camera.quaternion.identity();
    this.applyArProjection();
  }

  /** Derive the AR camera's fov/near/far from the session's GL projection and the
   *  canvas aspect (the intrinsics are centred, so a symmetric three frustum +
   *  a CSS-cover video matches mind-ar's own resize math). */
  private applyArProjection(): void {
    const proj = this.arSession?.cameraProjectionMatrix();
    if (!proj) return;
    this.camera.fov = (2 * Math.atan(1 / proj[5]) * 180) / Math.PI;
    this.camera.near = proj[14] / (proj[10] - 1);
    this.camera.far = proj[14] / (proj[10] + 1);
    this.camera.aspect = this.aspect();
    this.camera.updateProjectionMatrix();
  }

  /** Leave AR: stop the tracker, restore the framed fallback view + orbit. */
  exitAR(): void {
    // An enterAR() is mid-flight (still awaiting start()): cancel it — its
    // post-await check sees the cleared flag and releases the session itself.
    if (this.arEntering) {
      this.arEntering = false;
      return;
    }
    const session = this.arSession;
    if (!session) return;
    this.arSession = null;
    void session.stop();

    const anchor = session.anchor();
    if (this.arMount) {
      this.arMount.remove(this.cat.object3D);
      anchor.remove(this.arMount);
      this.arMount = null;
    }
    this.scene.remove(anchor);
    this.scene.add(this.cat.object3D);
    this.cat.setContactShadowVisible(true); // restore for the fallback view

    // Restore the fallback camera (FOV/near/far it was constructed with) + framing.
    this.camera.fov = FOV;
    this.camera.near = 0.01;
    this.camera.far = 100;
    this.camera.position.copy(this.savedCamPos);
    this.camera.quaternion.copy(this.savedCamQuat);
    this.camera.aspect = this.aspect();
    this.camera.updateProjectionMatrix();
    this.setupControls();
  }

  /** Stop the render loop and release GPU resources. */
  dispose(): void {
    if (this.arSession || this.arEntering) this.exitAR();
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    window.removeEventListener("resize", this.onResize);
    this.controls?.dispose();
    this.controls = null;
    this.scene.remove(this.cat.object3D);
    this.cat.dispose();
    (this.scene.environment as THREE.Texture | null)?.dispose();
    this.scene.environment = null;
    this.renderer.dispose();
  }
}
