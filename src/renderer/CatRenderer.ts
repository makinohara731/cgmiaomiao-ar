/**
 * CatRenderer — the single seam every animation call goes through.
 *
 * All clip playback in the app funnels through one entry (`playAnim`), so
 * hiding the concrete renderer behind this interface lets a later phase swap
 * the model-viewer backend for a three.js one without touching any caller.
 *
 * Scope grows in stages: P1.2 animation only; P2.4a orientation (face-toward) +
 * the pointer-interaction target; P2.4b facial expressions (head-texture swap).
 */

/** Config for the facial-expression system (P2.4b). */
export interface FaceConfig {
  /**
   * Expression name → texture URL (relative to BASE_URL). The neutral face
   * ("open") is NOT listed here — it's captured from the GLB's own head texture.
   */
  variants: Record<string, string>;
  /** Name of the head material (and/or mesh) carrying the face atlas, e.g. "root.3". */
  headMaterial: string;
}

export interface CatRenderer {
  /** All clip names the loaded model exposes. */
  getClips(): string[];
  /** Whether a clip name is available to play. */
  hasClip(name: string): boolean;
  /** Start a clip; `loop` true = repeat forever, false = play once. */
  playClip(name: string, loop: boolean): Promise<void>;
  /** Duration of the current clip in seconds (fallback ~1.2). */
  currentDuration(): number;
  /** Whether the underlying model has finished loading. */
  isReady(): boolean;
  /**
   * Turn the whole model to face a direction, layered on top of the playing
   * clip (it's the model's orientation, not an animation). `yawDeg` left(−)/
   * right(+), `pitchDeg` down(−)/up(+). Both are absolute target angles in
   * degrees; the caller eases toward them frame by frame.
   */
  setOrientation(yawDeg: number, pitchDeg: number): void;
  /** The DOM element that pointer/petting listeners should attach to. */
  getInteractionTarget(): HTMLElement;
  /**
   * Initialise the facial-expression system: find the head material, capture
   * its neutral texture as "open", and load the variant textures. Idempotent;
   * resolves when done (variants that fail to load are simply absent). The
   * backend owns the texture loading + the head-material reference.
   */
  loadFaces(config: FaceConfig): Promise<void>;
  /** Whether a named face is available to show ("open" once the head is found). */
  hasFace(name: string): boolean;
  /** Swap the head to a named face ("open" = neutral). No-ops if not ready. */
  setFace(name: string): void;
  /**
   * Register a callback fired when a ONE-SHOT clip reaches its end (the
   * AnimationMixer 'finished' event for LoopOnce actions; the <model-viewer>
   * 'finished' DOM event). The callback receives the finished clip's name.
   * Returns an unsubscribe fn. Loop clips never fire this. Interrupting a
   * one-shot with `.stop()` (the hard-cut path) does NOT fire it.
   *
   * This is what lets the host return to idle off the real end-of-clip event
   * instead of a `setTimeout(duration)` race — the single source of truth for
   * "the one-shot is done".
   */
  onClipFinished(cb: (clipName: string) => void): () => void;
}
