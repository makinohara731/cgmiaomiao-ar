import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// ar/ is the Vite root. Static runtime assets live in public/ (copied verbatim
// to dist/, so runtime fetches like "character_v2.glb" / "textures/face_*.webp"
// keep working at the site root). The model-viewer CDN <script> stays external.
//
// index.html IS the Svelte app (src/app/main.ts) since the M7 cutover.
export default defineConfig({
  plugins: [svelte()],
  publicDir: "public",
  // The kept renderer/AR modules import `three` + `three/addons`; without dedupe,
  // Vite dev pre-bundles core vs addons as separate chunks → three's "Multiple
  // instances" warning. One copy fixes it.
  resolve: { dedupe: ["three"] },
  server: {
    host: "127.0.0.1",
    port: 8765, // matches the Worker CORS allowlist (:8765)
  },
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
    // SMOKE=1: also build the dev AR harness so dev/ar-smoke-probe.mjs can run
    // against `vite preview` (the mindar vendored runtime only loads on the
    // static prod path). Never set for real production builds.
    rollupOptions: (globalThis as any).process?.env?.SMOKE
      ? { input: { index: "index.html", "ar-smoke": "dev/ar-smoke.html" } }
      : undefined,
  },
});
