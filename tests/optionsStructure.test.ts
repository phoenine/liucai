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

test("uses the extension image icon in popup and settings branding", async () => {
  const popup = await readFile(new URL("../src/popup.tsx", import.meta.url), "utf8");
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");

  assert.match(popup, /<img alt="" aria-hidden="true" className="lc-popup__logo" src="icon128\.png"/);
  assert.match(options, /<img alt="" aria-hidden="true" className="lc-options__logo" src="icon128\.png"/);
  assert.doesNotMatch(popup, /className="lc-popup__logo">六/);
  assert.doesNotMatch(options, /className="lc-options__logo">六/);
});

test("summarizes the current page and keeps a quiet footer", async () => {
  const [popup, styles, localization] = await Promise.all([
    readFile(new URL("../src/popup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/popup.css", import.meta.url), "utf8"),
    readFile(new URL("../src/shared/localization.ts", import.meta.url), "utf8"),
  ]);

  assert.match(popup, /copy\.statHighlights/);
  assert.match(popup, /copy\.statNotes/);
  assert.match(popup, /copy\.statTags/);
  assert.match(popup, /copy\.statMasks/);
  assert.match(popup, /copy\.helpFeedback/);
  assert.match(popup, /copy\.about/);
  assert.match(popup, /const ABOUT_URL = "https:\/\/github\.com\/phoenine\/liucai";/);
  assert.match(popup, /openExternal\(ABOUT_URL\)/);
  assert.doesNotMatch(popup, /lc-popup__count|localStorageAction|page\.hostname/);
  assert.match(styles, /\.lc-popup__stats[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.lc-popup\s*\{[^}]*padding:\s*14px;/s);
  assert.doesNotMatch(styles, /\.lc-popup\s*\{[^}]*(?:border|box-shadow|background):/s);
  assert.match(styles, /\.lc-popup__card\s*\{[^}]*border-radius:\s*14px;/s);
  assert.match(styles, /\.lc-popup__footer\s*\{[^}]*border-top:\s*1px solid #edf0f4;[^}]*margin-top:\s*16px;/s);
  assert.match(styles, /\.lc-popup__footer button\s*\{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s);
  assert.match(styles, /\.lc-popup__footer button:hover\s*\{[^}]*background:\s*#f1f4f8;/s);
  assert.doesNotMatch(styles, /\.lc-popup__footer button \+ button::before/);
  assert.match(localization, /statMasks: "遮罩"/);
  assert.doesNotMatch(localization, /数据保存到 Chrome IndexedDB/);
  assert.match(popup, /syncStatus && !syncStatus\.signedIn \? \([\s\S]*copy\.quickActions/);
  assert.match(styles, /\.lc-popup__site-button\s*\{[^}]*background:\s*#ffffff;[^}]*height:\s*40px;/s);
  assert.doesNotMatch(styles, /\.lc-popup__site-button--restore/);
  assert.doesNotMatch(styles, /\.lc-popup__status--disabled/);
  assert.match(popup, /PencilSimpleIcon[\s\S]*ChatCircleIcon[\s\S]*TagIcon[\s\S]*BrainIcon[\s\S]*weight="regular"/);
  assert.match(styles, /\.lc-popup__stat-icon--highlight\s*\{[^}]*color:\s*#d97706;/s);
  assert.match(styles, /\.lc-popup__stat-icon--note\s*\{[^}]*color:\s*#1078f8;/s);
  assert.match(styles, /\.lc-popup__stat-icon--tag\s*\{[^}]*color:\s*#8040f8;/s);
  assert.match(styles, /\.lc-popup__stat-icon--mask\s*\{[^}]*color:\s*#f86038;/s);
  assert.match(styles, /\.lc-popup__stat-value\s*\{[^}]*display:\s*inline-flex;[^}]*font-size:\s*18px;[^}]*justify-content:\s*center;/s);
  assert.match(styles, /\.lc-popup__stats\[data-disabled="true"\] \.lc-popup__stat-value svg\s*\{[^}]*opacity:\s*0\.55;/s);
  assert.match(styles, /\.lc-popup__title\s*\{[^}]*font-weight:\s*400;/s);
  assert.match(localization, /siteDisabled: "此网站已禁用划线"/);
  assert.match(styles, /\.lc-popup__disabled-note\s*\{[^}]*border-top:\s*1px solid #edf0f4;[^}]*color:\s*#dc2626;/s);
});

test("keeps cloud auth neutral until the stored session status is loaded", async () => {
  const popup = await readFile(new URL("../src/popup.tsx", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/shared/localization.ts", import.meta.url), "utf8");

  assert.match(popup, /syncStatus === null \? \([\s\S]*copy\.checkingSync/);
  assert.match(localization, /checkingSync: "正在检查登录状态……"/);
  assert.match(localization, /checkingSync: "Checking sign-in status…"/);
});

test("offers browser, Chinese, and English interface language choices", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/shared/localization.ts", import.meta.url), "utf8");

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
  const controller = await readFile(new URL("../src/content/contentController.tsx", import.meta.url), "utf8");

  assert.match(controller, /createHighlight\(color, \{ openEditor: false \}\)/);
  assert.match(controller, /createHighlight\(\s*this\.defaultAnnotationColor,\s*\{ openEditor: true, focus: "note" \}/);
  assert.match(controller, /createHighlight\(\s*this\.defaultAnnotationColor,\s*\{ openEditor: true, focus: "tags" \}/);
});

test("offers separate LM Studio and OpenAI direct connection settings", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/shared/localization.ts", import.meta.url), "utf8");

  assert.match(options, /\["lm-studio", "openai"\]/);
  assert.match(options, /loadLlmSettings/);
  assert.match(options, /saveLlmSettings/);
  assert.match(options, /type="password"/);
  assert.match(options, /OPENAI_BASE_URL/);
  assert.match(options, /llmSettings\.openai\.baseUrl/);
  assert.match(localization, /API Key 会保存在当前浏览器本地/);
  assert.match(localization, /Direct use from a browser extension risks exposing the key/);
});

test("captures LLM input values before queued React state updates", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(
    options,
    /setLlmSettings\(\(current\) => \(\{[\s\S]{0,180}event\.currentTarget\.value/,
  );
  assert.equal(options.match(/const value = event\.currentTarget\.value;/g)?.length, 6);
});

test("offers save feedback, a real connection test, and reduced-motion press feedback", async () => {
  const options = await readFile(new URL("../src/options.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../src/options.css", import.meta.url), "utf8");
  const localization = await readFile(new URL("../src/shared/localization.ts", import.meta.url), "utf8");

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
