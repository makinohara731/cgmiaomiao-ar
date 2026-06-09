import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
import { decodePNG } from "./png-min.mjs";
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = process.argv[2] || "http://127.0.0.1:8765/svelte.html";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Bounding box of "cat green" pixels (g clearly dominates r and b).
function greenBBox(buf) {
  const im = decodePNG(buf), ch = im.channels, W = im.width, H = im.height;
  let minX = W, minY = H, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch, r = im.data[i], g = im.data[i + 1], b = im.data[i + 2];
    if (g > 90 && g > r + 18 && g > b + 25) {
      n++; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return { W, H, n, box: n ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null };
}

const b = await puppeteer.launch({ executablePath: CHROME, headless: "new",
  args: ["--proxy-server=http://127.0.0.1:10808", "--proxy-bypass-list=127.0.0.1,localhost", "--use-gl=swiftshader", "--no-sandbox", "--window-size=1280,720"] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
await sleep(6000);
const buf = await p.screenshot();
const gb = greenBBox(buf);
console.log("green-pixel bbox:", JSON.stringify(gb));
await p.screenshot({ path: "dev/_svelteshot.png" });
await b.close();
process.exit(0);
