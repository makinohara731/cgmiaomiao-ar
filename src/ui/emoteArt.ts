/**
 * Emote glyph → hand-drawn SVG art (a cohesive custom set so mood cues read as
 * designed art, not generic emoji). Ported from main.js (_ART / EMOTE_ART). The
 * Hud emote bubble renders EMOTE_ART[glyph] (falling back to the raw glyph).
 */
import { ICON } from "./icons";

const svg = (inner: string): string => `<svg viewBox="0 0 48 48" width="58" height="58">${inner}</svg>`;

const ART: Record<string, string> = {
  heart: svg('<path d="M24 41C9.5 31 3 23 3 15.6 3 9 8 4.5 14 4.5c4.2 0 7.7 2.3 10 6 2.3-3.7 5.8-6 10-6 6 0 11 4.5 11 11.1C45 23 38.5 31 24 41Z" fill="#ff6f91"/><ellipse cx="14.5" cy="13.5" rx="4" ry="2.5" fill="#fff" opacity=".55" transform="rotate(-38 14.5 13.5)"/>'),
  spark: svg('<path d="M27 3c1.1 9.7 4.3 12.9 14 14-9.7 1.1-12.9 4.3-14 14-1.1-9.7-4.3-12.9-14-14 9.7-1.1 12.9-4.3 14-14Z" fill="#ffd23f"/><path d="M12 27c.6 5 2 6.4 7 7-5 .6-6.4 2-7 7-.6-5-2-6.4-7-7 5-.6 6.4-2 7-7Z" fill="#ffe480"/>'),
  note: svg('<ellipse cx="16" cy="35" rx="9.5" ry="7.5" fill="#5fb95e"/><rect x="22.5" y="7" width="4.2" height="30" fill="#5fb95e"/><path d="M26.7 7c8.5 2.2 11.6 7.4 9.3 15.6 1.4-6.4-3.3-9.6-9.3-10.6Z" fill="#4a9e4a"/>'),
  moon: svg('<path d="M33 5a19 19 0 1 0 11.5 33.5A15 15 0 0 1 33 5Z" fill="#f6c945"/><circle cx="30" cy="14" r="2.4" fill="#fff" opacity=".6"/><circle cx="37" cy="22" r="1.6" fill="#fff" opacity=".5"/>'),
  think: svg('<g fill="#eef3f0"><circle cx="19" cy="21" r="10.5"/><circle cx="32" cy="17" r="8.8"/><circle cx="34" cy="28" r="8.2"/><circle cx="23" cy="30" r="8.5"/></g><circle cx="13" cy="38" r="3.6" fill="#eef3f0"/><circle cx="7.5" cy="43.5" r="2.3" fill="#eef3f0"/>'),
  question: svg('<circle cx="24" cy="24" r="21" fill="#5fb95e"/><text x="24" y="35.5" font-size="31" font-weight="800" text-anchor="middle" fill="#fff" font-family="-apple-system,Segoe UI,sans-serif">?</text>'),
  fish: svg('<path d="M31 24c0-7.2-7.2-12.5-15.5-12.5-5.2 0-9.6 2-12.5 5.2 2 3 3 5.1 3 7.3s-1 4.3-3 7.3c2.9 3.2 7.3 5.2 12.5 5.2C23.8 36.5 31 31.2 31 24Z" fill="#ff9a52"/><path d="M31 24 45 14.5v19Z" fill="#ff9a52"/><circle cx="13" cy="20.5" r="2.6" fill="#fff"/><circle cx="13" cy="20.5" r="1.2" fill="#3a2a1a"/>'),
  tear: svg('<path d="M24 5C24 5 39 27 39 34.5a15 15 0 0 1-30 0C9 27 24 5 24 5Z" fill="#5ab3f0"/><ellipse cx="18" cy="30" rx="3" ry="5.2" fill="#fff" opacity=".5"/>'),
  sun: svg('<g stroke="#f6c945" stroke-width="4.2" stroke-linecap="round"><path d="M24 3v6.5M24 38.5V45M3 24h6.5M38.5 24H45M9 9l4.6 4.6M34.4 34.4 39 39M39 9l-4.6 4.6M13.6 34.4 9 39"/></g><circle cx="24" cy="24" r="11" fill="#ffd23f"/>'),
  paw: svg('<g fill="#ff8fab"><ellipse cx="24" cy="33" rx="11.5" ry="9.5"/><ellipse cx="10.5" cy="20" rx="5" ry="6.6"/><ellipse cx="19.5" cy="12.5" rx="5" ry="6.8"/><ellipse cx="28.5" cy="12.5" rx="5" ry="6.8"/><ellipse cx="37.5" cy="20" rx="5" ry="6.6"/></g>'),
  exclaim: svg('<circle cx="24" cy="24" r="21" fill="#ff8a3d"/><text x="24" y="35.5" font-size="31" font-weight="800" text-anchor="middle" fill="#fff" font-family="-apple-system,Segoe UI,sans-serif">!</text>'),
  dizzy: svg('<path d="M24 24c0-3.2 2.6-5.4 5.8-5.4 5.2 0 9.2 4.2 9.2 9.8 0 8-7 14.4-15.6 14.4C13 42.8 5 34.6 5 24 5 12 14.4 3 26.4 3c8.4 0 15.6 5 19 12.4" fill="none" stroke="#b98fe0" stroke-width="4.2" stroke-linecap="round"/>'),
};

export const EMOTE_ART: Record<string, string> = {
  "❤️": ART.heart, "💕": ART.heart, "🥺": ART.heart, "🎈": ART.heart,
  "✨": ART.spark, "🧼": ART.spark, "⤴️": ART.spark, "💨": ART.spark, "🙆": ART.spark,
  "♪": ART.note, "🌸": ART.note, "🌿": ART.note,
  "💤": ART.moon, "🥱": ART.moon,
  "💭": ART.think,
  "❓": ART.question, "👃": ART.question,
  "🍖": ART.fish, "🐟": ART.fish, "🍽️": ART.fish,
  "😿": ART.tear, "💧": ART.tear,
  "💫": ART.dizzy, "💢": ART.dizzy,
  "🌞": ART.sun,
  "❗": ART.exclaim,
  "👋": ART.paw, "🐾": ART.paw,
  "🎵": ART.note, "💥": ART.dizzy, "👀": ICON.eye, "👁": ICON.eye,
  "🌀": ICON.swirl, "☀️": ART.sun, "💚": ART.heart, "✋": ICON.hand,
  "✅": ICON.check, "😳": ICON.blush, "🤔": ART.think, "😌": ICON.smile,
  "💀": ICON.zzz, "🌟": ICON.star, "💬": ICON.chat, "💾": ICON.note,
};
