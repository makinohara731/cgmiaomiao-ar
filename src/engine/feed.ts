/** Feeding — restores hunger + a little mood/affection, with a happy beat. */
import { life, notifyLife } from "../stores/soul";
import { wakeUp } from "./autonomy";
import { bumpInteract, addAffection } from "./soul/life";
import { writeDiary } from "./soul/diary";
import { emote, sayLine } from "./feedback";
import { play, enterState } from "./runtime";
import * as audio from "../audio";
import { pickFrom, clamp01 } from "./util";

export function feedCat(): void {
  if (life.asleep) wakeUp(false);
  bumpInteract();
  const wasHungry = life.hunger < 0.45;
  life.hunger = clamp01(life.hunger + 0.5);
  life.mood = clamp01(life.mood + 0.12);
  addAffection(wasHungry ? 4 : 1.5);
  enterState("oneshot", 2400);
  emote("🐟");
  play("eat");
  audio.playEat();
  window.setTimeout(() => sayLine(pickFrom(wasHungry
    ? ["呜哇～太好吃了！谢谢你喵～", "嗯嗯！这个我最喜欢了！", "吃饱饱～最喜欢你了！"]
    : ["喵～虽然不太饿，还是谢谢你！", "嗯…再吃一点点也可以啦", "你对我真好喵～"])), 800);
  writeDiary(wasHungry ? "今天 ta 在我饿肚子的时候喂了我，好暖" : "ta 又给我加餐啦，嘿嘿", "feed");
  notifyLife();
}
