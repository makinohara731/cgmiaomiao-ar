<script lang="ts">
  // M0 skeleton — proves the Svelte app mounts on :8765 alongside the legacy
  // main.js app. Real shell (Scene + renderer + UI) arrives in M1+.
</script>

<main>
  <h1>喵喵咕咯精灵</h1>
  <p class="tag">Svelte 重建 · M0 skeleton</p>
</main>

<style>
  main {
    font-family: system-ui, "PingFang SC", "Microsoft YaHei", sans-serif;
    color: #36473a;
    display: grid;
    place-content: center;
    min-height: 100vh;
    text-align: center;
    background: linear-gradient(170deg, #eef5ea, #dde9d7);
  }
  h1 { font-size: 30px; letter-spacing: 0.06em; margin: 0; }
  .tag { color: #8a978a; margin-top: 8px; }
</style>
