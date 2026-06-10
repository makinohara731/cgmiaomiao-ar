<script lang="ts">
  import { mem } from "../stores/soul";
  import { catName } from "../stores/soul";
  import { openPanel } from "../stores/ui";
  // mem is a plain object (mutated by chat in M5 + slot restore in M4) — re-read
  // it each time the panel opens, keyed on $openPanel, so restored facts show.
  const by = (k: string) => mem.facts.filter((f) => f.k === k).map((f) => f.v);
  $: visible = $openPanel === "memory";
  $: likes = visible ? by("likes") : [];
  $: dislikes = visible ? by("dislikes") : [];
  $: facts = visible ? by("fact") : [];
  $: empty = visible && !mem.facts.length && !mem.topics.length;
</script>

{#if $openPanel === "memory"}
<div class="status-panel" onclick={(e) => { if (e.target === e.currentTarget) openPanel.set(null); }} role="presentation">
  <div class="sp-card mem-board">
    <button class="sp-close" aria-label="关闭" onclick={() => openPanel.set(null)}><i class="ic" data-icon="close"></i></button>
    <div class="sp-title">{$catName}记得的事</div>
    <div class="mem-list">
      {#if empty}
        <div class="mem-empty">还不太了解你…多和{$catName}聊聊吧</div>
      {/if}
      {#if likes.length}<div class="mem-group"><span class="mem-key">喜欢</span>{#each likes as v}<span class="mem-tag">{v}</span>{/each}</div>{/if}
      {#if dislikes.length}<div class="mem-group"><span class="mem-key">不喜欢</span>{#each dislikes as v}<span class="mem-tag">{v}</span>{/each}</div>{/if}
      {#if facts.length}<div class="mem-group"><span class="mem-key">提过</span>{#each facts as v}<span class="mem-tag">{v}</span>{/each}</div>{/if}
      {#if mem.topics.length}<div class="mem-group"><span class="mem-key">最近聊过</span>{#each mem.topics.slice(-3) as v}<span class="mem-tag">{v}</span>{/each}</div>{/if}
    </div>
    <div class="cfg-hint">聊天时它会悄悄记住你提到的喜好和小事。</div>
  </div>
</div>
{/if}
