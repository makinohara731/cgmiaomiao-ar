<script lang="ts">
  import { diaryStore, catName } from "../stores/soul";
  import { openPanel } from "../stores/ui";
  $: entries = [...$diaryStore].reverse();
</script>

{#if $openPanel === "diary"}
<div class="status-panel" onclick={(e) => { if (e.target === e.currentTarget) openPanel.set(null); }} role="presentation">
  <div class="sp-card diary-book">
    <button class="sp-close" aria-label="关闭" onclick={() => openPanel.set(null)}><i class="ic" data-icon="close"></i></button>
    <div class="sp-title">{$catName}的日记本</div>
    <div class="diary-list">
      {#each entries as e (e.ts)}
        <div class="diary-item"><span class="diary-text">{e.text}</span><span class="diary-date">{e.ymd}</span></div>
      {:else}
        <div class="diary-item locked">还没有日记…多陪陪{$catName}吧</div>
      {/each}
    </div>
    <div class="cfg-hint">{$catName}会把和你之间的小事，悄悄写进这本日记里。</div>
  </div>
</div>
{/if}
