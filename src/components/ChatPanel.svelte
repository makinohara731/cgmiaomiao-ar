<script lang="ts">
  import { onMount, tick } from "svelte";
  import { chatOpen } from "../stores/ui";
  import { chatLogStore, sendChat } from "../engine/chat";
  import { ICON } from "../ui/icons";

  // Always mounted; `.hidden` slides it out (transform transition — an {#if}
  // unmount would cut the 0.32s slide and lose the log scroll position).
  let logEl: HTMLDivElement;
  let inputEl: HTMLInputElement;
  let value = "";

  function send(): void {
    const t = value;
    value = ""; // clear BEFORE sendChat (old-app: avoids double-send)
    void sendChat(t);
  }
  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter") { e.preventDefault(); send(); }
  }

  // Auto-scroll / focus via imperative subscriptions, NOT `$:` statements —
  // a reactive statement depending on a bind:this local loops Svelte 5's
  // legacy-mode batch forever (wedged the main thread at boot).
  onMount(() => {
    const u1 = chatLogStore.subscribe(() => {
      void tick().then(() => { if (logEl) logEl.scrollTop = logEl.scrollHeight; });
    });
    const u2 = chatOpen.subscribe((open) => {
      if (open) void tick().then(() => inputEl?.focus());
    });
    return () => { u1(); u2(); };
  });
</script>

<div id="chatPanel" class="chat-panel" class:hidden={!$chatOpen}>
  <div class="chat-header">
    <span>跟喵喵聊天</span>
    <button id="chatClose" class="close-btn" aria-label="关闭" onclick={() => chatOpen.set(false)}><i class="ic">{@html ICON.close}</i></button>
  </div>
  <div id="chatLog" class="chat-log" bind:this={logEl}>
    {#each $chatLogStore as m (m.id)}
      <div class="chat-msg {m.role} {m.cls}">{m.text}</div>
    {/each}
  </div>
  <div class="chat-input">
    <input id="chatInput" type="text" placeholder="说点什么...（试试：你饿吗？）" autocomplete="off"
           bind:this={inputEl} bind:value={value} onkeydown={onKeydown}>
    <button id="chatSend" onclick={send}>发送</button>
  </div>
</div>
