/**
 * Clip → emote-glyph mapping (ported from main.js EMOTE_FOR). The glyph→SVG art
 * map (EMOTE_ART) that renders the bubble is added with the emote-bubble
 * component in M3; this is just the per-clip cue used by userPlay + autonomy.
 */
export const EMOTE_FOR: Record<string, string> = {
  lookaround: "❓", groom: "🧼", stretch: "🙆", sniff: "👃",
  happy: "❤️", spin: "✨", jump: "⤴️", wave: "👋",
  walk: "🐾", run: "💨", attack: "💢", hurt: "💧",
  headtilt: "❓", sit: "·ω·", lickpaw: "🧼", pounce: "💢", playbow: "🎈",
  nod: "✅", shy: "😳", ponder: "🤔", adore: "💗", headpat: "😌",
};
