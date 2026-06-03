import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import type { FaceConfig } from "./CatRenderer";

/**
 * CatModel — the cat as a self-contained three.js unit: the loaded Draco GLB, its
 * AnimationMixer + 22 clips (cross-faded, one-shots clamp), facial-expression
 * head-texture swaps, face-toward orientation, and a soft contact shadow — all
 * parented under one `object3D` you can drop into ANY scene.
 *
 * It owns NO renderer / camera / lights / loop, so both the fallback view
 * (`ThreeCatRenderer`) and AR (`MindArSession`, P2.3) reuse it: add `.object3D`
 * to their own scene or AR anchor, call `update(dt)` each frame, and forward the
 * clip/face/orientation calls. The host frames its camera from `bounds()`.
 *
 * The GLB requires KHR_draco_mesh_compression, so a DRACOLoader is mandatory.
 */

const FADE = 0.25; // s — clip cross-fade
const FALLBACK_DUR = 1.2; // s — when a clip duration is unknown

export interface CatModelOpts {
  /** GLB url. Defaults to the app's character GLB under BASE_URL. */
  src?: string;
  /** Draco decoder dir (must end with "/"). Defaults to BASE_URL + "draco/". */
  dracoPath?: string;
  /** Called once the model + clips are ready. */
  onReady?: () => void;
  /** Called if the GLB fails to load. */
  onError?: (err: unknown) => void;
}

export class CatModel {
  /** Parent this into a scene or AR anchor. Holds the centred pivot + shadow. */
  readonly object3D = new THREE.Group();

  private mixer: THREE.AnimationMixer | null = null;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentAction: THREE.AnimationAction | null = null;
  private root: THREE.Object3D | null = null;
  private pivot: THREE.Group | null = null;
  private contactShadow: THREE.Mesh | null = null;
  private ready = false;

  // facial expressions
  private headMaterial: THREE.MeshStandardMaterial | null = null;
  private neutralMap: THREE.Texture | null = null;
  private readonly faces = new Map<string, THREE.Texture | null>();

  // local-space bounds (for the host to frame its camera)
  private readonly _centre = new THREE.Vector3();
  private _maxDim = 1;

