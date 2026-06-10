<script lang="ts">
  import { onMount, tick } from "svelte";
  import { mountIcons } from "../ui/icons";
  import { openPanel } from "../stores/ui";
  import Scene from "../components/Scene.svelte";
  import Loader from "../components/Loader.svelte";
  import AnimBar from "../components/AnimBar.svelte";
  import Hud from "../components/Hud.svelte";
  import VnLayer from "../components/VnLayer.svelte";
  import StatusPanel from "../components/StatusPanel.svelte";
  import DiaryPanel from "../components/DiaryPanel.svelte";
  import MemoryPanel from "../components/MemoryPanel.svelte";
  import SettingsPanel from "../components/SettingsPanel.svelte";
  import GalleryPanel from "../components/GalleryPanel.svelte";
  import Onboarding from "../components/Onboarding.svelte";

  // Inject the custom line-icons into every [data-icon] once the whole tree is
  // mounted (children mount before the parent's onMount).
  onMount(() => mountIcons());

  // Panels render conditionally ({#if $openPanel === …}) — their [data-icon]
  // glyphs don't exist at app mount, so re-inject after each panel opens
  // (idempotent; fixes blank close/keepsake icons from M3).
  $: if ($openPanel) tick().then(() => mountIcons());
</script>

<Scene />
<Hud />
<AnimBar />
<VnLayer />
<StatusPanel />
<DiaryPanel />
<MemoryPanel />
<SettingsPanel />
<GalleryPanel />
<Onboarding />
<Loader />

<style>
  /* The Svelte mount point sits between <body> (height:100%) and #scene
     (height:100% of its parent). Without this, #app collapses to 0 height and
     the renderer draws into a 0-height box (invisible cat). */
  :global(#app) {
    width: 100%;
    height: 100%;
  }
</style>
