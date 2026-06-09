/**
 * Naming — sanitize + apply the cat's name; the nickname dialog (用户昵称 unlock).
 * Ported from main.js (sanitizeName / applyNaming / openNicknameDialog).
 */
import { life, notifyLife } from "../../stores/soul";
import { emote, sayLine } from "../feedback";
import { saveLife } from "../persistence";
import { writeDiary } from "./diary";
import { enterState, holdState } from "../runtime";
import { getChoices } from "../vn";
import { setNicknameDialog } from "./bond";

export function sanitizeName(raw: string): string {
  if (typeof raw !== "string") return "";
  let s = raw.replace(/[ -<>"'`\\\n\r\t]/g, "").trim();
  const arr = Array.from(s);
  if (arr.length > 6) s = arr.slice(0, 6).join("");
  return s;
}

/** Persist the cat's name (empty = use default 喵喵) + a warm beat. */
export function applyNaming(rawName: string): void {
  const name = sanitizeName(rawName);
  life.catName = name;
  saveLife();
  notifyLife();
  if (name) { sayLine(`好哒～从今天起我就叫${name}啦`); emote("❤️"); }
  else { sayLine("那就还叫我喵喵吧～"); emote("✨"); }
}

export function openNicknameDialog(): void {
  const choices = getChoices();
  if (!choices) return;
  emote("✨");
  sayLine("我想给你一个专属的称呼～你想让我叫你什么呢？");
  enterState("dialogue", 60000);
  choices.showInput(
    { placeholder: "想被我怎么叫～", maxLength: 6, submitLabel: "就这样叫我吧" },
    (value: string) => {
      const n = sanitizeName(value || "");
      if (n) {
        life.userName = n;
        saveLife();
        sayLine(`${n}！这下就是我们之间的小秘密啦～`);
        emote("❤️");
        writeDiary(`从今天起我会叫 ta「${n}」`, "bond");
      } else {
        sayLine("嗯…那我先这样叫你吧～");
      }
      holdState(1200);
    }
  );
}

// Hand the nickname dialog to bond.ts (the 黏人 unlock opens it) without a cycle.
setNicknameDialog(openNicknameDialog);
