// Headless probe for dev/ar-smoke (P2.3). Two tracks (a headless fake camera
// produces no capturable frames for the tfjs GPU warmup, so the tracking loop +
// an actual marker LOCK are verified by hand on a real card):
//   B (plumbing)     — ThreeCatRenderer.enterAR/exitAR with a stub session:
//                      reparent + AR camera fov/near/far derivation + restore.
//   A (tracker setup)— real MindArSession.prepare(): runtime load, Controller
//                      build, miao-card.mind → marker dims, projection (vfov≈45°).
//
// Run: build with the harness as an input, `vite preview` (production static
// path — the vendored mindar bundle's lazy import() works there, NOT under the
// dev server), write its port to $CLAUDE_JOB_DIR/tmp/port.txt, then
//   NODE_PATH=C:/Users/Lenovo/AppData/Roaming/npm/node_modules node dev/ar-smoke-probe.mjs
// REAL GPU (no --use-gl=swiftshader — tfjs needs it) + a fake camera.
import { createRequire } from "module";
import { readFileSync } from "fs";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const PORT = readFileSync(process.env.CLAUDE_JOB_DIR + "/tmp/port.txt", "utf8").trim();
const URL = `http://127.0.0.1:${PORT}/dev/ar-smoke.html`;
const errs = [];

const b = await puppeteer.launch({
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: "new",
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    "--ignore-gpu-blocklist",
    "--enable-gpu",
    "--no-sandbox",
    "--disable-dev-shm-usage",
  ],
});
const p = await b.newPage();
p.on("pageerror", (e) => errs.push("PE:" + e.message));
p.on("console", (m) => {
  if (m.type() !== "error") return;
  const url = (m.location && m.location()?.url) || "";
  // Resource 404s carry a generic text; the URL is in location() — skip favicon.
  if (/favicon/.test(m.text()) || /favicon/.test(url)) return;
  errs.push("CE:" + m.text() + (url ? " @" + url : ""));
});

console.log("goto", URL);
await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });

const t0 = Date.now();
let st = {};
while (Date.now() - t0 < 50000) {
  await new Promise((r) => setTimeout(r, 1500));
  st = await p.evaluate(() => window.__ar).catch(() => ({}));
  const done = st && (st.setup || st.setupError);
  console.log(
    `  +${Math.round((Date.now() - t0) / 1000)}s ready=${st.ready} ` +
      `plumb=${st.plumb ? "Y" : st.plumbError ? "ERR" : "…"} ` +
      `setup=${st.setup ? "Y" : st.setupError ? "ERR" : "…"}`
  );
  if (done) break;
}

await b.close();

const plumb = st.plumb || {};
const setup = st.setup || {};
const checks = [
  ["cat ready", st.ready === true],
  ["22 clips", st.clips === 22],
  // Track B — ThreeCatRenderer AR plumbing
  ["B: enterAR reparented + AR camera", plumb.enteredOk === true],
  ["B: AR vfov ≈ 45°", plumb.arFov >= 44 && plumb.arFov <= 46],
  ["B: AR near ≈ 10", plumb.arNear >= 9 && plumb.arNear <= 11],
  ["B: AR far ≈ 1e5", plumb.arFar >= 90000 && plumb.arFar <= 110000],
  ["B: stand-up rot 90° + scale 0.5", plumb.mountRotX === 90 && Math.abs((plumb.mountScale ?? 0) - 0.5) < 1e-6],
  ["B: exitAR restored fallback (fov 30)", plumb.exitedOk === true],
  // Track A — real MindArSession.prepare()
  ["A: prepare() ok", setup.prepared === true],
  ["A: marker dims w>0,h>0", Array.isArray(setup.dims) && setup.dims[0] > 0 && setup.dims[1] > 0],
  ["A: projection 16 elems", setup.projLen === 16],
  ["A: setup vfov ≈ 45°", setup.vfovDeg > 44 && setup.vfovDeg < 46],
  ["no page errors", errs.length === 0],
];

console.log("\n--- checks ---");
let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
if (st.plumbError) console.log("\nplumb error:\n" + st.plumbError);
if (st.setupError) console.log("\nsetup error:\n" + st.setupError);
if (st.error) console.log("\nharness error:\n" + st.error);
if (errs.length) errs.forEach((e) => console.log("  " + e));
console.log(
  "\nplumb=" + JSON.stringify(plumb) + "\nsetup=" + JSON.stringify(setup) +
    "\nNOTE: GPU kernel warmup + actual marker lock need a real card/camera.\n" +
    (ok ? "AR SMOKE PASS" : "AR SMOKE FAIL")
);
process.exit(ok ? 0 : 1);
