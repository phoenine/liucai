import { sharedBuildConfig } from "./vite-shared.mjs";
import { build } from "vite";
import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
await cp(resolve(root, "public"), dist, { recursive: true });

const base = {
  ...sharedBuildConfig,
  root,
  configFile: false,
};

await build({
  ...base,
  build: {
    ...base.build,
    lib: {
      entry: resolve(root, "src/content.tsx"),
      name: "LiucaiContent",
      formats: ["iife"],
      fileName: () => "content.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});

await build({
  ...base,
  build: {
    ...base.build,
    lib: {
      entry: resolve(root, "src/background.ts"),
      name: "LiucaiBackground",
      formats: ["iife"],
      fileName: () => "background.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});

await build({
  ...base,
  build: {
    ...base.build,
    lib: {
      entry: resolve(root, "src/popup.tsx"),
      name: "LiucaiPopup",
      formats: ["iife"],
      fileName: () => "popup.js",
    },
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
