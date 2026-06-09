/**
 * Long-term memory — tiny fact store the cat learns about its human from chat.
 * Ported from main.js (FACT_PATTERNS / addFact / addTopic / extractFacts /
 * buildMemoryBlock). Kept small so the LLM prompt stays in budget.
 */
import { mem, life } from "../../stores/soul";
import { story } from "../../story/StoryEngine";
import { saveMem, saveLife } from "../persistence";

const MEM_FACT_CAP = 12;
const MEM_VAL_MAX = 24;
const MEM_BLOCK_MAX = 180;
const MEM_TOPIC_CAP = 6;

// Longer prefixes MUST precede shorter ones (regex alternation is leftmost-first):
// "不喜欢" before "不", else "我不喜欢香菜" captures "喜欢香菜".
const FACT_PATTERNS: { k: "likes" | "dislikes" | "self" | "fact"; re: RegExp }[] = [
  { k: "dislikes", re: /我(?:不喜欢|讨厌吃|讨厌|害怕)([^，。！？!?,.\n、~～\s]{1,20})/g },
  { k: "likes", re: /我(?:很|超|特别|真的)?(?:喜欢|爱|想吃|想要)([^，。！？!?,.\n、~～\s]{1,20})/g },
  { k: "self", re: /(?:我叫|我是|你叫我|叫我)([^，。！？!?,.\n、~～\s]{1,12})/g },
  { k: "fact", re: /我(?:今天|昨天|刚刚|刚才)([^，。！？!?,.\n、~～\s]{2,20})/g },
];

export function addFact(k: string, v: string): void {
  if (!v) return;
  v = String(v).trim().slice(0, MEM_VAL_MAX);
  if (!v) return;
  const i = mem.facts.findIndex((f) => f.k === k && f.v === v);
  if (i >= 0) mem.facts[i].ts = Date.now();
  else mem.facts.push({ k: k as any, v, ts: Date.now() });
  if (mem.facts.length > MEM_FACT_CAP) mem.facts = mem.facts.slice(-MEM_FACT_CAP);
  saveMem();
}

export function addTopic(text: string): void {
  if (!text) return;
  const t = String(text).trim().replace(/\s+/g, "").slice(0, 12);
  if (t.length < 4) return;
  if (mem.topics[mem.topics.length - 1] === t) return;
  mem.topics.push(t);
  if (mem.topics.length > MEM_TOPIC_CAP) mem.topics = mem.topics.slice(-MEM_TOPIC_CAP);
  saveMem();
}

export function extractFacts(text: string): void {
  if (!text || typeof text !== "string") return;
  const t = text.slice(0, 200);
  for (const { k, re } of FACT_PATTERNS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      addFact(k, m[1]);
      if (k === "self" && !life.userName) {
        life.userName = String(m[1]).slice(0, MEM_VAL_MAX);
        saveLife();
        story.onNameLearned(life.userName);
      }
    }
  }
}

export function buildMemoryBlock(): string {
  if (!mem.facts.length && !mem.topics.length) return "";
  const by = (k: string) => mem.facts.filter((f) => f.k === k).slice(-4).map((f) => f.v);
  const parts: string[] = [];
  const likes = by("likes"); if (likes.length) parts.push(`ta 喜欢${likes.join("、")}`);
  const dislikes = by("dislikes"); if (dislikes.length) parts.push(`不喜欢${dislikes.join("、")}`);
  const facts = by("fact"); if (facts.length) parts.push(`提过：${facts.join("；")}`);
  if (mem.topics.length) parts.push(`最近聊过${mem.topics.slice(-3).join("、")}`);
  let s = parts.join("；");
  if (s.length > MEM_BLOCK_MAX) s = s.slice(0, MEM_BLOCK_MAX - 1) + "…";
  return s;
}
