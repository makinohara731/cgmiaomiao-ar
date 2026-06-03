// Dev-only smoke harness for ThreeCatRenderer (P2.1). Mounts the renderer on a
// full-screen canvas and exposes its state on window for the puppeteer probe.
// Not in tsconfig `include`, not in the production build.
import { ThreeCatRenderer } from "../src/renderer/ThreeCatRenderer";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const w = window as any;
w.__smoke = { ready: false, error: null as string | null, clips: [] as string[] };

const r = new ThreeCatRenderer(canvas, {
  // Keep the last frame readable so the puppeteer probe can sample pixels.
  glAttributes: { preserveDrawingBuffer: true },
  onReady: () => {
    w.__smoke.ready = true;
    w.__smoke.clips = r.getClips();
    hud.textContent = `ready · ${r.getClips().length} clips · ${r.getClips().join(", ")}`;
  },
  onError: (e) => {
    w.__smoke.error = String(e);
    hud.textContent = "ERROR: " + String(e);
  },
});

w.__r = r;
// Lets the probe force a specific clip for a pose screenshot.
w.__play = (name: string, loop = false) => r.playClip(name, loop);
