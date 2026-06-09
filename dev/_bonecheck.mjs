// Does the arm bone actually rotate at runtime? Mount the renderer (smoke
// harness), play a clip, and sample named bones' live quaternions over the clip,
// reporting max angle away from the rest pose. Isolates "GLB has motion but the
// runtime doesn't apply it" from "framing makes it look small".
//   node dev/_bonecheck.mjs [clip]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const URL = "http://127.0.0.1:8765/dev/three-smoke.html";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CLIP = process.argv[2] || "wave";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost", "--use-gl=swiftshader", "--no-sandbox"],
});
const p = await b.newPage();
const logs = [];
p.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
p.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await p.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
await p.waitForFunction(() => window.__smoke && window.__smoke.ready, { timeout: 30000 });

const result = await p.evaluate(async (clip) => {
  const r = window.__r;
  const root = r.cat.object3D;
  const BONES = ["ArmL", "ArmR", "Head", "Tail1", "Hips"];
  const found = {};
  root.traverse((o) => { if (BONES.includes(o.name) && !found[o.name]) found[o.name] = o; });
  const rest = {}, maxAng = {};
  for (const n of BONES) {
    const o = found[n];
    rest[n] = o ? o.quaternion.clone() : null;
    maxAng[n] = 0;
  }
  const ang = (a, q) => 2 * Math.acos(Math.min(1, Math.abs(a.x*q.x + a.y*q.y + a.z*q.z + a.w*q.w)));

  window.__play(clip, false);
  const t0 = performance.now();
  // sample for ~2.4s
  while (performance.now() - t0 < 2400) {
    for (const n of BONES) {
      const o = found[n];
      if (o && rest[n]) maxAng[n] = Math.max(maxAng[n], ang(rest[n], o.quaternion));
    }
    await new Promise((res) => requestAnimationFrame(res));
  }
  const deg = (r) => (r * 180 / Math.PI).toFixed(1);
  return {
    presentBones: Object.keys(found),
    maxAngleDeg: Object.fromEntries(BONES.map((n) => [n, found[n] ? deg(maxAng[n]) : "ABSENT"])),
    clips: r.getClips().length,
  };
}, CLIP);

console.log("=== clip:", CLIP);
console.log("=== bones present:", result.presentBones.join(", "));
console.log("=== max rotation from rest during clip:");
for (const [n, d] of Object.entries(result.maxAngleDeg)) console.log(`     ${n.padEnd(7)} ${d}°`);
console.log("=== total clips:", result.clips);
console.log("=== console:");
for (const l of logs) if (/error|warn|fail|miss/i.test(l)) console.log("   ", l);
await b.close();
