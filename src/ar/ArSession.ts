import type { Object3D } from "three";

/**
 * ArSession — abstracts the AR tracker backend so the app can enter/exit AR and
 * react to the marker card without knowing whether it's MindAR, AR.js, or WebXR.
 *
 * Planned backend (P2.3): MindAR image-target tracking driven via its LOW-LEVEL
 * controller, NOT `MindARThree`. mind-ar 1.2.5's three build still
 * `import { sRGBEncoding } from "three"`, which three removed in r0.160 — so it
 * link-errors on our three 0.184. Feeding the tracked pose into our own three
 * scene avoids that (and the two-copies-of-three problem). The mind-ar runtime +
 * tfjs are heavy, so they're lazy-loaded only on enter-AR. See docs/进度.md.
 */
export interface ArSession {
  /** Start the camera + tracker. Resolves once tracking is running (or rejects). */
  start(): Promise<void>;
  /** Stop tracking and release the camera. */
  stop(): Promise<void>;
  /** Whether the tracker is currently running. */
  isRunning(): boolean;
  /**
   * The node whose world transform follows the tracked marker card. Parent the
   * cat under this so it "sits on" the card.
   */
  anchor(): Object3D;
  /** The live camera <video> element (AR feed + MediaPipe gestures, P2.5). */
  video(): HTMLVideoElement | null;
  /** Marker card entered view. */
  onFound(cb: () => void): void;
  /** Marker card left view. */
  onLost(cb: () => void): void;
}
