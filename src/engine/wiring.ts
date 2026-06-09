/**
 * DI wiring — replaces the top-of-main.js configure() calls. The callback bags
 * are a 1:1 port; only the implementations now read/write stores and route clip
 * calls through CatController. (audio.configure MUST run before any play*.)
 *
 * The Choices instance is wired in M4 (the real VN surface); until then a stub
 * keeps story.maybeBeat()'s `choices.isOpen()` gate working (always closed).
 */
import * as audio from "../audio";
import * as composites from "../composites";
import { story } from "../story/StoryEngine";
import type { CatController } from "./CatController";
import type { CatStateMachine } from "../anim/CatState";
import { get } from "svelte/store";
import { isMuted } from "../stores/session";
import { life, daily, catNameDisplay, stageOf } from "../stores/soul";
import { emote, sayLine } from "./feedback";
import { flashExpression } from "./expression";
import { addAffection, hasUnlock } from "./soul/life";
import { writeDiary } from "./soul/diary";

const choicesStub = {
  show: (_items: any[], _onPick: (item: any, i: number) => void, _opts?: any) => {},
  isOpen: () => false,
};

export function configureEngine(controller: CatController, state: CatStateMachine): void {
  audio.configure({ isMuted: () => get(isMuted), hasBgmUnlock: () => hasUnlock("bgm") });

  composites.configure({
    playAnim: (n: string) => controller.play(n),
    emote,
    sayLine,
    audio,
    faceToward: (yaw: number, pitch: number) => controller.faceToward(yaw, pitch),
    busyUntil: (ms: number) => { state.enter("composite", ms); },
  });

  story.configure({
    life: () => ({
      affection: life.affection,
      stage: stageOf(life.affection).name,
      catName: catNameDisplay(),
      userName: life.userName || "",
      hasUnlock,
      seenEvent: (n: string) => life.seenEvents.includes(n),
      dailyTheme: daily.theme || "",
    }),
    sayLine,
    emote,
    playAnim: (n: string) => controller.play(n),
    flashExpression,
    choices: choicesStub,
    busy: (ms: number) => state.enter("dialogue", ms),
    isBusy: () => controller.isBusy(),
    writeDiary,
    addAffection,
  });
}
