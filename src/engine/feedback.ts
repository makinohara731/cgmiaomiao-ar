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

// sayLine is the single speech entry. The real implementation (DialogueBox.say
// + duckBGM + TTS) is injected by engine/vn.ts via setSayImpl — kept injectable
// so the many soul modules can `import { sayLine }` without a cycle through vn.
let sayImpl: (text: string, mood?: string) => void = () => {};
export function setSayImpl(fn: (text: string, mood?: string) => void): void { sayImpl = fn; }
export function sayLine(text: string, mood?: string): void { sayImpl(text, mood); }
