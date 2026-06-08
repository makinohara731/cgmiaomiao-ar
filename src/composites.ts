// Procedural "composite actions" — sequences of existing GLB clips +
// emotes + sayLines + audio cues, choreographed in time. They feel like
// new animations without needing the Blender pipeline rerun.
//
// Each composite returns a duration in ms so the caller can claim the
// "composite" state for that long and the autonomous loop doesn't interrupt
// mid-sequence (main.js wires cfg.busyUntil → catState.enter("composite", ms)).
//
// Usage from main.js:
//   import * as composites from "./composites.js";
//   composites.configure({ playAnim, emote, sayLine, audio, ... });
//   composites.play("think");      // returns ms duration

// The host (main.js) injects these via configure(); the no-op defaults keep
// composites callable before wiring. Typed permissively — every callback is a
// thin pass-through to main.js, and `audio` is the whole SFX module by name.
type AnyFn = (...args: any[]) => void;
interface CompositeConfig {
  playAnim: AnyFn;
  emote: AnyFn;
  sayLine: AnyFn;
  audio: Record<string, AnyFn | undefined>;
  faceToward: AnyFn;
  busyUntil: AnyFn;
}

const cfg: CompositeConfig = {
  playAnim: () => {},
  emote: () => {},
  sayLine: () => {},
  audio: {},
  faceToward: () => {},
  busyUntil: () => {},
};

export function configure(opts) {
  Object.assign(cfg, opts);
}

// ---- Scheduler: cancellable timed steps ----
// Each composite schedules its steps via at(); play() cancels the previous
// routine's pending steps and bumps a token so any straggler timer no-ops. This
// is what fixed the "按动作按钮不显示/卡顿" bug: rapid taps used to leave a
// finished composite's orphaned setTimeouts firing playAnim over the new action.
let pendingTimers: ReturnType<typeof setTimeout>[] = [];
let activeToken = 0;

function clearPending() {
  for (const id of pendingTimers) clearTimeout(id);
  pendingTimers.length = 0;
}

/** Schedule one step of the current routine; it no-ops if a newer play()/cancel()
 *  superseded this run (so an interrupted composite goes fully silent). The first
 *  step is scheduled at 0 too, so nothing fires synchronously in play() — letting
 *  play() claim catState BEFORE step 0 runs. */
function at(ms: number, fn: () => void) {
  const my = activeToken;
  pendingTimers.push(setTimeout(() => { if (my === activeToken) fn(); }, ms));
}

// ---- Each composite is a plain function returning total ms. It only SCHEDULES
//      its steps via at(); the steps fire after play() has claimed catState. ----

function think() {
  at(0,    () => { cfg.emote("💭"); cfg.playAnim("stretch"); });
  at(350,  () => cfg.sayLine("唔…让我想想喵"));
  at(1600, () => cfg.emote("❓"));
  at(1800, () => cfg.playAnim("lookaround"));
  return 3400;
}

function peek() {
  at(0,    () => { cfg.emote("❓"); cfg.playAnim("sniff"); cfg.audio.playChirp?.(); });
  at(900,  () => cfg.playAnim("lookaround"));
  at(1100, () => cfg.emote("👀"));
  at(1800, () => cfg.playAnim("sniff"));
  return 3200;
}

function dance() {
  at(0,    () => { cfg.emote("♪"); cfg.playAnim("spin"); cfg.audio.playTrill?.(); });
  at(1100, () => { cfg.emote("🎵"); cfg.playAnim("twirl"); });
  at(2400, () => { cfg.emote("✨"); cfg.playAnim("jump");  });
  at(3300, () => { cfg.emote("♪"); cfg.playAnim("happy");  });
  return 4800;
}

function sneeze() {
  at(0,    () => { cfg.emote("💨"); cfg.playAnim("sniff"); });
  at(700,  () => { cfg.emote("💥"); cfg.playAnim("hurt"); cfg.audio.playHurt?.(); });
  at(950,  () => cfg.sayLine("阿…阿嚏！"));
  at(2100, () => cfg.playAnim("groom"));
  return 3500;
}

