<script lang="ts">
  import { onMount } from "svelte";
  import { start } from "../app/bootstrap";

  // The renderer factory needs these exact DOM nodes (#catModel mobile backend,
  // #catCanvas three backend, #camFeed AR passthrough). Their styling +
  // .renderer-hidden toggling come from style.css.
  let modelViewer: HTMLElement;
  let canvas: HTMLCanvasElement;

  onMount(() => {
    start({ modelViewer, canvas });
  });
</script>

<main id="scene">
  <!-- Camera passthrough — live feed behind the transparent 3D scene (AR, M6) -->
  <video id="camFeed" playsinline muted autoplay></video>

  <!-- model-viewer backend (mobile / no-WebGL / native AR). Hidden by the factory
       when the three backend is selected (desktop default). -->
  <model-viewer
    id="catModel"
    bind:this={modelViewer}
    src="character_v2.glb"
    ios-src="character_v2.usdz"
    alt="可爱的绿色小猫精灵"
    ar
    ar-modes="webxr scene-viewer quick-look"
    ar-scale="auto"
    camera-controls
    touch-action="pan-y"
    auto-rotate-delay="3000"
    interaction-prompt="none"
    shadow-intensity="0.55"
    shadow-softness="1.0"
    exposure="1.15"
    tone-mapping="aces"
    environment-image="neutral"
    camera-orbit="90deg 85deg 0.40m"
    field-of-view="30deg"
    min-camera-orbit="auto auto 0.22m"
    max-camera-orbit="auto auto 1.5m"
    autoplay
    animation-name="idle"
    animation-loop
  ></model-viewer>

  <!-- three.js renderer canvas (desktop default). Revealed by the factory. -->
  <canvas id="catCanvas" class="renderer-hidden" bind:this={canvas}></canvas>
</main>
