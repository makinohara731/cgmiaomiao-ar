/**
 * TTS voice output — cloud Qwen-TTS first (the worker picks the voice from the
 * story route / bond stage; mood tints the playback rate here), falling back to
 * the browser's SpeechSynthesis. Faithful port of main.js speak()/loadVoices.
 *
 * Concurrency model (deliberate, don't "improve"): ONE cloudAudio handle, a new
 * line pauses the old one (last one wins); no queue, no throttle, no abort, no
 * client cache (the worker has a Cache-API read-through). The autonomous loop
 * is kept off by catState, not by throttling here.
 */
import { get } from "svelte/store";
import { isMuted } from "../stores/session";
import { life, cfg, stageOf } from "../stores/soul";
import { story } from "../story/StoryEngine";
import { TTS_ENDPOINT } from "./endpoints";

let cloudAudio: HTMLAudioElement | null = null;

let ttsVoices: SpeechSynthesisVoice[] = [];
function loadVoices(): void {
  if (window.speechSynthesis) ttsVoices = window.speechSynthesis.getVoices() || [];
}
if (typeof window !== "undefined" && window.speechSynthesis) {
  loadVoices();
  window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
}

export async function speak(text: string, mood?: string): Promise<void> {
  if (get(isMuted)) return;
  const clean = (text || "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, "")
    .replace(/[\[\]{}]/g, "")
    .trim();
  if (!clean) return;

  // ---- Cloud TTS first (real Qwen-TTS voice). Falls back to the browser's
  //      SpeechSynthesis if the network/worker hiccups. ----
  if (TTS_ENDPOINT && cfg.cloudVoice) {
    try {
      const resp = await fetch(TTS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: clean,
          mood: mood || "",
          route: (story.route && story.route()) || "",
          stage: stageOf(life.affection).name,
        }),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        if (cloudAudio) { try { cloudAudio.pause(); } catch { /* */ } }
        const url = URL.createObjectURL(blob);
        cloudAudio = new Audio(url);
        // free mood tint on a fixed voice: a touch quicker/brighter when happy,
        // a touch slower/softer when down.
        cloudAudio.playbackRate = mood === "up" ? 1.06 : mood === "down" ? 0.95 : 1.0;
        cloudAudio.onended = cloudAudio.onerror = () => URL.revokeObjectURL(url);
        await cloudAudio.play();
        return;
      }
    } catch { /* fall through to browser TTS */ }
  }

  // ---- Fallback: browser SpeechSynthesis (prosody also varies by mood) ----
  if (!window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = "zh-CN";
    u.pitch = mood === "up" ? 1.85 : mood === "down" ? 1.5 : 1.7; // small, cute voice
    u.rate = mood === "up" ? 1.14 : mood === "down" ? 1.0 : 1.08;
    const zh = ttsVoices.find((v) => /zh|cmn|chinese|中文|普通话/i.test(v.lang + " " + v.name));
    if (zh) u.voice = zh;
    window.speechSynthesis.speak(u);
  } catch { /* speech unavailable — the bubble still carries it */ }
}

/** Cut off whatever is speaking right now (mute toggle). */
export function stopSpeaking(): void {
  if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch { /* */ } }
  if (cloudAudio) {
    try { cloudAudio.pause(); } catch { /* */ }
    cloudAudio = null;
  }
}
