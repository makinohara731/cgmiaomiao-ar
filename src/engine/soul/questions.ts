/**
 * Dialogue choices — the cat asks, you pick, the bond shifts. Ported from main.js
 * (QUESTIONS / askQuestion / answerQuestion). Uses the real Choices instance (VN).
 */
import { life, notifyLife } from "../../stores/soul";
import { emote, sayLine } from "../feedback";
import { flashExpression } from "../expression";
import { addAffection } from "./life";
import { play, hasClip, enterState, holdState } from "../runtime";
import { getChoices } from "../vn";
import { pickFrom, clamp01 } from "../util";

interface Opt { t: string; aff: number; anim: string; reply: string; }
const QUESTIONS: { q: string; opts: Opt[] }[] = [
  { q: "今天…你是特意来看我的吗？", opts: [
    { t: "当然啦", aff: 4, anim: "happy", reply: "嘿嘿…我就知道！最喜欢你了喵～" },
    { t: "顺便而已", aff: -1, anim: "hurt", reply: "唔…顺便也好啦…（小声）" }] },
  { q: "喵～你喜欢现在的我吗？", opts: [
    { t: "超级喜欢", aff: 4, anim: "spin", reply: "呀！我也是我也是！转个圈给你看～" },
    { t: "还行吧", aff: 0, anim: "lookaround", reply: "还行…那我要更努力让你喜欢我！" }] },
  { q: "如果我饿了，你会第一时间喂我吗？", opts: [
    { t: "马上喂你", aff: 3, anim: "happy", reply: "呼噜～有你这句话我就放心啦" },
    { t: "看心情", aff: -1, anim: "sniff", reply: "喵…那我得多撒娇才行了" }] },
  { q: "你今天过得开心吗？说给我听听～", opts: [
    { t: "和你说说", aff: 3, anim: "lookaround", reply: "嗯嗯，我都听着呢，喵～" },
    { t: "保密", aff: 1, anim: "groom", reply: "哼，小气！那我自己玩啦" }] },
  { q: "我们…会一直在一起对不对？", opts: [
    { t: "会一直在", aff: 5, anim: "happy", reply: "太好啦！那我要赖着你一辈子喵～" },
    { t: "谁知道呢", aff: -2, anim: "hurt", reply: "…别这样说嘛，我会难过的" }] },
  { q: "想不想看我表演个绝技？", opts: [
    { t: "快表演！", aff: 3, anim: "backflip", reply: "看好咯——喵嗷！" },
    { t: "下次吧", aff: 0, anim: "idle", reply: "好吧…那你可要记得哦" }] },
];

export let lastQuestionAt = 0;

export function askQuestion(): void {
  const choices = getChoices();
  if (!choices) return;
  lastQuestionAt = Date.now();
  const q = pickFrom(QUESTIONS);
  emote("❓");
  sayLine(q.q);
  enterState("dialogue", 60000);
  choices.show(
    q.opts.map((o) => Object.assign({ label: o.t }, o)),
    (opt: any) => answerQuestion(opt),
    {
      timeoutMs: 22000,
      onTimeout: () => { holdState(500); emote("…"); sayLine("…你不理我，哼。"); flashExpression("cry", 2000); addAffection(-1); },
    }
  );
}

function answerQuestion(opt: Opt): void {
  enterState("oneshot", 2000);
  life.lastInteract = Date.now();
  addAffection(opt.aff);
  if (opt.aff > 0) { life.mood = clamp01(life.mood + 0.1); notifyLife(); }
  emote(opt.aff > 0 ? "❤️" : opt.aff < 0 ? "💧" : "·ω·");
  if (opt.anim && hasClip(opt.anim)) play(opt.anim);
  sayLine(opt.reply);
}
