import { createRequire } from "module"; import { readFileSync, writeFileSync } from "fs";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
const PORT = readFileSync(process.env.CLAUDE_JOB_DIR+"/tmp/port.txt","utf8").trim();
const BASE="http://127.0.0.1:"+PORT;
const OUT="E:/05_claude/CGmiaomiao/ar/public/targets/miao-card.mind";
const errs=[];
// NO --use-gl=swiftshader: let Chrome use the real GPU so tfjs picks the WebGL backend.
const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",
  args:["--proxy-server=http://127.0.0.1:10808","--proxy-bypass-list=127.0.0.1,localhost","--ignore-gpu-blocklist","--enable-gpu","--no-sandbox","--disable-dev-shm-usage"]});
const p=await b.newPage();
p.on("pageerror",e=>errs.push("PE:"+e.message));
await p.goto(BASE+"/",{waitUntil:"domcontentloaded",timeout:60000});
const backend = await p.evaluate(async () => {
  const m = await import("/vendor/mindar/mindar-image.prod.js");
  window.__m = { done:false, err:null, data:null, prog:0 };
  (async () => {
    try {
      const img = new Image(); img.src = "/targets/miao-card.png"; await img.decode();
      const compiler = new m.Compiler();
      await compiler.compileImageTargets([img], (pr) => { window.__m.prog = pr; });
      const data = await compiler.exportData();
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      window.__m.data = Array.from(u8); window.__m.done = true;
    } catch (e) { window.__m.err = String(e && e.stack || e); window.__m.done = true; }
  })();
  return "kicked";
});
console.log("compiling on real GPU...");
let lastProg=-1; const t0=Date.now();
while (true) {
  await new Promise(r=>setTimeout(r,2000));
  const st = await p.evaluate(() => ({ done: window.__m.done, prog: Math.round(window.__m.prog||0), err: window.__m.err })).catch(()=>({done:false,prog:lastProg}));
  if (st.prog !== lastProg) { lastProg = st.prog; console.log(`  progress ${st.prog}%  (+${Math.round((Date.now()-t0)/1000)}s)`); }
  if (st.done) { if(st.err){console.log("ERR:",st.err);} break; }
  if (Date.now()-t0 > 150000) { console.log("TIMEOUT 150s"); break; }
}
const res = await p.evaluate(() => ({ err: window.__m.err, data: window.__m.data }));
await b.close();
if (res.err || !res.data){ console.log("COMPILE ERROR:", res.err || "(no data)"); errs.forEach(e=>console.log("  "+e)); process.exit(1); }
writeFileSync(OUT, Buffer.from(res.data));
console.log("\n.mind written:", OUT, "| bytes:", res.data.length);
console.log(res.data.length>1000 && errs.length===0 ? "MIND COMPILE PASS" : "FAIL");
process.exit(res.data.length>1000 && errs.length===0 ? 0 : 1);
