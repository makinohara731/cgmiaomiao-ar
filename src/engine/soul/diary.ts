/**
 * Diary — append-only with text+tag adjacency-dedupe + a 14-entry cap, persisted
 * immediately (ported from main.js writeDiary). renderDiary (日记本 panel) is a
 * Svelte component reading diaryStore. Writes localStorage directly (not via
 * persistence.saveDiary) to avoid an import cycle, with the same isSuppressed guard.
 */
import { diary, notifyDiary } from "../../stores/soul";
import * as saves from "../../story/saves";
import { localYMD } from "../util";

const DIARY_KEY = "miaomiao.diary.v1";
const DIARY_CAP = 14;

export function writeDiary(text: string, tag = "moment"): void {
  if (!text) return;
  text = String(text).slice(0, 80);
  const last = diary.entries[diary.entries.length - 1];
  if (last && last.text === text && last.tag === tag) return; // de-dupe consecutive identical
  diary.entries.push({ ymd: localYMD(), text, tag, ts: Date.now() });
  if (diary.entries.length > DIARY_CAP) diary.entries = diary.entries.slice(-DIARY_CAP);
  notifyDiary();
  if (!saves.isSuppressed()) {
    try { localStorage.setItem(DIARY_KEY, JSON.stringify(diary.entries)); } catch { /* storage full */ }
  }
}
