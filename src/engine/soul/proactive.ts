/**
 * Proactive speech + need-seeking — the soul layer talks on its own, throttled.
 * Ported from main.js (THOUGHTS / PROACTIVE_* / canProactive / recallFromMemory /
 * proactiveSpeak / seekCare).
 */
import { life, mem, stageOf, notifyLife } from "../../stores/soul";
import { story } from "../../story/StoryEngine";
import { timeBucket } from "../time-of-day";
import { emote, sayLine } from "../feedback";
import { flashExpression } from "../expression";
import { play } from "../runtime";
import { pickFrom, clamp01 } from "../util";
import { maybeWriteDream } from "./bond";

const THOUGHTS: Record<string, string[]> = {
  初遇: ["喵？你是谁呀…", "这里是哪里呢～", "嗯…要不要相信你呢", "（小心地打量着你）"],
  熟悉: ["今天也见到你了，喵～", "你身上的味道我记住啦", "陪着你感觉还不错", "在想等会儿玩什么呢"],
  亲近: ["和你在一起好安心呀", "诶嘿，又是你～", "我有点点想你了…", "今天也要一起玩哦"],
  黏人: ["最喜欢你待在我身边了", "你不许走开太久哦！", "想一直一直黏着你～", "呼噜呼噜…好幸福"],
  形影不离: ["你就是我最重要的人啦", "我们会一直在一起对吧？", "有你在，哪里都是家", "（满足地蹭了蹭你）"],
};
const PROACTIVE_TIME: Record<string, string[]> = {
  morning: ["太阳出来啦，喵～该起床咯", "早上的空气真清新呢", "唔…伸个懒腰，舒服"],
  afternoon: ["午后的光好暖呀", "想找个地方蹭一蹭…", "今天的时间过得好慢喵"],
  evening: ["天要黑了呢…你在干嘛呀？", "晚饭吃了吗喵？", "夕阳真好看，像橘子味的"],
  night: ["你也还没睡呀…", "夜里好安静，喵～", "嘘…星星出来啦"],
};
const PROACTIVE_RANDOM = [
  "刚才我好像梦到鱼啦…", "诶？刚才那是什么声音？", "你在做什么呢？让我看看～",
  "尾巴痒痒的喵…", "今天的我也很可爱吧？", "唔…突然有点想撒娇了",
  "外面的世界…我也想看看", "（看着你的方向，眼睛眨了眨）",
];

const PROACTIVE_MIN_GAP = 90 * 1000;
const PROACTIVE_HOUR_CAP = 4;
const proactiveStats = { lastAt: 0, ring: [] as number[] };

function canProactive(): boolean {
  const now = Date.now();
  if (now - proactiveStats.lastAt < PROACTIVE_MIN_GAP) return false;
  proactiveStats.ring = proactiveStats.ring.filter((t) => now - t < 3600 * 1000);
  return proactiveStats.ring.length < PROACTIVE_HOUR_CAP;
}
function markProactive(): void { const now = Date.now(); proactiveStats.lastAt = now; proactiveStats.ring.push(now); }

function recallFromMemory(): string | null {
  if (life.affection < 15 || !mem.facts.length) return null;
  const f = pickFrom(mem.facts.slice(-6));
  if (!f) return null;
  if (f.k === "likes") return `还记得你喜欢${f.v}吗，我也想试一试喵`;
  if (f.k === "dislikes") return `${f.v}你不喜欢对吧？我也不要～`;
  if (f.k === "self" && life.userName) return `${life.userName}…你今天好不好呀？`;
  if (f.k === "fact") return `你上次说${f.v}…后来呢？`;
  return null;
}

export function proactiveSpeak(): void {
  if (!canProactive()) {
    if (Math.random() < 0.6) { emote(pickFrom(["♪", "～", "·ω·"])); play(pickFrom(["lookaround", "groom"])); }
    return;
  }
  if (story.maybeBeat("proactive")) { markProactive(); return; }

  let line: string | null = null;
  const stage = stageOf(life.affection).name;
  if (Math.random() < 0.35) line = recallFromMemory();
  if (!line && Math.random() < 0.45) { const pool = PROACTIVE_TIME[timeBucket()]; if (pool) line = pickFrom(pool); }
  if (!line && Math.random() < 0.5) line = pickFrom(THOUGHTS[stage] || THOUGHTS["初遇"]);
  if (!line) line = pickFrom(PROACTIVE_RANDOM);
  if (life.userName && Math.random() < 0.3 && !line.startsWith(life.userName)) line = `${life.userName}…${line}`;

  emote(pickFrom(["💭", "～", "·ω·", "🌸", "♪"]));
  sayLine(line);
  if (Math.random() < 0.5) play(pickFrom(["lookaround", "groom", "sniff"]));
  markProactive();
  maybeWriteDream();
}

/** The cat actively seeks care for a low need (nags each cycle until met). */
export function seekCare(need: "hunger" | "mood" | "energy"): void {
  if (need === "hunger") {
    emote(pickFrom(["🍖", "😿", "🍽️"]));
    sayLine(pickFrom(["肚子饿扁了喵…喂我点东西好不好", "喵呜～我好想吃东西…", "你看我可怜兮兮的，是不是该喂我啦？"]));
    play(pickFrom(["sniff", "lookaround", "walk"]));
    life.mood = clamp01(life.mood - 0.02);
  } else if (need === "mood") {
    emote(pickFrom(["🎈", "🥺", "✨"]));
    sayLine(pickFrom(["好无聊呀…陪我玩一会儿嘛", "喵～你都不理我，哼！", "我们来玩点什么好不好？"]));
    flashExpression("cry", 1900);
    play(pickFrom(["happy", "jump", "spin"]));
  } else {
    emote("🥱");
    sayLine(pickFrom(["唔…有点困了喵", "好想眯一小会儿…"]));
    play("stretch");
  }
  notifyLife();
}
