/**
 * VN surface — instantiates the kept DialogueBox + Choices ONCE (brought forward
 * from M4 so the soul layer's speech/questions are actually visible in M3). The
 * real sayLine (DialogueBox.say) is injected into feedback. TTS is added in M5;
 * the full story-beat Choices integration in M4 (the instances are already real
 * here, so M4 just wires beats on top).
 */
import { DialogueBox } from "../vn/DialogueBox";
import { Choices } from "../vn/Choices";
import { catNameDisplay } from "../stores/soul";
import { setSayImpl } from "./feedback";
import { duckBGM } from "../audio";
import { speak } from "./voice";

let dialogue: DialogueBox | null = null;
let choices: Choices | null = null;

/** Read-dwell for a line (main.js bubbleDwellMs) — ONE source for the VN box,
 *  the BGM duck and the chat catState hold. */
export const bubbleDwellMs = (s: string): number => Math.min(7000, 2200 + (s ? s.length : 0) * 180);

/** Called once from VnLayer.svelte onMount with the #choices element. */
export function initVn(choicesEl: HTMLElement): void {
  if (dialogue) return;
  dialogue = new DialogueBox({ getName: catNameDisplay });
  choices = new Choices(choicesEl);
  // The full sayLine (M5): VN box + duck the BGM under the voice + TTS.
  // speak() is async fire-and-forget (old-app behaviour).
  setSayImpl((text, mood) => {
    if (!text) return;
    const dwell = bubbleDwellMs(text);
    dialogue?.say(text, dwell);
    duckBGM(0.35, dwell);
    void speak(text, mood);
  });
  if (import.meta.env.DEV) {
    const w = window as any;
    w.__dialogue = dialogue;  // headless probe hooks (parity with main.js)
    w.__choices = choices;
  }
}

export function getDialogue(): DialogueBox | null { return dialogue; }
export function getChoices(): Choices | null { return choices; }
