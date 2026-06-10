/**
 * Bootstrap — the rebuilt replacement for the top of main.js. Scene.svelte calls
 * start() in onMount with the DOM mount points; this owns renderer creation, the
 * idempotent onModelLoaded funnel (load event + cached fast path + 15s safety net
 * + degraded no-clips mode), the DI wiring, and kicking off the life loop.
 */
import { createRenderer } from "../renderer/RendererFactory";
import type { CatRenderer } from "../renderer/CatRenderer";
import { CatStateMachine } from "../anim/CatState";
import { CatController } from "../engine/CatController";
import { isLoopClip, baseAnim } from "../engine/clips";
import { configureEngine } from "../engine/wiring";
import { initAutonomy, setModelReady, scheduleBehavior } from "../engine/autonomy";
import { initFirstGesture } from "../engine/device";
import { startTimeOfDay, timeBucket } from "../engine/time-of-day";
import { installPersistence, loadLife, loadMem, loadDiary, loadDaily, loadCfg } from "../engine/persistence";
import { initExpression, setEyes, flashExpression } from "../engine/expression";
import { initActions } from "../engine/actions";
import { initChat } from "../engine/chat";
import { initAr } from "../engine/ar";
import { setRuntime } from "../engine/runtime";
import { installBond, applyUnlocksOnLoad } from "../engine/soul/bond";
import { dailyRoll } from "../engine/soul/daily";
import { installPetting } from "../engine/petting";
import "../engine/soul/naming"; // side-effect: hands openNicknameDialog to bond
import { emote, showStatus, sayLine } from "../engine/feedback";
import { pickFrom } from "../engine/util";
import * as audio from "../audio";
import { bus, EVT } from "../bus";
import { life, notifyLife } from "../stores/soul";
import { modelReady, loaderHidden, degraded, currentClip, onboardActive } from "../stores/session";
import { story } from "../story/StoryEngine";
import * as saves from "../story/saves";

export const ONBOARD_KEY = "miaomiao.onboarded.v1";

let renderer: CatRenderer;
let controller: CatController;
let state: CatStateMachine;
let initDone = false;

const TIME_GREET: Record<string, string[]> = {
  morning: ["早上好喵～", "早安！今天也要一起呀", "唔…早晨的阳光暖暖的呢"],
  afternoon: ["喵～你来啦！", "下午好呀～", "嗨！今天想玩点什么？"],
  evening: ["晚上好喵～", "天快黑了你才来呀", "今天过得开心吗？"],
  night: ["这么晚还来呀，喵～", "夜深啦…我有点困了", "嘘…小声点，喵咕～"],
};

/** Construct the renderer + engine and wire the load lifecycle. */
export function start(opts: { modelViewer: HTMLElement; canvas: HTMLCanvasElement }): void {
  const r = createRenderer({
    modelViewer: opts.modelViewer as any,
    canvas: opts.canvas,
    onReady: onModelLoaded,
    onError,
  });
  renderer = r.renderer;
  document.body.classList.add("renderer-" + r.backend);

  // Dev hooks for the headless probes (parity with the legacy app + smoke harness).
  if (import.meta.env.DEV) {
    const w = window as any;
    w.__r = renderer;
    w.__play = (name: string, _loop = false) => controller.play(name);
    w.__story = story;   // headless P4/M4 checks (parity with main.js)
    w.__saves = saves;
    w.__busy = () => controller.isBusy(); // M5: catState-window release checks
  }

  state = new CatStateMachine();
  controller = new CatController({
    renderer, state, isLoopClip, baseClip: baseAnim, onAnimPlayed,
  });
  initAutonomy(controller);
  initActions(controller, state);
  setRuntime(controller, state, renderer);   // soul/* modules drive the cat via this
  installBond();                              // addAffection fires bond events
  configureEngine(controller, state);
  installPetting(renderer.getInteractionTarget()); // tap = pet, long-press, empty-tap = look
  initFirstGesture();
  startTimeOfDay();
  installPersistence();
  initChat(); // offline fallback listener + body.is-offline + DEV hooks
  initAr();   // AR hint flavor + vision source + screenPos seam + pagehide release

  // model-viewer drives its own load event; wire it + the cached fast path
  // (the three backend funnels through onReady). Both are idempotent.
  const mv = opts.modelViewer as any;
  mv.addEventListener?.("load", onModelLoaded, { once: true });
  if (mv.loaded) onModelLoaded();

  // 15s safety net: hide the loader; if still not ready, run degraded.
  window.setTimeout(() => {
    loaderHidden.set(true);
    if (!initDone) { degraded.set(true); onModelLoaded(); }
  }, 15000);
}

