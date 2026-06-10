// M4 headless verification: onboarding flow, story beat wiring, save/load slots,
// gallery panel, no-clobber on tab-hide. Runs against the DEV server (needs the
// import.meta.env.DEV window.__story/__saves hooks).
//   node dev/_m4check.mjs [url]
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");

const URL = process.argv[2] || "http://127.0.0.1:8765/";
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

async function newPage(seed) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  if (seed) await page.evaluateOnNewDocument(seed);
  await page.goto(URL, { waitUntil: "networkidle2", timeout: 45000 });
  return { ctx, page, logs };
}
const waitReady = (page) =>
  page.waitForFunction(() => window.__r && window.__r.isReady(), { timeout: 25000 }).catch(() => null);

// ---------- A. fresh visit → onboarding cutscene + naming ----------
console.log("\n=== A. onboarding (fresh visit)");
{
  const { ctx, page, logs } = await newPage(null);
  await waitReady(page);
  await page.waitForFunction(() => {
    const el = document.getElementById("onboard");
    return el && !el.classList.contains("hidden");
  }, { timeout: 20000 }).catch(() => null);

  const visible = await page.evaluate(() => {
    const el = document.getElementById("onboard");
    return el && !el.classList.contains("hidden");
  });
  check("overlay shows on first visit", !!visible);

  const beat1 = await page.evaluate(() => !document.querySelector('[data-beat="1"]').classList.contains("hidden"));
  check("beat 1 visible", !!beat1);

  // regression gate (review fix): the autonomy loop must NOT burn story beats
  // behind the onboarding overlay — linger on beat 1 across several ticks.
  await sleep(7000);
  const burned = await page.evaluate(() =>
    ((JSON.parse(localStorage.getItem("miaomiao.story.v1") || "{}").seenBeats) || []).includes("daily.intro"));
  check("no beat consumed behind overlay", !burned);

  for (let i = 0; i < 3; i++) { await page.click("#onboard .beat-line, #onboard"); await sleep(350); }
  const state4 = await page.evaluate(() => ({
    b4: !document.querySelector('[data-beat="4"]').classList.contains("hidden"),
    isLast: document.getElementById("onboard").classList.contains("is-last"),
  }));
  check("3 taps reach beat 4", state4.b4);
  check("overlay gains .is-last on beat 4", state4.isLast);

  await page.type("#catNameInput", "咪咪");
  await page.click("#onboardStart");
  await sleep(900); // 400ms applyNaming + typewriter start

  const after = await page.evaluate(() => ({
    hidden: document.getElementById("onboard").classList.contains("hidden"),
    flag: localStorage.getItem("miaomiao.onboarded.v1"),
    catName: (JSON.parse(localStorage.getItem("miaomiao.life.v1") || "{}").catName) || "",
    story: JSON.parse(localStorage.getItem("miaomiao.story.v1") || "null"),
    vnOpen: !!document.querySelector(".vn-box.show"),
    vnText: (document.querySelector(".vn-text") || {}).textContent || "",
  }));
  check("overlay hidden after 交个朋友吧", after.hidden);
  check("onboarded flag written", after.flag === "1");
  check("catName persisted", after.catName === "咪咪", `got "${after.catName}"`);
  check("story state persisted (route 日常)", after.story && after.story.route === "日常", JSON.stringify(after.story));
  await sleep(2500);
  const vnText = await page.evaluate(() => (document.querySelector(".vn-text") || {}).textContent || "");
  check("naming line in VN box", vnText.includes("咪咪"), `got "${vnText}"`);

  const errs = logs.filter((l) => /pageerror|\[error\]/.test(l) && !/favicon/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- B1. story beat fires on a proactive turn ----------
console.log("\n=== B1. daily.intro beat via maybeBeat");
{
  const { ctx, page, logs } = await newPage(() => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "", affection: 20, unlocks: [], seenEvents: ["熟悉"], bornAt: Date.now() - 86400000, savedAt: Date.now() }));
  });
  await waitReady(page);
  await sleep(1500);

  // retry: the autonomy loop may have the cat mid one-shot
  let fired = false;
  for (let i = 0; i < 12 && !fired; i++) {
    fired = await page.evaluate(() => window.__story.maybeBeat("proactive"));
    if (!fired) await sleep(1000);
  }
  check("maybeBeat ran a beat", fired);
  await sleep(2500);
  const r = await page.evaluate(() => ({
    vnText: (document.querySelector(".vn-text") || {}).textContent || "",
    seen: (JSON.parse(localStorage.getItem("miaomiao.story.v1") || "{}").seenBeats) || [],
  }));
  check("daily.intro line in VN box", r.vnText.includes("留下来陪我"), `got "${r.vnText}"`);
  check("daily.intro marked seen + persisted", r.seen.includes("daily.intro"), JSON.stringify(r.seen));
  const errs = logs.filter((l) => /pageerror|\[error\]/.test(l) && !/favicon/.test(l));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- B2. CHOICE beat (bond.promise): answered → markSeen ----------
