/**
 * Saves bridge (M4) — doSaveSlot/doLoadSlot over the kept src/story/saves.ts,
 * ported from main.js. The restore runs SYNCHRONOUSLY inside withSuppressed so
 * the periodic saveLife / visibilitychange persist can't clobber the restored
 * keys mid-rehydrate (every save* no-ops while isSuppressed()).
 *
 * Two deliberate deviations from main.js (documented in docs/进度.md):
 * - doSaveSlot flushes the in-memory state to localStorage BEFORE snapshotting:
 *   saves.saveSlot copies the RAW key strings, and life only hits disk every
 *   15 s — the old code could snapshot up-to-15s-stale state under fresh meta.
 * - doLoadSlot refuses while a story/question choice is open: restoring resets
 *   story state under an open onPick callback (markSeen/addAffection would fire
 *   against the restored state).
 */
import { writable } from "svelte/store";
import * as saves from "../story/saves";
import type { SlotMeta } from "../story/saves";
import { story } from "../story/StoryEngine";
import { life, cfg, catNameDisplay, stageOf } from "../stores/soul";
import {
  loadLife, loadMem, loadDiary, loadDaily, loadCfg,
  persistAll, saveDiary, saveDaily, saveCfg,
} from "./persistence";
import { dailyRoll } from "./soul/daily";
import { applyUnlocksOnLoad } from "./soul/bond";
import { hasUnlock } from "./soul/life";
import { setEyes } from "./expression";
import { timeBucket } from "./time-of-day";
import { emote, showStatus } from "./feedback";
import { getChoices } from "./vn";
import * as audio from "../audio";

/** Slot metadata for the 回廊 panel; refreshed on open + after save/load. */
export const slotsStore = writable<SlotMeta[]>(saves.listSlots());
export function refreshSlots(): void { slotsStore.set(saves.listSlots()); }

export function doSaveSlot(n: number): void {
  // Flush first — the snapshot reads the on-disk JSON strings, not memory.
  persistAll(); saveDaily(); saveCfg();
  saves.saveSlot(n, {
    affection: life.affection,
    stage: stageOf(life.affection).name,
    catName: catNameDisplay(),
    route: story.route(),
  });
  refreshSlots();
  emote("✨");
  showStatus(`已保存到存档 ${n + 1}`, 2000);
}

export function doLoadSlot(n: number): void {
  if (getChoices()?.isOpen()) { showStatus("现在不方便读档哦", 2000); return; }
  let ok = false;
  saves.withSuppressed(() => {
    ok = saves.restoreSlot(n);
    if (!ok) return;
    // Rehydrate from the restored keys. loadDaily() is new vs main.js: the old
    // dailyRoll re-read localStorage itself, the rebuilt one reads the in-memory
    // `daily` object. story.load() MUST run BEFORE dailyRoll(): the cross-day
    // branch calls story.onDailyRoll→save(), which would persist STALE in-memory
    // story state over the just-restored blob.
    loadLife(); loadMem(); loadDiary(); loadDaily(); loadCfg();
    story.load();
    dailyRoll();
    applyUnlocksOnLoad();
    setEyes(life.asleep); // sync eyes to the restored sleep state (review fix)
  });
  if (ok) {
    // story.load→syncEndings may have written a 解锁结局 diary line while
    // suppressed (memory only) — flush it now so disk matches memory.
    saveDiary();
    // Align the actual BGM playback with the restored cfg.bgm (the checkbox
    // follows the store, but nothing else starts/stops the audio).
    try {
      if (cfg.bgm && hasUnlock("bgm") && !audio.bgmRunning()) audio.startBGM(timeBucket() === "night" ? "night" : "day");
      else if (!cfg.bgm && audio.bgmRunning()) audio.stopBGM();
    } catch { /* audio not ready */ }
  }
  refreshSlots();
  showStatus(ok ? `已读取存档 ${n + 1} ～` : "这个存档位是空的", 2200);
}
