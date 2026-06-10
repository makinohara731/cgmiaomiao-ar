// M6 headless verification: AR enter/exit through the real #camBtn path (fake
// camera), seating-flag parsing (NaN-safe), ?ar=mind backend pick, the #arHint /
// #arCaption overlays, soulNotice routing, and the QR modal. Real green-lock /
// MindAR tracking / MediaPipe stay manual on real hardware.
//   node dev/_m6check.mjs [url]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const BASE = process.argv[2] || "http://127.0.0.1:8765/";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, ok, extra = "") {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}  ${extra}`); }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost",
         "--use-gl=swiftshader", "--no-sandbox", "--window-size=1280,720",
         "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

async function newPage(url) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = [];
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "", affection: 40, unlocks: [], seenEvents: ["熟悉", "亲近"], bornAt: Date.now() - 86400000, savedAt: Date.now() }));
    localStorage.setItem("miaomiao.story.v1", JSON.stringify({ v: 1, route: "羁绊", seenBeats: ["daily.intro", "daily.curious", "bond.open", "bond.memory"], flags: { first_day: true }, unlockedEndings: [], acceptedRomance: false, updatedAt: 1 }));
  });
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
  await page.waitForFunction(() => window.__r && window.__r.isReady(), { timeout: 30000 }).catch(() => null);
  await sleep(600);
  return { ctx, page, logs };
}

