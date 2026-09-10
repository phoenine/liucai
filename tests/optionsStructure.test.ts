import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("declares a tab-based options page in the extension manifest", async () => {
  const manifest = JSON.parse(await readFile(new URL("../public/manifest.json", import.meta.url), "utf8"));

  assert.deepEqual(manifest.options_ui, {
    page: "options.html",
    open_in_tab: true,
  });
});

test("opens settings from an accessible popup header button", async () => {
  const popup = await readFile(new URL("../src/popup.tsx", import.meta.url), "utf8");

  assert.match(popup, /aria-label=\{copy\.settings\}/);
  assert.match(popup, /chrome\.runtime\.openOptionsPage\(\)/);
  assert.match(popup, /lc-popup__settings-button/);
});

test("offers browser, Chinese, and English interface language choices", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/localization.ts", import.meta.url), "utf8");

  assert.match(options, /\["auto", "zh-CN", "en"\]/);
  assert.match(localization, /Follow browser/);
  assert.match(localization, /跟随浏览器/);
  assert.match(localization, /getPopupCopy/);
  assert.match(options, /lc-options__retry/);
  assert.match(localization, /retry: "Retry"/);
});

test("builds a dedicated options script and stylesheet", async () => {
  const buildScript = await readFile(new URL("../scripts/build.mjs", import.meta.url), "utf8");
  const optionsHtml = await readFile(new URL("../public/options.html", import.meta.url), "utf8");

  assert.match(buildScript, /src\/options\.tsx/);
  assert.match(buildScript, /options\.js/);
  assert.match(buildScript, /options\.css/);
  assert.match(optionsHtml, /href="options\.css"/);
  assert.match(optionsHtml, /src="options\.js"/);
});

test("uses the configured default only for implicit note and tag highlights", async () => {
  const controller = await readFile(new URL("../src/contentController.tsx", import.meta.url), "utf8");

  assert.match(controller, /createHighlight\(color, \{ openEditor: false \}\)/);
  assert.match(controller, /createHighlight\(\s*this\.defaultAnnotationColor,\s*\{ openEditor: true, focus: "note" \}/);
  assert.match(controller, /createHighlight\(\s*this\.defaultAnnotationColor,\s*\{ openEditor: true, focus: "tags" \}/);
});
