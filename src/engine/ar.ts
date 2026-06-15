/**
 * AR + camera-passthrough orchestration — faithful port of main.js (enterArMode/
 * exitArMode/enterCamMode/exitCamMode/swapCamera/AR_SEATING/makeArSession).
 *
 * Real AR (desktop three backend + camera + secure context): GreenBlobSession by
 * default, MindArSession behind ?ar=mind. renderer.enterAR() reparents the SAME
 * CatModel under the tracked anchor; the session's <video> goes behind the
 * transparent canvas as the backdrop. Everything else (autonomy/catState/
 * expressions) keeps running — AR is the same cat with a different backdrop.
 *
 * Seating flags (?sc/rx/ry/lift + green-blob ?bs/fov/depth/gk/gsm) are NaN-safe:
 * optNum → undefined (let the session default), numParam → an explicit default.
 */
import { get } from "svelte/store";
import { GreenBlobSession } from "../ar/GreenBlobSession";
import { MindArSession } from "../ar/MindArSession";
import type { ArSession } from "../ar/ArSession";
import { ThreeCatRenderer } from "../renderer/ThreeCatRenderer";
import type { EnterArOpts } from "../renderer/ThreeCatRenderer";
import { canActivateAR } from "../renderer/capabilities";
import { rendererInstance } from "./runtime";
import { arMode, camMode } from "../stores/session";
import { emote, sayLine, showStatus } from "./feedback";
import { bumpInteract } from "./soul/life";
import { setScreenCenterFn } from "./face-toward";
import { setArHintFlavor, showArHint, hideArHint, hideArCaption, showArCaption } from "./ar-overlay";
import { initVision, startVisionLoop, stopVisionLoop, setVisionSource } from "./vision";
import { pickFrom } from "./util";
import * as hints from "../hints";
import * as particles from "../particles";

// ---- query flags (NaN-safe) ----
const arQuery = new URLSearchParams(typeof location !== "undefined" ? location.search : "");
const optNum = (k: string): number | undefined => {
  const v = parseFloat(arQuery.get(k) ?? "");
  return Number.isFinite(v) ? v : undefined;
};
const numParam = (k: string, def: number): number => optNum(k) ?? def;

export const useMindAr = arQuery.get("ar") === "mind";

/** Mount transform on the tracked anchor. Green-blob: upright 3/4 view, size
 *  comes from the session's baseScale (mount scale stays 1). MindAR: stood up
 *  +90° onto the flat card. rotXDeg also drives the contact-shadow visibility
 *  inside renderer.enterAR (|rotX|>45 keeps it). */
export const AR_SEATING: EnterArOpts = useMindAr
  ? { scale: numParam("sc", 0.5), rotXDeg: numParam("rx", 90), rotYDeg: numParam("ry", 0), lift: numParam("lift", 0) }
  : { scale: numParam("sc", 1), rotXDeg: numParam("rx", 0), rotYDeg: numParam("ry", 22), lift: numParam("lift", 0) };

function makeArSession(): ArSession {
  if (useMindAr) return new MindArSession();
  return new GreenBlobSession({
    fovDeg: optNum("fov"), depth: optNum("depth"), sizeK: optNum("gk"),
    smooth: optNum("gsm"), baseScale: optNum("bs"),
  });
}

function threeRenderer(): ThreeCatRenderer | null {
  const r = rendererInstance();
  return r instanceof ThreeCatRenderer ? r : null;
}

/** Real AR needs the three backend + WebGL + camera + secure context. */
export const arCapable = (): boolean => !!threeRenderer() && canActivateAR();

let arSession: ArSession | null = null;
export function currentArSession(): ArSession | null { return arSession; }

const sceneEl = (): HTMLElement | null => document.getElementById("scene");
const catCanvasEl = (): HTMLElement | null => document.getElementById("catCanvas");
const camFeedEl = (): HTMLVideoElement | null => document.getElementById("camFeed") as HTMLVideoElement | null;
const modelViewerEl = (): HTMLElement | null => document.getElementById("catModel");

