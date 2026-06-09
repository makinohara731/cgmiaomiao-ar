// M3 check: HUD renders; crossing an affection band fires a bond event + unlock
// + diary (once); the status panel opens from the bond chip.
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = "http://127.0.0.1:8765/svelte.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost", "--use-gl=swiftshader", "--no-sandbox", "--window-size=1280,720"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
const errs = [];
p.on("pageerror", (e) => errs.push(e.message));
p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
// Seed: onboarded, affection just under 熟悉(15), hungry so feed gives +4.
await p.evaluateOnNewDocument(() => {
  localStorage.setItem("miaomiao.onboarded.v1", "1");
  localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", affection: 14, hunger: 0.3, mood: 0.6, energy: 0.7, bornAt: Date.now() - 3 * 86400000, savedAt: Date.now() }));
});
for (let i = 0; i < 3; i++) { try { await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 30000 }); break; } catch { await sleep(1500); } }
await p.waitForFunction(() => window.__r && window.__r.getClips && window.__r.getClips().length > 0, { timeout: 30000 });
await sleep(3500);

// HUD present?
const hud = await p.evaluate(() => ({
  bondChip: !!document.getElementById("bondChip"),
  bondStage: document.getElementById("bondStage")?.textContent,
  feedBtn: !!document.getElementById("feedBtn"),
  sideBar: !!document.getElementById("sideBar"),
}));
console.log("HUD:", JSON.stringify(hud));
await p.screenshot({ path: "dev/_m3_hud.png" });

// Feed → +4 affection → cross 15 → bond event 熟悉 (+ bgm unlock + diary).
await p.evaluate(() => document.getElementById("feedBtn")?.click());
await sleep(2500);
const after = await p.evaluate(() => {
  const life = JSON.parse(localStorage.getItem("miaomiao.life.v1") || "{}");
  const diary = JSON.parse(localStorage.getItem("miaomiao.diary.v1") || "[]");
  return { affection: life.affection, unlocks: life.unlocks, seenEvents: life.seenEvents,
    diaryHas熟悉: diary.some((d) => /熟悉/.test(d.text)), diaryLen: diary.length };
});
console.log("after feed:", JSON.stringify(after));

// Open status panel from the bond chip.
await p.evaluate(() => document.getElementById("bondChip")?.click());
await sleep(500);
const panel = await p.evaluate(() => {
  const sp = document.getElementById("statusPanel");
  return { statusPanelOpen: !!sp, ladderRungs: document.querySelectorAll(".sp-rung").length, keeps: document.querySelectorAll(".sp-keep").length };
});
console.log("status panel:", JSON.stringify(panel));
await p.screenshot({ path: "dev/_m3_panel.png" });

console.log("errors:", errs.length ? errs.slice(0, 6) : "none");
await b.close();
process.exit(0);
