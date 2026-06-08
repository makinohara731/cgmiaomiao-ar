import type { CatRenderer, FaceConfig } from "./CatRenderer";

/** A model-viewer material texture-info: `.texture` reads it, `.setTexture()` swaps it. */
interface MVTextureInfo {
  texture: unknown;
  setTexture(tex: unknown): void;
}
interface MVMaterial {
  name: string;
  pbrMetallicRoughness: { baseColorTexture: MVTextureInfo };
}

/**
 * Minimal view of the <model-viewer> element this adapter touches. The element
 * is a custom element loaded from a CDN (no @types), so we declare just the
 * members we use rather than pulling in the whole type.
 */
interface ModelViewerEl extends HTMLElement {
  availableAnimations?: string[];
  duration?: number;
  loaded?: boolean;
  currentTime: number;
  updateComplete: Promise<unknown>;
  play(opts?: { repetitions?: number }): void;
  model?: { materials: MVMaterial[] };
  createTexture(url: string): Promise<unknown>;
}

/**
 * model-viewer backend for CatRenderer.
 *
 * Gotcha (preserved from main.js): model-viewer is an async Lit web component —
 * setting `animation-name` and then immediately calling play() races and plays
 * the *previous* clip. So we set the attribute, await `updateComplete`, reset
 * currentTime, then play.
 *   - https://github.com/google/model-viewer/discussions/4525
 *   - https://github.com/google/model-viewer/issues/3144
 */
export class ModelViewerRenderer implements CatRenderer {
  constructor(private readonly mv: ModelViewerEl) {}

  /** Bumped per playClip so a slower `updateComplete` from an earlier call can't
   *  resolve after a newer one and play the stale clip (the documented race). */
  private playSeq = 0;

  getClips(): string[] {
    return this.mv.availableAnimations || [];
  }

  hasClip(name: string): boolean {
    return (this.mv.availableAnimations || []).includes(name);
  }

  async playClip(name: string, loop: boolean): Promise<void> {
    const seq = ++this.playSeq;
    this.mv.setAttribute("animation-name", name);
    await this.mv.updateComplete;
    if (seq !== this.playSeq) return; // a newer playClip superseded this one
    this.mv.currentTime = 0;
    this.mv.play({ repetitions: loop ? Infinity : 1 });
  }

  currentDuration(): number {
    return this.mv.duration || 1.2;
  }

  isReady(): boolean {
    return !!this.mv.loaded;
  }

  setOrientation(yawDeg: number, pitchDeg: number): void {
    // model-viewer `orientation` is "roll pitch yaw" — yaw is the THIRD slot.
    // (Writing yaw into the second slot looks like nothing happens; v4.1
    // regressed exactly this.) Roll stays 0, pitch slot 2, yaw slot 3.
    this.mv.setAttribute(
      "orientation",
      `0deg ${pitchDeg.toFixed(1)}deg ${yawDeg.toFixed(1)}deg`
    );
  }

  getInteractionTarget(): HTMLElement {
    return this.mv;
  }

  // ---- Facial expressions (head base-colour texture swap) ----
  private headTex: MVTextureInfo | null = null;
  private readonly faces = new Map<string, unknown>();

  async loadFaces(config: FaceConfig): Promise<void> {
    const mats = this.mv.model?.materials;
    if (!mats) return;
    const mat = mats.find((m) => m.name === config.headMaterial) || mats[3];
    if (!mat) return;
    this.headTex = mat.pbrMetallicRoughness.baseColorTexture;
    this.faces.set("open", this.headTex.texture); // the GLB's own neutral face
    for (const [name, url] of Object.entries(config.variants)) {
      // Best-effort per variant: a missing webp just leaves that face absent.
      try {
        this.faces.set(name, await this.mv.createTexture(url));
      } catch {
        /* variant unavailable */
      }
    }
  }

  hasFace(name: string): boolean {
    return this.faces.has(name);
  }

  setFace(name: string): void {
    if (!this.headTex || !this.faces.has(name)) return;
    try {
      this.headTex.setTexture(this.faces.get(name));
    } catch {
      /* scene-graph API unavailable */
    }
  }
}
