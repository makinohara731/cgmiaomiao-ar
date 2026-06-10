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

let dialogue: DialogueBox | null = null;
let choices: Choices | null = null;

/** Called once from VnLayer.svelte onMount with the #choices element. */
export function initVn(choicesEl: HTMLElement): void {
  if (dialogue) return;
  dialogue = new DialogueBox({ getName: catNameDisplay });
  choices = new Choices(choicesEl);
  setSayImpl((text) => dialogue?.say(text));
  if (import.meta.env.DEV) {
    const w = window as any;
    w.__dialogue = dialogue;  // headless probe hooks (parity with main.js)
    w.__choices = choices;
  }
}

export function getDialogue(): DialogueBox | null { return dialogue; }
export function getChoices(): Choices | null { return choices; }
