import type { CatRenderer } from "./CatRenderer";

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

  getClips(): string[] {
    return this.mv.availableAnimations || [];
  }

  hasClip(name: string): boolean {
    return (this.mv.availableAnimations || []).includes(name);
  }

  async playClip(name: string, loop: boolean): Promise<void> {
    this.mv.setAttribute("animation-name", name);
    await this.mv.updateComplete;
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
}
