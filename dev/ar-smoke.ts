// Dev-only smoke harness for P2.3: MindArSession (image-target tracker) + the
// ThreeCatRenderer AR plumbing. Exposes its state on window for the puppeteer
// probe (dev/ar-smoke-probe.mjs). Two independently verifiable tracks, since a
// headless fake camera produces NO capturable frames for the tfjs GPU warmup:
//
//   Track B (plumbing) — ThreeCatRenderer.enterAR/exitAR with a STUB session:
//     reparent the cat under the anchor, derive the AR camera fov/near/far from
//     a known projection, restore on exit. Deterministic, no GPU/video.
//   Track A (tracker setup) — the REAL MindArSession.prepare(): runtime load,
//     Controller build, miao-card.mind → marker dims, projection. Everything but
//     the kernel warmup (dummyRun/processVideo) + an actual marker LOCK, which
//     need a physical card + real camera and are verified by hand.
import * as THREE from "three";
import { ThreeCatRenderer } from "../src/renderer/ThreeCatRenderer";
import { MindArSession } from "../src/ar/MindArSession";
import type { ArSession } from "../src/ar/ArSession";

const canvas = document.getElementById("c") as HTMLCanvasElement;
const hud = document.getElementById("hud") as HTMLDivElement;
const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);

const w = window as any;
w.__ar = {
  ready: false,
  clips: 0,
  error: null as string | null,
  // Track B (plumbing, stub session)
  plumb: null as any,
  plumbError: null as string | null,
  // Track A (real tracker setup)
  setup: null as any,
  setupError: null as string | null,
};

function paint() {
  const a = w.__ar;
  hud.textContent =
    `ready=${a.ready} clips=${a.clips}\n` +
    `[B plumbing] ${a.plumb ? JSON.stringify(a.plumb) : a.plumbError || "…"}\n` +
    `[A setup]    ${a.setup ? JSON.stringify(a.setup) : a.setupError || "…"}` +
    (a.error ? `\nERROR: ${a.error}` : "");
}

/** The GL projection mind-ar's Controller produces (45° vfov, near 10, far 1e5),
 *  for a stub session so the plumbing's fov/near/far derivation is checkable. */
function buildStubProjection(inputW = 640, inputH = 480): number[] {
  const near = 10;
  const far = 1e5;
  const p = inputH / 2 / Math.tan((45 * Math.PI) / 180 / 2);
  const m = new Array(16).fill(0);
  m[0] = (2 * p) / inputW;
  m[5] = (2 * p) / inputH; // == 1/tan(22.5°)
  m[10] = -(far + near) / (far - near);
  m[11] = -1;
  m[14] = (-2 * far * near) / (far - near);
  return m;
}

async function trackB(renderer: ThreeCatRenderer) {
  try {
    const anchor = new THREE.Group();
    anchor.matrixAutoUpdate = false;
    const proj = buildStubProjection();
    const stub: ArSession = {
      start: async () => {},
      stop: async () => {},
      isRunning: () => true,
      anchor: () => anchor,
      video: () => null,
      cameraProjectionMatrix: () => proj,
      onFound: () => {},
      onLost: () => {},
    };

    await renderer.enterAR(stub, { scale: 0.5, rotXDeg: 90 });
    const mount = anchor.children[0] as THREE.Object3D | undefined;
    const camIn = renderer.cameraState();
    const enteredOk =
      camIn.isAR &&
      anchor.children.length === 1 && // mount
      !!mount &&
      mount.children.length === 1 && // the cat
      Math.round(THREE.MathUtils.radToDeg(mount.rotation.x)) === 90 &&
      Math.abs(mount.scale.x - 0.5) < 1e-6;

    renderer.exitAR();
    const camOut = renderer.cameraState();
    const exitedOk = !camOut.isAR && anchor.children.length === 0 && Math.round(camOut.fov) === 30;

    w.__ar.plumb = {
      enteredOk,
      exitedOk,
      arFov: Math.round(camIn.fov),
      arNear: Math.round(camIn.near),
      arFar: Math.round(camIn.far),
      fallbackFov: Math.round(camOut.fov),
      mountRotX: mount ? Math.round(THREE.MathUtils.radToDeg(mount.rotation.x)) : null,
      mountScale: mount ? mount.scale.x : null,
    };
  } catch (e) {
    w.__ar.plumbError = String((e as any)?.stack || e);
  }
  paint();
}

async function trackA() {
  try {
    const session = new MindArSession();
    const v = session.video();
    if (v) {
      v.id = "arFeed";
      document.body.insertBefore(v, canvas);
    }
    w.__session = session;
    await session.prepare(); // setup only; no GPU warmup / tracking loop
    const proj = session.cameraProjectionMatrix() || [];
    w.__ar.setup = {
      prepared: true,
      dims: session.markerDimensions(),
      projLen: proj.length,
      proj5: proj[5] ? Number(proj[5].toFixed(3)) : 0,
      vfovDeg: proj[5] ? Number(((2 * Math.atan(1 / proj[5]) * 180) / Math.PI).toFixed(1)) : 0,
    };
  } catch (e) {
    w.__ar.setupError = String((e as any)?.stack || e);
  }
  paint();
}

const renderer = new ThreeCatRenderer(canvas, {
  glAttributes: { preserveDrawingBuffer: true },
  onReady: async () => {
    w.__ar.ready = true;
    w.__ar.clips = renderer.getClips().length;
    paint();
    await trackB(renderer); // fast, deterministic
    await trackA(); // slow (camera + runtime + .mind)
  },
  onError: (e) => {
    w.__ar.error = String(e);
    paint();
  },
});

w.__r = renderer;
// Allow the tuner to override seating live: ?sc=&rx=&ry=&lift= on a real card.
w.__enterReal = async () => {
  const s = w.__session as MindArSession;
  if (s) await renderer.enterAR(s, { scale: num("sc", 0.5), rotXDeg: num("rx", 90), rotYDeg: num("ry", 0), lift: num("lift", 0) });
};
paint();
