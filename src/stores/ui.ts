/**
 * Transient view state for HUD / panels / feedback surfaces. The engine pushes
 * via the helpers; components subscribe. Emote + toast auto-clear on a timer (the
 * old main.js set textContent + a reflow-restart; here a nonce re-triggers the
 * CSS pop and a timer hides it).
 */
import { writable } from "svelte/store";

export type PanelName = "status" | "cfg" | "diary" | "memory" | "gallery" | "chat" | "qr" | null;

export const openPanel = writable<PanelName>(null);
export const animTrayOpen = writable(false);
// The chat panel slides independently of the modal panels (old-app semantics:
// #chatPanel.hidden is its own toggle, can overlap the status panel).
export const chatOpen = writable(false);

// Emote bubble.
export const emoteGlyph = writable<{ glyph: string; nonce: number }>({ glyph: "", nonce: 0 });
let emoteNonce = 0;
let emoteTimer: number | undefined;
export function setEmote(glyph: string): void {
  emoteGlyph.set({ glyph, nonce: ++emoteNonce });
  clearTimeout(emoteTimer);
  emoteTimer = window.setTimeout(() => emoteGlyph.set({ glyph: "", nonce: ++emoteNonce }), 2200);
}

// Status toast.
export const statusToast = writable<{ msg: string; nonce: number }>({ msg: "", nonce: 0 });
let toastNonce = 0;
let toastTimer: number | undefined;
export function showToast(msg: string, ms = 2400): void {
  statusToast.set({ msg, nonce: ++toastNonce });
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => statusToast.set({ msg: "", nonce: ++toastNonce }), ms);
}
