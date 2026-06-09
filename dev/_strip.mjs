// Full-BODY in-app motion strip per clip: play each clip in the live three.js
// renderer, capture 6 frames across playback, crop to the WHOLE cat (incl. room
// above for jumps), montage into one strip → dev/_strip/<clip>.png.
import { createRequire } from "module";
const require = createRequire("C:/Users/Lenovo/AppData/Roaming/npm/node_modules/");
const puppeteer = require("puppeteer");
import { decodePNG } from "./png-min.mjs";
import { writeFileSync, mkdirSync } from "fs";
import zlib from "zlib";
mkdirSync("dev/_strip", { recursive: true });
const URL = process.env.MIAO_URL || "http://127.0.0.1:8765/";
const CLIPS = process.argv.slice(2).length ? process.argv.slice(2)
  : ["idle","walk","run","wave","happy","jump","spin","backflip","twirl","stretch","groom","sit","headtilt","lickpaw","pounce","playbow","nod","shy","ponder","adore","headpat","attack","hurt","lookaround"];
const X0=400, Y0=40, CW=480, CHH=700, SCALE=3.0;   // full body + headroom for jumps
const TIMES=[80,320,560,800,1040,1280];
const CRC=(()=>{const t=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=(b)=>{let c=0xFFFFFFFF;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
function chunk(type,data){const c=Buffer.alloc(8+data.length+4);c.writeUInt32BE(data.length,0);c.write(type,4);data.copy(c,8);c.writeUInt32BE(crc32(c.subarray(4,8+data.length)),8+data.length);return c;}
function encodePNG(w,h,rgb){const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;const raw=Buffer.alloc(h*(w*3+1));for(let y=0;y<h;y++){raw[y*(w*3+1)]=0;rgb.copy(raw,y*(w*3+1)+1,y*w*3,(y+1)*w*3);}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ihdr),chunk("IDAT",zlib.deflateSync(raw)),chunk("IEND",Buffer.alloc(0))]);}
function cropScale(png){const ow=Math.floor(CW/SCALE),oh=Math.floor(CHH/SCALE),ch=png.channels,W=png.width;const out=Buffer.alloc(ow*oh*3);for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const sx=X0+Math.floor(x*SCALE),sy=Y0+Math.floor(y*SCALE),si=(sy*W+sx)*ch,di=(y*ow+x)*3;out[di]=png.data[si];out[di+1]=png.data[si+1];out[di+2]=png.data[si+2];}return {w:ow,h:oh,rgb:out};}
function montage(fr){const h=fr[0].h,sep=2,w=fr.reduce((s,f)=>s+f.w,0)+sep*(fr.length-1);const out=Buffer.alloc(w*h*3,40);let xo=0;for(const f of fr){for(let y=0;y<h;y++)for(let x=0;x<f.w;x++){const di=(y*w+xo+x)*3,si=(y*f.w+x)*3;out[di]=f.rgb[si];out[di+1]=f.rgb[si+1];out[di+2]=f.rgb[si+2];}xo+=f.w+sep;}return {w,h,rgb:out};}
const b=await puppeteer.launch({executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe",headless:"new",args:["--proxy-server=http://127.0.0.1:10808","--proxy-bypass-list=127.0.0.1,localhost","--use-gl=swiftshader","--no-sandbox","--window-size=1280,800"]});
const p=await b.newPage();await p.setViewport({width:1280,height:800});
await p.evaluateOnNewDocument(()=>localStorage.setItem("miaomiao.onboarded.v1","1"));
for(let i=0;i<3;i++){try{await p.goto(URL,{waitUntil:"load",timeout:30000});break;}catch(e){await new Promise(r=>setTimeout(r,1500));}}
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>document.body.classList.add("anim-open"));
const miss=[];
for(const clip of CLIPS){
  await new Promise(r=>setTimeout(r,1300));
  const ok=await p.evaluate(c=>{const e=document.querySelector(`[data-anim="${c}"]`);if(e){e.click();return true;}return false;},clip);
  if(!ok){console.log(clip,"NO BTN");miss.push(clip);continue;}
  const t0=Date.now();const frames=[];
  for(const t of TIMES){const wait=t-(Date.now()-t0);if(wait>0)await new Promise(r=>setTimeout(r,wait));frames.push(cropScale(decodePNG(await p.screenshot())));}
  const m=montage(frames);writeFileSync(`dev/_strip/${clip}.png`,encodePNG(m.w,m.h,m.rgb));
  console.log(clip,"ok");
}
console.log("MISSING(no btn):",miss.join(",")||"none");
await b.close();
