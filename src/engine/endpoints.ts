/**
 * Worker API endpoints (ported verbatim from main.js). WORKER_URL can be
 * cleared to "" to disable the backend — every endpoint then reads null and
 * the callers degrade (offline replies / browser TTS / no ASR).
 */
export const WORKER_URL = "https://cgmiaomiao-asr.makinohara20050410.workers.dev";

export const ASR_ENDPOINT = WORKER_URL ? `${WORKER_URL}/api/asr` : null;
export const CHAT_ENDPOINT = WORKER_URL ? `${WORKER_URL}/api/chat` : null;
export const CHAT_STREAM_ENDPOINT = WORKER_URL ? `${WORKER_URL}/api/chat-stream` : null;
export const TTS_ENDPOINT = WORKER_URL ? `${WORKER_URL}/api/tts` : null;
