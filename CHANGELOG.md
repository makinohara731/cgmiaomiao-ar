# CHANGELOG

## v5 — 5 new GLB clips + livelier idle (2026-05-29)

New baked animations (authored in animate_v2.py, exported in ACTIONS mode →
22 clips total, GLB still 0.51 MB with Draco + WebP):

- **headtilt** 🤨 — the curious "?" head-cock (anticipation pre-dip → big tilt
  → hold → return), with near-ear perk + slow tail.
- **sit** 🪑 — settles onto haunches (legs fold, body lowers, tail curls round),
  holds at the end.
- **lickpaw** 👅 — raises a paw to the face and does a few lick-bobs, then lowers.
- **pounce** 🐯 — stalk-crouch with the iconic butt-wiggle, then springs forward
  and lands.
- **playbow** 🙇 — the universal front-down "let's play" bow, holds the invite,
  pops back up with a little hop.

All five read clearly despite the rigid stub-rig (verified via Blender renders
+ in-browser model-viewer playback). Wired into CLIPS, EMOTE_FOR, VOICE_MAP
(歪头 / 坐下 / 舔爪 / 扑 / 作揖, with lickpaw ahead of the generic 舔→groom), and
the anim bar. The autonomous idle pool now draws headtilt / lickpaw / sit as
calm micro-actions and pounce / playbow when energetic, so the cat looks busy
with its own little routines between moves instead of standing still.

## v4.2 — Review-driven correctness pass (2026-05-29)

A multi-agent review (7 dimensions, every finding adversarially verified) surfaced
43 confirmed issues; this release fixes 39 of them (the rest were deliberate design
— a frozen event vocabulary + doc nits). A second adversarial pass over the diff
caught a critical regression before commit (a tap-handler teardown that swallowed
every short tap), which is also fixed here.

Critical / high:
- **ASR was non-functional.** The worker posted inline base64 to DashScope's *async
  file-transcription* REST path with `X-DashScope-Async: enable` — an inconsistent
  combination that always returned an empty PENDING task, so voice input silently
  showed "没听清". Rewired to a synchronous OpenAI-compatible ASR call
  (`qwen3-asr-flash`, inline `input_audio`). ⚠ Needs a live-key smoke test: model
  availability + whether the model accepts the browser's webm/opus container are
  documented inline as residual risk; a failure now surfaces a real error instead of
  silence.
- **Chat clobbered itself.** Streaming/non-streaming chat never claimed
  `life.busyUntil`, so the autonomous loop could fire `sayLine()` mid-stream —
  wiping the streaming bubble and starting a second, overlapping TTS. Chat now owns
  the loop for the in-flight window and releases it to a short read-tail on every
  terminal path.
- **Face-tracking never turned the cat (v4.1 regression).** Yaw was written to the
  wrong `orientation` slot; restored to the proven slot order ("0deg pitch yaw").
- **BGM self-destructed.** `startBGM`→`stopBGM(0)`'s deferred teardown read the
  shared `bgm` object after `startBGM` had installed the new nodes, stopping the new
  track. `stopBGM` now snapshots its nodes to locals first.

Medium:
- Inline SSE error frames now trigger the non-streaming fallback instead of leaving
  the cat saying "喵？".
- A quick orbit-drag no longer falls through to a stray pet/look on release.
- Composites & one-shot user actions wake the cat instead of fighting the sleep loop.
- `mem.topics` ("最近聊过…" recall) is now actually populated from chat turns
  (was read but never written — permanently dead).
- The "今天的心情" diary entry is gated to once per local day (was re-appended on
  every visibilitychange).
- Init is idempotent with a cached-GLB fast path + a degraded-mode safety-net, so the
  life engine comes up even if the model-load event is missed.

Low / nit (selected): `\uXXXX` escapes no longer leak hex digits into the streamed
bubble; SSE `[DONE]` stops the outer loop and releases the upstream reader; client
SSE retry cancels the abandoned reader; affection deltas crossing two bond bands no
longer skip the lower stage's unlock; bond-event dialogue chain is now cancelable;
`playAnim` caches the anim buttons instead of two whole-document queries per call;
the behavior loop pauses while the tab is hidden; mic-meter RAF is guarded against
double-start; "days together" uses calendar-day math; worker logs 403/429; ASR
base64 is chunked; `parseChatReply`'s fallback regex is derived from `ANIMATIONS`
(no longer drops `eat`); particle duration flows through `--ttl`; dead code removed
(`spontaneousThought`, `getAudioCtx`, `composites.names`, persona over-exports,
forbidden `Connection` SSE header).

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
