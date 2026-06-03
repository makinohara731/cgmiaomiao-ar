/**
 * Renderer capability detection + backend selection (P2.2).
 *
 * The app is unifying on three.js, but the swap is staged: model-viewer stays
 * the DEFAULT until the three.js path reaches interaction parity (orientation /
 * expressions / pointer-petting, P2.4). Until then three.js is opt-in via
 * `?renderer=three` (aliases `?r=three` / `?r=3`); `?renderer=mv` forces
 * model-viewer. When the default flips, only `chooseBackend`'s fallthrough
 * changes — every caller already goes through `RendererFactory`.
 */

export type Backend = "three" | "model-viewer";

export interface Caps {
  /** A WebGL (1 or 2) context could be created — three.js can run. */
  webgl: boolean;
}

export function detectCaps(): Caps {
  let webgl = false;
  try {
    const c = document.createElement("canvas");
    webgl = !!(
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl")
    );
  } catch {
    webgl = false;
  }
  return { webgl };
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
  // P2.2 default — model-viewer until the three.js path reaches parity (P2.4).
  return "model-viewer";
}
