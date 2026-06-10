<script lang="ts">
  import { openPanel } from "../stores/ui";
  import { lifeStore } from "../stores/soul";
  import { story } from "../story/StoryEngine";
  import { ICON } from "../ui/icons";
  import { doSaveSlot, doLoadSlot, slotsStore, refreshSlots } from "../engine/saves-bridge";

  // Endings recompute on open + on any life change while open (affection /
  // unlocks drive the gates inside story.endings()).
  $: endings = $openPanel === "gallery" && $lifeStore ? story.endings() : [];
  $: if ($openPanel === "gallery") refreshSlots();

  function fmtSlotTime(ts: number): string {
    try {
      return new Date(ts).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ""; }
  }
</script>

{#if $openPanel === "gallery"}
<div id="galleryPanel" class="status-panel" onclick={(e) => { if (e.target === e.currentTarget) openPanel.set(null); }} role="presentation">
  <div class="sp-card">
    <button id="galleryClose" class="sp-close" aria-label="关闭" onclick={() => openPanel.set(null)}><i class="ic">{@html ICON.close}</i></button>
    <div class="sp-title">回廊<span class="sp-crest">·</span>结局与存档</div>

    <div class="gallery-sub">结局收藏</div>
    <div id="galleryEndings" class="diary-list">
      {#each endings as { ending, unlocked } (ending.id)}
        <div class="diary-item" class:locked={!unlocked}>
          <span class="diary-meta"><span class="diary-ic">{@html unlocked ? ICON.star : ICON.lock}</span>{unlocked ? ending.label : "？？？"}</span>{unlocked ? ending.blurb : "尚未解锁的结局"}
        </div>
      {:else}
        <div class="diary-empty">还没有结局…继续和喵喵相处吧～</div>
      {/each}
    </div>

    <div class="gallery-sub">存档（3 位）</div>
    <div id="gallerySlots" class="gallery-slots">
      {#each $slotsStore as m, i}
        <div class="save-slot">
          <div class="slot-info"><b>存档 {i + 1}</b><br>
            {#if m.used}
              {m.catName || "喵喵"} · 好感 {Math.round(m.affection)} · {m.stage || "初遇"} <span class="slot-time">{fmtSlotTime(m.timestamp)}</span>
            {:else}
              <span class="slot-empty">空存档位</span>
            {/if}
          </div>
          <div class="slot-btns">
            <button class="slot-btn slot-save" data-slot={i} onclick={() => doSaveSlot(i)}>保存</button>
            {#if m.used}<button class="slot-btn slot-load" data-slot={i} onclick={() => doLoadSlot(i)}>读取</button>{/if}
          </div>
        </div>
      {/each}
    </div>

    <div class="cfg-hint">在这里回顾走过的结局，或保存 / 读取你和喵喵的进度。</div>
  </div>
</div>
{/if}
