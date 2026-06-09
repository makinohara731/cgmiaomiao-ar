// M0 check: the new Svelte app (svelte.html) mounts AND the legacy app (/) still
// loads. Reports console errors + a marker text from each.
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const b = await puppeteer.launch({
  executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost", "--use-gl=swiftshader", "--no-sandbox"],
});

async function check(url, label) {
  const p = await b.newPage();
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  await sleep(1500);
  const txt = (await p.evaluate(() => document.body.innerText || "")).slice(0, 60).replace(/\s+/g, " ");
  console.log(`\n=== ${label} (${url})`);
  console.log("   body text:", JSON.stringify(txt));
  console.log("   errors:", errs.length ? errs.slice(0, 5) : "none");
  await p.close();
}

await check("http://127.0.0.1:8765/svelte.html", "NEW Svelte app");
await check("http://127.0.0.1:8765/", "LEGACY main.js app");
await b.close();
