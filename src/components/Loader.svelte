<script lang="ts">
  import { loaderHidden } from "../stores/session";
</script>

<!-- Covers the scene until the model is ready. #loader id kept so dev probes
     (anim-probe) can read its .hidden state. -->
<div id="loader" class="loader" class:hidden={$loaderHidden}>
  <div class="loader-cat"><i class="ic" data-icon="spirit"></i></div>
  <p>喵喵正在赶来…</p>
</div>
