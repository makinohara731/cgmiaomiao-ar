/**
 * User-facing feedback surfaces: emote bubble, status toast, and VN speech.
 * emote/showStatus push to the ui store (rendered by components in M3). sayLine
 * is the single speech entry — wired to the VN DialogueBox + TTS in M4/M5; a
 * no-op stub until then so callers (greeting, autonomy, story, composites) work.
 */
import { setEmote, showToast } from "../stores/ui";

export function emote(glyph: string): void {
  if (glyph) setEmote(glyph);
}

export function showStatus(msg: string, ms = 2400): void {
  showToast(msg, ms);
}

// Replaced by the real DialogueBox.say + duckBGM + speak() in M4/M5.
export function sayLine(_text: string, _mood?: string): void {
  /* M4/M5: render into the VN box + speak */
}
