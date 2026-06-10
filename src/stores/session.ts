/**
 * Transient session/UI state — NOT persisted. Replaces the loose main.js globals
 * (modelReady, isMuted, arMode, camMode, currentExpression, …).
 */
import { writable } from "svelte/store";

export const modelReady = writable(false);
export const degraded = writable(false);     // 15s safety-net fired with no clips
export const loaderHidden = writable(false);
export const onboardActive = writable(false); // first-visit cutscene showing
export const isMuted = writable(false);
export const isRecording = writable(false);
export const arMode = writable(false);
export const camMode = writable(false);
export const currentExpression = writable<string>("open");
/** The clip currently playing — drives the anim-bar active highlight. */
export const currentClip = writable<string>("idle");
