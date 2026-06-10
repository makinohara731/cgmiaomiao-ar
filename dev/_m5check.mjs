// M5 headless verification: chat streaming into the VN box, envelope consumption
// (animation validation + choices), stream-kill → non-stream fallback, 429 path,
// offline replies, catState window release, VOICE_MAP dispatch.
//
// The worker is mocked by overriding window.fetch IN-PAGE (evaluateOnNewDocument):
// CDP request interception wedges the renderer in this environment (and disables
// the cache), while an in-page fetch stub exercises the real chat-stream.ts
// ReadableStream path deterministically.
//   node dev/_m5check.mjs [url]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const URL_ = process.argv[2] || "http://127.0.0.1:8765/";
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
         "--use-gl=swiftshader", "--no-sandbox", "--window-size=1280,720"],
});

async function newPage(mode) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  await page.evaluateOnNewDocument((mode_) => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "", affection: 40, unlocks: [], seenEvents: ["熟悉", "亲近"], bornAt: Date.now() - 86400000, savedAt: Date.now() }));
    // keep the story quiet during chat checks
    localStorage.setItem("miaomiao.story.v1", JSON.stringify({ v: 1, route: "羁绊", seenBeats: ["daily.intro", "daily.curious", "bond.open", "bond.memory"], flags: { first_day: true }, unlockedEndings: [], acceptedRomance: false, updatedAt: 1 }));

    // ---- in-page worker mock ----
    const m = { mode: mode_, streamPosts: [], chatPosts: [], ttsPosts: 0 };
    window.__mock = m;
    const realFetch = window.fetch.bind(window);
    const sse = (frames) => frames.map((f) => "data: " + JSON.stringify(f) + "\n").join("\n") + "\n";
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (!/workers\.dev/.test(url)) return realFetch(input, init);
      if (url.endsWith("/api/chat-stream")) {
        m.streamPosts.push((init && init.body) || "");
        if (m.mode === "stream-ok") {
          return new Response(sse([
            { type: "text", content: "喵～今天" },
            { type: "text", content: "也最喜欢你啦！" },
            { type: "envelope", reply: "喵～今天也最喜欢你啦！", animation: "wave", emote: "👋", mood: "up", choices: ["陪我玩", "摸摸我"] },
            { type: "done" },
          ]), { status: 200, headers: { "Content-Type": "text/event-stream" } });
        }
        if (m.mode === "stream-bad-anim") {
          return new Response(sse([
            { type: "text", content: "我会飞哦" },
            { type: "envelope", reply: "我会飞哦", animation: "fly_to_moon", emote: "✨", mood: "up", choices: [] },
            { type: "done" },
          ]), { status: 200, headers: { "Content-Type": "text/event-stream" } });
        }
        return new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/chat")) {
        m.chatPosts.push((init && init.body) || "");
        if (m.mode === "nonstream-429") {
          return new Response(JSON.stringify({ ok: false, error: { code: "rate_limited", message: "30/min", status: 429 } }), { status: 429, headers: { "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ ok: true, reply: "备胎回复喵～", animation: "nod", emote: "😢", mood: "down", choices: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.endsWith("/api/tts")) {
        m.ttsPosts++;
        return new Response(JSON.stringify({ ok: false, error: { code: "no_key", message: "mock", status: 502 } }), { status: 502, headers: { "Content-Type": "application/json" } });
      }
      return realFetch(input, init);
    };
  }, mode);

  await page.goto(URL_, { waitUntil: "networkidle2", timeout: 45000 });
  await page.waitForFunction(() => window.__r && window.__r.isReady(), { timeout: 30000 }).catch(() => null);
  await sleep(800);
  return { ctx, page, logs };
}

const vnText = (page) => page.evaluate(() => (document.querySelector(".vn-text") || {}).textContent || "");
const lastCatMsg = (page) => page.evaluate(() => {
  const els = document.querySelectorAll("#chatLog .chat-msg.cat");
  return els.length ? els[els.length - 1].textContent : "";
});

