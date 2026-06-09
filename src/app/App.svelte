<script lang="ts">
  import Scene from "../components/Scene.svelte";
  import Loader from "../components/Loader.svelte";
</script>

<Scene />
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
