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

test("keeps cloud auth neutral until the stored session status is loaded", async () => {
  const popup = await readFile(new URL("../src/popup.tsx", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/localization.ts", import.meta.url), "utf8");

  assert.match(popup, /syncStatus === null \? \([\s\S]*copy\.checkingSync/);
  assert.match(localization, /checkingSync: "正在检查登录状态……"/);
  assert.match(localization, /checkingSync: "Checking sign-in status…"/);
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

test("offers separate LM Studio and OpenAI direct connection settings", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/localization.ts", import.meta.url), "utf8");

  assert.match(options, /\["lm-studio", "openai"\]/);
  assert.match(options, /loadLlmSettings/);
  assert.match(options, /saveLlmSettings/);
  assert.match(options, /type="password"/);
  assert.match(options, /OPENAI_BASE_URL/);
  assert.match(localization, /API Key 会保存在当前浏览器本地/);
  assert.match(localization, /Direct use from a browser extension risks exposing the key/);
});

test("captures LLM input values before queued React state updates", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    options,
    /setLlmSettings\(\(current\) => \(\{[\s\S]{0,180}event\.currentTarget\.value/,
  );
  assert.equal(options.match(/const value = event\.currentTarget\.value;/g)?.length, 5);
});

test("offers save feedback, a real connection test, and reduced-motion press feedback", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/options.css", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/localization.ts", import.meta.url), "utf8");

  assert.match(options, /LIUCAI_AI_TEST_CONNECTION/);
  assert.match(options, /llmTestSuccess/);
  assert.match(options, /saveTarget === "llm"/);
  assert.match(localization, /saveLlm: "保存"/);
  assert.match(localization, /testLlm: "测试连接"/);
  assert.match(styles, /transform 140ms var\(--ease-out\)/);
  assert.match(styles, /transform: scale\(0\.97\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("uses shared accent colors for default-highlight swatches", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/options.css", import.meta.url), "utf8");

  assert.match(options, /HIGHLIGHT_ACCENT\[color\]/);
  assert.match(styles, /\.lc-options__color-swatch\s*\{[^}]*background:\s*var\(--liucai-accent\);/s);
  assert.doesNotMatch(styles, /color-swatch\[data-color="gold"\]/);
});
