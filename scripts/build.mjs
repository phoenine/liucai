import { sharedBuildConfig } from "./vite-shared.mjs";
import { build } from "vite";
import { access, cp, mkdir, readFile, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const inlineIifeOutput = (stylesheet) => ({
  inlineDynamicImports: true,
  assetFileNames: (assetInfo) => {
    if (assetInfo.name?.endsWith(".css")) return stylesheet;
    return "assets/[name][extname]";
  },
});

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
      output: inlineIifeOutput("content-bundle.css"),
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
      output: inlineIifeOutput("background-bundle.css"),
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
      output: inlineIifeOutput("liucai.css"),
    },
  },
});

await build({
  ...base,
  build: {
    ...base.build,
    lib: {
      entry: resolve(root, "src/options.tsx"),
      name: "LiucaiOptions",
      formats: ["iife"],
      fileName: () => "options.js",
    },
    rollupOptions: {
      output: inlineIifeOutput("options.css"),
    },
  },
});

await verifyHtmlCssContract("popup.html", "liucai.css");
await verifyHtmlCssContract("options.html", "options.css");

async function verifyHtmlCssContract(htmlFilename, cssFilename) {
  const html = await readFile(resolve(dist, htmlFilename), "utf8");
  if (!html.includes(`href="${cssFilename}"`)) {
    throw new Error(`${htmlFilename} must reference the deterministic stylesheet: href="${cssFilename}"`);
  }
  await access(resolve(dist, cssFilename), constants.R_OK);
}
