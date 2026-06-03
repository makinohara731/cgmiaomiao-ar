/**
 * Lazy loader for the vendored mind-ar IMAGE runtime (Controller + Compiler),
 * loaded ONLY when entering AR so its ~2.2MB (TensorFlow.js + the tracker) never
 * touches the main bundle.
 *
 * The runtime is a self-contained ESM bundle under `public/vendor/mindar/`
 * (mind-ar 1.2.5 dist: mindar-image.prod.js → controller-*.js + ui-*.js). We use
 * the THREE-FREE low-level `Controller` (mind-ar's three build imports the
 * removed `sRGBEncoding` and is unusable on three ≥0.160) and feed the tracked
 * pose into our own three scene. `Compiler` compiles a marker image → `.mind`
 * in the browser (no node-canvas needed).
 *
 * Typed permissively (the vendored bundle ships no .d.ts); the concrete shapes
 * are pinned where we actually call into them (MindArSession).
 */

export interface MindarImageRuntime {
  /** Image-target tracker: construct, addImageTargets(.mind), processVideo(video). */
  Controller: any;
  /** Browser-side marker-image → .mind compiler. */
  Compiler: any;
  /** mind-ar's built-in scanning/overlay UI helper (we may use our own instead). */
  UI: any;
}

let cached: Promise<MindarImageRuntime> | null = null;

function toRuntime(m: any): MindarImageRuntime {
  if (!m || typeof m.Controller !== "function") {
    throw new Error("mind-ar runtime loaded but Controller is missing");
  }
  return { Controller: m.Controller, Compiler: m.Compiler, UI: m.UI };
}

/**
 * Load (once) the vendored mind-ar image runtime. Idempotent.
 *
 * Loaded via a `<script type="module">` tag, NOT `import()`. A dynamic import()
 * of a `public/` URL works in the static production build but FAILS under the
 * Vite DEV server (`npm run dev`): Vite runs the request through its module
 * transform pipeline (rewritten to `…?import`), which 500s on the 2.2MB vendored
 * tfjs bundle. A script-src request is served statically by both, and the bundle
 * sets `window.MINDAR.IMAGE` on execution + resolves its own sibling chunks
 * (controller-*.js / ui-*.js) relative to its URL. Heavy (tfjs), loaded only
 * here on first enter-AR, so it never touches the main bundle either way.
 */
export function loadMindarImage(): Promise<MindarImageRuntime> {
  if (cached) return cached;
  const base = (import.meta as any).env?.BASE_URL ?? "/";
  const url = base + "vendor/mindar/mindar-image.prod.js";
  cached = new Promise<MindarImageRuntime>((resolve, reject) => {
    const pre = (window as any).MINDAR?.IMAGE;
    if (pre?.Controller) {
      resolve(toRuntime(pre));
      return;
    }
    const s = document.createElement("script");
    s.type = "module";
    s.src = url;
    s.onload = () => {
      try {
        resolve(toRuntime((window as any).MINDAR?.IMAGE));
      } catch (e) {
        reject(e);
      }
    };
    s.onerror = () => reject(new Error("failed to load mind-ar runtime: " + url));
    document.head.appendChild(s);
  });
  return cached;
}
