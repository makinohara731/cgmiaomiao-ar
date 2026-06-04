// Diagnostic probe: load the app, capture all console + page errors, inspect
// renderer/animation state, and screenshot. Run against `npm run dev` (8765).
//   NODE_PATH=C:/Users/Lenovo/AppData/Roaming/npm/node_modules node dev/diag-probe.mjs [url]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

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
page.on("requestfailed", (r) =>
  logs.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`)
);

await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 }).catch((e) =>
  logs.push(`[goto] ${e.message}`)
);
// give the GLB + draco worker time to load and the mixer to spin up
await new Promise((r) => setTimeout(r, 7000));

const state = await page.evaluate(() => {
  const mv = document.querySelector("#catModel");
  const canvas = document.querySelector("#catCanvas");
  const loader = document.querySelector("#loader");
  return {
    bodyClass: document.body.className,
    loaderHidden: loader?.classList.contains("hidden") ?? null,
    canvasVisible: canvas ? !canvas.classList.contains("renderer-hidden") : null,
    mvDisplayNone: mv ? getComputedStyle(mv).display === "none" : null,
    mvAnimCount: mv?.availableAnimations?.length ?? null,
    mvLoaded: mv?.loaded ?? null,
    statusText: document.querySelector("#status")?.textContent || "",
    activeAnimBtn: document.querySelector(".anim-btn.active")?.getAttribute("data-anim") || null,
  };
});

console.log("=== URL:", URL);
console.log("=== STATE:", JSON.stringify(state, null, 2));
console.log("=== CONSOLE (" + logs.length + ") ===");
for (const l of logs) console.log(l);

const out = URL.includes("renderer=mv") ? "dev/_diag_mv.png" : "dev/_diag_three.png";
await page.screenshot({ path: out });
console.log("=== shot:", out);

await browser.close();
