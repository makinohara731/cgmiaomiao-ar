// SSE chat client. Reads /api/chat-stream frame-by-frame and surfaces
// each kind of event via callbacks AND on the global bus.
//
// Usage:
//   streamChat({
//     endpoint, body,
//     onText:     (s)   => bubble += s,    // each batched reply chunk
//     onEnvelope: (env) => playAnim(env.animation),
//     onDone:     ()    => speak(fullReply),
//     onError:    (err) => showStatus(...),
//   });

import { bus, EVT } from "./bus.js";

const SSE_PREFIX = "data:";

export async function streamChat({ endpoint, body, onText, onEnvelope, onDone, onError }) {
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = { code: "network", message: e.message };
    bus.emit(EVT.ChatError, err);
    onError && onError(err);
    return;
  }
  if (resp.status === 429) {
    const err = { code: "rate_limit", message: "30/min cap" };
    bus.emit(EVT.ChatError, err);
    onError && onError(err);
    return;
  }
  if (!resp.ok || !resp.body) {
    let msg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j.error?.message || msg; } catch (_) {}
    const err = { code: "http", message: msg };
    bus.emit(EVT.ChatError, err);
    onError && onError(err);
    return;
  }

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith(SSE_PREFIX)) continue;
        const data = line.slice(SSE_PREFIX.length).trim();
        if (!data) continue;
        let frame;
        try { frame = JSON.parse(data); }
        catch (_) { continue; }
        if (frame.type === "text") {
          bus.emit(EVT.ChatChunk, { delta: frame.content });
          onText && onText(frame.content);
        } else if (frame.type === "envelope") {
          bus.emit(EVT.ChatEnvelope, frame);
          onEnvelope && onEnvelope(frame);
        } else if (frame.type === "error") {
          bus.emit(EVT.ChatError, frame);
          onError && onError(frame);
        } else if (frame.type === "done") {
          finished = true;
          break;
        }
      }
      if (finished) break;
    }
  } catch (e) {
    const err = { code: "stream_io", message: e.message };
    bus.emit(EVT.ChatError, err);
    onError && onError(err);
    return;
  }
  bus.emit(EVT.ChatDone, null);
  onDone && onDone();
}
