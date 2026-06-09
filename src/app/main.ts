// Svelte app entry (the rebuilt replacement for main.js). Mounts the root
// component; bootstrap/SW registration are added in later milestones.
import { mount } from "svelte";
import App from "./App.svelte";

const target = document.getElementById("app");
if (!target) throw new Error("#app mount point missing");

const app = mount(App, { target });
export default app;
