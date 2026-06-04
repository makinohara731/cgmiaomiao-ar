// Animation probe: skip onboarding, let the three.js cat run, capture two frames
// ~1.3s apart and report the fraction of pixels that changed (→ is it animating?).
//   node dev/anim-probe.mjs [url]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
import { decodePNG } from "./png-min.mjs";

const URL = process.argv[2] || "http://127.0.0.1:8765/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--proxy-server=http://127.0.0.1:10808",
    "--proxy-bypass-list=127.0.0.1,localhost",
    "--use-gl=swiftshader",
    "--no-sandbox",
    "--window-size=1280,720",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));

// First load to get an origin, then seed "already onboarded" + a name so the cat
// shows directly, then reload.
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("miaomiao.onboarded.v1", "1");
  localStorage.setItem(
    "miaomiao.life.v1",
    JSON.stringify({ catName: "小绿", userName: "", affection: 20, unlocks: [], bornAt: Date.now() - 86400000 })
  );
});
await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 6000));

const buf1 = await page.screenshot();
await new Promise((r) => setTimeout(r, 1300));
const buf2 = await page.screenshot();

const a = decodePNG(buf1);
const b = decodePNG(buf2);
let changed = 0;
const ch = a.channels;
const n = Math.min(a.data.length, b.data.length);
for (let i = 0; i + 2 < n; i += ch) {
  const d =
    Math.abs(a.data[i] - b.data[i]) +
    Math.abs(a.data[i + 1] - b.data[i + 1]) +
    Math.abs(a.data[i + 2] - b.data[i + 2]);
  if (d > 24) changed++;
}
const px = a.width * a.height;
console.log("=== URL:", URL);
console.log(`=== changed pixels: ${changed} / ${px} = ${((changed / px) * 100).toFixed(2)}%`);
console.log("=== (>0.5% over 1.3s ⇒ the cat is animating)");
const st = await page.evaluate(() => ({
  body: document.body.className,
  loaderHidden: document.querySelector("#loader")?.classList.contains("hidden"),
  onboardHidden: document.querySelector("#onboard")?.classList.contains("hidden"),
}));
console.log("=== STATE:", JSON.stringify(st));
console.log("=== CONSOLE:");
for (const l of logs) console.log(l);
await page.screenshot({ path: "dev/_anim_frame.png" });
await browser.close();
