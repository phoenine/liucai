import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("content UI reads all interactive labels from localized copy", async () => {
  const source = await readFile(new URL("../src/content/contentUi.tsx", import.meta.url), "utf8");

  assert.match(source, /copy: ContentCopy/);
  assert.match(source, /props\.copy\.sidebarTitle/);
  assert.match(source, /props\.copy\.editorTitle/);
  assert.match(source, /props\.copy\.notePlaceholder/);
  assert.match(source, /props\.copy\.confirmDelete/);
  assert.match(source, /aria-label=\{`\$\{props\.copy\.aiTitle\}: \$\{props\.subject\}`\}/);
  assert.match(source, /<span title=\{props\.subject\}>\{props\.subject\}<\/span>/);
  assert.doesNotMatch(source, /<h3>\{props\.state\.explanation\.concept\}<\/h3>/);
  assert.match(source, /aiExample[\s\S]*aiThoughtCard[\s\S]*aiAppendNote/);
  assert.doesNotMatch(source, /批注与标签|六彩划线列表|还没有划线|确认删除/);
});

test("content controller applies language changes to mounted page UI", async () => {
  const source = await readFile(new URL("../src/content/contentController.tsx", import.meta.url), "utf8");

  assert.match(source, /applyPreferences\(/);
  assert.match(source, /languageChanged && this\.pageActive/);
  assert.match(source, /run\(\(\) => this\.refreshSidebarData\(\)\)/);
  assert.match(source, /copy=\{this\.contentCopy\}/);
});

test("pointer targeting treats the highlight tooltip as UI without changing text offsets", async () => {
  const controller = await readFile(new URL("../src/content/contentController.tsx", import.meta.url), "utf8");
  const domText = await readFile(new URL("../src/content/domText.ts", import.meta.url), "utf8");

  assert.match(controller, /LIUCAI_UI_SELECTOR\},?\.liucai-highlight-tooltip/);
  assert.match(controller, /startedInUi = this\.mouseDownStartedInUi;\s*this\.mouseDownStartedInUi = false;/s);
  assert.match(controller, /pointercancel.*this\.clearUiMouseDown/s);
  assert.doesNotMatch(domText, /liucai-highlight-tooltip/);
});