// ---- AR live scaling (pinch / wheel): the placement-UX fix for "model too
// small". Both call the session's nudgeScale (persisted), only while in AR, and
// only on a backend that supports it (green-blob; MindAR omits it). ----
let pinchDist = 0;
function scaleToast(k: number): void {
  // Tell the user when a pinch/wheel hit the clamp (SCALE_MIN/MAX in the session)
  // instead of silently doing nothing.
  if (k >= 2.98) showStatus("已经最大啦～", 1000);
  else if (k <= 0.42) showStatus("不能再小啦～", 1000);
  else showStatus(`大小 ${k.toFixed(1)}×`, 1000);
}
function onArWheel(e: WheelEvent): void {
  if (!get(arMode) || typeof arSession?.nudgeScale !== "function") return;
  e.preventDefault();
  scaleToast(arSession.nudgeScale(e.deltaY < 0 ? 1.08 : 1 / 1.08));
}
function onArTouchMove(e: TouchEvent): void {
  if (!get(arMode) || e.touches.length !== 2 || typeof arSession?.nudgeScale !== "function") return;
  e.preventDefault();
  const dist = Math.hypot(
    e.touches[0].clientX - e.touches[1].clientX,
    e.touches[0].clientY - e.touches[1].clientY,
  );
  if (pinchDist > 0 && Math.abs(dist / pinchDist - 1) > 0.01) scaleToast(arSession.nudgeScale(dist / pinchDist));
  pinchDist = dist;
}
function onArTouchEnd(e: TouchEvent): void { if (e.touches.length < 2) pinchDist = 0; }
function installArScaleGestures(): void {
  window.addEventListener("wheel", onArWheel, { passive: false });
  window.addEventListener("touchmove", onArTouchMove, { passive: false });
  window.addEventListener("touchend", onArTouchEnd);
  window.addEventListener("touchcancel", onArTouchEnd);
}
function removeArScaleGestures(): void {
  window.removeEventListener("wheel", onArWheel);
  window.removeEventListener("touchmove", onArTouchMove);
  window.removeEventListener("touchend", onArTouchEnd);
  window.removeEventListener("touchcancel", onArTouchEnd);
  pinchDist = 0;
}

// ---- real AR ----

export async function enterArMode(): Promise<void> {
  if (get(arMode)) return;
  const renderer = threeRenderer();
  if (!renderer) return;
  if (!arSession) {
    arSession = makeArSession();
    arSession.onFound(() => {
      hideArHint(); emote("✨"); showStatus("找到你啦，我出来咯～", 2200);
      threeRenderer()?.arLandingPop(); // ease the cat onto the surface, not flat-pop
      // sparkle ring at the cat's seat — defer a frame so screenPos is fresh.
      requestAnimationFrame(() => {
        const s = arSession as GreenBlobSession;
        const p = typeof s?.screenPos === "function" ? s.screenPos() : null;
        if (p) particles.burst("sparkle", p.x, p.y, 8);
      });
    });
    arSession.onLost(() => { showArHint(); });
  }
  showStatus("正在打开摄像头喵～", 2200);
  try {
    await renderer.enterAR(arSession, AR_SEATING);
  } catch (e: any) {
    const denied = e && (e.name === "NotAllowedError" || /denied|permission/i.test(String(e)));
    showStatus(denied ? "要允许相机权限，喵喵才能出现哦～" : "AR 打不开喵…(" + ((e && e.name) || "err") + ")", 3400);
    return;
  }
  arMode.set(true);
  document.body.classList.add("ar-mode");
  const v = arSession.video();
  const scene = sceneEl(), canvas = catCanvasEl();
  if (v && scene && canvas) { v.classList.add("ar-feed"); scene.insertBefore(v, canvas); }
  bumpInteract();
  showArHint();
  installArScaleGestures(); // wheel / two-finger pinch → resize the cat (persisted)
  if (typeof arSession.nudgeScale === "function") {
    window.setTimeout(() => { if (get(arMode)) hints.showHint("ar-resize", "嫌我太小？滚轮 / 双指捏合可以把我调大～", { anchor: "top", ttlMs: 7000 }); }, 3600);
  }
  sayLine(useMindAr
    ? pickFrom(["把卡片对准我，我就出来啦！", "喵～对准标记卡看看！"])
    : pickFrom(["给我看一块纯绿色，我就出现啦！", "喵～拿块绿色的东西对准镜头！"]));
  // Bring gesture / face / pose recognition into the real AR camera stream.
  void initVision().then(() => { if (get(arMode)) startVisionLoop(); });
}

