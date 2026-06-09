/**
 * Daily roll — one mood/theme per local day, persisted so "today's vibe" stays
 * consistent across reloads within a day. Ported from main.js dailyRoll.
 * loadDaily (persistence) has already populated `daily` from storage before this.
 */
import { daily, life, notifyLife } from "../../stores/soul";
import { story } from "../../story/StoryEngine";
import { saveDaily } from "../persistence";
import { localYMD, pickFrom, clamp01 } from "../util";

const DAILY_THEMES = [
  { theme: "想吃鱼", moodBias: 0.05 }, { theme: "想撒娇", moodBias: 0.10 },
  { theme: "想念你", moodBias: 0.03 }, { theme: "好奇宝宝", moodBias: 0.06 },
  { theme: "懒洋洋", moodBias: -0.02 }, { theme: "想念星星", moodBias: 0.00 },
  { theme: "尾巴痒", moodBias: 0.04 }, { theme: "做白日梦", moodBias: 0.02 },
];

export function dailyRoll(): void {
  const today = localYMD();
  if (!(daily.ymd === today && daily.theme)) {
    const pick = pickFrom(DAILY_THEMES);
    daily.ymd = today; daily.theme = pick.theme; daily.moodBias = pick.moodBias; daily.diarized = false;
    saveDaily();
    // Apply mood bias once per day (after loadLife's time-away decay).
    life.mood = clamp01(life.mood + pick.moodBias);
    notifyLife();
  }
  story.onDailyRoll(daily.theme); // let the story layer read today's theme
}
