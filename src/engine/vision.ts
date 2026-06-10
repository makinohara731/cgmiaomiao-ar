/**
 * MediaPipe vision — hand gestures / face (gaze + smile) / full-body pose,
 * fed from the cam-passthrough or AR camera stream. Faithful port of main.js
 * (P2.5/P2.6): lazy runtime import() from the CDN (never enters the bundle),
 * a single RAF loop throttled to ~7-8fps that round-robins ONE model per tick
 * (per 5 ticks: 2×gesture, 2×face, 1×pose), and one SHARED cooldown across all
 * three reaction kinds. Reactions claim catState("react") unconditionally —
 * sensor reactions outrank ambient moves; the cooldown is the rate limit.
 *
 * Recognizers are NEVER close()d (old-app behaviour): exit just stops the RAF;
 * re-entering reuses the loaded models instead of re-downloading the WASM.
 */
import { get } from "svelte/store";
import { arMode, camMode } from "../stores/session";
import { life, notifyLife } from "../stores/soul";
import { addAffection } from "./soul/life";
import { emote, sayLine, showStatus } from "./feedback";
import { flashExpression } from "./expression";
import { faceTowardYaw } from "./face-toward";
import { play, enterState } from "./runtime";
import { pickFrom, clamp01 } from "./util";

// The frame sources — wired by engine/ar.ts (AR session video vs #camFeed).
let sourceFn: () => HTMLVideoElement | null = () => null;
export function setVisionSource(fn: () => HTMLVideoElement | null): void { sourceFn = fn; }

let gestureRecognizer: any = null;
let faceLandmarker: any = null;
let poseLandmarker: any = null;
let visionLoading = false;
let visionReady = false;
let visionRAF: number | null = null;
let lastVisionAt = 0;
let visionTick = 0;
let lastGestureName = "";
let visionCooldownUntil = 0;

const GESTURE_REACTION: Record<string, { anim: string; emote: string; line: string; aff?: number }> = {
  Open_Palm: { anim: "wave", emote: "👋", line: "你好呀～我也跟你招手！" },
  Thumb_Up: { anim: "happy", emote: "❤️", line: "嘿嘿，被你夸啦，好开心！", aff: 2 },
  Victory: { anim: "twirl", emote: "✨", line: "耶～看我转个圈圈！", aff: 1 },
  Closed_Fist: { anim: "jump", emote: "⤴️", line: "出拳？那我蹦一个给你看！" },
  Pointing_Up: { anim: "lookaround", emote: "❓", line: "嗯？那边有什么吗喵～" },
  ILoveYou: { anim: "happy", emote: "❤️", line: "我也最爱你啦！呼噜呼噜～", aff: 3 },
};

export async function initVision(): Promise<void> {
  if (visionReady || visionLoading) return;
  visionLoading = true;
  try {
    // Full-URL dynamic import: Vite leaves it alone, the browser fetches the
    // ESM at runtime — MediaPipe never enters the main bundle. (URL goes via a
    // variable so tsc doesn't try to resolve it as a module.)
    const VISION_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision";
    const vision: any = await import(/* @vite-ignore */ VISION_CDN);
    const { GestureRecognizer, FaceLandmarker, PoseLandmarker, FilesetResolver } = vision;
    const files = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm");
    gestureRecognizer = await GestureRecognizer.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO", numHands: 1,
    });
    faceLandmarker = await FaceLandmarker.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO", numFaces: 1, outputFaceBlendshapes: true,
    });
    // Body-pose loads separately so its failure (or a weak device) degrades to
    // gesture+face only instead of killing all vision.
    try {
      poseLandmarker = await PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO", numPoses: 1,
      });
    } catch (e) { console.warn("pose init failed (body gestures off):", e); }
    visionReady = true;
    showStatus("手势 / 表情 / 体感识别已开启", 2600);
  } catch (e) {
    console.warn("vision init failed:", e);
    showStatus("手势识别没能加载，仍可正常互动", 2800);
  }
  visionLoading = false;
}

export function startVisionLoop(): void {
  if (!visionReady || visionRAF) return;
  const loop = (): void => {
    if (!get(camMode) && !get(arMode)) { visionRAF = null; return; }
    visionRAF = requestAnimationFrame(loop);
    const now = performance.now();
    if (now - lastVisionAt < 130) return; // throttle to ~7-8 fps
    lastVisionAt = now;
    const src = sourceFn();
    if (!src || src.readyState < 2) return;
    visionTick++;
    // Round-robin ONE model per tick so adding pose doesn't raise per-frame cost.
    // Per 5 ticks: 2×gesture, 2×face, 1×pose (~1.6 Hz) — pose is the heaviest.
    // slot 4 with pose unavailable falls through to gesture (4%2===0), giving
    // 3×gesture/2×face on pose-less devices — identical to old main.js.
    const slot = visionTick % 5;
    try {
      if (slot === 4 && poseLandmarker) {
        handlePose(poseLandmarker.detectForVideo(src, now));
      } else if (slot % 2 === 0) {
        handleGestures(gestureRecognizer.recognizeForVideo(src, now));
      } else {
        handleFace(faceLandmarker.detectForVideo(src, now));
      }
    } catch { /* a dropped frame — ignore */ }
  };
  visionRAF = requestAnimationFrame(loop);
}

