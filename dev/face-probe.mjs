// Render the new face atlases on the actual 3D head (via the three-smoke harness
// __r). Loads faces, sets each, screenshots a tight crop of the head so blush /
// think placement can be verified + tuned headlessly.
//   node dev/face-probe.mjs
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const URL = "http://127.0.0.1:8765/dev/three-smoke.html";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: [
    "--proxy-server=http://127.0.0.1:10808",
    "--proxy-bypass-list=127.0.0.1,localhost",
    "--use-gl=swiftshader",
    "--no-sandbox",
    "--window-size=900,900",
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 900, deviceScaleFactor: 1 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });

// wait for the renderer to report ready
await page.waitForFunction(() => (window).__smoke?.ready === true, { timeout: 20000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 1500));

const loaded = await page.evaluate(async () => {
  const r = (window).__r;
  await r.loadFaces({
    variants: {
      blink: "textures/face_blink.webp",
      happy: "textures/face_happy.webp",
      blush: "textures/face_blush.webp",
      think: "textures/face_think.webp",
    },
    headMaterial: "root.3",
  });
  r.setOrientation(0, 0);
  r.playClip("idle", true);
  return { open: r.hasFace("open"), blush: r.hasFace("blush"), think: r.hasFace("think") };
});
console.log("faces:", JSON.stringify(loaded), errs.length ? "ERRS:" + errs.join("|") : "");

for (const f of ["open", "blush", "think", "happy"]) {
  await page.evaluate((n) => (window).__r.setFace(n), f);
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: `dev/_face_${f}.png` });
}
console.log("shots: _face_open / _face_blush / _face_think / _face_happy");
await browser.close();
