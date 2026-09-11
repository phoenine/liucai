import test from "node:test";
import assert from "node:assert/strict";
import { continueNoteList } from "../src/noteFormat.ts";

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
