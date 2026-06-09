<script lang="ts">
  import { onMount } from "svelte";
  import { mountIcons } from "../ui/icons";
  import { userPlay, playComposite } from "../engine/actions";
  import { currentClip } from "../stores/session";

  // [data-anim, icon, label] — kept in the exact order/ids the dev probes
  // (_clipcheck/_strip) and CSS expect. eat/sleep/groom/stretch/sniff/lookaround
  // are ambient/feed-only and intentionally absent from the tray (as in main.js).
  const CLIPS: [string, string, string][] = [
    ["idle", "cat", "待机"], ["walk", "walk", "走路"], ["run", "run", "跑步"],
    ["attack", "claw", "攻击"], ["hurt", "bandage", "受伤"], ["wave", "paw", "招手"],
    ["happy", "heart", "撒娇"], ["jump", "jump", "蹦跳"], ["spin", "spin", "转圈"],
    ["backflip", "flip", "空翻"], ["twirl", "swirl", "旋跳"],
    ["sit", "sit", "坐下"], ["headtilt", "tilt", "歪头"], ["lickpaw", "paw", "舔爪"],
    ["pounce", "pounce", "猛扑"], ["playbow", "bow", "作揖"],
    ["nod", "check", "点头"], ["shy", "blush", "害羞"], ["ponder", "think", "思考"],
    ["adore", "heart", "心动"], ["headpat", "hand", "摸头"],
  ];
  // [data-composite, icon, label]
  const COMPOSITES: [string, string, string][] = [
    ["dance", "note", "跳舞"], ["think", "think", "发呆"], ["peek", "eye", "偷瞄"],
    ["sneeze", "wind", "喷嚏"], ["beg", "heart", "讨抱"], ["stargaze", "star", "看星星"],
    ["stalk", "eye", "潜伏"], ["zoomies", "swirl", "暴冲"], ["knead", "paw", "揉揉"],
    ["headbutt", "heart", "撞撞"], ["scratch", "paw", "挠挠"], ["playdead", "zzz", "装死"],
  ];

  onMount(() => mountIcons());

  function toggleTray() {
    document.body.classList.toggle("anim-open");
  }
</script>

<!-- Tray handle: keeps the 33-button strip tucked off-screen by default. -->
<button id="animToggle" aria-label="动作" onclick={toggleTray}><span>动作</span></button>

<div id="animBar" class="anim-bar">
  {#each CLIPS as [anim, icon, label] (anim)}
    <button
      class="anim-btn"
      class:active={$currentClip === anim}
      data-anim={anim}
      title={label}
      onclick={() => userPlay(anim)}
    >
      <i class="ic" data-icon={icon}></i><span>{label}</span>
    </button>
  {/each}
  {#each COMPOSITES as [comp, icon, label] (comp)}
    <button
      class="anim-btn anim-composite"
      data-composite={comp}
      title={label}
      onclick={() => playComposite(comp)}
    >
      <i class="ic" data-icon={icon}></i><span>{label}</span>
    </button>
  {/each}
</div>
