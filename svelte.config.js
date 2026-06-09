import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Lets <script lang="ts"> blocks in .svelte files be TypeScript.
export default { preprocess: vitePreprocess() };
