// Procedural "composite actions" — sequences of existing GLB clips +
// emotes + sayLines + audio cues, choreographed in time. They feel like
// new animations without needing the Blender pipeline rerun.
//
// Each composite returns a duration in ms so the caller can mark
// busyUntil and the autonomous loop doesn't interrupt mid-sequence.
//
// Usage from main.js:
//   import * as composites from "./composites.js";
//   composites.configure({ playAnim, emote, sayLine, audio, ... });
//   composites.play("think");      // returns ms duration

const cfg = {
  playAnim: () => {},
  emote: () => {},
  sayLine: () => {},
  audio: {},
  faceToward: () => {},
  busyUntil: (ms) => {},
};

export function configure(opts) {
  Object.assign(cfg, opts);
}

// ---- Each composite is a plain function returning total ms. ----

function think() {
  cfg.emote("💭");
  cfg.playAnim("stretch");
  setTimeout(() => cfg.sayLine("唔…让我想想喵"), 350);
  setTimeout(() => cfg.emote("❓"), 1600);
  setTimeout(() => cfg.playAnim("lookaround"), 1800);
  return 3400;
}

function peek() {
  cfg.emote("❓");
  cfg.playAnim("sniff");
  cfg.audio.playChirp?.();
  setTimeout(() => cfg.playAnim("lookaround"), 900);
  setTimeout(() => cfg.emote("👀"), 1100);
  setTimeout(() => cfg.playAnim("sniff"), 1800);
  return 3200;
}

function dance() {
  cfg.emote("♪");
  cfg.playAnim("spin");
  cfg.audio.playTrill?.();
  setTimeout(() => { cfg.emote("🎵"); cfg.playAnim("twirl"); }, 1100);
  setTimeout(() => { cfg.emote("✨"); cfg.playAnim("jump");  }, 2400);
  setTimeout(() => { cfg.emote("♪"); cfg.playAnim("happy");  }, 3300);
  return 4800;
}

function sneeze() {
  cfg.emote("💨");
  cfg.playAnim("sniff");
  setTimeout(() => { cfg.emote("💥"); cfg.playAnim("hurt"); cfg.audio.playHurt?.(); }, 700);
  setTimeout(() => cfg.sayLine("阿…阿嚏！"), 950);
  setTimeout(() => cfg.playAnim("groom"), 2100);
  return 3500;
}

function beg() {
  cfg.emote("🥺");
  cfg.playAnim("wave");
  setTimeout(() => cfg.sayLine("给我一点点嘛～"), 600);
  setTimeout(() => { cfg.emote("❤️"); cfg.playAnim("happy"); cfg.audio.playPurr?.(); }, 1800);
  return 3400;
}

function stargaze() {
  cfg.emote("💫");
  cfg.playAnim("lookaround");
  setTimeout(() => cfg.sayLine("星星…在闪耀呢喵"), 900);
  setTimeout(() => { cfg.emote("✨"); cfg.playAnim("stretch"); }, 2200);
  setTimeout(() => cfg.playAnim("lookaround"), 3500);
  return 4800;
}

// ---- v4 wave 2: predator + cozy behaviours ----

// stalk — slow sniff stalking → sudden pounce (attack)
function stalk() {
  cfg.emote("👀");
  cfg.playAnim("sniff");
  setTimeout(() => { cfg.emote("👁"); cfg.playAnim("walk"); }, 900);
  setTimeout(() => { cfg.emote("💢"); cfg.playAnim("attack"); cfg.audio.playHit?.(); }, 2400);
  setTimeout(() => { cfg.emote("✨"); cfg.playAnim("happy"); }, 3200);
  return 4400;
}

// zoomies — sudden burst of run + spin + run (cat 5pm energy)
function zoomies() {
  cfg.emote("💨");
  cfg.playAnim("run");
  setTimeout(() => cfg.sayLine("呀呀呀～!"), 200);
  setTimeout(() => { cfg.emote("🌀"); cfg.playAnim("spin"); }, 1200);
  setTimeout(() => cfg.playAnim("run"), 2200);
  setTimeout(() => { cfg.emote("💥"); cfg.playAnim("jump"); cfg.audio.playTrill?.(); }, 3300);
  return 4400;
}

// knead — soft kneading via repeated groom + content happy
function knead() {
  cfg.emote("❤️");
  cfg.playAnim("groom");
  cfg.audio.playPurr?.();
  setTimeout(() => cfg.sayLine("呼噜呼噜…"), 500);
  setTimeout(() => cfg.playAnim("happy"), 1800);
  setTimeout(() => cfg.playAnim("groom"), 3000);
  return 4500;
}

// headbutt — affectionate bump: walk in, gentle attack ("bonk"), happy
function headbutt() {
  cfg.emote("💚");
  cfg.playAnim("walk");
  setTimeout(() => { cfg.emote("💢"); cfg.playAnim("attack"); cfg.audio.playMeow?.(); }, 1100);
  setTimeout(() => { cfg.emote("❤️"); cfg.playAnim("happy"); }, 2300);
  setTimeout(() => cfg.sayLine("撞撞你～"), 2500);
  return 3700;
}

// scratch — itchy groom-groom-hurt sequence
function scratch() {
  cfg.emote("✋");
  cfg.playAnim("groom");
  setTimeout(() => { cfg.emote("💢"); cfg.playAnim("hurt"); cfg.audio.playHurt?.(); }, 800);
  setTimeout(() => cfg.sayLine("哎呀，痒痒喵"), 1100);
  setTimeout(() => { cfg.emote("✨"); cfg.playAnim("groom"); }, 2200);
  return 3500;
}

// playdead — drama: hurt → sleep → stretch back up
function playdead() {
  cfg.emote("💥");
  cfg.playAnim("hurt");
  cfg.audio.playHurt?.();
  setTimeout(() => cfg.sayLine("我…倒下啦…"), 600);
  setTimeout(() => { cfg.emote("💤"); cfg.playAnim("sleep"); }, 1700);
  setTimeout(() => { cfg.emote("☀️"); cfg.playAnim("stretch"); cfg.audio.playYawn?.(); }, 3800);
  setTimeout(() => cfg.sayLine("骗你的，喵～"), 4400);
  return 5600;
}

export const REGISTRY = {
  think, peek, dance, sneeze, beg, stargaze,
  stalk, zoomies, knead, headbutt, scratch, playdead,
};

// Display metadata for the animation bar buttons + status toasts.
export const META = {
  think:    { icon: "💭", label: "发呆" },
  peek:     { icon: "👀", label: "偷瞄" },
  dance:    { icon: "💃", label: "跳舞" },
  sneeze:   { icon: "💨", label: "打喷嚏" },
  beg:      { icon: "🥺", label: "讨抱" },
  stargaze: { icon: "💫", label: "看星星" },
  stalk:    { icon: "👁", label: "潜伏" },
  zoomies:  { icon: "🌀", label: "暴冲" },
  knead:    { icon: "🐾", label: "揉揉" },
  headbutt: { icon: "💚", label: "撞撞" },
  scratch:  { icon: "✋", label: "挠挠" },
  playdead: { icon: "💀", label: "装死" },
};

export function play(name) {
  const fn = REGISTRY[name];
  if (!fn) return 0;
  const dur = fn() || 2000;
  cfg.busyUntil(dur);
  return dur;
}

export function names() { return Object.keys(REGISTRY); }