/** Expose for components that need to drive the cat (anim bar, petting — M2/M3). */
export function getController(): CatController { return controller; }
export function getRenderer(): CatRenderer { return renderer; }

function onError(): void {
  loaderHidden.set(true);
  showStatus("模型加载失败，请刷新重试", 4000);
}

function onModelLoaded(): void {
  if (initDone) return;
  initDone = true;
  modelReady.set(true);
  setModelReady(true);
  controller.attach();             // wire the mixer 'finished' listener — return-to-idle source
  loadLife();                      // restore needs/affection/sleep
  loadMem();
  loadDiary();
  loadDaily();
  loadCfg();
  dailyRoll();                     // pick today's mood theme (idempotent within a day)
  applyUnlocksOnLoad();            // re-reveal unlocked keepsakes
  story.load();                    // load story state vs restored life
  notifyLife();
  initExpression(renderer);        // M2: faces + blink loop
  // eslint-disable-next-line no-console
  console.log("Model loaded. Clips:", renderer.getClips());
  loaderHidden.set(true);
  // First visit → the 4-beat onboarding cutscene; otherwise greet after 700ms.
  // scheduleBehavior runs unconditionally either way (old-app behaviour: the
  // ambient loop ticks behind the z-1000 overlay, invisible until it closes).
  if (!localStorage.getItem(ONBOARD_KEY)) onboardActive.set(true);
  else setTimeout(doGreeting, 700);
  scheduleBehavior();              // start the autonomous life loop
}

function onAnimPlayed(name: string, loop: boolean): void {
  // Per-clip SFX + expression pairing (ported from main.js playAnim). Fires for
  // BOTH user and autonomy plays — so e.g. an ambient `shy` still blushes.
  if (name === "attack") audio.playHit();
  if (name === "hurt") { audio.playHurt(); flashExpression("sad", 1900); }
  if (name === "happy") { audio.playTrill(); flashExpression("happy", 1900); }
  if (name === "shy") flashExpression("blush", 2000);
  if (name === "ponder") flashExpression("think", 2200);
  if (name === "adore") { audio.playTrill(); flashExpression(life.affection >= 60 ? "blush" : "love", 2200); }
  if (name === "headpat") flashExpression("happy", 1900);
  currentClip.set(name);           // anim-bar active highlight
  bus.emit(EVT.AnimPlayed, { name, loop });
}

/** Exported for Onboarding.svelte's already-named branch (old-app parity). */
export function doGreeting(): void {
  if (life.asleep) {
    emote("💤"); setEyes(true);
    showStatus("喵喵在打盹… 戳一下叫醒它", 2800);
    controller.play("sleep");
    return;
  }
  const t = timeBucket();
  if (life.mood > 0.72) {
    emote("❤️"); controller.play("happy"); sayLine(pickFrom(TIME_GREET[t]));
  } else if (life.mood < 0.34) {
    emote("…"); controller.play("lookaround");
    sayLine(pickFrom(["喵…你去哪儿了呀…", "我等你好久了啦…", "哼，才想起我呀…"]));
  } else {
    emote("👋"); controller.play("wave"); sayLine(pickFrom(TIME_GREET[t]));
  }
}
