/**
 * Runtime accessors — a tiny indirection so soul/* engine modules can drive the
 * cat (play a clip, check a clip, claim the busy window) without importing
 * bootstrap (which imports them → cycle). bootstrap calls setRuntime() once.
 */
import type { CatController } from "./CatController";
import type { CatStateMachine } from "../anim/CatState";
import type { CatRenderer } from "../renderer/CatRenderer";

let controller: CatController | null = null;
let state: CatStateMachine | null = null;
let renderer: CatRenderer | null = null;

export function setRuntime(c: CatController, s: CatStateMachine, r: CatRenderer): void {
  controller = c; state = s; renderer = r;
}

export const play = (name: string): void => controller?.play(name);
export const currentClip = (): string => controller?.current ?? "idle";
export const hasClip = (name: string): boolean => !!renderer?.hasClip(name);
export const isBusy = (now?: number): boolean => controller?.isBusy(now) ?? false;
export const currentDuration = (): number => renderer?.currentDuration() ?? 1.2;
export const enterState = (s: string, ms: number): void => { state?.enter(s as any, ms); };
export const holdState = (ms: number): void => { state?.hold(ms); };
export const setOrientation = (yaw: number, pitch: number): void => renderer?.setOrientation(yaw, pitch);
export const interactionTarget = (): HTMLElement | null => renderer?.getInteractionTarget() ?? null;
/** The live renderer instance (engine/ar.ts narrows it to ThreeCatRenderer for AR). */
export const rendererInstance = (): CatRenderer | null => renderer;
