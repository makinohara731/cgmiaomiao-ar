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
  /**
   * iPad specifically (vs phone). iPad has a REAR camera and a big screen, so it
   * gets the three.js green-block AR (the rich desktop experience) instead of
   * phone Quick Look. iPhone/Android phones stay model-viewer.
   */
  iPad: boolean;
  /** `navigator.mediaDevices.getUserMedia` exists — a camera can be requested. */
  camera: boolean;
  /** Secure context (https / localhost) — required for getUserMedia. */
  secureContext: boolean;
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

function detectIPad(): boolean {
  try {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPod/i.test(ua)) return false; // phones stay model-viewer
    // iPadOS 13+ Safari ships a desktop Mac UA but still exposes touch points;
    // older / "request mobile" iPads keep "iPad" in the UA.
    return /iPad/i.test(ua) || (/Macintosh/i.test(ua) && (navigator.maxTouchPoints || 0) > 1);
  } catch {
    return false;
  }
}

function detectCamera(): boolean {
  try {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  } catch {
    return false;
  }
}

function detectSecure(): boolean {
  try {
    return typeof window !== "undefined" && window.isSecureContext === true;
  } catch {
    return false;
  }
}

export function detectCaps(): Caps {
  return {
    webgl: detectWebGL(),
    mobile: detectMobile(),
    iPad: detectIPad(),
    camera: detectCamera(),
    secureContext: detectSecure(),
  };
}

/**
 * Whether the desktop MindAR image-target AR path can run: needs WebGL (three.js),
 * a camera, and a secure context (getUserMedia is blocked on bare-LAN http — the
 * v3 gotcha). The actual camera *permission* is still requested at enter-AR time;
 * this only gates whether to offer/auto-enter AR vs the fallback 3D view.
 */
export function canActivateAR(caps: Caps = detectCaps()): boolean {
  return caps.webgl && caps.camera && caps.secureContext;
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
  // iPad has a rear camera + big screen → give it the three.js green-block AR
  // (size/breathing/pinch/gestures), not phone Quick Look. (Phones: mobile→mv.)
  if (caps.iPad) return "three";
  return caps.mobile ? "model-viewer" : "three";
}
