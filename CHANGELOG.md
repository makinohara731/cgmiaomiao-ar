# CHANGELOG

## v3 — Soul layer (2026-05-29)

The cat went from a button-driven puppet with reactive chat to a small life with its own inner state and voice. Headline changes:

- **Naming ceremony.** The first-run flow asks for a name; it's persisted in `life.catName` and surfaces in the status panel header and every LLM call (worker `describeState` builds an Identity block).
- **Long-term memory.** Cheap client-side regex mines user disclosures (`我喜欢X`, `我不喜欢X`, `我叫X`) on every user turn into a 12-entry fact store. `buildMemoryBlock()` packs them into ≤180 chars and the worker splices that into the system prompt as 【你对 ta 的记忆】. User nicknames feed back into the Identity block.
- **Proactive speech engine.** The autonomous loop now picks lines from four pools — memory recall / time-of-day / bond-stage monologue / random self-narration — and self-throttles at 90s gap, 4/hour. The cat speaks first, not only when spoken to.
- **Daily mood + diary.** One theme per local day biases `life.mood` once on load and shows up in the status panel + LLM prompt. A 14-entry diary logs bond promotions, feedings, dream lines, and a daily "今日心情" entry; opened from a new 📖 button in the status panel.
- **Narrative onboarding cutscene.** Four beats: 🌙 a small soul drifting → 🐾 it follows the light → 😺 it sees you → 你想叫我什么呢. Star field, fade transitions, palette shift from cosmic blue to warm green at the naming beat.
- **Bond-stage unlocks.** Each stage now grants a tangible gift on top of the dialogue: 熟悉 unlocks the BGM toggle, 亲近 starts dream-diary entries, 黏人 opens a nickname prompt, 形影不离 reveals a "永远的朋友" keepsake badge. Bond chip shimmers on each unlock.
- **Generative BGM + richer SFX.** Day/night chord pads via Web Audio (no mp3 dependency), low-pass + tremolo, master ~0.06; `duckBGM()` dips during speech. New SFX: `playSparkle` (unlock), `playEat` (feed), `playPurrLong` (10+ tap streak).
- **Deeper persona.** Worker `CAT_PERSONA` grew a 3-line backstory, IRON RULE on the 30-char reply limit, and four few-shot exchanges; a single-shot retry triggers if reply > 50 chars.
- **Production polish.** Worker logs as JSON per request, in-memory 30-req/min/IP rate limit, CORS locked to Pages + local dev origins. Client gains a global error boundary toast so a stray exception doesn't wipe the UI.
