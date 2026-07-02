import test from "node:test";
import assert from "node:assert/strict";
import { continueNoteList, parseNoteBlocks } from "../src/noteFormat.ts";

test("preserves consecutive plain lines as one paragraph", () => {
  assert.deepEqual(parseNoteBlocks("第一行\n第二行"), [
    { type: "paragraph", lines: ["第一行", "第二行"] },
  ]);
});

test("parses ordered and unordered note lists", () => {
  assert.deepEqual(parseNoteBlocks("3. 第三项\n4. 第四项\n\n- 检查代码\n- 补充测试"), [
    { type: "ordered-list", start: 3, items: ["第三项", "第四项"] },
    { type: "unordered-list", items: ["检查代码", "补充测试"] },
  ]);
});

test("separates mixed note blocks without emitting empty blocks", () => {
  assert.deepEqual(parseNoteBlocks("结论\n\n1. 定位问题\n2. 修复问题\n\n补充说明"), [
    { type: "paragraph", lines: ["结论"] },
    { type: "ordered-list", start: 1, items: ["定位问题", "修复问题"] },
    { type: "paragraph", lines: ["补充说明"] },
  ]);
});

test("continues ordered and unordered lists at the end of an item", () => {
  assert.deepEqual(continueNoteList("1. 定位问题", 7, 7), {
    value: "1. 定位问题\n2. ",
    caret: 11,
  });
  assert.deepEqual(continueNoteList("- 检查代码", 6, 6), {
    value: "- 检查代码\n- ",
    caret: 9,
  });
});

test("exits a list from an empty item", () => {
  assert.deepEqual(continueNoteList("1. 定位问题\n2. ", 11, 11), {
    value: "1. 定位问题\n",
    caret: 8,
  });
  assert.deepEqual(continueNoteList("- 检查代码\n- ", 9, 9), {
    value: "- 检查代码\n",
    caret: 7,
  });
});

test("leaves non-applicable Enter presses to the textarea", () => {
  assert.equal(continueNoteList("普通批注", 4, 4), null);
  assert.equal(continueNoteList("1. 选中文本", 3, 5), null);
  assert.equal(continueNoteList("1. 光标在中间", 5, 5), null);
});
