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

export const BEATS: Beat[] = [];

export const ENDINGS: Ending[] = [];
