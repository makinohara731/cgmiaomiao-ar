<script lang="ts">
  import { onMount } from "svelte";
  import { initVn } from "../engine/vn";

  // The Choices instance manages this element's show/hide; DialogueBox creates
  // its own DOM (appended to body) on init.
  let choicesEl: HTMLDivElement;
  onMount(() => initVn(choicesEl));
</script>

<div id="choices" class="choices hidden" bind:this={choicesEl}></div>
