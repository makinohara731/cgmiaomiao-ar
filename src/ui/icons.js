// Custom line-icon set — replaces ALL user-facing emoji so the UI reads as
// deliberately designed (the "太AI" complaint was emoji-on-everything + default
// fonts). One cohesive language: 24×24, currentColor, 2px round strokes, so the
// existing active-state recolours (.anim-btn.active .ic { color: var(--green) })
// just work. Extends the same hand-drawn-SVG approach already used by EMOTE_ART
// in main.js. Authored as strings + injected by mountIcons() so the markup stays
// declarative (`<i class="ic" data-icon="walk"></i>`) and main.js doesn't bloat.

// width/height in `em` so one icon scales to whatever font-size its host sets
// (anim-btn 20px, round-btn 22px, emote bubble 42px…) with no per-context CSS.
const S = (inner) =>
  '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
const dot = (x, y) => `<circle cx="${x}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`;

export const ICON = Object.freeze({
  // —— the cat itself / faces ——
  cat: S('<path d="M6 8.5 5.5 3 10 6.5"/><path d="M18 8.5 18.5 3 14 6.5"/><path d="M4.8 12a7.2 6 0 0 0 14.4 0 7.2 6 0 0 0-14.4 0Z"/>' + dot(9.5, 11) + dot(14.5, 11) + '<path d="M11 13.6q1 .8 2 0"/>'),
  smile: S('<circle cx="12" cy="12" r="9"/><path d="M8 13.5a4.5 4.5 0 0 0 8 0"/>' + dot(9, 9.5) + dot(15, 9.5)),
  blush: S('<circle cx="12" cy="12" r="9"/><path d="M9 14q3 2 6 0"/>' + dot(9, 9.5) + dot(15, 9.5) + '<path d="M6.5 13.5q.8 1.2 2 1.2" stroke="currentColor" opacity=".55"/><path d="M17.5 13.5q-.8 1.2-2 1.2" opacity=".55"/>'),
  heart: S('<path d="M12 20S4 14.5 4 9.2A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 8 2.2C20 14.5 12 20 12 20Z" fill="currentColor" stroke="none"/>'),
  check: S('<path d="M4 13l5 5L20 6"/>'),
  think: S('<path d="M3 9.5A3.5 3.5 0 0 1 7 6a4.5 4.5 0 0 1 9 .5 3.5 3.5 0 0 1-1 6.9H7A3.5 3.5 0 0 1 3 9.5Z"/>' + dot(7.5, 18) + dot(5, 21)),
  eye: S('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>'),
  star: S('<path d="M12 3l2.5 5.6L20.5 9.3l-4.3 4 1.1 6-5.3-3-5.3 3 1.1-6L3.5 9.3l6-0.7Z"/>'),
  spark: S('<path d="M12 3c.8 4.5 1.7 5.4 6 6-4.3.6-5.2 1.5-6 6-.8-4.5-1.7-5.4-6-6 4.3-.6 5.2-1.5 6-6Z" fill="currentColor" stroke="none"/><path d="M18.5 14c.4 2 .9 2.5 3 3-2.1.5-2.6 1-3 3-.4-2-.9-2.5-3-3 2.1-.5 2.6-1 3-3Z" fill="currentColor" stroke="none" opacity=".7"/>'),
  note: S('<path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>'),
  zzz: S('<path d="M5 8h6l-6 8h6"/><path d="M14 4h5l-5 6h5" opacity=".7"/>'),
  wind: S('<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h16a3 3 0 1 1-3 3"/><path d="M3 16h8a2.5 2.5 0 1 1-2.5 2.5"/>'),
  tear: S('<path d="M12 4s6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 6-11 6-11Z"/>'),
  bandage: S('<rect x="3.5" y="9.5" width="17" height="5" rx="2.5" transform="rotate(-35 12 12)"/>' + dot(10.5, 10.5) + dot(13.5, 13.5) + dot(13.5, 10.5) + dot(10.5, 13.5)),

  // —— moves ——
  paw: S('<ellipse cx="12" cy="16" rx="4.5" ry="3.7" fill="currentColor" stroke="none"/><ellipse cx="6" cy="11" rx="1.9" ry="2.6" fill="currentColor" stroke="none"/><ellipse cx="10" cy="8" rx="1.9" ry="2.7" fill="currentColor" stroke="none"/><ellipse cx="14" cy="8" rx="1.9" ry="2.7" fill="currentColor" stroke="none"/><ellipse cx="18" cy="11" rx="1.9" ry="2.6" fill="currentColor" stroke="none"/>'),
  walk: S('<path d="M3 19h4l1-3"/><path d="M11 19h4l1-3"/><path d="M19 19h2"/><path d="M6 9l2 2-1 4"/>' + dot(9, 6)),
  run: S('<circle cx="14" cy="5" r="2"/><path d="M13 8l-3 3 2 3-1 5"/><path d="M10 11l-4 1"/><path d="M12 14l4 2"/><path d="M3 9h4M2 13h3M3 17h3" opacity=".6"/>'),
  jump: S('<path d="M4 19q8-14 16 0"/><path d="M9 7l3-3 3 3"/>'),
  spin: S('<path d="M20 12a8 8 0 1 1-3-6.2"/><path d="M20 4v4h-4"/>'),
  swirl: S('<path d="M12 12m0 0a3 3 0 1 0 3 3 5 5 0 1 1-5-5 7 7 0 1 1 7 7"/>'),
  flip: S('<path d="M5 9a7 7 0 1 1 0 6"/><path d="M5 5v4h4"/><path d="M19 19v-4h-4"/>'),
  sit: S('<path d="M6 7 5 3 9 6"/><path d="M14 6 18 3 17 7"/><path d="M7 7a5 5 0 0 1 10 0v6a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3Z"/><path d="M7 19h10"/>'),
  tilt: S('<g transform="rotate(16 12 12)"><circle cx="12" cy="11" r="7"/>' + dot(9.5, 10) + dot(14.5, 10) + '<path d="M10 14q2 1.4 4 0"/></g>'),
  pounce: S('<path d="M3 17c3 0 5-1 7-4 1.5-2.2 3.5-3.5 6-3.5"/><path d="M16 7l4 2-2 4"/>' + dot(20, 17) + dot(17, 19)),
  bow: S('<path d="M5 6 5 3 8 5"/><path d="M16 5 19 3 19 6"/><path d="M6 6a6 6 0 0 1 12 0c0 5-4 7-6 7"/><path d="M5 19q7-3 14 0"/>'),
  hand: S('<path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V10m0-1V4.5a1.5 1.5 0 0 1 3 0V10m0-.5V6a1.5 1.5 0 0 1 3 0v7a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2.2L4.5 13a1.6 1.6 0 0 1 2.6-1.8L8 12"/>'),
  claw: S('<path d="M5 5c2 4 4 6 8 7M5 9c2 4 4 6 8 7M5 13c2 4 4 6 8 7"/><path d="M14 11l5-5M16 15l4-4" opacity=".7"/>'),

  // —— side bar / chrome ——
  cam: S('<path d="M3 8a2 2 0 0 1 2-2h2l1.2-1.6a1 1 0 0 1 .8-.4h6a1 1 0 0 1 .8.4L19 6h0a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><circle cx="12" cy="12.5" r="3.5"/>'),
  swap: S('<path d="M4 9a8 8 0 0 1 13-3l2 2"/><path d="M20 15A8 8 0 0 1 7 18l-2-2"/><path d="M19 4v4h-4M5 20v-4h4"/>'),
  fish: S('<path d="M3 12c3-4.5 8-6 13-6 0 0-2 3-2 6s2 6 2 6c-5 0-10-1.5-13-6Z"/><path d="M16 12l5-4v8Z"/>' + dot(7, 11)),
  mic: S('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3M9 21h6"/>'),
  chat: S('<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>' + dot(8.5, 10.5) + dot(12, 10.5) + dot(15.5, 10.5)),
  sound: S('<path d="M4 9v6h3l5 4V5L7 9Z" fill="currentColor" stroke="none"/><path d="M16 8.5a4.5 4.5 0 0 1 0 7"/><path d="M18.5 6a8 8 0 0 1 0 12" opacity=".6"/>'),
  mute: S('<path d="M4 9v6h3l5 4V5L7 9Z" fill="currentColor" stroke="none"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
  phone: S('<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>'),
  close: S('<path d="M6 6l12 12M18 6 6 18"/>'),
  sun: S('<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7"/>'),
  moon: S('<path d="M20.5 14.5A8.4 8.4 0 1 1 9.2 3.6 6.8 6.8 0 0 0 20.5 14.5Z"/>'),
  lock: S('<rect x="5" y="11" width="14" height="9" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),

  // —— brand spirit-orb (loader) — echoes the onboarding hero ——
  spirit: '<svg viewBox="0 0 120 120" width="76" height="76" aria-hidden="true">' +
    '<defs><radialGradient id="lgGlow" cx="50%" cy="44%" r="56%"><stop offset="0%" stop-color="#e9ffe6"/><stop offset="34%" stop-color="#9bf0a0"/><stop offset="70%" stop-color="#4fae5f" stop-opacity="0.45"/><stop offset="100%" stop-color="#4fae5f" stop-opacity="0"/></radialGradient></defs>' +
    '<circle cx="60" cy="62" r="50" fill="url(#lgGlow)"/><path d="M40 40 34 20 54 34Z" fill="#bff0bd"/><path d="M80 40 86 20 66 34Z" fill="#bff0bd"/>' +
    '<circle cx="60" cy="60" r="24" fill="#f2fff4"/><circle cx="52" cy="58" r="4" fill="#26331f"/><circle cx="68" cy="58" r="4" fill="#26331f"/>' +
    '<path d="M56 67q4 4 8 0" stroke="#26331f" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
});

/** Inject SVG into every `[data-icon]` under root (idempotent). Unknown names
 *  are left untouched so a typo degrades to empty, never crashes. */
export function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    const name = el.getAttribute("data-icon");
    const svg = ICON[name];
    if (svg && el.innerHTML !== svg) el.innerHTML = svg;
  });
}
