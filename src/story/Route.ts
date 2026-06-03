/**
 * Story content (P4) — the LOCAL scripted routes, beats, and endings. Pure data +
 * small gate predicates: no DOM, no network, imports types only. This is the file
 * P6 polish / new beats touch. Beats reuse existing GLB clips (wave/happy/spin/
 * twirl) + faces (love/blush via flashExpression) and DELIBERATELY do not
 * re-implement the 形影不离 climax — the 永远朋友 ending just gates on hasUnlock("photo").
 *
 * Gating uses the REAL thresholds in main.js (STAGES: 熟悉=15, 黏人=60, 形影不离=85).
 *
 * P4.1: ROUTES + pickRoute + moodHintFor are live (route tracking works); BEATS /
 * ENDINGS are filled in P4.3 (日常+羁绊) and P4.4 (浪漫).
 */
import type { RouteId, StoryState, LifeView, Beat, Ending } from "./types";

export const ROUTES: Record<RouteId, { id: RouteId; gate(s: StoryState, l: LifeView): boolean; moodHint: string }> = {
  日常: { id: "日常", gate: () => true, moodHint: "日常陪伴，轻松温馨" },
  羁绊: { id: "羁绊", gate: (_s, l) => l.affection >= 15, moodHint: "关系渐深，越来越依赖你" },
  浪漫: {
    id: "浪漫",
    gate: (s, l) => l.affection >= 60 && !!l.userName && s.acceptedRomance,
    moodHint: "浪漫线，甜蜜又有点害羞",
  },
};

// Highest-unlocked wins: 浪漫 > 羁绊 > 日常.
const ROUTE_ORDER: RouteId[] = ["浪漫", "羁绊", "日常"];

export function pickRoute(s: StoryState, l: LifeView): RouteId {
  for (const id of ROUTE_ORDER) if (ROUTES[id].gate(s, l)) return id;
  return "日常";
}

/** The ≤120-char 【剧情】 mood hint sent to the worker (mood label only, never the
 *  scripted lines). */
export function moodHintFor(s: StoryState, l: LifeView): string {
  return ROUTES[pickRoute(s, l)].moodHint;
}

// Beats fire one-per-safe-turn (idle proactive), in array order: the first
// unseen beat whose gate passes runs. Order = priority. Reuses existing clips +
// faces (love/blush via flashExpression); no new GLB/anim needed.
export const BEATS: Beat[] = [
  // ---------- 日常线 ----------
  {
    id: "daily.intro",
    route: "日常",
    gate: (s) => !s.flags.first_day,
    run: ({ hooks, setFlag }) => {
      hooks.emote("✨");
      hooks.sayLine("嘿嘿…你真的留下来陪我了，好开心喵～");
      setFlag("first_day", true);
    },
  },
  {
    id: "daily.curious",
    route: "日常",
    gate: (_s, l) => l.affection >= 8,
    run: ({ hooks }) => {
      hooks.emote("❓");
      hooks.sayLine("对了…你平时都喜欢做些什么呀？我想多了解你一点喵。");
    },
  },
  // ---------- 羁绊线 ----------
  {
    id: "bond.open",
    route: "羁绊",
    gate: (_s, l) => l.affection >= 15,
    run: ({ hooks, setFlag }) => {
      hooks.flashExpression("love", 2200);
      hooks.emote("❤️");
      hooks.sayLine("唔…不知不觉，我好像已经习惯有你在身边了。");
      setFlag("bonded", true);
    },
  },
  {
    id: "bond.memory",
    route: "羁绊",
    gate: (_s, l) => l.affection >= 35,
    run: ({ hooks }) => {
      hooks.emote("💭");
      hooks.sayLine("我偷偷把和你的小事都记在心里啦，要一直一直在一起哦～");
    },
  },
  {
    id: "bond.promise",
    route: "羁绊",
    gate: (_s, l) => l.affection >= 60,
    run: ({ hooks, setFlag }) => {
      hooks.busy(30000); // hold for the choice window
      hooks.emote("🥺");
      hooks.sayLine("我们…会一直在一起，对不对？");
      hooks.choices.show(
        [{ label: "会一直在" }, { label: "谁知道呢" }],
        (item) => {
          hooks.busy(2600);
          if (item.label === "会一直在") {
            hooks.flashExpression("love", 2400);
            hooks.emote("❤️");
            hooks.sayLine("太好啦！那我要赖着你一辈子喵～");
            hooks.addAffection(2);
            setFlag("promised", true);
          } else {
            hooks.emote("💧");
            hooks.sayLine("…别这样说嘛，我会难过的。");
            hooks.addAffection(-1);
          }
        },
        { timeoutMs: 25000, onTimeout: () => hooks.busy(500) }
      );
    },
  },
];

export const ENDINGS: Ending[] = [
  {
    // Reuses the EXISTING 形影不离 climax — gates on the 'photo' unlock that
    // triggerBondEvent('形影不离') grants (which reveals the 永远朋友 badge).
    id: "forever",
    label: "永远的朋友",
    route: "羁绊",
    icon: "🏅",
    blurb: "你们一起走过了好多日子，喵喵把你认定成了最重要的人——永远的朋友。",
    gate: (_s, l) => l.hasUnlock("photo"),
  },
];
