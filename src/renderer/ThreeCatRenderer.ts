import type { CatRenderer } from "./CatRenderer";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * ThreeCatRenderer — the three.js backend for CatRenderer (P2.1).
 *
 * Same seam as ModelViewerRenderer: every clip call funnels through the
 * CatRenderer interface, so callers (playAnim et al.) don't know or care which
 * backend is live. This phase implements ANIMATION ONLY — load the Draco GLB,
 * play its 22 clips via an AnimationMixer with cross-fades, one-shots clamping
 * on their last frame. Orientation, facial-texture swaps, the load/error
 * lifecycle, mouse-orbit, ground shadow, and the MindAR anchor land in
 * P2.2–P2.4 (see docs/进度.md).
 *
 * The GLB requires KHR_draco_mesh_compression, so a DRACOLoader is mandatory;
 * its decoder ships in public/draco/ (served at BASE_URL + "draco/") so the app
 * stays offline-capable rather than depending on a CDN decoder.
 *
 * Visual defaults pre-match the model-viewer config we're replacing
 * (tone-mapping="aces", exposure="1.15", environment-image="neutral",
 * field-of-view="30deg"); exact framing/lighting parity is tuned in P2.2.
 */

const FOV = 30; // deg — matches model-viewer field-of-view
const EXPOSURE = 1.15; // matches model-viewer exposure
const FADE = 0.25; // s — clip cross-fade
const FALLBACK_DUR = 1.2; // s — when a clip duration is unknown

export interface ThreeCatRendererOpts {
  /** GLB url. Defaults to the app's character GLB under BASE_URL. */
  src?: string;
  /** Draco decoder dir (must end with "/"). Defaults to BASE_URL + "draco/". */
  dracoPath?: string;
  /** Extra WebGL context attributes (e.g. preserveDrawingBuffer for screenshots). */
  glAttributes?: Partial<WebGLContextAttributes>;
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

  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private root: THREE.Object3D | null = null;
  private ready = false;
  private rafId = 0;
  private readonly onResize = () => this.resize();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    opts: ThreeCatRendererOpts = {}
  ) {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    const src = opts.src ?? base + "character_v2.glb";
    const dracoPath = opts.dracoPath ?? base + "draco/";

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
    // Neutral image-based lighting — model-viewer's environment-image="neutral"
    // gives soft, even studio light + reflections on the PBR pack.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(roomEnv, 0.04).texture;
    pmrem.dispose();   // free the transient render targets; the env map is retained
    roomEnv.dispose(); // and the throwaway room geometry/materials
    // Explicit fill so the cat is lit on GPUs where the IBL render-target is weak
    // (e.g. headless swiftshader) and to seat the future ground shadow. Kept
    // gentle; exact model-viewer-neutral parity is tuned in P2.2.
    const hemi = new THREE.HemisphereLight(0xffffff, 0xb8c2cc, 1.2);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(0.6, 1.4, 1.0);
    this.scene.add(key);

    this.camera = new THREE.PerspectiveCamera(FOV, this.aspect(), 0.01, 100);

    const draco = new DRACOLoader().setDecoderPath(dracoPath);
    const loader = new GLTFLoader().setDRACOLoader(draco);
    loader.load(
      src,
      (gltf) => {
        this.onLoaded(gltf);
        draco.dispose();
        opts.onReady?.();
      },
      undefined,
      (err) => {
        console.error("ThreeCatRenderer: GLB load failed", err);
        draco.dispose(); // free the decoder worker on the failure path too
        opts.onError?.(err);
      }
    );

    this.resize();
    window.addEventListener("resize", this.onResize);
  }

  // ---- CatRenderer ----

  getClips(): string[] {
    return [...this.actions.keys()];
  }

  hasClip(name: string): boolean {
    return this.actions.has(name);
  }

  playClip(name: string, loop: boolean): Promise<void> {
    const action = this.actions.get(name);
    if (!action) return Promise.resolve();

    // Re-requesting the clip that's already looping (the autonomous idle pool /
    // VOICE_MAP keyword matches do this constantly): leave it running. A fresh
    // reset()+fadeIn would snap it to frame 0 and dim it to nothing for FADE s.
    if (action === this.currentAction && action.isRunning() && loop) {
      return Promise.resolve();
    }

    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop; // one-shots hold their last frame
    action.setEffectiveTimeScale(1);
    action.enabled = true;
    action.fadeIn(FADE);
    action.play();

    // Fade out every OTHER action still influencing the pose, so rapid switches
    // (A→B→C inside one fade window) don't pile up blended weight.
    for (const other of this.actions.values()) {
      if (other !== action && other.isRunning()) other.fadeOut(FADE);
    }
    this.currentAction = action;
    return Promise.resolve();
  }

  currentDuration(): number {
    // Read the live action so this can't drift from what's actually playing.
    return this.currentAction?.getClip().duration || FALLBACK_DUR;
  }

  isReady(): boolean {
    return this.ready;
  }

  // ---- internals ----

  private onLoaded(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): void {
    const root = gltf.scene;
    this.root = root;
    this.scene.add(root);

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    this.frameTo(root);
    this.ready = true;

    // Default to the idle loop if present, like the model-viewer autoplay.
    if (this.actions.has("idle")) this.playClip("idle", true);

    this.start();
  }

  /** Place the camera to frame the model, mirroring model-viewer's view angle. */
  private frameTo(root: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(root);
    if (box.isEmpty()) return; // degenerate/empty model — avoid NaN camera pos
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;

    // Distance so the model fits the 30° vertical FOV (with margin).
    const fitDist = (maxDim * 0.5) / Math.tan((FOV * 0.5 * Math.PI) / 180);
    const r = fitDist * 1.35;

    // model-viewer camera-orbit="90deg 85deg": theta=azimuth, phi=polar-from-+Y.
    const theta = (90 * Math.PI) / 180;
    const phi = (85 * Math.PI) / 180;
    this.camera.position.set(
      center.x + r * Math.sin(phi) * Math.sin(theta),
      center.y + r * Math.cos(phi),
      center.z + r * Math.sin(phi) * Math.cos(theta)
    );
    this.camera.lookAt(center);
    this.camera.updateProjectionMatrix();
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
      // Clamp so a backgrounded tab (huge accumulated delta) doesn't jump clips.
      const dt = Math.min(this.clock.getDelta(), 0.1);
      if (this.mixer) this.mixer.update(dt);
      this.renderer.render(this.scene, this.camera);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** Stop the render loop and release GPU resources. */
  dispose(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.ready = false;
    window.removeEventListener("resize", this.onResize);
    this.mixer?.stopAllAction();
    if (this.root) {
      this.mixer?.uncacheRoot(this.root);
      this.scene.remove(this.root);
      disposeObject(this.root); // renderer.dispose() does NOT free these
      this.root = null;
    }
    (this.scene.environment as THREE.Texture | null)?.dispose();
    this.scene.environment = null;
    this.mixer = null;
    this.currentAction = null;
    this.actions.clear();
    this.renderer.dispose();
  }
}

/** Free the GPU resources (geometry/material/textures) of a loaded subtree —
 *  three's `WebGLRenderer.dispose()` releases the context's programs and render
 *  targets but leaves these per-object resources allocated. */
function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose?.();
    const mat = mesh.material;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) disposeMaterial(m);
  });
}

function disposeMaterial(mat: THREE.Material): void {
  // Dispose any texture-valued property (map, normalMap, roughnessMap, …)
  // without having to enumerate every map name three defines.
  for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
  }
  mat.dispose();
}
