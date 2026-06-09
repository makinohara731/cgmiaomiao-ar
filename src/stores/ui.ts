/**
 * Transient view state for HUD/panels/feedback surfaces. Components subscribe;
 * the engine pushes via the helper fns. (Panels/emote/status get rendered by
 * Svelte components in M3 — for now the engine writes here harmlessly.)
 */
import { writable } from "svelte/store";

export type PanelName = "status" | "cfg" | "diary" | "memory" | "gallery" | "chat" | "qr" | null;

export const openPanel = writable<PanelName>(null);
export const animTrayOpen = writable(false);

/** Emote bubble: a glyph + a nonce so re-emitting the same glyph still re-pops. */
export const emoteGlyph = writable<{ glyph: string; nonce: number }>({ glyph: "", nonce: 0 });
let emoteNonce = 0;
export function setEmote(glyph: string): void {
  emoteGlyph.set({ glyph, nonce: ++emoteNonce });
}

/** Transient status toast. */
export const statusToast = writable<{ msg: string; until: number }>({ msg: "", until: 0 });
export function showToast(msg: string, ms = 2400): void {
  statusToast.set({ msg, until: Date.now() + ms });
}
