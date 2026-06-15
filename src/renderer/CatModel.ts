import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import type { FaceConfig } from "./CatRenderer";

/**
 * CatModel — the cat as a self-contained three.js unit: the loaded Draco GLB, its
 * AnimationMixer + 27 clips (cross-faded, one-shots clamp), facial-expression
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

const FADE = 0.25; // s — cross-fade for ambient LOOPS (idle/walk/run/sleep)
const FALLBACK_DUR = 1.2; // s — when a clip duration is unknown

// Procedural idle "breathing": a sub-1% vertical sway on the centred pivot,
// applied every frame UNDER the clip layer so the cat is never a frozen loop
// when nothing's happening. Tiny amplitude reads as breathing, not floating.
const BREATHE_W = 1.45;    // rad/s ≈ 0.23 Hz
const BREATHE_AMP = 0.006; // × maxDim

// Some v5/v6 "galgame" clips were authored with very small head/ear-only motion
// — so subtle (peak movement BELOW idle's own breathing, per dev/_look.mjs) that
// they read as static / "broken". Amplify their keyframe rotations + translations
// away from the clip's first (≈rest) pose at load so the runtime cat actually
// moves. Conservative factors to avoid mesh intersection; re-tune via the probe.
const AMPLIFY: Record<string, number> = {
  // Most clips were re-authored bolder in Blender (v7 + the batch-1/2 arm-unlock),
  // so they're NOT amplified — a runtime gain on top would DOUBLE-boost them
  // (e.g. lickpaw/pounce/playbow: the arm would extrapolate past the +90° wrap
  // point, the crouch/bow would over-shoot). Only nod/headtilt stay deliberately
  // small in Blender and keep a runtime nudge.
  nod: 1.9, headtilt: 1.6,
};

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

  // Listeners for the mixer's 'finished' event (one-shot clip reached its end).
  private readonly finishedCbs = new Set<(name: string) => void>();

  // facial expressions
  private headMaterial: THREE.MeshStandardMaterial | null = null;
  private neutralMap: THREE.Texture | null = null;
  private readonly faces = new Map<string, THREE.Texture | null>();

  // local-space bounds (for the host to frame its camera)
  private readonly _centre = new THREE.Vector3();
  private _maxDim = 1;

  // idle-breathing phase + the pivot's resting Y (breathing offsets from it)
  private breatheT = 0;
  private pivotBaseY = 0;

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
    // Idle breathing — a continuous micro-sway beneath the clip layer. Writes
    // pivot.position.y; face-toward owns pivot.rotation, so they never fight.
    if (this.pivot) {
      this.breatheT += dt;
      this.pivot.position.y = this.pivotBaseY + Math.sin(this.breatheT * BREATHE_W) * this._maxDim * BREATHE_AMP;
    }
  }

  // ---- clips ----

  getClips(): string[] {
    return [...this.actions.keys()];
  }

  hasClip(name: string): boolean {
    return this.actions.has(name);
  }

  /** Subscribe to one-shot clip completion (the mixer 'finished' event). */
  onClipFinished(cb: (clipName: string) => void): () => void {
    this.finishedCbs.add(cb);
    return () => this.finishedCbs.delete(cb);
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
    action.setEffectiveWeight(1);
    action.enabled = true;

    if (loop) {
      // Ambient loops (idle↔walk↔run↔sleep) keep a smooth cross-fade so the gait
      // blends; fade out every OTHER action still influencing the pose.
      action.fadeIn(FADE);
      action.play();
      // Fade out every other action still influencing the pose. CRITICAL: include
      // `paused` actions — a finished one-shot (clampWhenFinished) PAUSES at its
      // last frame and keeps applying it at weight 1, yet reports isRunning()===
      // false. Without the paused check, those clamped poses linger and blend into
      // the loop.
      for (const other of this.actions.values()) {
        if (other !== action && (other.isRunning() || other.paused)) other.fadeOut(FADE);
      }
    } else {
      // One-shots (attack/jump/wave/pounce/nod/adore…): HARD-CUT. Stop every other
      // action instantly (no fade-out) and play this one at full weight from frame
      // 0, so the clip's anticipation + peak frames read at 100% amplitude with no
      // other pose bleeding through to damp them.
      //
      // The `|| other.paused` is the real fix for "动作幅度变小了": each finished
      // one-shot stays enabled+clamped (paused) at weight 1 and KEEPS contributing
      // its last frame — isRunning() is false for it, so the old isRunning-only
      // stop left every prior one-shot (greeting + autonomous idles) accumulating
      // into the bone binding, diluting the new clip to ~1/N amplitude.
      for (const other of this.actions.values()) {
        if (other !== action && (other.isRunning() || other.paused)) other.stop();
      }
      action.play();
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

  /** Show/hide the soft contact shadow. The AR host hides it when the cat stands
   *  upright on a colour marker (the horizontal shadow plane would be edge-on to
   *  a level camera with no real ground beneath — a useless dark sliver). */
  setContactShadowVisible(v: boolean): void {
    if (this.contactShadow) this.contactShadow.visible = v;
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
    // Fire onClipFinished when a one-shot (LoopOnce) clip reaches its end. The
    // 'finished' event carries the action; reverse-map it to its clip name.
    // (clampWhenFinished one-shots still emit 'finished'; an interrupting
    // .stop() does NOT — so the hard-cut path stays silent here.)
    this.mixer.addEventListener("finished", (e: { action: THREE.AnimationAction }) => {
      let name = "";
      for (const [n, a] of this.actions) if (a === e.action) { name = n; break; }
      for (const cb of this.finishedCbs) { try { cb(name); } catch { /* listener error — ignore */ } }
    });
    for (const clip of gltf.animations) {
      // glTF export collapses ANY full 360° root rotation into a there-and-back
      // (the quaternion reverses at 180°). Regenerate a clean continuous turn for
      // EVERY clip that spins — spin/twirl had the same bug as backflip, unfixed.
      if (clip.name === "backflip") repairRootSpin(clip, new THREE.Vector3(1, 0, 0), -2 * Math.PI, 14 / 24, 38 / 24);
      else if (clip.name === "spin") repairRootSpin(clip, new THREE.Vector3(0, 1, 0), 2 * Math.PI, 4 / 24, 32 / 24);
      else if (clip.name === "twirl") repairRootSpin(clip, new THREE.Vector3(0, 1, 0), 2 * Math.PI, 8 / 24, 40 / 24);
      const gain = AMPLIFY[clip.name];
      if (gain) amplifyClip(clip, gain);   // boost the too-subtle galgame clips
      this.actions.set(clip.name, this.mixer.clipAction(clip));
    }

    // Wrap the model in a pivot AT ITS CENTRE so setOrientation() (face-toward)
    // turns it in place — rotation about the model centre, not the local origin.
    // Re-centring leaves the world position unchanged (model offset by −centre,
    // pivot by +centre). SAFE because no clip animates the scene-root node: all
    // 27 clips drive Hips and below (animate_v2.py), so the mixer never
    // overwrites root.position and un-centres the pivot. A future re-rig that
    // bakes root motion would break this — keep root motion off the scene-root.
    root.updateWorldMatrix(true, true);
    const centre = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    pivot.position.copy(centre);
    this.pivotBaseY = centre.y; // breathing offsets from this resting height
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
    this.finishedCbs.clear();
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

/** Rebuild a clip's Hips rotation as a CONTINUOUS root spin. A full single-bone
 *  360° rotation can't survive the glTF export: Blender bakes each frame to a
 *  rotation matrix (rotation mod 360°), so past 180° the quaternion "unwinds" —
 *  the exported track ramps 0°→180° then back to 0°, and the cat REVERSES
 *  instead of going all the way around (the "转圈不连贯" report). Regenerate the
 *  Hips quaternion as a clean continuous `totalRad` sweep about `axis` over the
 *  [t0,t1]-second window. Per-frame keys keep slerp on the forward path.
 *  Used for backflip (−360° X), spin and twirl (+360° Y). */
function repairRootSpin(
  clip: THREE.AnimationClip,
  axis: THREE.Vector3,
  totalRad: number,
  t0: number,
  t1: number
): void {
  const track = clip.tracks.find((t) => /(^|[/.])Hips\.quaternion$/.test(t.name)) as
    | THREE.QuaternionKeyframeTrack
    | undefined;
  if (!track) return;
  const q = new THREE.Quaternion();
  const times = track.times, v = track.values;
  for (let i = 0; i < times.length; i++) {
    const t = times[i];
    const p = t <= t0 ? 0 : t >= t1 ? 1 : (t - t0) / (t1 - t0);
    q.setFromAxisAngle(axis, totalRad * p);
    q.toArray(v, i * 4);
  }
}

/** Scale a clip's motion amplitude about its first keyframe (≈rest): quaternion
 *  tracks extrapolate q0→qi by `factor` (a keyframe equal to the anchor is left
 *  unchanged — no motion to amplify); position tracks scale the delta from v0.
 *  Mutates the clip's track values in place at load time. */
function amplifyClip(clip: THREE.AnimationClip, factor: number): void {
  const q0 = new THREE.Quaternion();
  const qi = new THREE.Quaternion();
  for (const track of clip.tracks) {
    const v = track.values;
    if (track.name.endsWith(".quaternion") && v.length >= 4) {
      q0.fromArray(v, 0);
      for (let i = 0; i < v.length; i += 4) {
        qi.fromArray(v, i);
        q0.clone().slerp(qi, factor).normalize().toArray(v, i);
      }
    } else if (track.name.endsWith(".position") && v.length >= 3) {
      const x0 = v[0], y0 = v[1], z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i]     = x0 + (v[i] - x0) * factor;
        v[i + 1] = y0 + (v[i + 1] - y0) * factor;
        v[i + 2] = z0 + (v[i + 2] - z0) * factor;
      }
    }
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