function beg() {
  at(0,    () => { cfg.emote("🥺"); cfg.playAnim("wave"); });
  at(600,  () => cfg.sayLine("给我一点点嘛～"));
  at(1800, () => { cfg.emote("❤️"); cfg.playAnim("happy"); cfg.audio.playPurr?.(); });
  return 3400;
}

function stargaze() {
  at(0,    () => { cfg.emote("💫"); cfg.playAnim("lookaround"); });
  at(900,  () => cfg.sayLine("星星…在闪耀呢喵"));
  at(2200, () => { cfg.emote("✨"); cfg.playAnim("stretch"); });
  at(3500, () => cfg.playAnim("lookaround"));
  return 4800;
}

// ---- v4 wave 2: predator + cozy behaviours ----

// stalk — slow sniff stalking → sudden pounce (attack)
function stalk() {
  at(0,    () => { cfg.emote("👀"); cfg.playAnim("sniff"); });
  at(900,  () => { cfg.emote("👁"); cfg.playAnim("walk"); });
  at(2400, () => { cfg.emote("💢"); cfg.playAnim("attack"); cfg.audio.playHit?.(); });
  at(3200, () => { cfg.emote("✨"); cfg.playAnim("happy"); });
  return 4400;
}

// zoomies — sudden burst of run + spin + run (cat 5pm energy)
function zoomies() {
  at(0,    () => { cfg.emote("💨"); cfg.playAnim("run"); });
  at(200,  () => cfg.sayLine("呀呀呀～!"));
  at(1200, () => { cfg.emote("🌀"); cfg.playAnim("spin"); });
  at(2200, () => cfg.playAnim("run"));
  at(3300, () => { cfg.emote("💥"); cfg.playAnim("jump"); cfg.audio.playTrill?.(); });
  return 4400;
}

// knead — soft kneading via repeated groom + content happy
function knead() {
  at(0,    () => { cfg.emote("❤️"); cfg.playAnim("groom"); cfg.audio.playPurr?.(); });
  at(500,  () => cfg.sayLine("呼噜呼噜…"));
  at(1800, () => cfg.playAnim("happy"));
  at(3000, () => cfg.playAnim("groom"));
  return 4500;
}

// headbutt — affectionate bump: walk in, gentle attack ("bonk"), happy
function headbutt() {
  at(0,    () => { cfg.emote("💚"); cfg.playAnim("walk"); });
  at(1100, () => { cfg.emote("💢"); cfg.playAnim("attack"); cfg.audio.playMeow?.(); });
  at(2300, () => { cfg.emote("❤️"); cfg.playAnim("happy"); });
  at(2500, () => cfg.sayLine("撞撞你～"));
  return 3700;
}

// scratch — itchy groom-groom-hurt sequence
function scratch() {
  at(0,    () => { cfg.emote("✋"); cfg.playAnim("groom"); });
  at(800,  () => { cfg.emote("💢"); cfg.playAnim("hurt"); cfg.audio.playHurt?.(); });
  at(1100, () => cfg.sayLine("哎呀，痒痒喵"));
  at(2200, () => { cfg.emote("✨"); cfg.playAnim("groom"); });
  return 3500;
}

// playdead — drama: hurt → sleep → stretch back up
function playdead() {
  at(0,    () => { cfg.emote("💥"); cfg.playAnim("hurt"); cfg.audio.playHurt?.(); });
  at(600,  () => cfg.sayLine("我…倒下啦…"));
  at(1700, () => { cfg.emote("💤"); cfg.playAnim("sleep"); });
  at(3800, () => { cfg.emote("☀️"); cfg.playAnim("stretch"); cfg.audio.playYawn?.(); });
  at(4400, () => cfg.sayLine("骗你的，喵～"));
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
  clearPending();            // cancel the previous routine's pending steps
  activeToken++;             // invalidate any straggler timer that already queued
  const dur = fn() || 2000;  // fn() only SCHEDULES via at(); nothing runs yet
  cfg.busyUntil(dur);        // claim catState BEFORE step 0's timer fires
  return dur;
}

/** Interrupt any running routine — call before a user-driven single clip so its
 *  pending steps can't stamp over the new action. */
export function cancel() {
  clearPending();
  activeToken++;
}
