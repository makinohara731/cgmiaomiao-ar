/**
 * Voice input — press-and-hold mic → MediaRecorder → /api/asr → VOICE_MAP
 * keyword dispatch (composites BEFORE single clips — "跳一下舞" must hit dance
 * before "跳"→jump), falling through to sendChat. Plus the mic level meter
 * (drives the #micBtn glow via --mic-amp) and the shout/whisper reaction.
 * Faithful port of main.js startRecording/stopRecording/sendToASR/
 * handleVoiceCommand/startMicMeter/stopMicMeter/reactToVolume + VOICE_MAP.
 */
import { isRecording } from "../stores/session";
import { ASR_ENDPOINT, CHAT_ENDPOINT } from "./endpoints";
import { sendChat } from "./chat";
import { userPlay, playComposite } from "./actions";
import { emote, sayLine, showStatus } from "./feedback";
import { flashExpression } from "./expression";
import { play } from "./runtime";
import * as audio from "../audio";

// Composites come BEFORE the single-clip fallbacks so that e.g. "跳一下舞"
// hits dance (composite) before "跳" → jump (clip). Order is load-bearing.
const VOICE_MAP: { kw: RegExp; composite?: string; anim?: string }[] = [
  { kw: /跳舞|舞蹈|来一段|秀一下/, composite: "dance" },
  { kw: /想想|想一下|你觉得|什么意思/, composite: "think" },
  { kw: /偷看|偷瞄|瞅瞅|藏哪了/, composite: "peek" },
  { kw: /喷嚏|过敏|感冒了/, composite: "sneeze" },
  { kw: /讨抱|要抱抱|可怜可怜|求你/, composite: "beg" },
  { kw: /看星星|星空|月亮|看天/, composite: "stargaze" },
  { kw: /潜伏|偷袭|抓老鼠|蹲下/, composite: "stalk" },
  { kw: /暴冲|乱跑|疯一下|发疯/, composite: "zoomies" },
  { kw: /揉揉|捏面团|踩奶/, composite: "knead" },
  { kw: /撞撞|顶顶|蹭头|蹭蹭/, composite: "headbutt" },
  { kw: /挠挠|抓抓|痒痒/, composite: "scratch" },
  { kw: /装死|倒下|装睡|演戏/, composite: "playdead" },
  // v5 atomic clips — lickpaw before the generic 舔→groom so 舔爪 wins
  { kw: /歪头|歪歪头|偏头|歪一下/, anim: "headtilt" },
  { kw: /坐下|坐好|坐一下|乖乖坐/, anim: "sit" },
  { kw: /舔爪|舔手|洗爪|舔舔/, anim: "lickpaw" },
  { kw: /扑|扑过来|扑上来|猛扑/, anim: "pounce" },
  { kw: /作揖|趴下|想玩|一起玩|邀请/, anim: "playbow" },
  // v6 galgame atomic clips (before the generic single-clip fallbacks)
  { kw: /点头|嗯嗯|好的|同意|没错/, anim: "nod" },
  { kw: /害羞|羞羞|不好意思|脸红了|害臊/, anim: "shy" },
  { kw: /思考|认真想|沉思|让我想想/, anim: "ponder" },
  { kw: /心动|好心动|小鹿乱撞|么么哒/, anim: "adore" },
  { kw: /摸头|摸摸头|拍拍头|乖乖/, anim: "headpat" },
  { kw: /走|行走|散步|过来/, anim: "walk" },
  { kw: /跑|奔跑|快点|加速/, anim: "run" },
  { kw: /打|攻击|揍|出拳|咬/, anim: "attack" },
  { kw: /疼|痛|受伤|哎呀|被打/, anim: "hurt" },
  { kw: /招手|你好|嗨|打招呼/, anim: "wave" },
  { kw: /撒娇|可爱|乖|抱抱|喜欢你|亲亲/, anim: "happy" },
  { kw: /蹦|跳一下|跳跳/, anim: "jump" },
  { kw: /转圈|转一圈|旋转/, anim: "spin" },
  { kw: /空翻|后空翻|翻跟头/, anim: "backflip" },
  { kw: /旋跳|花式|绝技/, anim: "twirl" },
  { kw: /睡|困|休息一下|晚安|睡觉/, anim: "sleep" },
  { kw: /伸懒腰|懒腰|起床|醒醒/, anim: "stretch" },
  { kw: /舔|洗脸|梳毛|理毛|打理/, anim: "groom" },
  { kw: /看看|东张西望|四处看|找一找/, anim: "lookaround" },
  { kw: /闻一闻|嗅|凑近|闻闻/, anim: "sniff" },
  { kw: /停|站好|发呆|待机|安静|别动/, anim: "idle" },
];

export function handleVoiceCommand(text: string): boolean {
  for (const entry of VOICE_MAP) {
    if (!entry.kw.test(text)) continue;
    if (entry.composite) {
      playComposite(entry.composite); // bumpInteract(0.4) + wakeForUser + composites.play
      return true;
    }
    if (entry.anim) {
      userPlay(entry.anim);
      return true;
    }
  }
  if (CHAT_ENDPOINT) void sendChat(text); // no keyword → treat it as chat
  return false;
}

// ---- recording ----
let recording = false;
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let micBtnEl: HTMLElement | null = null;

