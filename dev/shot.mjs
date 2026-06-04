// UI screenshot harness. Seeds "already onboarded" state, then drives the app to
// a named surface and screenshots it, so the aesthetic redesign can be verified
// across every panel headlessly.
//   node dev/shot.mjs <scene> [outfile]
// scenes: main | onboard | status | diary | gallery | cfg | chat | choices | dialogue
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const SCENE = process.argv[2] || "main";
const OUT = process.argv[3] || `dev/_shot_${SCENE}.png`;
const URL = "http://127.0.0.1:8765/";
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
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.25 });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));

await page.goto(URL, { waitUntil: "domcontentloaded" });
if (!SCENE.startsWith("onboard")) {
  await page.evaluate(() => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem(
      "miaomiao.life.v1",
      JSON.stringify({ catName: "小绿", userName: "你", affection: 46, unlocks: ["nickname"], bornAt: Date.now() - 6 * 86400000 })
    );
    localStorage.setItem(
      "miaomiao.diary.v1",
      JSON.stringify([
        { ymd: "2026-06-01", text: "今天第一次见到你，有点害羞但很开心。", tag: "day", ts: Date.now() - 3 * 86400000 },
        { ymd: "2026-06-03", text: "你摸了摸我的头，我把这件事记住了。", tag: "moment", ts: Date.now() - 86400000 },
      ])
    );
  });
}
await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
await new Promise((r) => setTimeout(r, 5500));

const click = async (sel) => { await page.evaluate((s) => document.querySelector(s)?.click(), sel); await new Promise((r) => setTimeout(r, 600)); };

if (SCENE === "onboard3") { await click("#onboard"); await click("#onboard"); }
else if (SCENE === "onboard4") { await click("#onboard"); await click("#onboard"); await click("#onboard"); }
else if (SCENE === "tray") await click("#animToggle");
else if (SCENE === "status") await click("#bondChip");
else if (SCENE === "diary") { await click("#bondChip"); await click("#spOpenDiary"); }
else if (SCENE === "gallery") { await click("#bondChip"); await click("#spOpenGallery"); }
else if (SCENE === "cfg") { await click("#bondChip"); await click("#spOpenCfg"); }
else if (SCENE === "chat") await click("#chatBtn");
else if (SCENE === "choices") {
  await page.evaluate(() => (window).__offerChoices?.(["要不要一起看星星？", "给你讲个秘密", "我想抱抱"]));
  await new Promise((r) => setTimeout(r, 700));
} else if (SCENE === "dialogue") {
  await page.evaluate(() => (window).__dialogue?.say?.("呜…你今天回来得好晚，我等了你好久好久呢。"));
  await new Promise((r) => setTimeout(r, 1400));
}

await page.screenshot({ path: OUT });
console.log("shot:", OUT, errs.length ? "ERRORS: " + errs.join(" | ") : "(no page errors)");
await browser.close();
