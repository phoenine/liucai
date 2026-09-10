import assert from "node:assert/strict";
import test from "node:test";
import {
  getOptionsCopy,
  getPopupCopy,
  getContentCopy,
  resolveInterfaceLocale,
} from "../src/localization.ts";

test("resolves explicit and browser-following interface languages", () => {
  assert.equal(resolveInterfaceLocale("zh-CN", "en-US"), "zh-CN");
  assert.equal(resolveInterfaceLocale("en", "zh-CN"), "en");
  assert.equal(resolveInterfaceLocale("auto", "zh-TW"), "zh-CN");
  assert.equal(resolveInterfaceLocale("auto", "fr-FR"), "en");
});

test("provides matching settings and popup copy for both locales", () => {
  assert.equal(getOptionsCopy("zh-CN").settings, "设置");
  assert.equal(getOptionsCopy("en").settings, "Settings");
  assert.equal(getPopupCopy("zh-CN").currentPage, "当前页面");
  assert.equal(getPopupCopy("en").currentPage, "Current page");
  assert.equal(getContentCopy("zh-CN").editorTitle, "批注与标签");
  assert.equal(getContentCopy("en").editorTitle, "Note & tags");
  assert.equal(getContentCopy("en").highlightCount(1), "1 highlight");
  assert.equal(getContentCopy("en").highlightCount(2), "2 highlights");
  assert.equal(getContentCopy("zh-CN").tagSeparator, "，");
  assert.equal(getContentCopy("en").tagSeparator, ", ");
});
