/// <reference types="vite/client" />
/// <reference types="svelte" />
// Declares Vite's ambient types: `*.css` (and other asset) side-effect imports,
// plus `import.meta.env` (BASE_URL / DEV / PROD). Needed so tsc accepts
// `import "./vn-styles.css"` in the vn modules.

// Let `tsc --noEmit` resolve `.svelte` imports from .ts files (svelte-check does
// the real component typecheck; this just stops tsc erroring on the import).
declare module "*.svelte" {
  import type { Component } from "svelte";
  const component: Component<Record<string, any>>;
  export default component;
}
