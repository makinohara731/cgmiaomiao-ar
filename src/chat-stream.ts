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
//
// Resilience: the *entry-point* attempts once, and on a transient
// network failure (network error / 502 / 503 / 504 / HTTP-level abort
// before any chunk arrived) retries ONCE after a short backoff. We
// don't retry once chunks have started — the bubble already has
// half a reply on it, retrying would duplicate text.

import { bus, EVT } from "./bus";

const SSE_PREFIX = "data:";
const RETRY_DELAY_MS = 600;

// Returns true if we should retry once. We only retry when nothing was
// emitted yet (no chunks, no envelope) — otherwise the user would see
// "喵～ 喵～今天怎么样" duplicated as the second attempt re-streams.
function isRetryable(err, charsEmitted) {
  if (charsEmitted > 0) return false;
  return err.code === "network"
      || err.code === "stream_io"
      || (err.code === "http" && /\b(502|503|504)\b/.test(err.message || ""));
}

export async function streamChat(opts) {
  let charsEmitted = 0;
  const wrap = {
    ...opts,
    onText: (s) => { charsEmitted += s.length; opts.onText && opts.onText(s); },
  };
  const firstErr = await streamChatOnce(wrap);
  if (!firstErr) return;
  if (!isRetryable(firstErr, charsEmitted)) {
    bus.emit(EVT.ChatError, firstErr);
    opts.onError && opts.onError(firstErr);
    return;
  }
  console.warn("[chat-stream] transient error, retrying:", firstErr.code);
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  const secondErr = await streamChatOnce(wrap);
  if (secondErr) {
    bus.emit(EVT.ChatError, secondErr);
    opts.onError && opts.onError(secondErr);
  }
}

// One attempt — returns null on success, or an error object on failure.
async function streamChatOnce({ endpoint, body, onText, onEnvelope, onDone }) {
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "text/event-stream" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { code: "network", message: e.message };
  }
  if (resp.status === 429) {
    return { code: "rate_limit", message: "30/min cap" };
  }
  if (!resp.ok || !resp.body) {
    let msg = `HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j.error?.message || msg; } catch (_) {}
    return { code: "http", message: msg };
  }

  const reader  = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  let inlineError = null;     // a {type:"error"} frame from the server
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
          // Server-side stream error. Treat it as a failure return so the
          // caller's fallback (non-streaming POST) can engage; if any chars
          // were already emitted, streamChat() won't retry (charsEmitted>0)
          // and the partial reply is kept.
          inlineError = { code: frame.code || "server", message: frame.message || "stream error" };
          finished = true;
          break;
        } else if (frame.type === "done") {
          finished = true;
          break;
        }
      }
      if (finished) break;
    }
  } catch (e) {
    try { await reader.cancel(); } catch (_) {}     // release the socket now
    return { code: "stream_io", message: e.message };
  }
  if (inlineError) {
    try { await reader.cancel(); } catch (_) {}
    return inlineError;
  }
  bus.emit(EVT.ChatDone, null);
  onDone && onDone();
  return null;
}
