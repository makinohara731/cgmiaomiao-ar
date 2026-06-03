/**
 * CatRenderer — the single seam every animation call goes through.
 *
 * All clip playback in the app funnels through one entry (`playAnim`), so
 * hiding the concrete renderer behind this interface lets a later phase swap
 * the model-viewer backend for a three.js one without touching any caller.
 *
 * Scope (P1.2): animation only. Orientation, facial-expression texture swaps,
 * and the load/error lifecycle stay on the model-viewer element for now and
 * fold into this interface in P2.
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
}
