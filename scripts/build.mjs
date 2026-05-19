import { sharedBuildConfig } from "./vite-shared.mjs";
import { build } from "vite";
import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const inlineIifeOutput = {
  inlineDynamicImports: true,
  assetFileNames: (assetInfo) => {
    if (assetInfo.name?.endsWith(".css")) return "liucai.css";
    return "assets/[name][extname]";
  },
};

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
      output: inlineIifeOutput,
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
      output: inlineIifeOutput,
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
      output: inlineIifeOutput,
    },
  },
});

await verifyPopupCssContract();

async function verifyPopupCssContract() {
  const popupHtml = await readFile(resolve(dist, "popup.html"), "utf8");
  if (!popupHtml.includes('href="liucai.css"')) {
    throw new Error('popup.html must reference the deterministic popup stylesheet: href="liucai.css"');
  }
  await access(resolve(dist, "liucai.css"), constants.R_OK);
}