console.log("\n=== B2. choice beat bond.promise");
{
  const { ctx, page } = await newPage(() => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "", affection: 65, unlocks: ["bgm", "dream", "nickname"], seenEvents: ["熟悉", "亲近", "黏人"], bornAt: Date.now() - 86400000, savedAt: Date.now() }));
    localStorage.setItem("miaomiao.story.v1", JSON.stringify({ v: 1, route: "羁绊", seenBeats: ["daily.intro", "daily.curious", "bond.open", "bond.memory"], flags: { first_day: true, bonded: true }, unlockedEndings: [], acceptedRomance: false, updatedAt: 1 }));
  });
  await waitReady(page);
  await sleep(1500);

  // The app's own autonomy loop may beat us to it (proactiveSpeak → maybeBeat);
  // in that case our manual call returns false because choices are already open.
  let fired = false;
  for (let i = 0; i < 12 && !fired; i++) {
    fired = await page.evaluate(() =>
      window.__story.maybeBeat("proactive") || !document.getElementById("choices").classList.contains("hidden"));
    if (!fired) await sleep(1000);
  }
  check("choice beat fired", fired);
  await sleep(600);
  const choices = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#choices .choice-btn")).map((b) => b.textContent));
  check("2 choice buttons shown", choices.length === 2 && choices[0] === "会一直在", JSON.stringify(choices));

  // unanswered yet → NOT seen (manualSeen invariant)
  const seenBefore = await page.evaluate(() => window.__story.state.seenBeats.includes("bond.promise"));
  check("not marked seen before pick (manualSeen)", !seenBefore);

  await page.evaluate(() => { document.querySelectorAll("#choices .choice-btn")[0].click(); });
  await sleep(1800);
  const r = await page.evaluate(() => ({
    seen: window.__story.state.seenBeats.includes("bond.promise"),
    flag: window.__story.state.flags.promised === true,
    vnText: (document.querySelector(".vn-text") || {}).textContent || "",
    choicesOpen: !document.getElementById("choices").classList.contains("hidden"),
  }));
  check("marked seen after pick", r.seen);
  check("promised flag set", r.flag);
  check("reply line shows", r.vnText.includes("赖着你"), `got "${r.vnText}"`);
  check("choices closed after pick", !r.choicesOpen);
  await ctx.close();
}

