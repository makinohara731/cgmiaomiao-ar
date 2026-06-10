<script lang="ts">
  import { onMount } from "svelte";
  import { ICON } from "../ui/icons";

  // The QR is a STATIC qr.png pointing at the phone page — no QR library
  // (old-app behaviour). The button shows only where native mobile AR is NOT
  // available (model-viewer's canActivateAR, re-checked once after 1200ms —
  // it can be transiently false right after load).
  let open = false;
  let showBtn = false;

  onMount(() => {
    const mv = document.getElementById("catModel") as any;
    const decide = (): void => { showBtn = !(mv && mv.canActivateAR); };
    decide();
    const t = setTimeout(decide, 1200);
    return () => clearTimeout(t);
  });
</script>

{#if showBtn}
  <!-- z-index:30 lifts it above #catCanvas (z1) — the old app's button was
       unreachable under the three backend (latent hit-test bug). -->
  <button id="qrBtn" class="ar-btn qr-btn" style="display:flex;z-index:30" onclick={() => (open = true)}>
    <i class="ic">{@html ICON.phone}</i> 手机看AR
  </button>
{/if}

<div id="qrModal" class="qr-modal" class:hidden={!open} onclick={(e) => { if (e.target === e.currentTarget) open = false; }} role="presentation">
  <div class="qr-card">
    <button id="qrClose" class="qr-close" aria-label="关闭" onclick={() => (open = false)}><i class="ic">{@html ICON.close}</i></button>
    <h2>在手机上和喵喵 AR 见面</h2>
    <p>电脑没有 AR 相机～用手机扫一扫，<br>就能把喵喵放进你身边的现实里。</p>
    <img id="qrImg" src="qr.png" alt="二维码" width="220" height="220">
    <span class="qr-url">makinohara731.github.io/cgmiaomiao-ar</span>
  </div>
</div>