// ---------- A. streaming success ----------
console.log("\n=== A. streaming chat → VN box + envelope");
{
  const { ctx, page, logs } = await newPage("stream-ok");
  await page.click("#chatBtn");
  await sleep(300);
  const open = await page.evaluate(() => !document.getElementById("chatPanel").classList.contains("hidden"));
  check("chat panel slides open", open);
  await page.type("#chatInput", "你好呀");
  const ttsBefore = await page.evaluate(() => window.__mock.ttsPosts);
  await page.click("#chatSend");
  await sleep(1500);

  check("reply streamed into VN box", (await vnText(page)).includes("最喜欢你"), await vnText(page));
  check("user + cat bubbles in chat log", await page.evaluate(() =>
    document.querySelectorAll("#chatLog .chat-msg.user").length === 1 &&
    document.querySelectorAll("#chatLog .chat-msg.cat:not(.thinking)").length === 1));
  const body = await page.evaluate(() => JSON.parse(window.__mock.streamPosts[0] || "{}"));
  check("body carries message/history/memory/story/state", body.message === "你好呀" && Array.isArray(body.history) && "memory" in body && "story" in body && body.state && body.state.catName === "小绿", JSON.stringify(body).slice(0, 200));
  const chips = await page.evaluate(() => Array.from(document.querySelectorAll("#choices .choice-btn")).map((b) => b.textContent));
  check("LLM choices rendered (2 chips)", chips.length === 2 && chips[0] === "陪我玩", JSON.stringify(chips));
  const waveActive = await page.evaluate(() => !!document.querySelector('#animBar [data-anim="wave"].active'));
  check("envelope animation wave played (validated)", waveActive);
  check("busy during read dwell", await page.evaluate(() => window.__busy()));
  // ≥1: the greeting/proactive lines may also have spoken in the window
  check("TTS fetch fired for the reply", await page.evaluate((b) => window.__mock.ttsPosts > b, ttsBefore));

  // pick a chip → continues the chat (a second stream POST fires)
  await page.evaluate(() => { document.querySelectorAll("#choices .choice-btn")[0].click(); });
  await sleep(1200);
  const follow = await page.evaluate(() => ({ n: window.__mock.streamPosts.length, msg: JSON.parse(window.__mock.streamPosts[1] || "{}").message }));
  check("picking a chip sends a follow-up chat", follow.n === 2 && follow.msg === "陪我玩", JSON.stringify(follow));
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- B. invalid animation name is rejected ----------
console.log("\n=== B. invalid envelope animation rejected");
{
  const { ctx, page, logs } = await newPage("stream-bad-anim");
  await page.click("#chatBtn"); await sleep(200);
  await page.type("#chatInput", "你能飞吗");
  await page.click("#chatSend");
  await sleep(1500);
  check("reply still shows", (await vnText(page)).includes("我会飞哦"), await vnText(page));
  const flyActive = await page.evaluate(() => !!document.querySelector("#animBar .anim-btn.active[data-anim='fly_to_moon']"));
  check("bogus clip not played", !flyActive);
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- C. stream kill → non-stream fallback ----------
console.log("\n=== C. stream-kill → non-stream fallback");
{
  const { ctx, page, logs } = await newPage("stream-dead");
  await page.click("#chatBtn"); await sleep(200);
  await page.type("#chatInput", "流断了怎么办");
  await page.click("#chatSend");
  // 503 → one retry (600ms) → fallback POST; the ~2s nod clip plays right after
  // the reply lands, so poll for its active flash instead of sampling late.
  let nodSeen = false;
  for (let i = 0; i < 25 && !nodSeen; i++) {
    nodSeen = await page.evaluate(() => !!document.querySelector('#animBar [data-anim="nod"].active'));
    if (!nodSeen) await sleep(200);
  }
  await sleep(800);

  const counts = await page.evaluate(() => ({ s: window.__mock.streamPosts.length, c: window.__mock.chatPosts.length }));
  check("fallback POST /api/chat fired", counts.c >= 1, JSON.stringify(counts));
  check("fallback reply in chat log", (await lastCatMsg(page)).includes("备胎回复"), await lastCatMsg(page));
  check("fallback reply in VN box (sayLine)", (await vnText(page)).includes("备胎回复"), await vnText(page));
  check("no thinking bubble left", await page.evaluate(() => !document.querySelector("#chatLog .chat-msg.thinking")));
  check("fallback envelope animation nod played", nodSeen);
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- D. 429 terminal releases the cat ----------
console.log("\n=== D. 429 path + catState release");
{
  const { ctx, page, logs } = await newPage("nonstream-429");
  await page.click("#chatBtn"); await sleep(200);
  await page.type("#chatInput", "再说一句");
  await page.click("#chatSend");
  await sleep(3500);
  check("429 bubble", (await lastCatMsg(page)).includes("太快啦"), await lastCatMsg(page));
  // The 20s window must be cut to 400ms — but the autonomy loop legitimately
  // re-claims busy for ambient moves, so poll for ANY idle moment within 6s.
  let released = false;
  for (let i = 0; i < 30 && !released; i++) {
    released = await page.evaluate(() => !window.__busy());
    if (!released) await sleep(200);
  }
  check("catState released after 429 (no 20s stall)", released);
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- E. offline reply ----------
console.log("\n=== E. offline short-circuit");
{
  const { ctx, page, logs } = await newPage("stream-ok");
  await page.evaluate(() => {
    // emulate offline at the API the code reads (navigator.onLine) + the event
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    window.dispatchEvent(new Event("offline"));
  });
  await sleep(300);
  await page.click("#chatBtn"); await sleep(200);
  await page.type("#chatInput", "在吗");
  await page.click("#chatSend");
  await sleep(1200);
  const msg = await lastCatMsg(page);
  const POOL = ["嗯…今天有点安静呢喵～", "（眨眨眼，看着你）", "我先陪你坐一会儿吧", "网络好像睡着啦，喵"];
  check("offline reply from the pool", POOL.some((p) => msg.includes(p)), msg);
  check("body.is-offline set", await page.evaluate(() => document.body.classList.contains("is-offline")));
  check("no request fired", await page.evaluate(() => window.__mock.streamPosts.length === 0 && window.__mock.chatPosts.length === 0));
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- F. VOICE_MAP dispatch ----------
console.log("\n=== F. VOICE_MAP keyword dispatch");
{
  const { ctx, page, logs } = await newPage("stream-ok");
  // composite precedence: 跳一下舞 must hit dance, not 跳→jump
  const r1 = await page.evaluate(() => window.__voice("给我跳一下舞"));
  await sleep(400);
  check("'跳一下舞' → composite (returns true + busy)", r1 === true && await page.evaluate(() => window.__busy()));
  await sleep(6000); // let the dance composite finish
  const r2 = await page.evaluate(() => window.__voice("点头"));
  await sleep(400);
  const nodActive = await page.evaluate(() => !!document.querySelector('#animBar [data-anim="nod"].active'));
  check("'点头' → nod clip", r2 === true && nodActive);
  await sleep(2500);
  const before = await page.evaluate(() => window.__mock.streamPosts.length);
  const r3 = await page.evaluate(() => window.__voice("今天天气怎么样呢"));
  await sleep(1500);
  const after = await page.evaluate(() => window.__mock.streamPosts.length);
  check("no keyword → falls through to chat", r3 === false && after === before + 1, `${r3} ${after - before}`);
  const errs = logs.filter((l) => /pageerror/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

console.log(`\n=== TOTAL: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