// ---------- A. enter/exit AR via the 📸 button ----------
console.log("\n=== A. AR enter/exit (green-blob, fake camera)");
{
  const { ctx, page, logs } = await newPage(BASE);
  const cap = await page.evaluate(() => window.__arDebug.state());
  check("arCapable on desktop three backend", cap.capable === true, JSON.stringify(cap));

  await page.click("#camBtn");
  await page.waitForFunction(() => document.body.classList.contains("ar-mode"), { timeout: 15000 }).catch(() => null);
  const inAr = await page.evaluate(() => ({
    bodyClass: document.body.classList.contains("ar-mode"),
    state: window.__arDebug.state(),
    feedBeforeCanvas: (() => {
      const v = document.querySelector("#scene video.ar-feed");
      const c = document.getElementById("catCanvas");
      if (!v || !c) return false;
      return !!(v.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING);
    })(),
    hintCreated: !!document.querySelector("#arHint .ar-hint-swatch"),
    hintShown: !!document.querySelector("#arHint.show"),
    camBtnActive: document.getElementById("camBtn").classList.contains("active"),
  }));
  check("body.ar-mode set", inAr.bodyClass);
  check("renderer in AR (cameraState.isAR)", inAr.state.camState && inAr.state.camState.isAR === true, JSON.stringify(inAr.state));
  check("ar-feed video inserted before #catCanvas", inAr.feedBeforeCanvas);
  // The fake camera's test pattern contains green → the blob can lock instantly
  // and correctly hide the hint; assert the green-flavor hint EXISTS instead.
  check("green #arHint created (swatch flavor)", inAr.hintCreated);
  console.log(`  INFO  hint visible at sample time: ${inAr.hintShown} (green-lock may have hidden it)`);
  check("camBtn active", inAr.camBtnActive);

  // soulNotice routing → #arCaption in AR
  await page.evaluate(() => window.__arDebug.caption("羁绊加深 · 测试", 2000));
  await sleep(200);
  const cap2 = await page.evaluate(() => {
    const el = document.getElementById("arCaption");
    return { shown: !!el && el.classList.contains("show"), text: el ? el.textContent : "" };
  });
  check("#arCaption shows + text", cap2.shown && cap2.text === "羁绊加深 · 测试", JSON.stringify(cap2));

  await page.click("#camBtn"); // exit
  await sleep(600);
  const out = await page.evaluate(() => ({
    bodyClass: document.body.classList.contains("ar-mode"),
    state: window.__arDebug.state(),
    feedGone: !document.querySelector("#scene video.ar-feed"),
    hintHidden: !document.querySelector("#arHint.show"),
    captionHidden: !document.querySelector("#arCaption.show"),
    camBtnActive: document.getElementById("camBtn").classList.contains("active"),
  }));
  check("exit clears body.ar-mode", !out.bodyClass);
  check("exit restores fallback camera (fov 30, !isAR)", out.state.camState && out.state.camState.isAR === false && Math.round(out.state.camState.fov) === 30, JSON.stringify(out.state.camState));
  check("ar-feed video removed", out.feedGone);
  check("#arHint hidden on exit", out.hintHidden);
  check("#arCaption hidden on exit", out.captionHidden);
  check("camBtn not active", !out.camBtnActive);

  // re-enter reuses the lazily-built session (no crash, same plumbing)
  await page.click("#camBtn");
  await page.waitForFunction(() => document.body.classList.contains("ar-mode"), { timeout: 15000 }).catch(() => null);
  check("re-enter works (session reuse)", await page.evaluate(() => document.body.classList.contains("ar-mode")));
  await page.click("#camBtn");
  await sleep(400);

  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- B. seating flags parse (incl. NaN safety) ----------
console.log("\n=== B. seating flags");
{
  const { ctx, page } = await newPage(BASE + "?sc=0.8&rx=5&ry=10&lift=0.2&bs=3.5");
  const s = await page.evaluate(() => window.__arDebug.seating);
  check("?sc/rx/ry/lift override green defaults",
    s.scale === 0.8 && s.rotXDeg === 5 && s.rotYDeg === 10 && s.lift === 0.2, JSON.stringify(s));
  await ctx.close();
}
{
  const { ctx, page } = await newPage(BASE + "?sc=abc&ry=");
  const s = await page.evaluate(() => ({ seat: window.__arDebug.seating, mind: window.__arDebug.useMindAr }));
  check("NaN-safe flags fall back to green defaults",
    s.seat.scale === 1 && s.seat.rotYDeg === 22 && s.seat.rotXDeg === 0 && s.mind === false, JSON.stringify(s));
  await ctx.close();
}

// ---------- C. ?ar=mind backend pick ----------
console.log("\n=== C. ?ar=mind");
{
  const { ctx, page } = await newPage(BASE + "?ar=mind");
  const s = await page.evaluate(() => ({ mind: window.__arDebug.useMindAr, seat: window.__arDebug.seating }));
  check("useMindAr true + mind seating defaults (0.5/90/0)",
    s.mind === true && s.seat.scale === 0.5 && s.seat.rotXDeg === 90 && s.seat.rotYDeg === 0, JSON.stringify(s));
  await ctx.close();
}

// ---------- D. soulNotice routes to toast OFF AR ----------
console.log("\n=== D. soulNotice off-AR → toast");
{
  const { ctx, page } = await newPage(BASE);
  // not in AR: the caption element must NOT be used by soulNotice — emulate by
  // checking the seam directly: feed across a bond boundary fires soulNotice.
  await page.evaluate(() => { for (let i = 0; i < 2; i++) document.getElementById("feedBtn").click(); });
  await sleep(700);
  const r = await page.evaluate(() => ({
    captionShown: !!document.querySelector("#arCaption.show"),
  }));
  check("no AR caption while not in AR", !r.captionShown);
  await ctx.close();
}

// ---------- E. QR button + modal ----------
console.log("\n=== E. QR modal");
{
  const { ctx, page, logs } = await newPage(BASE);
  await sleep(1500); // the 1200ms canActivateAR re-check
  const btn = await page.evaluate(() => !!document.getElementById("qrBtn"));
  check("#qrBtn visible on desktop (no native AR)", btn);
  if (btn) {
    await page.click("#qrBtn");
    await sleep(200);
    const openState = await page.evaluate(() => ({
      open: !document.getElementById("qrModal").classList.contains("hidden"),
      url: (document.querySelector("#qrModal .qr-url") || {}).textContent || "",
      img: !!document.getElementById("qrImg"),
    }));
    check("modal opens with qr.png + url", openState.open && openState.img && openState.url.includes("makinohara731.github.io"), JSON.stringify(openState));
    await page.click("#qrClose");
    await sleep(200);
    check("modal closes", await page.evaluate(() => document.getElementById("qrModal").classList.contains("hidden")));
  }
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log(`\n=== TOTAL: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