export function exitArMode(): void {
  if (!get(arMode)) return;
  arMode.set(false);
  document.body.classList.remove("ar-mode");
  threeRenderer()?.exitAR();
  if (arSession) {
    const v = arSession.video();
    if (v && v.parentNode) v.parentNode.removeChild(v);
    if (v) v.classList.remove("ar-feed");
  }
  hideArHint();
  stopVisionLoop();
  removeArScaleGestures();
  hideArCaption();
}

// ---- camera passthrough (mobile / no real AR) ----

let camStream: MediaStream | null = null;
let camFacing: "environment" | "user" = "environment";

export async function enterCamMode(): Promise<void> {
  if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    if (!window.isSecureContext) showStatus("请用 https 网址打开才能开摄像头喵～", 3200);
    else showStatus("此设备不支持摄像头", 2400);
    return;
  }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing } }, audio: false,
    });
  } catch (e: any) {
    const msg = e && e.name === "NotFoundError"
      ? "没找到摄像头喵…"
      : "要允许相机权限，喵喵才能出现在你身边哦";
    showStatus(msg, 3200);
    return;
  }
  const camFeed = camFeedEl();
  if (camFeed) {
    camFeed.srcObject = camStream;
    try { await camFeed.play(); } catch { /* autoplay quirk */ }
  }
  camMode.set(true);
  document.body.classList.add("cam-mode");
  modelViewerEl()?.setAttribute("shadow-intensity", "0"); // a floating spirit — skip the fake ground shadow
  bumpInteract();
  emote("✨");
  sayLine(pickFrom(["喵～带我看看你那边！", "哇，这是哪里呀？", "嘿嘿，我出来啦！"]));
  void initVision().then(() => { if (get(camMode)) startVisionLoop(); });
}

export function exitCamMode(): void {
  camMode.set(false);
  document.body.classList.remove("cam-mode", "cam-front");
  camFacing = "environment";
  modelViewerEl()?.setAttribute("shadow-intensity", "0.55");
  stopVisionLoop();
  if (camStream) {
    camStream.getTracks().forEach((t) => t.stop());
    camStream = null;
  }
  const camFeed = camFeedEl();
  if (camFeed) camFeed.srcObject = null;
}

export async function swapCamera(): Promise<void> {
  if (!get(camMode) || !navigator.mediaDevices?.getUserMedia) return;
  camFacing = camFacing === "environment" ? "user" : "environment";
  if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: camFacing } }, audio: false,
    });
    const camFeed = camFeedEl();
    if (camFeed) {
      camFeed.srcObject = camStream;
      await camFeed.play().catch(() => { /* */ });
    }
    document.body.classList.toggle("cam-front", camFacing === "user");
    showStatus(camFacing === "user" ? "前置镜头：让喵喵看你 🙂" : "后置镜头", 1700);
  } catch {
    showStatus("打不开摄像头", 1800);
  }
}

/** The 📸 button's three-way flow (old-app camBtn handler). */
export function toggleCamAr(): void {
  if (arCapable()) {
    if (get(arMode)) exitArMode(); else void enterArMode();
  } else if (get(camMode)) {
    exitCamMode();
  } else {
    void enterCamMode();
  }
}

/** One-time wiring: hint flavor, vision frame source, the green-blob screen
 *  position into petting/face-toward, and the pagehide camera release. */
export function initAr(): void {
  setArHintFlavor(useMindAr);
  setVisionSource(() => {
    if (get(arMode)) return arSession?.video() ?? null;
    return camFeedEl();
  });
  // Green-blob AR: the cat sits wherever the blob is — petting hit-tests and
  // face-toward aim at its REAL screen position. (MindAR has no screenPos.)
  setScreenCenterFn(() => {
    if (!get(arMode) || useMindAr || !arSession) return null;
    const s = arSession as GreenBlobSession;
    return typeof s.screenPos === "function" ? s.screenPos() : null;
  });
  window.addEventListener("pagehide", () => {
    if (get(camMode)) exitCamMode();
    if (get(arMode)) exitArMode();
  });
  if (import.meta.env.DEV) {
    (window as any).__arDebug = {
      enter: enterArMode, exit: exitArMode, toggle: toggleCamAr,
      seating: AR_SEATING, useMindAr, caption: showArCaption,
      state: () => ({
        ar: get(arMode), cam: get(camMode), capable: arCapable(),
        camState: threeRenderer()?.cameraState() ?? null,
      }),
    };
  }
}