// ---------- C. gallery panel + save/load + no clobber ----------
console.log("\n=== C. gallery + save/load slots");
{
  const { ctx, page, logs } = await newPage(() => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "", affection: 40, unlocks: ["bgm", "dream"], seenEvents: ["熟悉", "亲近"], bornAt: Date.now() - 86400000, savedAt: Date.now() }));
  });
  await waitReady(page);
  await sleep(1200);

  // open status panel → 回廊
  await page.click("#bondChip");
  await sleep(300);
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll(".sp-cfg-link"));
    const b = btns.find((x) => x.textContent === "回廊");
    b && b.click();
  });
  await sleep(300);
  const g = await page.evaluate(() => ({
    panel: !!document.getElementById("galleryPanel"),
    endings: Array.from(document.querySelectorAll("#galleryEndings .diary-item")).map((d) => ({
      locked: d.classList.contains("locked"), text: d.textContent,
    })),
    slots: document.querySelectorAll("#gallerySlots .save-slot").length,
    saveBtns: document.querySelectorAll("#gallerySlots .slot-save").length,
    loadBtns: document.querySelectorAll("#gallerySlots .slot-load").length,
    closeIcon: !!document.querySelector("#galleryPanel .sp-close svg"),
  }));
  check("gallery panel opens", g.panel);
  check("2 endings, both locked (？？？)", g.endings.length === 2 && g.endings.every((e) => e.locked && e.text.includes("？？？")), JSON.stringify(g.endings));
  check("3 slots, 3 save btns, 0 load btns", g.slots === 3 && g.saveBtns === 3 && g.loadBtns === 0, `${g.slots}/${g.saveBtns}/${g.loadBtns}`);
  check("gallery close icon renders", g.closeIcon);

  // save slot 1
  await page.click('#gallerySlots .slot-save[data-slot="0"]');
  await sleep(400);
  const s = await page.evaluate(() => {
    const blob = JSON.parse(localStorage.getItem("miaomiao.saves.v1") || "null");
    const m = blob && blob.slots[0] && blob.slots[0].meta;
    return {
      meta: m,
      loadBtns: document.querySelectorAll("#gallerySlots .slot-load").length,
      toast: (document.getElementById("status") || {}).textContent || "",
      slotText: (document.querySelector("#gallerySlots .save-slot") || {}).textContent || "",
    };
  });
  check("slot 0 saved with meta", s.meta && s.meta.used && Math.round(s.meta.affection) === 40 && s.meta.catName === "小绿" && s.meta.route === "羁绊", JSON.stringify(s.meta));
  check("读取 button appears", s.loadBtns === 1);
  check("save toast", s.toast.includes("已保存到存档 1"), s.toast);
  check("slot row shows meta", s.slotText.includes("小绿") && s.slotText.includes("好感 40"), s.slotText);

  // close panel, feed twice (real engine mutation), affection rises
  await page.evaluate(() => { document.getElementById("galleryPanel").dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await sleep(300);
  await page.click("#feedBtn"); await sleep(400); await page.click("#feedBtn"); await sleep(600);
  const affAfterFeed = await page.evaluate(() => parseFloat(document.getElementById("bondChip").style.getPropertyValue("--aff")) * 100);
  check("feeding raised affection in memory", affAfterFeed > 40.5, String(affAfterFeed));

  // reopen gallery, load slot 1 → affection back to 40
  await page.click("#bondChip"); await sleep(250);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll(".sp-cfg-link")).find((x) => x.textContent === "回廊"); b && b.click(); });
  await sleep(250);
  await page.click('#gallerySlots .slot-load[data-slot="0"]');
  await sleep(500);
  const l = await page.evaluate(() => ({
    aff: parseFloat(document.getElementById("bondChip").style.getPropertyValue("--aff")) * 100,
    disk: JSON.parse(localStorage.getItem("miaomiao.life.v1")).affection,
    toast: (document.getElementById("status") || {}).textContent || "",
  }));
  check("affection restored in memory (HUD)", Math.abs(l.aff - 40) < 0.01, String(l.aff));
  check("affection restored on disk", l.disk === 40, String(l.disk));
  check("load toast", l.toast.includes("已读取存档 1"), l.toast);

  // simulated tab death right after restore → restored state survives
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
  await sleep(300);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("miaomiao.life.v1")).affection);
  check("pagehide after load does NOT clobber", after === 40, String(after));

  // other panels' data-icon close buttons (M3 mountIcons timing check)
  await page.evaluate(() => { const b = document.querySelector("#galleryPanel"); b && b.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  await sleep(200);
  await page.click("#bondChip"); await sleep(250);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll(".sp-cfg-link")).find((x) => x.textContent === "日记"); b && b.click(); });
  await sleep(300);
  const diaryIcon = await page.evaluate(() => !!document.querySelector('.sp-close [data-icon="close"] svg, .sp-close[data-icon] svg, .sp-close svg'));
  console.log(`  INFO  diary panel close icon renders: ${diaryIcon}`);

  const errs = logs.filter((l2) => /pageerror|\[error\]/.test(l2) && !/favicon/.test(l2));
  check("no page errors", errs.length === 0, errs.join(" | "));
  await ctx.close();
}

// ---------- D. unlocked ending shows in gallery ----------
console.log("\n=== D. unlocked ending display");
{
  const { ctx, page } = await newPage(() => {
    localStorage.setItem("miaomiao.onboarded.v1", "1");
    localStorage.setItem("miaomiao.life.v1", JSON.stringify({ catName: "小绿", userName: "阿和", affection: 90, unlocks: ["bgm", "dream", "nickname", "photo"], seenEvents: ["熟悉", "亲近", "黏人", "形影不离"], bornAt: Date.now() - 86400000, savedAt: Date.now() }));
  });
  await waitReady(page);
  await sleep(1200);
  await page.click("#bondChip"); await sleep(250);
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll(".sp-cfg-link")).find((x) => x.textContent === "回廊"); b && b.click(); });
  await sleep(300);
  const d = await page.evaluate(() => ({
    items: Array.from(document.querySelectorAll("#galleryEndings .diary-item")).map((x) => ({ locked: x.classList.contains("locked"), text: x.textContent })),
    diary: JSON.parse(localStorage.getItem("miaomiao.diary.v1") || "[]").map((e) => e.text),
  }));
  const forever = d.items.find((x) => x.text.includes("永远的朋友"));
  check("forever ending unlocked + labeled", !!forever && !forever.locked, JSON.stringify(d.items));
  check("解锁结局 diary line written once", d.diary.filter((t) => t.includes("解锁结局「永远的朋友」")).length === 1, JSON.stringify(d.diary));
  await ctx.close();
}

console.log(`\n=== TOTAL: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
