<script lang="ts">
  import { onboardActive } from "../stores/session";
  import { life } from "../stores/soul";
  import { story } from "../story/StoryEngine";
  import * as audio from "../audio";
  import { applyNaming } from "../engine/soul/naming";
  import { ONBOARD_KEY, doGreeting } from "../app/bootstrap";

  // The overlay stays in the DOM and toggles `hidden` (never {#if}-unmounted):
  // the beats cross-fade on opacity/transform transitions, and the overlay
  // itself fades out over 0.5s — unmounting would cut both (old-app behaviour).
  let beat = 1;
  let hidden = true;
  let started = false;
  let nameValue = "";

  $: if ($onboardActive && !started) { started = true; beat = 1; hidden = false; }

  function onTap(e: MouseEvent): void {
    if (beat === 4) return; // the naming card owns its clicks
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "BUTTON")) return;
    beat = Math.min(4, beat + 1);
  }

  function finish(e: MouseEvent): void {
    e.stopPropagation(); // don't bubble back to the overlay tap handler
    hidden = true;
    onboardActive.set(false); // releases the autonomy-loop gate (`started` keeps us from re-showing)
    try { localStorage.setItem(ONBOARD_KEY, "1"); } catch { /* storage unavailable */ }
    story.onOnboardComplete(); // records only — no beat plays synchronously
    try { audio.ensureAudio(); } catch { /* audio unavailable */ }
    // 400ms: let the overlay fade before the naming line/emote (old timing).
    if (!life.catName) setTimeout(() => applyNaming(nameValue || ""), 400);
    else setTimeout(doGreeting, 400);
  }
</script>

<div id="onboard" class="overlay" class:hidden class:is-last={beat === 4} onclick={onTap} role="presentation">
  <!-- Shared gradient for the spirit-orb hero (becomes the cat by beat 3) -->
  <svg width="0" height="0" aria-hidden="true" style="position:absolute">
    <defs>
      <radialGradient id="spiritGlow" cx="50%" cy="44%" r="56%">
        <stop offset="0%" stop-color="#e9ffe6"/>
        <stop offset="34%" stop-color="#9bf0a0"/>
        <stop offset="70%" stop-color="#4fae5f" stop-opacity="0.45"/>
        <stop offset="100%" stop-color="#4fae5f" stop-opacity="0"/>
      </radialGradient>
    </defs>
  </svg>
  <!-- Star field backdrop sits behind every beat; faded out at the last beat -->
  <div id="onboardStars" aria-hidden="true">
    <span style="left:8%;top:14%"></span><span style="left:22%;top:8%"></span>
    <span style="left:38%;top:18%"></span><span style="left:55%;top:6%"></span>
    <span style="left:71%;top:13%"></span><span style="left:86%;top:20%"></span>
    <span style="left:14%;top:32%"></span><span style="left:46%;top:38%"></span>
    <span style="left:78%;top:34%"></span>
  </div>

  <!-- Beat 1: a small spirit-wisp drifting through space -->
  <section class="beat" class:hidden={beat !== 1} data-beat="1">
    <div class="beat-cat"><svg class="spirit" viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
      <circle cx="60" cy="60" r="50" fill="url(#spiritGlow)"/>
      <circle cx="60" cy="56" r="17" fill="#f2fff4"/>
      <circle cx="54" cy="50" r="6" fill="#fff"/>
      <circle class="sp-spark" cx="92" cy="40" r="2.4" fill="#eafff0"/>
      <circle class="sp-spark" cx="28" cy="78" r="1.8" fill="#eafff0"/>
      <circle class="sp-spark" cx="86" cy="84" r="1.6" fill="#eafff0"/>
    </svg></div>
    <div class="beat-line">在很远很远的地方…<br>有一只迷路的小精灵</div>
    <div class="beat-hint">轻点任意位置 ›</div>
  </section>

  <!-- Beat 2: it follows the light here -->
  <section class="beat" class:hidden={beat !== 2} data-beat="2">
    <div class="beat-cat"><svg class="spirit" viewBox="0 0 120 120" width="150" height="150" aria-hidden="true">
      <path d="M60 60 Q22 70 8 96" stroke="url(#spiritGlow)" stroke-width="6" fill="none" stroke-linecap="round" opacity="0.7"/>
      <circle cx="60" cy="60" r="50" fill="url(#spiritGlow)"/>
      <circle cx="60" cy="56" r="18" fill="#f2fff4"/>
      <circle cx="54" cy="50" r="6" fill="#fff"/>
      <circle class="sp-spark" cx="90" cy="44" r="2.2" fill="#eafff0"/>
      <circle class="sp-spark" cx="96" cy="74" r="1.8" fill="#eafff0"/>
    </svg></div>
    <div class="beat-line">它沿着光，找到了这里…<br>会是个新朋友吗？</div>
    <div class="beat-hint">轻点继续 ›</div>
  </section>

  <!-- Beat 3: the wisp takes the shape of a little cat and sees you -->
  <section class="beat" class:hidden={beat !== 3} data-beat="3">
    <div class="beat-cat"><svg class="spirit" viewBox="0 0 120 120" width="158" height="158" aria-hidden="true">
      <circle cx="60" cy="62" r="50" fill="url(#spiritGlow)"/>
      <path d="M40 40 L34 20 L54 34 Z" fill="#bff0bd"/>
      <path d="M80 40 L86 20 L66 34 Z" fill="#bff0bd"/>
      <circle cx="60" cy="60" r="26" fill="#f2fff4"/>
      <circle cx="51" cy="58" r="4.6" fill="#26331f"/>
      <circle cx="69" cy="58" r="4.6" fill="#26331f"/>
      <path d="M56 68 q4 4 8 0" stroke="#26331f" stroke-width="2" fill="none" stroke-linecap="round"/>
      <circle class="sp-spark" cx="94" cy="42" r="2.2" fill="#eafff0"/>
      <circle class="sp-spark" cx="26" cy="80" r="1.8" fill="#eafff0"/>
    </svg></div>
    <div class="beat-line">"你好呀…<br>能听见我说话吗？"</div>
    <div class="beat-hint">轻点继续 ›</div>
  </section>

  <!-- Beat 4: the naming card — the moment the relationship begins -->
  <section class="beat" class:hidden={beat !== 4} data-beat="4">
    <div class="onboard-card">
      <div class="logo"><svg class="spirit" viewBox="0 0 120 120" width="86" height="86" aria-hidden="true">
        <circle cx="60" cy="62" r="48" fill="url(#spiritGlow)"/>
        <path d="M40 40 L34 20 L54 34 Z" fill="#bff0bd"/>
        <path d="M80 40 L86 20 L66 34 Z" fill="#bff0bd"/>
        <circle cx="60" cy="60" r="25" fill="#f2fff4"/>
        <circle cx="51" cy="58" r="4.4" fill="#26331f"/>
        <circle cx="69" cy="58" r="4.4" fill="#26331f"/>
        <path d="M56 68 q4 4 8 0" stroke="#26331f" stroke-width="2" fill="none" stroke-linecap="round"/>
      </svg></div>
      <h1>那么…</h1>
      <p>你想叫我什么呢？</p>
      <div class="name-input">
        <input id="catNameInput" type="text" maxlength="6" bind:value={nameValue}
               placeholder="留空就叫我喵喵～" autocomplete="off" spellcheck="false">
      </div>
      <button id="onboardStart" class="primary-btn" onclick={finish}>交个朋友吧～</button>
      <div class="onboard-mini-hint">之后可以从「设置」改名字</div>
    </div>
  </section>
</div>
