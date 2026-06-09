// Per-clip playback check via the REAL UI path: open the action tray, click each
// action button, and measure on-screen motion right after (two frames ~500ms
// apart). A working clip moves a lot; a frozen/broken clip sits near 0% (idle is
// hard-cut off when a one-shot plays, so "no motion" really means broken).
//   node dev/_clipcheck.mjs
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
import { decodePNG } from "./png-min.mjs";
import { mkdirSync } from "fs";
mkdirSync("dev/_clipcheck", { recursive: true });

const URL = "http://127.0.0.1:8765/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function diffPct(b1, b2) {
  const a = decodePNG(b1), b = decodePNG(b2), ch = a.channels;
  let changed = 0; const n = Math.min(a.data.length, b.data.length);
  for (let i = 0; i + 2 < n; i += ch) {
    const d = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i+1] - b.data[i+1]) + Math.abs(a.data[i+2] - b.data[i+2]);
    if (d > 24) changed++;
  }
  return (changed / (a.width * a.height)) * 100;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost",
         "--use-gl=swiftshader", "--no-sandbox", "--window-size=1280,720"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720 });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
await page.evaluateOnNewDocument(() => {
  localStorage.setItem("miaomiao.onboarded.v1", "1");
  localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "", affection: 40, unlocks: [], bornAt: Date.now() - 86400000 }));
});
await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(5000);
await page.evaluate(() => document.body.classList.add("anim-open"));

// enumerate the action buttons actually in the DOM
const btns = await page.evaluate(() =>
  Array.from(document.querySelectorAll("#animBar .anim-btn"))
    .map((b) => ({ anim: b.dataset.anim || "", composite: b.dataset.composite || "" }))
);
const clips = btns.filter((b) => b.anim && !b.composite).map((b) => b.anim);
console.log("=== buttons found:", btns.length, "| single-clip:", clips.length);
console.log("=== clip list:", clips.join(", "));

// idle baseline (no action triggered)
const i1 = await page.screenshot(); await sleep(600); const i2 = await page.screenshot();
console.log(`\n--- idle baseline motion: ${diffPct(i1, i2).toFixed(2)}%\n`);

const rows = [];
for (const clip of clips) {
  await page.evaluate((c) => { const e = document.querySelector(`#animBar [data-anim="${c}"]`); e && e.click(); }, clip);
  await sleep(220);
  const a = await page.screenshot();
  await sleep(520);
  const b = await page.screenshot();
  const pct = diffPct(a, b);
  await page.screenshot({ path: `dev/_clipcheck/${clip}.png` });
  rows.push({ clip, pct });
  console.log(`${clip.padEnd(12)} ${pct.toFixed(2)}%  ${pct < 0.6 ? "  <-- FROZEN?" : ""}`);
  await sleep(1600); // let it return to idle
}

rows.sort((x, y) => x.pct - y.pct);
console.log("\n=== SORTED (lowest motion first):");
for (const r of rows) console.log(`  ${r.clip.padEnd(12)} ${r.pct.toFixed(2)}%`);
console.log("\n=== CONSOLE (errors/warns):");
for (const l of logs) if (/error|warn|fail|missing/i.test(l)) console.log(l);
await browser.close();
