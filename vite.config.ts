import { defineConfig } from "vite";

// ar/ is the Vite root. index.html is the entry; main.js (→ main.ts) is its
// module. Static runtime assets live in public/ (copied verbatim to dist/, so
// runtime fetches like "character_v2.glb" / "textures/face_*.webp" keep working
// at the site root). The model-viewer CDN <script> stays external (untouched).
export default defineConfig({
  publicDir: "public",
  server: {
    host: "127.0.0.1",
    port: 8765, // matches the Worker CORS allowlist (:8765)
  },
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
  },
});
