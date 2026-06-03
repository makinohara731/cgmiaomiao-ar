import type { CatRenderer } from "./CatRenderer";
import { ModelViewerRenderer } from "./ModelViewerRenderer";
import { ThreeCatRenderer } from "./ThreeCatRenderer";
import { chooseBackend, type Backend } from "./capabilities";

/**
 * RendererFactory (P2.2) — pick the renderer backend and wire the DOM to match,
 * returning a CatRenderer the app drives uniformly. This is the single place
 * that knows about concrete backends; `main.js` only sees the interface.
 */

export interface CreateRendererOpts {
  /** The <model-viewer> element. */
  modelViewer: HTMLElement;
  /** The three.js canvas (starts hidden; shown only if three is selected). */
  canvas: HTMLCanvasElement;
  /** three backend only: drives the app's load lifecycle (→ onModelLoaded). */
  onReady?: () => void;
  /** three backend only: GLB load failure. */
  onError?: (err: unknown) => void;
}

export interface CreatedRenderer {
  renderer: CatRenderer;
  backend: Backend;
}

const HIDDEN = "renderer-hidden";

export function createRenderer(opts: CreateRendererOpts): CreatedRenderer {
  const backend = chooseBackend();

  if (backend === "three") {
    // Reveal the canvas BEFORE constructing (so the renderer measures real
    // layout dimensions), and hide the model-viewer. The model-viewer element
    // stays in the DOM, so its not-yet-migrated touchpoints in main.js
    // (orientation / createTexture / canActivateAR) remain harmless no-ops
    // until P2.4 folds them into the renderer interface.
    opts.canvas.classList.remove(HIDDEN);
    opts.modelViewer.classList.add(HIDDEN);
    const renderer = new ThreeCatRenderer(opts.canvas, {
      onReady: opts.onReady,
      onError: opts.onError,
    });
    return { renderer, backend };
  }

  // model-viewer (default): hide the canvas; the element's own `load` event
  // drives the lifecycle (wired in main.js), so onReady/onError aren't used.
  opts.canvas.classList.add(HIDDEN);
  return {
    renderer: new ModelViewerRenderer(opts.modelViewer as unknown as ConstructorParameters<typeof ModelViewerRenderer>[0]),
    backend,
  };
}
