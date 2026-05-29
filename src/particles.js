// DOM-based particle layer — small floating glyphs (hearts, stars, Zs)
// that drift up and fade out. Cheaper than canvas, and the CSS engine
// schedules them off the main thread.
//
// Spawning fires-and-forgets — the element auto-removes after its
// animation. The host wires this via bus.on(...) → spawnHeart(x, y).

let layer = null;

function ensureLayer() {
  if (layer && document.body.contains(layer)) return layer;
  layer = document.createElement("div");
  layer.id = "particleLayer";
  layer.setAttribute("aria-hidden", "true");
  document.body.appendChild(layer);
  return layer;
}

function spawn({ glyph, x, y, color, drift = 80, ttlMs = 1500, size = 26 }) {
  const el = document.createElement("span");
  el.className = "particle";
  el.textContent = glyph;
  el.style.left  = `${x}px`;
  el.style.top   = `${y}px`;
  el.style.color = color || "inherit";
  el.style.fontSize = `${size}px`;
  // Randomize the rise direction slightly so a burst doesn't look stacked.
  const angle = (Math.random() - 0.5) * 60;             // ±30 deg
  const dx = Math.sin(angle * Math.PI / 180) * drift;
  const dy = -Math.cos(angle * Math.PI / 180) * drift;
  el.style.setProperty("--dx", `${dx}px`);
  el.style.setProperty("--dy", `${dy}px`);
  el.style.setProperty("--ttl", `${ttlMs}ms`);   // CSS `animation: ... var(--ttl)` reads this

  ensureLayer().appendChild(el);
  setTimeout(() => { try { el.remove(); } catch (_) {} }, ttlMs + 50);
}

export function spawnHeart(x, y) {
  const glyph = ["♥", "❤", "💕"][(Math.random() * 3) | 0];
  spawn({ glyph, x, y, color: "#ff6f91", size: 24 + Math.random() * 8, drift: 90 });
}

export function spawnSparkle(x, y) {
  spawn({ glyph: "✦", x, y, color: "#ffd23f", size: 18 + Math.random() * 6, drift: 60, ttlMs: 1300 });
}

export function spawnZ(x, y) {
  spawn({ glyph: "💤", x, y, color: "#a8c0ff", size: 20, drift: 50, ttlMs: 1800 });
}

// Burst N of one kind from a single anchor point.
export function burst(kind, x, y, n = 4) {
  const fn = { heart: spawnHeart, sparkle: spawnSparkle, z: spawnZ }[kind];
  if (!fn) return;
  for (let i = 0; i < n; i++) {
    const jx = x + (Math.random() - 0.5) * 30;
    const jy = y + (Math.random() - 0.5) * 12;
    // Stagger spawns so they don't all rise at the same height.
    setTimeout(() => fn(jx, jy), i * 60);
  }
}
