/**
 * CatRenderer — the single seam every animation call goes through.
 *
 * All clip playback in the app funnels through one entry (`playAnim`), so
 * hiding the concrete renderer behind this interface lets a later phase swap
 * the model-viewer backend for a three.js one without touching any caller.
 *
 * Scope grows in stages: P1.2 animation only; P2.4 adds orientation (face-toward)
 * and the pointer-interaction target so the three.js backend reaches parity.
 * Facial-expression texture swaps still fold in next (see docs/进度.md).
 */
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
}