/** Stop the loop (cam/AR exit). Recognizers stay loaded for the next entry. */
export function stopVisionLoop(): void {
  if (visionRAF) { cancelAnimationFrame(visionRAF); visionRAF = null; }
  lastGestureName = "";
}

function handleGestures(result: any): void {
  if (!result || !result.gestures || !result.gestures.length) {
    lastGestureName = "";
    return;
  }
  const top = result.gestures[0][0];
  if (!top || top.categoryName === "None" || top.score < 0.55) {
    lastGestureName = "";
    return;
  }
  const name = top.categoryName;
  if (name === lastGestureName) return; // same gesture still held
  lastGestureName = name;
  if (Date.now() < visionCooldownUntil) return;
  const r = GESTURE_REACTION[name];
  if (!r) return;
  visionCooldownUntil = Date.now() + 3000;
  enterState("react", 2200);
  life.lastInteract = Date.now();
  if (r.aff) addAffection(r.aff);
  emote(r.emote);
  play(r.anim);
  sayLine(r.line);
}

function handleFace(result: any): void {
  if (!result) return;
  // ---- Eye tracking: turn the cat's whole body to face the user ----
  if (result.faceLandmarks && result.faceLandmarks.length) {
    const lm = result.faceLandmarks[0];
    let sx = 0;
    for (const p of lm) sx += p.x;
    const cx = sx / lm.length; // 0..1, face centre X in the image
    faceTowardYaw(Math.max(-30, Math.min(30, (cx - 0.5) * 56)), 1600);
  }
  // ---- Smile detection ----
  if (result.faceBlendshapes && result.faceBlendshapes.length) {
    let smile = 0;
    for (const c of result.faceBlendshapes[0].categories) {
      if (c.categoryName === "mouthSmileLeft" || c.categoryName === "mouthSmileRight") {
        smile = Math.max(smile, c.score);
      }
    }
    if (smile > 0.45 && Date.now() >= visionCooldownUntil) {
      visionCooldownUntil = Date.now() + 5000;
      enterState("react", 2000);
      life.lastInteract = Date.now();
      addAffection(1.5);
      life.mood = clamp01(life.mood + 0.12);
      notifyLife();
      emote("❤️");
      play("happy");
      flashExpression("love", 2200); // heart eyes when you smile at it
      sayLine(pickFrom(["你笑起来真好看喵～", "看到你笑我也好开心！", "嘿嘿，对着我笑啦～"]));
    }
  }
}

let poseHist: number[] = [];
function handlePose(result: any): void {
  const lms = result && result.landmarks && result.landmarks[0];
  if (!lms || lms.length < 25) { poseHist = []; return; }
  const lsh = lms[11], rsh = lms[12], lw = lms[15], rw = lms[16], lh = lms[23], rh = lms[24];
  if (!lsh || !rsh || !lw || !rw) return;
  // torso vertical span grows as the user leans in / approaches the lens
  if (lh && rh) {
    const span = Math.abs((lh.y + rh.y) / 2 - (lsh.y + rsh.y) / 2);
    poseHist.push(span);
    if (poseHist.length > 6) poseHist.shift();
  }
  if (Date.now() < visionCooldownUntil) return;
  const fire = (anim: string, em: string, line: string, aff?: number, fx?: string): void => {
    visionCooldownUntil = Date.now() + 3500;
    enterState("react", 2200);
    life.lastInteract = Date.now();
    if (aff) addAffection(aff);
    emote(em);
    play(anim);
    if (fx) flashExpression(fx, 2200);
    sayLine(line);
  };
  const armsUp = lw.y < lsh.y - 0.04 && rw.y < rsh.y - 0.04; // both wrists above shoulders
  const tPose = Math.abs(lw.y - lsh.y) < 0.13 && Math.abs(rw.y - rsh.y) < 0.13 &&
    Math.abs(lw.x - lsh.x) > 0.17 && Math.abs(rw.x - rsh.x) > 0.17; // wrists out at shoulder height
  const leanedIn = poseHist.length >= 5 && poseHist[poseHist.length - 1] > poseHist[0] * 1.3;
  if (tPose) {
    fire("twirl", "✨", "张开手臂～看我转个圈！", 1);
  } else if (armsUp) {
    fire("jump", "⤴️", "哇，举高高！我也跳一个！", 2);
  } else if (leanedIn) {
    poseHist = []; // reset so it fires once per approach
    fire("happy", "❤️", "你靠近啦，让我好好看看你～", 1, "love");
  }
}
