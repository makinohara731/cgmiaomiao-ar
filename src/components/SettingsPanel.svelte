<script lang="ts">
  import { cfg, cfgStore, notifyCfg, lifeStore } from "../stores/soul";
  import { openPanel } from "../stores/ui";
  import { saveCfg } from "../engine/persistence";
  import { timeBucket } from "../engine/time-of-day";
  import * as audio from "../audio";

  const PERS: [string, string][] = [["default", "默认"], ["lively", "活泼"], ["gentle", "温和"], ["lazy", "慵懒"]];

  function setPers(p: string) { cfg.personality = p as any; notifyCfg(); saveCfg(); }
  function toggle(key: "proactive" | "nightSleep" | "cloudVoice", e: Event) {
    cfg[key] = (e.target as HTMLInputElement).checked; notifyCfg(); saveCfg();
  }
  function toggleBgm(e: Event) {
    cfg.bgm = (e.target as HTMLInputElement).checked; notifyCfg(); saveCfg();
    try {
      if (cfg.bgm) audio.startBGM(timeBucket() === "night" ? "night" : "day");
      else audio.stopBGM();
    } catch { /* audio not ready */ }
  }
</script>

{#if $openPanel === "cfg"}
<div class="status-panel" onclick={(e) => { if (e.target === e.currentTarget) openPanel.set(null); }} role="presentation">
  <div class="sp-card">
    <button class="sp-close" aria-label="关闭" onclick={() => openPanel.set(null)}><i class="ic" data-icon="close"></i></button>
    <div class="sp-title">{"喵喵设置"}</div>
    <div class="cfg-row">
      <div class="cfg-label">性格</div>
      <div class="cfg-personality">
        {#each PERS as [val, label]}
          <button class="pers-btn" class:active={$cfgStore.personality === val} onclick={() => setPers(val)}>{label}</button>
        {/each}
      </div>
    </div>
    <label class="cfg-row cfg-toggle"><span>主动求关注</span><input type="checkbox" checked={$cfgStore.proactive} onchange={(e) => toggle("proactive", e)}></label>
    <label class="cfg-row cfg-toggle"><span>夜里更容易犯困</span><input type="checkbox" checked={$cfgStore.nightSleep} onchange={(e) => toggle("nightSleep", e)}></label>
    <label class="cfg-row cfg-toggle"><span>云端语音（更可爱）</span><input type="checkbox" checked={$cfgStore.cloudVoice} onchange={(e) => toggle("cloudVoice", e)}></label>
    {#if $lifeStore.unlocks.includes("bgm")}
      <label class="cfg-row cfg-toggle"><span>背景音乐</span><input type="checkbox" checked={$cfgStore.bgm} onchange={toggleBgm}></label>
    {/if}
    <div class="cfg-hint">性格会影响行为偏好与需求消耗速度；设置即时生效，保存在本地。</div>
  </div>
</div>
{/if}