async function startRecording(): Promise<void> {
  if (!ASR_ENDPOINT) {
    showStatus("语音功能未配置，请用按钮操作", 2200);
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
    recordedChunks = [];
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      const peak = stopMicMeter();                    // peak BEFORE releasing tracks
      stream.getTracks().forEach((t) => t.stop());    // release the mic (red dot off)
      reactToVolume(peak);                            // shout/whisper reaction first
      await sendToASR(blob);
    };
    mediaRecorder.start();
    recording = true;
    isRecording.set(true);
    showStatus("正在听...", 5000);
    startMicMeter(stream);
  } catch (e) {
    console.error("Mic error:", e);
    showStatus("无法访问麦克风", 2000);
  }
}

function stopRecording(): void {
  if (mediaRecorder && recording) {
    mediaRecorder.stop();
    recording = false;
    isRecording.set(false);
  }
}

/** Wire the press-and-hold listeners onto the mic button (Hud onMount). */
export function initVoiceInput(micBtn: HTMLElement): void {
  micBtnEl = micBtn;
  if (import.meta.env.DEV) (window as any).__voice = handleVoiceCommand; // headless probe hook
  micBtn.addEventListener("touchstart", (e) => { e.preventDefault(); void startRecording(); });
  micBtn.addEventListener("touchend", (e) => { e.preventDefault(); stopRecording(); });
  micBtn.addEventListener("mousedown", () => { void startRecording(); });
  micBtn.addEventListener("mouseup", () => stopRecording());
  micBtn.addEventListener("mouseleave", () => { if (recording) stopRecording(); });
}

async function sendToASR(blob: Blob): Promise<void> {
  showStatus("识别中...", 5000);
  try {
    const fd = new FormData();
    fd.append("audio", blob, "voice.webm");
    const r = await fetch(ASR_ENDPOINT!, { method: "POST", body: fd });
    if (r.status === 429) { showStatus("请稍候再试 ♪", 1800); return; }
    const data = await r.json();
    if (data && data.ok === false) {
      console.error("ASR error envelope:", data.error);
      showStatus("识别失败：" + (data.error?.code || "unknown"), 2200);
      return;
    }
    const text = data.text || "";
    console.log("ASR text:", text);
    if (text) {
      showStatus(`你说: ${text}`, 2200);
      handleVoiceCommand(text);
    } else {
      showStatus("没听清，再说一遍", 1800);
    }
  } catch (e: any) {
    console.error("ASR error:", e);
    showStatus("识别失败：" + e.message, 2200);
  }
}

// ---- mic level meter (drives --mic-amp on the button; returns the peak) ----
let micAnalyser: AnalyserNode | null = null;
let micDataArr: Uint8Array<ArrayBuffer> | null = null;
let micRAF: number | null = null;
let micPeak = 0;
let micSampleStart = 0;

function startMicMeter(stream: MediaStream): void {
  if (micRAF) { cancelAnimationFrame(micRAF); micRAF = null; }
  try { micAnalyser?.disconnect(); } catch { /* */ }
  micAnalyser = null;
  const ctx = audio.ensureAudio(); // reuse the app's AudioContext
  const src = ctx.createMediaStreamSource(stream);
  micAnalyser = ctx.createAnalyser();
  micAnalyser.fftSize = 512;
  src.connect(micAnalyser);
  micDataArr = new Uint8Array(micAnalyser.frequencyBinCount);
  micPeak = 0;
  micSampleStart = Date.now();
  const tick = (): void => {
    if (!micAnalyser) return;
    micAnalyser.getByteTimeDomainData(micDataArr!);
    // RMS in 0..1 — silence sits at 128/255 so subtract that baseline.
    let sum = 0;
    for (let i = 0; i < micDataArr!.length; i++) {
      const v = (micDataArr![i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / micDataArr!.length);
    if (rms > micPeak) micPeak = rms;
    // Drive a CSS var so the mic button glow scales with input volume.
    micBtnEl?.style.setProperty("--mic-amp", Math.min(1, rms * 3.5).toFixed(2));
    micRAF = requestAnimationFrame(tick);
  };
  tick();
}

function stopMicMeter(): number {
  if (micRAF) { cancelAnimationFrame(micRAF); micRAF = null; }
  micBtnEl?.style.setProperty("--mic-amp", "0");
  try { micAnalyser?.disconnect(); } catch { /* */ }
  micAnalyser = null; micDataArr = null;
  const peak = micPeak;
  micPeak = 0;
  const elapsed = Date.now() - micSampleStart;
  return elapsed < 350 ? 0.5 : peak; // too-short take → treat as normal volume
}

function reactToVolume(peak: number): void {
  if (peak >= 0.55) {
    // Loud — cat flinches and complains
    emote("💥");
    play("hurt"); // bare play: immediate interrupt, bypasses the catState window
    audio.playHurt();
    flashExpression("surprise", 1600); // wide-eyed at the shout
    setTimeout(() => sayLine("好大声…吓我一跳喵！"), 600);
  } else if (peak > 0 && peak < 0.06) {
    // Whisper — cat leans in
    emote("👂");
    play("sniff");
    setTimeout(() => sayLine("嗯？你说什么呀～"), 600);
  }
  // Mid-volume: no extra reaction — handleVoiceCommand handles intent.
}
