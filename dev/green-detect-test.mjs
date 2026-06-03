/**
 * Unit test for the pure green-blob detection + AR placement math
 * (src/ar/green-detect.ts). The camera LOCK needs a real device, but the math
 * (centroid, object-fit:cover NDC mapping, anchor↔projection round-trip) is
 * fully verifiable here. Run: `node dev/green-detect-test.mjs` (from ar/).
 *
 * No test framework — esbuild (a Vite dep) bundles the TS module to a temp
 * .mjs, then we assert against it.
 */
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import path from "node:path";

// green-detect.ts is import-free + pure, so tsc can transpile it standalone
// (--ignoreConfig sidesteps the project's noEmit). esbuild isn't installed here.
const outDir = (process.env.CLAUDE_JOB_DIR && path.join(process.env.CLAUDE_JOB_DIR, "tmp")) || tmpdir();
// Invoke the tsc JS entry via node (Node ≥24 refuses to spawn .cmd shims).
const tscJs = path.join("node_modules", "typescript", "bin", "tsc");
execFileSync(process.execPath, [tscJs, "src/ar/green-detect.ts", "--ignoreConfig", "--outDir", outDir, "--target", "es2020", "--module", "esnext"], { stdio: "inherit" });
const outfile = path.join(outDir, "green-detect.js");
if (!existsSync(outfile)) throw new Error("tsc did not emit " + outfile);
const m = await import(pathToFileURL(outfile).href + "?t=" + Date.now());
const { isGreen, detectGreenBlob, coverToNdc, anchorMatrix, perspectiveProjection, DEFAULT_GREEN } = m;

let pass = 0;
let fail = 0;
const approx = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("  PASS", name); }
  else { fail++; console.log("  FAIL", name, extra); }
}

// ---- isGreen ----
ok("isGreen pure green", isGreen(0, 216, 0, DEFAULT_GREEN));
ok("isGreen white rejected", !isGreen(255, 255, 255, DEFAULT_GREEN));
ok("isGreen yellow rejected", !isGreen(220, 220, 0, DEFAULT_GREEN));
ok("isGreen dark green rejected", !isGreen(0, 40, 0, DEFAULT_GREEN));
ok("isGreen cyan-ish green ok", isGreen(20, 200, 90, DEFAULT_GREEN));

// ---- detectGreenBlob: centroid + size on a synthetic frame ----
{
  const w = 40, h = 30;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
  let green = 0;
  for (let y = 6; y < 12; y++) for (let x = 10; x < 20; x++) {
    const i = (y * w + x) * 4;
    data[i] = 0; data[i + 1] = 216; data[i + 2] = 0; data[i + 3] = 255;
    green++;
  }
  const r = detectGreenBlob(data, w, h, DEFAULT_GREEN);
  ok("blob found", r.found);
  ok("blob count", r.count === green, `got ${r.count} want ${green}`);
  ok("blob centroid u", approx(r.u, 14.5 / 40, 1e-9), `got ${r.u}`);
  ok("blob centroid v", approx(r.v, 8.5 / 30, 1e-9), `got ${r.v}`);
  ok("blob sizeFrac", approx(r.sizeFrac, Math.sqrt(green / (w * h)), 1e-9), `got ${r.sizeFrac}`);
}

// ---- detectGreenBlob: two separate blobs → LARGEST wins, not the gap centroid ----
{
  const w = 100, h = 100;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data[i + 3] = 255;
  const paint = (x0, x1, y0, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const i = (y * w + x) * 4; data[i] = 0; data[i + 1] = 216; data[i + 2] = 0;
    }
  };
  paint(8, 14, 8, 14);     // small blob A: 6×6=36 near top-left (centre ~0.105)
  paint(68, 82, 68, 82);   // big blob B: 14×14=196 near bottom-right (centre ~0.745)
  const r = detectGreenBlob(data, w, h, DEFAULT_GREEN);
  ok("two-blob found", r.found);
  ok("two-blob count = largest", r.count === 196, `got ${r.count}`);
  ok("two-blob centroid on B not gap", approx(r.u, 74.5 / 100, 1e-9) && Math.abs(r.u - 0.5) > 0.2, `got u=${r.u}`);
}

