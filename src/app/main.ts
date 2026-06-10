// Svelte app entry (the rebuilt replacement for main.js).
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app mount point missing");

const app = mount(App, { target });

// PWA service worker (kept public/sw.js; relative path — works at the site root).
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.log("SW reg failed:", err));
  });
}

export default app;
