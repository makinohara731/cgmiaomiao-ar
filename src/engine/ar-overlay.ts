/**
 * AR overlay surfaces — the #arHint marker prompt + the #arCaption floating
 * caption. Faithful port of main.js ensureArHint/showArHint/hideArHint/
 * showArCaption: dynamically-created body-level elements toggled by class
 * (imperative on purpose — the caption's retrigger relies on the
 * remove→reflow→add transition restart, which Svelte keyed blocks don't model).
 *
 * Standalone module (no bootstrap import) so soul/bond.ts can route soulNotice
 * here without an import cycle.
 */

let useMindAr = false;
export function setArHintFlavor(mind: boolean): void { useMindAr = mind; }

let arHintEl: HTMLElement | null = null;
function ensureArHint(): HTMLElement {
  if (arHintEl) return arHintEl;
  const base = (import.meta.env && import.meta.env.BASE_URL) || "/";
  arHintEl = document.createElement("div");
  arHintEl.id = "arHint";
  arHintEl.innerHTML = useMindAr
    ? '<div class="ar-hint-card">' +
      '<img src="' + base + 'targets/miao-card.png" alt="标记卡" />' +
      "<p>把这张标记卡对准摄像头<br>用另一台手机打开它，或打印出来</p>" +
      "</div>"
    : '<div class="ar-hint-card">' +
      '<div class="ar-hint-swatch"></div>' +
      "<p>给我看一块<b>纯绿色</b><br>另一台手机开一张纯绿图对准镜头</p>" +
      "</div>";
  document.body.appendChild(arHintEl);
  return arHintEl;
}
export const showArHint = (): void => { ensureArHint().classList.add("show"); };
export const hideArHint = (): void => { if (arHintEl) arHintEl.classList.remove("show"); };

let arCaptionEl: (HTMLElement & { _t?: number }) | null = null;
export function showArCaption(text: string, ms = 3400): void {
  if (!arCaptionEl) {
    arCaptionEl = document.createElement("div");
    arCaptionEl.id = "arCaption";
    document.body.appendChild(arCaptionEl);
  }
  arCaptionEl.textContent = text;
  arCaptionEl.classList.remove("show");
  void arCaptionEl.offsetWidth; // forced reflow — restarts the transition
  arCaptionEl.classList.add("show");
  clearTimeout(arCaptionEl._t);
  arCaptionEl._t = window.setTimeout(() => arCaptionEl!.classList.remove("show"), ms);
}
export const hideArCaption = (): void => { if (arCaptionEl) arCaptionEl.classList.remove("show"); };
