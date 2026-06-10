<script lang="ts">
  import { lifeStore, stage, catName, daily, STAGES, stageOf } from "../stores/soul";
  import { STAGE_UNLOCK } from "../engine/soul/bond";
  import { openPanel } from "../stores/ui";

  const KEEP_ICON: Record<string, string> = { bgm: "note", dream: "zzz", nickname: "chat", photo: "star" };

  $: aff = $lifeStore.affection;
  $: cur = $stage.name;
  $: days = (() => {
    const d0 = new Date($lifeStore.bornAt); d0.setHours(0, 0, 0, 0);
    const dn = new Date(); dn.setHours(0, 0, 0, 0);
    return Math.round((+dn - +d0) / 86400000) + 1;
  })();
</script>

{#if $openPanel === "status"}
<div id="statusPanel" class="status-panel" onclick={(e) => { if (e.target === e.currentTarget) openPanel.set(null); }} role="presentation">
  <div class="sp-card">
    <button class="sp-close" aria-label="关闭" onclick={() => openPanel.set(null)}><i class="ic" data-icon="close"></i></button>
    <div class="sp-title"><span>{$catName}</span><span class="sp-crest">·</span>状态</div>
    <div class="sp-stage-row"><span class="sp-stage">{cur}</span></div>

    <div class="sp-meter"><span class="sp-label">好感</span><div class="sp-track"><div class="sp-fill sp-fill-aff" style="width:{aff}%"></div></div></div>
    <div class="sp-affnum">好感度 {Math.round(aff)} / 100</div>
    <div class="sp-meter"><span class="sp-label">饱食</span><div class="sp-track"><div class="sp-fill" style="width:{$lifeStore.hunger * 100}%"></div></div></div>
    <div class="sp-meter"><span class="sp-label">精力</span><div class="sp-track"><div class="sp-fill" style="width:{$lifeStore.energy * 100}%"></div></div></div>
    <div class="sp-meter"><span class="sp-label">心情</span><div class="sp-track"><div class="sp-fill" style="width:{$lifeStore.mood * 100}%"></div></div></div>

    <div class="sp-section">羁绊之路</div>
    <div class="sp-ladder">
      {#each STAGES as s}
        {@const reached = aff >= s.min}
        {@const u = STAGE_UNLOCK[s.name]}
        <div class="sp-rung" class:reached class:current={s.name === cur}>
          <span class="rung-dot"></span>
          <span class="rung-name">{s.name}</span>
          {#if !reached}<span class="rung-need">{s.min}</span>
          {:else if u}<span class="rung-gift">{u.label}</span>{/if}
        </div>
      {/each}
    </div>

    <div class="sp-section">心意收藏</div>
    <div class="sp-collection">
      {#each Object.entries(STAGE_UNLOCK) as [, u]}
        {@const has = $lifeStore.unlocks.includes(u.key)}
        <div class="sp-keep" class:locked={!has}>
          <span class="keep-icon ic" data-icon={KEEP_ICON[u.key]}></span>
          <span class="keep-label">{has ? u.label : "未解锁"}</span>
        </div>
      {/each}
    </div>

    <div class="sp-days">和{$catName}相伴第 {days} 天 · 摸过 {$lifeStore.totalPets} 次</div>
    {#if daily.theme}<div class="sp-theme">今日心情 · {daily.theme}</div>{/if}
    <div class="sp-link-row">
      <button class="sp-cfg-link" onclick={() => openPanel.set("diary")}>日记</button>
      <button class="sp-cfg-link" onclick={() => openPanel.set("memory")}>记忆</button>
      <button class="sp-cfg-link" onclick={() => openPanel.set("gallery")}>回廊</button>
      <button class="sp-cfg-link" onclick={() => openPanel.set("cfg")}>设置</button>
    </div>
  </div>
</div>
{/if}
