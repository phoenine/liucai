import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("content UI reads all interactive labels from localized copy", async () => {
  const source = await readFile(new URL("../src/contentUi.tsx", import.meta.url), "utf8");

  assert.match(source, /copy: ContentCopy/);
  assert.match(source, /props\.copy\.sidebarTitle/);
  assert.match(source, /props\.copy\.editorTitle/);
  assert.match(source, /props\.copy\.notePlaceholder/);
  assert.match(source, /props\.copy\.confirmDelete/);
  assert.doesNotMatch(source, /批注与标签|六彩划线列表|还没有划线|确认删除/);
});

test("content controller applies language changes to mounted page UI", async () => {
  const source = await readFile(new URL("../src/contentController.tsx", import.meta.url), "utf8");

  assert.match(source, /applyPreferences\(/);
  assert.match(source, /languageChanged && this\.pageActive/);
  assert.match(source, /run\(\(\) => this\.refreshSidebarData\(\)\)/);
  assert.match(source, /copy=\{this\.contentCopy\}/);
});
