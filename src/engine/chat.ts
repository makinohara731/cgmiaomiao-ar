/**
 * Chat pipeline — LLM streaming + non-streaming fallback + offline replies.
 * Faithful port of main.js sendChat/tryStreaming/sendChatNonStreaming.
 *
 * The P4-risk-list top invariant: sendChat claims catState.enter("chat", 20000)
 * exactly once, and EVERY terminal shortens it back with a hold() — success
 * holds the read dwell, every failure holds 400ms. Miss one and the autonomous
 * loop stalls for 20s. The stream→non-stream fallback is two-stage: the failed
 * stream holds 400 first, then the fallback applies its own terminal hold.
 *
 * Deliberate asymmetry (don't unify): the streaming path ends with
 * stream.end(dwell) + speak() (the VN box is already stream-driven), the
 * non-streaming path uses sayLine() (which opens the VN box itself).
 */
import { writable } from "svelte/store";
import { streamChat } from "../chat-stream";
import { bus, EVT } from "../bus";
import { life, daily, catNameDisplay } from "../stores/soul";
import { story } from "../story/StoryEngine";
import { CHAT_ENDPOINT, CHAT_STREAM_ENDPOINT } from "./endpoints";
import { bumpInteract } from "./soul/life";
import { extractFacts, addTopic, buildMemoryBlock } from "./soul/memory";
import { wakeUp } from "./autonomy";
import { userPlay } from "./actions";
import { emote, sayLine, showStatus } from "./feedback";
import { setExpression, flashReplyFace } from "./expression";
import { getDialogue, getChoices, bubbleDwellMs } from "./vn";
import { speak } from "./voice";
import { duckBGM } from "../audio";
import { enterState, holdState, hasClip, currentClip } from "./runtime";
import { clamp01 } from "./util";

// ---- visible chat log (the #chatLog bubbles; the VN box is separate) ----
export interface ChatMsg { id: number; role: "user" | "cat"; text: string; cls: string; }
export const chatLogStore = writable<ChatMsg[]>([]);
let msgId = 0;
function appendMsg(role: "user" | "cat", text: string, cls = ""): { remove(): void } {
  const id = ++msgId;
  chatLogStore.update((l) => [...l, { id, role, text, cls }]);
  return { remove: () => chatLogStore.update((l) => l.filter((m) => m.id !== id)) };
}

let chatHistory: { role: "user" | "assistant"; content: string }[] = [];

const OFFLINE_REPLIES = [
  "嗯…今天有点安静呢喵～",
  "（眨眨眼，看着你）",
  "我先陪你坐一会儿吧",
  "网络好像睡着啦，喵",
];

function buildChatBody(text: string) {
  return {
    message: text,
    history: chatHistory.slice(-6),
    memory: buildMemoryBlock(),
    story: story.storyHint(), // 【剧情】 mood hint (route atmosphere only)
    state: {
      mood: Math.round(life.mood * 100) / 100,
      energy: Math.round(life.energy * 100) / 100,
      asleep: life.asleep,
      activity: currentClip(),
      catName: catNameDisplay(),
      userName: life.userName || "",
      dailyTheme: daily.theme || "",
    },
  };
}

/** LLM-offered quick replies (P3.3) — picking one continues the chat. */
export function offerReplyChoices(list: unknown): void {
  if (!Array.isArray(list) || !list.length) return;
  const items = list
    .filter((s) => typeof s === "string" && s.trim())
    .slice(0, 3)
    .map((s) => ({ label: (s as string).trim() }));
  if (!items.length) return;
  getChoices()?.show(items, (item) => { void sendChat(item.label); });
}

export async function sendChat(text: string): Promise<void> {
  if (!text || !text.trim()) return;
  text = text.trim();
  getChoices()?.hide(); // clear any stale suggestion chips
  appendMsg("user", text);
  bumpInteract(0.5);
  extractFacts(text);
  addTopic(text); // remember what we talked about
  if (!CHAT_ENDPOINT) {
    appendMsg("cat", "（聊天功能未配置，部署 Cloudflare Workers 后启用）");
    return;
  }
  // Fully offline → don't fire the request (which would error, retry, then
  // fall back — three round-trips for nothing). Answer with a quiet line.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    const line = OFFLINE_REPLIES[(Math.random() * OFFLINE_REPLIES.length) | 0];
    appendMsg("cat", line);
    sayLine(line);
    return;
  }
  bus.emit(EVT.ChatStart, { text });
  enterState("chat", 20000);
  // Streaming path — let the VN box fill as text arrives.
  if (CHAT_STREAM_ENDPOINT) {
    const ok = await tryStreaming(text);
    if (ok) return;
  }
  // Fallback — classic POST /api/chat with the full envelope at the end.
  await sendChatNonStreaming(text);
}

