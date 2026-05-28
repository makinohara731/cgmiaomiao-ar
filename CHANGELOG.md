# CHANGELOG

## v4.1 — Deeper AR + reactive interactions (2026-05-29)

A follow-up pass on top of v4. Same architecture, more behaviour.

- **2-axis face tracking.** `faceToward(clientX, clientY?)` now drives
  both yaw (±32°) and pitch (±14°) via model-viewer's `orientation`
  attribute. The cat actually tilts UP toward sky taps and DOWN toward
  floor taps — much stronger "looks at you" feel in AR. Vision face
  tracking (front camera) still drives yaw only since user-face yaw is
  what we can detect reliably.
- **SSE one-shot reconnect.** `streamChat` wraps a single attempt and
  retries ONCE on transient errors (network / stream_io / HTTP 5xx)
  after 600ms — but only when zero reply chars were emitted, so the
  retry never duplicates text on the bubble.
- **Offline UX.** `body.is-offline` flips on `navigator.onLine` events
  to add a "离线" pill next to the bond chip and desaturate it. When
  fully offline the cat says a quiet stored line ("嗯…今天有点安静呢
  喵～") so the bubble still feels alive.
- **Hint chip system.** `src/hints.js` shows one-time gesture tips,
  persisted in `miaomiao.hints.v1`. Wired reactively from bus events:
  long-press hint at 8s, tap-empty hint at 18s, composite-bar hint on
  the 2nd user-driven anim, bond-chip hint 4.5s after first unlock.
  Dark pill UI, anchored top or bottom.
- **6 more composite actions.** stalk 👁, zoomies 🌀, knead 🐾,
  headbutt 💚, scratch ✋, playdead 💀 — choreographed atop existing
  clips. Voice keywords + 6 new anim-bar buttons. Library is now 12
  composites in addition to the 17 atomic clips.
- **Mic volume reactor.** AnalyserNode samples mic RMS per RAF while
  recording. Live `--mic-amp` CSS var scales the mic button's glow
  ring. After the take, peak volume classifies the recording: shout
  (≥0.55) → cat flinches + plays hurt; whisper (<0.06) → cat sniffs
  and leans in. Mid-volume passes through to the normal voice-command
  path unchanged.

## v4 — Architecture + streaming + AR touch (2026-05-29)

The release after v3 is an architecture pass — everything that was
"shippable as a feature" got pulled into proper modules, and a few new
interactions ride on top of the cleaner layout.

- **Worker modularization.** `worker/src/worker.js` shrank from 425 LoC
  to a routing stub. Logic moved into `handlers/` (asr / chat /
  chat-stream / tts), `services/` (dashscope / persona), `middleware/`
  (cors / rate-limit / log), and `util/` (response / json). Response
  envelope is now strict: `{ok:true,...}` or `{ok:false,error:{code,
  message,status}}`.
- **Streaming chat.** New `/api/chat-stream` SSE endpoint. The worker
  walks Qwen's deltas through `ReplyTextExtractor` and emits only the
  characters inside the JSON `"reply"` value — the client's bubble
  fills char-by-char instead of waiting for the closing brace. At
  stream end the server re-parses the assembled JSON and emits a
  single clean `{envelope}` frame for animation/emote/mood. Client
  falls back to the non-streaming endpoint on any error.
- **Frontend ES module migration.** `<script type="module" src="main.js">`.
  New `src/bus.js` (tiny pub/sub with a frozen `EVT` enum), `src/audio.js`
  (~310 LoC pulled out — all SFX + generative BGM, configured via
  callbacks so it doesn't reach into globals), `src/chat-stream.js`,
  `src/particles.js`, `src/composites.js`. `<link rel="modulepreload">`
  for each in the HTML head so they fetch in parallel with the GLB.
- **AR touch.** The single `click` handler on `<model-viewer>` became
  a pointer-state machine: short tap on the cat is a single pet, long
  press (≥350ms) is continuous petting with faster escalation, tap on
  empty space makes the cat look toward it with a curious ❓ + chirp.
  A pointer drag of >14px cancels the long-press so orbiting still
  works.
- **Particle layer.** `#particleLayer` floats DOM glyphs (♥/✦/💤) on
  CSS keyframes. Wired so each pet event bursts hearts at the tap
  position; bond unlocks burst sparkles from screen center.
- **6 composite actions.** No Blender rerun: `dance`, `think`, `peek`,
  `sneeze`, `beg`, `stargaze` are choreographed sequences of existing
  clips + emotes + audio. Added to VOICE_MAP keywords and as 6 new
  buttons in the anim bar (marked with a tiny ✦ corner badge).
- **Performance.** Periodic `saveLife` runs on `requestIdleCallback`
  with a setTimeout fallback for Safari. Pagehide stays synchronous
  for state durability. `<link rel="preload">` for the GLB. SW v8
  caches the new module files, bypasses `/api/*` so it doesn't break
  SSE.

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