// ---- detectGreenBlob: below minAreaFrac → not found ----
{
  const w = 100, h = 100; // 10000 px, minAreaFrac 0.004 → need ≥40 green
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) { data[i + 3] = 255; } // black, opaque
  for (let k = 0; k < 20; k++) { // only 20 green px (< 40)
    const i = k * 4; data[i] = 0; data[i + 1] = 216; data[i + 2] = 0;
  }
  const r = detectGreenBlob(data, w, h, DEFAULT_GREEN);
  ok("blob below threshold not found", !r.found, `count=${r.count}`);
}

// ---- coverToNdc: viewport WIDER than video (crop top/bottom) ----
{
  const vw = 640, vh = 480, cw = 1920, ch = 1080; // s=3, kx=1, ky=1.333…
  const c = coverToNdc(0.5, 0.5, vw, vh, cw, ch);
  ok("cover centre → (0,0)", approx(c.sx, 0) && approx(c.sy, 0), `${c.sx},${c.sy}`);
  const right = coverToNdc(1, 0.5, vw, vh, cw, ch);
  ok("cover right edge → sx=+1", approx(right.sx, 1), `${right.sx}`);
  const top = coverToNdc(0.5, 0, vw, vh, cw, ch);
  ok("cover top cropped → sy>1", top.sy > 1 && approx(top.sy, 480 * 3 / 1080), `${top.sy}`);
}

// ---- coverToNdc: viewport TALLER than video (crop left/right) ----
{
  const vw = 640, vh = 480, cw = 600, ch = 900; // s=max(0.9375,1.875)=1.875; kx=2, ky=1
  const c = coverToNdc(0.5, 0.5, vw, vh, cw, ch);
  ok("cover(tall) centre → (0,0)", approx(c.sx, 0) && approx(c.sy, 0));
  const t = coverToNdc(0.5, 0, vw, vh, cw, ch);
  ok("cover(tall) top → sy=+1", approx(t.sy, 1), `${t.sy}`);
  const lft = coverToNdc(0, 0.5, vw, vh, cw, ch);
  ok("cover(tall) left cropped → sx<-1", lft.sx < -1 && approx(lft.sx, -640 * 1.875 / 600), `${lft.sx}`);
}

// ---- anchorMatrix ↔ perspectiveProjection round-trip ----
// A point seated at NDC (sx,sy) via anchorMatrix must reproject to (sx,sy).
{
  const fov = 50, aspect = 16 / 9, depth = 3, scale = 0.7;
  for (const [sx, sy] of [[0, 0], [0.4, -0.6], [-0.9, 0.3], [1, 1]]) {
    const am = anchorMatrix(sx, sy, depth, fov, aspect, scale);
    const X = am[12], Y = am[13], Z = am[14];
    ok(`anchor scale on diagonal (${sx},${sy})`, am[0] === scale && am[5] === scale && am[10] === scale);
    const p = perspectiveProjection(fov, aspect, 0.05, 1000);
    // clip = P · (X,Y,Z,1)  (column-major: clip[r] = Σ_c P[r + 4c]·v[c])
    const v = [X, Y, Z, 1];
    const clip = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) clip[r] += p[r + 4 * c] * v[c];
    const ndcx = clip[0] / clip[3];
    const ndcy = clip[1] / clip[3];
    ok(`reproject sx (${sx},${sy})`, approx(ndcx, sx, 1e-9), `got ${ndcx}`);
    ok(`reproject sy (${sx},${sy})`, approx(ndcy, sy, 1e-9), `got ${ndcy}`);
  }
}

// ---- perspectiveProjection: host applyArProjection re-derivation ----
// ThreeCatRenderer derives fov/near/far from proj[5],[10],[14]; verify they invert.
{
  const fov = 50, near = 0.05, far = 1000;
  const p = perspectiveProjection(fov, 1, near, far);
  const derivedFov = (2 * Math.atan(1 / p[5]) * 180) / Math.PI;
  const derivedNear = p[14] / (p[10] - 1);
  const derivedFar = p[14] / (p[10] + 1);
  ok("derive fov", approx(derivedFov, fov, 1e-6), `got ${derivedFov}`);
  ok("derive near", approx(derivedNear, near, 1e-6), `got ${derivedNear}`);
  ok("derive far", approx(derivedFar, far, 1e-3), `got ${derivedFar}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