async function tryStreaming(text: string): Promise<boolean> {
  const thinking = appendMsg("cat", "喵喵在想…", "thinking");
  emote("💭");
  if (!life.asleep) setExpression("think"); // ponder face while it thinks
  // Open the VN dialogue box for streaming; the network paces the typewriter.
  const stream = getDialogue()!.beginStream();

  let reply = "";
  let envelope: any = null;
  let failed = false;

  await streamChat({
    endpoint: CHAT_STREAM_ENDPOINT,
    body: buildChatBody(text),
    onText: (delta: string) => {
      reply += delta;
      stream.setText(reply); // VN box renders the accumulated reply
    },
    onEnvelope: (env: any) => {
      envelope = env;
      // The envelope may have a cleaner reply than the streamed text
      // (e.g. retry path on the server). Trust it if it differs.
      if (env.reply && env.reply.length && env.reply !== reply) {
        reply = env.reply;
        stream.setText(reply);
      }
    },
    onError: (err: any) => {
      failed = true;
      console.warn("stream error, falling back:", err);
    },
  } as any);

  thinking.remove();
  if (failed && !reply) {
    getDialogue()?.hide();
    if (!life.asleep) setExpression("open"); // clear the ponder face before the fallback
    holdState(400); // release the loop for the fallback path
    return false;
  }
  if (!reply) reply = "喵？";
  appendMsg("cat", reply);
  chatHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
  if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);

  if (life.asleep) wakeUp(false);
  const mood = envelope?.mood;
  if (mood === "up") life.mood = clamp01(life.mood + 0.15);
  if (mood === "down") life.mood = clamp01(life.mood - 0.12);

  const anim = envelope?.animation;
  // Face the mood BEFORE the clip (a face-driven clip may override it)
  flashReplyFace(mood, envelope?.emote);
  if (anim && hasClip(anim)) userPlay(anim); // worker allowlist + client hasClip, both levels
  emote(envelope?.emote || "💬");
  offerReplyChoices(envelope?.choices);

  // TTS gets the final reply once — streaming TTS isn't worth the complexity.
  const dwell = bubbleDwellMs(reply);
  duckBGM(0.35, dwell);
  void speak(reply, mood); // mood tints the voice prosody / playback rate
  stream.end(dwell); // keep the VN box up for the read dwell, then hide
  holdState(dwell);
  return true;
}

async function sendChatNonStreaming(text: string): Promise<void> {
  const thinking = appendMsg("cat", "喵喵在想…", "thinking");
  emote("💭");
  if (!life.asleep) setExpression("think");
  try {
    const r = await fetch(CHAT_ENDPOINT!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildChatBody(text)),
    });
    if (r.status === 429) {
      thinking.remove();
      appendMsg("cat", "（喵…太快啦，让我喘口气）");
      showStatus("请稍候再试 ♪", 1800);
      holdState(400);
      return;
    }
    const data = await r.json();
    thinking.remove();
    if (data && data.ok === false) {
      appendMsg("cat", `（连不上喵的大脑：${data.error?.code || "unknown"}）`);
      console.error("Chat error envelope:", data.error);
      holdState(400);
      return;
    }
    const reply = data.reply || "喵？";
    appendMsg("cat", reply);
    chatHistory.push({ role: "user", content: text }, { role: "assistant", content: reply });
    if (chatHistory.length > 12) chatHistory = chatHistory.slice(-12);
    if (life.asleep) wakeUp(false);
    if (data.mood === "up") life.mood = clamp01(life.mood + 0.15);
    if (data.mood === "down") life.mood = clamp01(life.mood - 0.12);
    flashReplyFace(data.mood, data.emote);
    const anim = data.animation;
    if (anim && hasClip(anim)) userPlay(anim);
    emote(data.emote || "💬");
    sayLine(reply, data.mood); // sayLine opens the VN box + ducks + speaks
    offerReplyChoices(data.choices);
    holdState(bubbleDwellMs(reply));
  } catch (e) {
    thinking.remove();
    appendMsg("cat", "（连不上服务器，喵…）");
    console.error("Chat error:", e);
    holdState(400);
  }
}

/** Passive offline fallback + the body.is-offline indicator. Called once. */
export function initChat(): void {
  bus.on(EVT.ChatError, (err: any) => {
    if (err && err.code === "network" && !navigator.onLine) {
      sayLine(OFFLINE_REPLIES[(Math.random() * OFFLINE_REPLIES.length) | 0]);
    }
  });
  const applyOnlineState = (): void => {
    document.body.classList.toggle("is-offline", !navigator.onLine);
  };
  window.addEventListener("online", applyOnlineState);
  window.addEventListener("offline", applyOnlineState);
  applyOnlineState();
  if (import.meta.env.DEV) {
    const w = window as any;
    w.__sendChat = sendChat;            // headless probe hooks
    w.__offerChoices = offerReplyChoices;
  }
}
