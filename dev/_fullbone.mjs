// DEFINITIVE damping proof in the FULL app (autonomy loop running): click the
// real anim-bar button (userPlay path) and sample the live ArmR bone over the
// whole clip. If ArmR reaches ~full amplitude here — not just in the isolated
// smoke harness — the orchestration-layer damping bug is fixed.
//   node dev/_fullbone.mjs [url] [clip]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.argv[2] || "http://127.0.0.1:8765/svelte.html";
const CLIP = process.argv[3] || "wave";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost", "--use-gl=swiftshader", "--no-sandbox"] });
const p = await b.newPage();
await p.evaluateOnNewDocument(() => {
  localStorage.setItem("miaomiao.onboarded.v1", "1");
  localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", affection: 40, mood: 0.6, energy: 0.7, bornAt: Date.now() - 86400000 }));
});
for (let i = 0; i < 3; i++) {
  try { await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 }); break; }
  catch { await sleep(1500); } // Vite may force-reload to re-optimize new deps
}
await p.waitForFunction(() => window.__r && window.__r.getClips && window.__r.getClips().length > 0, { timeout: 30000 });
await sleep(7000); // let the greeting one-shot fully finish + settle to idle rest

const res = await p.evaluate(async (clip) => {
  const root = window.__r.cat.object3D;
  let armR = null;
  root.traverse((o) => { if (o.name === "ArmR" && !armR) armR = o; });
  if (!armR) return { err: "ArmR not found" };
  const angBetween = (a, q) => 2 * Math.acos(Math.min(1, Math.abs(a.x*q.x + a.y*q.y + a.z*q.z + a.w*q.w)));

  // Instrument every playClip call during the window (detect restarts / overlaps).
  const calls = [];
  const orig = window.__r.playClip.bind(window.__r);
  window.__r.playClip = (n, loop) => { calls.push(`${n}:${loop ? "loop" : "once"}@${Math.round(performance.now())}`); return orig(n, loop); };

  // Trigger: TRIG=play → window.__play (identical on smoke + full app);
  // else the REAL anim-bar button (userPlay path).
  const usePlay = clip.startsWith("play:");
  const name = usePlay ? clip.slice(5) : clip;
  document.body.classList.add("anim-open");
  const tClick = Math.round(performance.now());
  if (usePlay) {
    window.__play(name, false);
  } else {
    const btn = document.querySelector(`#animBar [data-anim="${name}"]`);
    if (!btn) return { err: "button not found" };
    btn.click();
  }

  // Reference = ArmR right AFTER the hard-cut (≈ the clip's own frame 0), so the
  // measured range is the clip's intrinsic arm swing, free of the idle baseline.
  await new Promise((r) => requestAnimationFrame(r));
  await new Promise((r) => requestAnimationFrame(r));
  const ref = armR.quaternion.clone();
  const cat = window.__r.cat;
  const act = cat.actions.get(name);
  // Deterministic: max angle of the ArmR quaternion TRACK from its first keyframe
  // (independent of mixer/timing). Reveals if the clip data itself differs.
  let trackMax = -1;
  if (act) {
    const tr = act.getClip().tracks.find((t) => /ArmR\.quaternion$/.test(t.name));
    if (tr) {
      const v = tr.values; let mx = 0;
      const d0 = [v[0], v[1], v[2], v[3]];
      for (let i = 0; i < v.length; i += 4) {
        const dot = Math.abs(d0[0]*v[i] + d0[1]*v[i+1] + d0[2]*v[i+2] + d0[3]*v[i+3]);
        mx = Math.max(mx, 2 * Math.acos(Math.min(1, dot)));
      }
      trackMax = mx * 180 / Math.PI;
    }
  }
  let maxAng = 0, samples = 0, running = "", maxTime = 0, dur = 0, ts = 0;
  dur = act ? act.getClip().duration : -1;
  const t0 = performance.now();
  while (performance.now() - t0 < 2600) {
    const a = angBetween(ref, armR.quaternion);
    if (act) { maxTime = Math.max(maxTime, act.time); ts = act.getEffectiveTimeScale(); }
    if (a > maxAng) {
      maxAng = a;
      running = [...cat.actions.entries()]
        .filter(([, x]) => x.getEffectiveWeight() > 0.01)
        .map(([n2, x]) => `${n2}:w${x.getEffectiveWeight().toFixed(2)}`)
        .join(",");
    }
    samples++;
    await new Promise((r) => requestAnimationFrame(r));
  }
  return { maxDeg: (maxAng * 180 / Math.PI).toFixed(1), samples, tClick, calls, running,
    clipDur: dur.toFixed(3), maxTime: maxTime.toFixed(3), timeScale: ts, trackMax: trackMax.toFixed(1) };
}, CLIP);

console.log(`=== FULL APP ${URL}`);
console.log(`=== clip: ${CLIP}`);
console.log(`=== ArmR max rotation from rest: ${res.err ? res.err : res.maxDeg + "° (" + res.samples + " samples)"}`);
console.log("=== playClip calls during window:", JSON.stringify(res.calls), "clickAt:", res.tClick);
console.log("=== running actions @ peak:", res.running);
console.log(`=== clipDur:${res.clipDur}s maxTime:${res.maxTime}s timeScale:${res.timeScale}`);
console.log(`=== adore ArmR TRACK intrinsic max: ${res.trackMax}° (clip data — should match GLB 64.9°)`);
await b.close();
process.exit(0);