  constructor(opts: CatModelOpts = {}) {
    const base = (import.meta as any).env?.BASE_URL ?? "/";
    const src = opts.src ?? base + "character_v2.glb";
    const dracoPath = opts.dracoPath ?? base + "draco/";

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
        console.error("CatModel: GLB load failed", err);
        draco.dispose(); // free the decoder worker on the failure path too
        opts.onError?.(err);
      }
    );
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Local-space framing info: model centre + largest dimension. */
  bounds(): { centre: THREE.Vector3; maxDim: number } {
    return { centre: this._centre, maxDim: this._maxDim };
  }

  /** Advance the animation. Call once per frame from the host's render loop. */
  update(dt: number): void {
    // Clamp so a backgrounded tab (huge accumulated delta) doesn't jump clips.
    this.mixer?.update(Math.min(dt, 0.1));
  }

  // ---- clips ----

  getClips(): string[] {
    return [...this.actions.keys()];
  }

  hasClip(name: string): boolean {
    return this.actions.has(name);
  }

  playClip(name: string, loop: boolean): void {
    const action = this.actions.get(name);
    if (!action) return;

    // Re-requesting the clip that's already looping (the autonomous idle pool /
    // VOICE_MAP keyword matches do this constantly): leave it running. A fresh
    // reset()+fadeIn would snap it to frame 0 and dim it to nothing for FADE s.
    if (action === this.currentAction && action.isRunning() && loop) return;

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
  }

  currentDuration(): number {
    // Read the live action so this can't drift from what's actually playing.
    return this.currentAction?.getClip().duration || FALLBACK_DUR;
  }

  // ---- orientation (face-toward) ----

  setOrientation(yawDeg: number, pitchDeg: number): void {
    if (!this.pivot) return;
    // Turn about the model centre: yaw → world-up (Y), pitch → X. Sign matches
    // model-viewer's UX (positive yaw turns the cat toward screen-right).
    this.pivot.rotation.set(
      THREE.MathUtils.degToRad(pitchDeg),
      THREE.MathUtils.degToRad(yawDeg),
      0
    );
  }

  // ---- facial expressions (head material `.map` swap) ----

  async loadFaces(config: FaceConfig): Promise<void> {
    if (!this.root || this.headMaterial) return; // not loaded yet, or already done
    const head = this.findMaterial(this.root, config.headMaterial);
    if (!head) {
      console.warn("CatModel: head material not found —", config.headMaterial);
      return;
    }
    this.headMaterial = head;
    this.neutralMap = head.map; // the GLB's own face texture
    this.faces.set("open", this.neutralMap);

    const base = (import.meta as any).env?.BASE_URL ?? "/";
    const loader = new THREE.TextureLoader();
    await Promise.all(
      Object.entries(config.variants).map(([name, url]) =>
        loader
          .loadAsync(base + url)
          .then((tex) => {
            this.tuneFaceTexture(tex);
            this.faces.set(name, tex); // best-effort: a failed load just stays absent
          })
          .catch(() => undefined)
      )
    );
  }

  hasFace(name: string): boolean {
    return this.faces.has(name);
  }

  setFace(name: string): void {
    if (!this.headMaterial || !this.faces.has(name)) return;
    // Swap the base-colour map to the variant (already GPU-uploaded at load).
    // No material.needsUpdate: the maps are same-type/encoding so no shader
    // define changes, and refreshUniformsCommon re-reads .map every frame —
    // flagging the material would force a needless per-blink program re-eval.
    this.headMaterial.map = this.faces.get(name) ?? this.neutralMap;
  }

  // ---- internals ----

  private onLoaded(gltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] }): void {
    const root = gltf.scene;
    this.root = root;

    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) {
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    // Wrap the model in a pivot AT ITS CENTRE so setOrientation() (face-toward)
    // turns it in place — rotation about the model centre, not the local origin.
    // Re-centring leaves the world position unchanged (model offset by −centre,
    // pivot by +centre). SAFE because no clip animates the scene-root node: all
    // 22 clips drive Hips and below (animate_v2.py), so the mixer never
    // overwrites root.position and un-centres the pivot. A future re-rig that
    // bakes root motion would break this — keep root motion off the scene-root.
    root.updateWorldMatrix(true, true);
    const centre = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.copy(centre);
    root.position.sub(centre);
    pivot.add(root);
    this.pivot = pivot;
    this.object3D.add(pivot);
    this.object3D.updateMatrixWorld(true);

    // Local-space bounds for the host's camera framing.
    const box = new THREE.Box3().setFromObject(this.object3D);
    if (!box.isEmpty()) {
      box.getCenter(this._centre);
      const size = box.getSize(new THREE.Vector3());
      this._maxDim = Math.max(size.x, size.y, size.z) || 1;
      this.addContactShadow(box);
    }

    this.ready = true;

    // Default to the idle loop if present (like the model-viewer autoplay).
    if (this.actions.has("idle")) this.playClip("idle", true);
  }

  /** Find the first MeshStandardMaterial named `name` (or on a mesh named `name`). */
  private findMaterial(root: THREE.Object3D, name: string): THREE.MeshStandardMaterial | null {
    let byName: THREE.MeshStandardMaterial | null = null;
    let byMesh: THREE.MeshStandardMaterial | null = null;
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        const sm = m as THREE.MeshStandardMaterial;
        if (m.name === name && !byName) byName = sm;
        if (mesh.name === name && !byMesh) byMesh = sm;
      }
    });
    return byName || byMesh;
  }

  /** Match the GLB head texture's sampler so a swapped atlas lines up with the
   *  head UVs (TextureLoader defaults to flipY=true; glTF base maps are sRGB,
   *  flipY=false). */
  private tuneFaceTexture(tex: THREE.Texture): void {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    const n = this.neutralMap;
    if (n) {
      tex.wrapS = n.wrapS;
      tex.wrapT = n.wrapT;
      tex.minFilter = n.minFilter;
      tex.magFilter = n.magFilter;
      tex.anisotropy = n.anisotropy;
      tex.generateMipmaps = n.generateMipmaps;
      tex.channel = n.channel;
    }
    tex.needsUpdate = true;
  }

  /** A soft "contact shadow" under the cat — a radial-gradient blob on a ground
   *  plane (no shadow map: cheap, swiftshader-safe, reads like model-viewer's
   *  contact shadow). Parented to `object3D` so it follows the cat into AR (where
   *  the cat "sits on" the marker card). */
  private addContactShadow(box: THREE.Box3): void {
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());

    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 62);
    g.addColorStop(0, "rgba(0,0,0,0.40)");
    g.addColorStop(0.55, "rgba(0,0,0,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const w = Math.max(size.x, size.z) * 1.7;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(w, w),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(centre.x, box.min.y + 0.002, centre.z); // just above the feet
    this.object3D.add(plane);
    this.contactShadow = plane;
  }

  /** Release all GPU resources owned by the cat (the host owns renderer/env). */
  dispose(): void {
    this.ready = false; // a disposed cat must not report ready (AR backend-swap)
    this.mixer?.stopAllAction();
    if (this.root) {
      this.mixer?.uncacheRoot(this.root);
      disposeObject(this.root); // renderer.dispose() does NOT free these
      this.root = null;
    }
    if (this.pivot) {
      this.object3D.remove(this.pivot);
      this.pivot = null;
    }
    if (this.contactShadow) {
      this.object3D.remove(this.contactShadow);
      this.contactShadow.geometry.dispose();
      const m = this.contactShadow.material as THREE.MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
      this.contactShadow = null;
    }
    // Free the runtime-loaded face variants (the neutral map belongs to the GLB
    // and is freed by disposeObject above).
    for (const tex of this.faces.values()) {
      if (tex && tex !== this.neutralMap) tex.dispose();
    }
    this.faces.clear();
    this.headMaterial = null;
    this.neutralMap = null;
    this.mixer = null;
    this.currentAction = null;
    this.actions.clear();
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
  for (const value of Object.values(mat as unknown as Record<string, unknown>)) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose();
  }
  mat.dispose();
}
