/**
 * Renderer capability detection + backend selection (P2.2).
 *
 * The app is unifying on three.js. As of P2.4d the default is FLIPPED: desktop
 * uses three.js (the unified renderer + the future MindAR path); mobile keeps
 * model-viewer for native Scene Viewer / Quick Look AR; a WebGL-less device
 * falls back to model-viewer. Force either backend with `?renderer=three`
 * (aliases `?r=three` / `?r=3`) or `?renderer=mv`. Every caller goes through
 * `RendererFactory`, so this is the only place that decides.
 */

export type Backend = "three" | "model-viewer";

export interface Caps {
  /** A WebGL (1 or 2) context could be created — three.js can run. */
  webgl: boolean;
  /**
   * Likely a mobile device. Mobile keeps model-viewer for native Scene Viewer /
   * Quick Look AR; the desktop AR path is MindAR on three.js (P2.3).
   */
  mobile: boolean;
}

function detectWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    return false;
  }
}

function detectMobile(): boolean {
  try {
    const uaData = (navigator as any).userAgentData;
    if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;
    if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent)) return true;
    // iPadOS reports a desktop (Mac) UA — fall back to coarse-pointer + touch.
    return matchMedia("(pointer: coarse)").matches && (navigator.maxTouchPoints || 0) > 1;
  } catch {
    return false;
  }
}

export function detectCaps(): Caps {
  return { webgl: detectWebGL(), mobile: detectMobile() };
}

function urlPick(): string | null {
  try {
    const q = new URLSearchParams(location.search);
    return q.get("renderer") || q.get("r");
  } catch {
    return null;
  }
}

export function chooseBackend(caps: Caps = detectCaps()): Backend {
  const pick = urlPick();
  if (pick === "three" || pick === "3") return caps.webgl ? "three" : "model-viewer";
  if (pick === "mv" || pick === "model-viewer") return "model-viewer";
  // P2.4d: default flipped. Desktop → three.js (the unified renderer + the
  // future MindAR AR path). Mobile keeps model-viewer for native Scene Viewer /
  // Quick Look AR. No WebGL → model-viewer fallback. Override via ?renderer=.
  if (!caps.webgl) return "model-viewer";
  return caps.mobile ? "model-viewer" : "three";
}
