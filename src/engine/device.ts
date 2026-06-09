/**
 * Device wiring — unlock the WebAudio context on the first user gesture (browsers
 * block audio until then). Shake / motion-permission are added in M3.
 */
import * as audio from "../audio";

export function initFirstGesture(): void {
  const unlock = (): void => {
    try { audio.ensureAudio(); } catch { /* audio unavailable */ }
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    window.removeEventListener("touchstart", unlock);
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock);
}
