/**
 * saves.ts (P4.5) — 3-slot, one-shot snapshot/restore of the EXISTING soul-layer
 * localStorage keys (life/mem/diary/daily/cfg) + story, under one new key
 * `miaomiao.saves.v1`. Raw localStorage IO only — it snapshots the JSON blobs by
 * string and does NOT touch the in-memory objects. After restoreSlot() writes the
 * keys back, the CALLER re-runs its existing load* fns to rehydrate.
 *
 * The restore race (the P4 highest-risk integration point): the periodic saveLife
 * + visibilitychange persist could write stale in-memory state over a just-restored
 * slot. restore runs SYNCHRONOUSLY (no await) so nothing interleaves; `withSuppressed`
 * + `isSuppressed` additionally let main.js's persist paths no-op as belt-and-braces.
 */

const SNAPSHOT_KEYS = [
  "miaomiao.life.v1",
  "miaomiao.mem.v1",
  "miaomiao.diary.v1",
  "miaomiao.daily.v1",
  "miaomiao.cfg.v1",
  "miaomiao.story.v1",
];

export const SAVES_KEY = "miaomiao.saves.v1";
const N_SLOTS = 3;

export interface SlotMeta {
  used: boolean;
  timestamp: number;
  affection: number;
  stage: string;
  catName: string;
  route: string;
}

interface Slot {
  meta: SlotMeta;
  data: Record<string, string | null>;
}

interface SavesBlob {
  v: 1;
  slots: (Slot | null)[];
}

const EMPTY_META = (): SlotMeta => ({
  used: false,
  timestamp: 0,
  affection: 0,
  stage: "",
  catName: "",
  route: "",
});

// ---- restore-race guard ----
let suppress = false;
export function isSuppressed(): boolean {
  return suppress;
}
export function withSuppressed(fn: () => void): void {
  suppress = true;
  try {
    fn();
  } finally {
    suppress = false;
  }
}

// ---- internals ----
function readBlob(): SavesBlob {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && p.v === 1 && Array.isArray(p.slots)) {
        const slots: (Slot | null)[] = [];
        for (let i = 0; i < N_SLOTS; i++) slots[i] = p.slots[i] || null;
        return { v: 1, slots };
      }
    }
  } catch {
    /* corrupt → fresh */
  }
  return { v: 1, slots: [null, null, null] };
}

function writeBlob(b: SavesBlob): void {
  try {
    localStorage.setItem(SAVES_KEY, JSON.stringify(b));
  } catch {
    /* storage full — non-fatal */
  }
}

// ---- public API ----

/** Metadata for all 3 slots (always length N_SLOTS; unused slots report used:false). */
export function listSlots(): SlotMeta[] {
  const b = readBlob();
  return Array.from({ length: N_SLOTS }, (_, i) => (b.slots[i] ? b.slots[i]!.meta : EMPTY_META()));
}

/** Snapshot the current soul-layer + story keys into slot n. The caller supplies
 *  the display meta (it knows affection/stage/name/route). */
export function saveSlot(
  n: number,
  meta: { affection: number; stage: string; catName: string; route: string }
): SlotMeta {
  const b = readBlob();
  const data: Record<string, string | null> = {};
  for (const k of SNAPSHOT_KEYS) data[k] = localStorage.getItem(k);
  const m: SlotMeta = { used: true, timestamp: Date.now(), ...meta };
  b.slots[n] = { meta: m, data };
  writeBlob(b);
  return m;
}

/** Write slot n's snapshot back into the live keys. Returns false if the slot is
 *  empty. The caller MUST re-run its load* fns (ideally inside withSuppressed). */
export function restoreSlot(n: number): boolean {
  const b = readBlob();
  const slot = b.slots[n];
  if (!slot) return false;
  for (const k of SNAPSHOT_KEYS) {
    const v = slot.data[k];
    if (v == null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  }
  return true;
}

export function clearSlot(n: number): void {
  const b = readBlob();
  b.slots[n] = null;
  writeBlob(b);
}
