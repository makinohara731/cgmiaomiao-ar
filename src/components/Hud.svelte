<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { lifeStore, stage } from "../stores/soul";
  import { emoteGlyph, statusToast, openPanel, chatOpen } from "../stores/ui";
  import { isMuted, isRecording, arMode, camMode } from "../stores/session";
  import { EMOTE_ART } from "../ui/emoteArt";
  import { ICON } from "../ui/icons";
  import { feedCat } from "../engine/feed";
  import { stopSpeaking } from "../engine/voice";
  import { initVoiceInput } from "../engine/voice-input";
  import { toggleCamAr, swapCamera } from "../engine/ar";
  import { showStatus } from "../engine/feedback";
  import { bus, EVT } from "../bus";
  import { mountIcons } from "../ui/icons";

  let shimmer = false;
  let shimmerKey = 0;
  let micBtnEl: HTMLButtonElement;

  onMount(() => {
    mountIcons();
    initVoiceInput(micBtnEl); // press-and-hold mic → ASR → VOICE_MAP
    bus.on(EVT.BondUnlock, () => { shimmer = true; shimmerKey++; setTimeout(() => (shimmer = false), 1400); });
  });

  function toggleMute() {
    isMuted.update((m) => !m);
    const m = get(isMuted);
    if (m) stopSpeaking(); // cut off the line being spoken right now
    showStatus(m ? "已静音" : "已开声", 1000);
  }

  $: emoteHtml = EMOTE_ART[$emoteGlyph.glyph] ?? "";
</script>

<!-- Status toast -->
{#key $statusToast.nonce}
  {#if $statusToast.msg}
    <div id="status" class="status show">{$statusToast.msg}</div>
  {/if}
{/key}

<!-- Emote bubble -->
{#key $emoteGlyph.nonce}
  {#if $emoteGlyph.glyph}
    <div id="emote" class="emote show">
      {#if emoteHtml}{@html emoteHtml}{:else}{$emoteGlyph.glyph}{/if}
    </div>
  {/if}
{/key}

<!-- Relationship chip — opens the status panel -->
<div id="bondChip" class="bond-chip" class:bond-shimmer={shimmer} style="--aff:{$lifeStore.affection / 100}"
     onclick={() => openPanel.set("status")} onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") openPanel.set("status"); }} role="button" tabindex="0">
  <span class="bond-heart"><svg viewBox="0 0 48 48" width="17" height="17"><path d="M24 41C9.5 31 3 23 3 15.6 3 9 8 4.5 14 4.5c4.2 0 7.7 2.3 10 6 2.3-3.7 5.8-6 10-6 6 0 11 4.5 11 11.1C45 23 38.5 31 24 41Z" fill="#ff7fa3"/></svg></span><span id="bondStage">{$stage.name}</span>
</div>

<!-- 永远的朋友 keepsake — unlocked at 形影不离 -->
{#if $lifeStore.unlocks.includes("photo")}
  <!-- {@html} instead of data-icon: this mounts conditionally mid-session
       (unlock / slot restore), after every mountIcons() pass has run. -->
  <div id="foreverBadge" class="forever-badge"><span class="forever-glow ic">{@html ICON.spark}</span><span class="forever-text">永远的朋友</span></div>
{/if}

<!-- Side bar -->
<div id="sideBar" class="side-bar">
  <button id="camBtn" class="round-btn" class:active={$arMode || $camMode} title="AR互动模式" aria-label="AR互动模式" onclick={toggleCamAr}><i class="ic">{@html ($arMode || $camMode) ? ICON.close : ICON.cam}</i></button>
  <button id="camSwapBtn" class="round-btn cam-swap-btn" title="切换前/后置镜头" aria-label="切换镜头" onclick={swapCamera}><i class="ic" data-icon="swap"></i></button>
  <button id="feedBtn" class="round-btn" title="喂食" aria-label="喂喵喵吃东西" onclick={feedCat}><i class="ic" data-icon="fish"></i></button>
  <button id="micBtn" class="round-btn" class:recording={$isRecording} title="长按说话" aria-label="语音命令" bind:this={micBtnEl}><i class="ic" data-icon="mic"></i></button>
  <button id="chatBtn" class="round-btn" title="跟猫聊天" aria-label="对话精灵" onclick={() => chatOpen.update((v) => !v)}><i class="ic" data-icon="chat"></i></button>
  <button id="muteBtn" class="round-btn" class:muted={$isMuted} title="静音" aria-label="音效" onclick={toggleMute}><i class="ic">{@html $isMuted ? ICON.mute : ICON.sound}</i></button>
</div>
