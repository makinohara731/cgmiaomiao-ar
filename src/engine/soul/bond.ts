/**
 * Bond layer — the scripted moment + tangible unlock at each new affection stage,
 * dreams, and the soul-notice surface. Ported from main.js (BOND_EVENTS /
 * STAGE_UNLOCK / triggerBondEvent / grantUnlock / applyUnlocksOnLoad / dreams).
 * grantUnlock's DOM side-effects (badge / bgm row / chip shimmer) are reactive in
 * Svelte now — components read hasUnlock + listen for EVT.BondUnlock.
 */
import { get } from "svelte/store";
import { life, type Stage, notifyLife } from "../../stores/soul";
import { arMode } from "../../stores/session";
import { story } from "../../story/StoryEngine";
import { bus, EVT } from "../../bus";
import { showArCaption } from "../ar-overlay";
import * as audio from "../../audio";
import { saveLife } from "../persistence";
import { writeDiary } from "./diary";
import { emote, sayLine, showStatus } from "../feedback";
import { flashExpression } from "../expression";
import { hasUnlock, setBondEventHandler } from "./life";
import { play, hasClip, enterState } from "../runtime";
import { pickFrom } from "../util";

const BOND_EVENTS: Record<string, { anim: string; lines: string[] }> = {
  熟悉: { anim: "wave", lines: ["唔…我好像，开始习惯有你了。", "以后…要常来看我哦，喵～"] },
  亲近: { anim: "happy", lines: ["和你在一起的时候，我最安心了。", "我决定啦——要一直黏着你！", "（轻轻蹭了蹭你的手）"] },
  黏人: { anim: "spin", lines: ["你不在的时候…我会偷偷想你的。", "好想把全世界最好的都给你呀～", "答应我，不要丢下我哦。"] },
  形影不离: { anim: "twirl", lines: ["从今天起，我和你就是一家人了。", "无论你去哪里，我的心都跟着你。", "谢谢你…一直一直陪着我。喵～"] },
};

export const STAGE_UNLOCK: Record<string, { key: string; label: string; gift: string }> = {
  熟悉: { key: "bgm", label: "BGM 开关", gift: "我学会哼歌啦，去设置里就能听到喵～" },
  亲近: { key: "dream", label: "梦境日记", gift: "我开始记得自己做的梦了，去日记里看看吧" },
  黏人: { key: "nickname", label: "用户昵称", gift: "我想要一个专属的称呼你的方式～" },
  形影不离: { key: "photo", label: "永远的朋友徽章", gift: "我们的故事，已经满满一本啦" },
};

const DREAMS = [
  "梦里我变成了一片云，飘呀飘…", "梦到一片海，海里全是鱼松软软～",
  "梦里你也在，我们一起吃了好多草莓", "我梦见自己长出了翅膀，喵～",
  "梦到月亮变成了一颗大鱼丸", "做了个奇怪的梦…里面的我是只大老虎",
];

export function grantUnlock(key: string): void {
  if (hasUnlock(key)) return;
  life.unlocks.push(key);
  saveLife();
  notifyLife();
  bus.emit(EVT.BondUnlock, { key }); // Svelte: chip shimmer + badge/bgm-row reveal + sparkle
  try { audio.playSparkle(); } catch { /* audio not ready */ }
}

export function applyUnlocksOnLoad(): void {
  // Visible side-effects (badge, bgm row) are reactive on hasUnlock in Svelte;
  // BGM stays opt-in across reloads (started on first gesture only if cfg.bgm).
}

function unlockDreamDiary(): void { writeDiary(`🌙 ${pickFrom(DREAMS)}`, "dream"); }
export function maybeWriteDream(): void {
  if (!hasUnlock("dream")) return;
  if (Math.random() < 0.25) writeDiary(`🌙 ${pickFrom(DREAMS)}`, "dream");
}

/** Soul-layer notice — a floating caption beside the cat in AR, else the toast. */
export function soulNotice(text: string, ms = 4200): void {
  if (get(arMode)) showArCaption(text, ms);
  else showStatus(text, ms);
}

// In-flight bond-event dialogue chain timers (cleared so a double-band cross
// can't interleave two events' dialogue/gift).
let bondChainTimers: number[] = [];
function clearBondChain(): void { bondChainTimers.forEach(clearTimeout); bondChainTimers = []; }

// nickname gift opens the rename dialog — wired lazily to avoid a cycle
// (naming imports vn which imports nothing heavy, but bond↔naming would cycle).
let openNicknameDialog: () => void = () => {};
export function setNicknameDialog(fn: () => void): void { openNicknameDialog = fn; }

export function triggerBondEvent(stage: Stage): void {
  const ev = BOND_EVENTS[stage.name];
  if (!ev || life.seenEvents.includes(stage.name)) return;
  clearBondChain();
  life.seenEvents.push(stage.name);
  saveLife();
  writeDiary(`今天我们的关系变成「${stage.name}」啦！`, "bond");
  const u = STAGE_UNLOCK[stage.name];
  if (u) { grantUnlock(u.key); soulNotice(`解锁 · ${u.label}`, 4500); }
  story.onBondStage(stage.name);
  enterState("dialogue", ev.lines.length * 3400 + 2000);
  soulNotice(`羁绊加深 · ${stage.name}`, 4200);
  flashExpression("love", 2600);
  if (ev.anim && hasClip(ev.anim)) play(ev.anim);
  let i = 0;
  const next = (): void => {
    if (i >= ev.lines.length) {
      if (u) {
        bondChainTimers.push(window.setTimeout(() => sayLine(u.gift), 600));
        bondChainTimers.push(window.setTimeout(() => {
          if (u.key === "dream") unlockDreamDiary();
          if (u.key === "nickname") openNicknameDialog();
        }, 2400));
      }
      return;
    }
    sayLine(ev.lines[i]);
    emote(i === ev.lines.length - 1 ? "❤️" : "✨");
    i++;
    bondChainTimers.push(window.setTimeout(next, 3400));
  };
  next();
}

/** Register triggerBondEvent as the handler addAffection calls on a stage cross. */
export function installBond(): void { setBondEventHandler(triggerBondEvent); }
