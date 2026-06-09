/**
 * Diary — append-only with adjacency-dedupe + a 14-entry cap (ported from
 * main.js writeDiary). renderDiary (the 日记本 panel) is a Svelte component (M3);
 * this is just the writer + state.
 */
import { diary, notifyDiary } from "../../stores/soul";
import { localYMD } from "../util";

const DIARY_CAP = 14;

export function writeDiary(text: string, tag = ""): void {
  if (!text) return;
  text = String(text).slice(0, 80);
  const last = diary.entries[diary.entries.length - 1];
  if (last && last.text === text) return; // adjacency dedupe
  diary.entries.push({ ymd: localYMD(), text, tag, ts: Date.now() });
  if (diary.entries.length > DIARY_CAP) diary.entries = diary.entries.slice(-DIARY_CAP);
  notifyDiary();
}
