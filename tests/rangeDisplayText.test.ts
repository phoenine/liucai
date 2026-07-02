import assert from "node:assert/strict";
import test from "node:test";
import {
  formatDisplayTextTokens,
  isDisplayBlockTag,
} from "../src/rangeDisplayText.ts";

test("keeps text from inline nodes on the same line", () => {
  assert.equal(
    formatDisplayTextTokens([
      { type: "text", value: "first " },
      { type: "text", value: "inline" },
    ]),
    "first inline",
  );
});

test("inserts one newline at repeated block boundaries", () => {
  assert.equal(
    formatDisplayTextTokens([
      { type: "text", value: "first paragraph" },
      { type: "boundary" },
      { type: "boundary" },
      { type: "text", value: "second paragraph" },
    ]),
    "first paragraph\nsecond paragraph",
  );
});

test("removes layout whitespace around a block boundary", () => {
  assert.equal(
    formatDisplayTextTokens([
      { type: "text", value: "first item  " },
      { type: "boundary" },
      { type: "text", value: "  second item" },
    ]),
    "first item\nsecond item",
  );
});

test("ignores source indentation between display blocks", () => {
  assert.equal(
    formatDisplayTextTokens([
      { type: "text", value: "first paragraph" },
      { type: "boundary" },
      { type: "text", value: "\n\n    " },
      { type: "boundary" },
      { type: "text", value: "second paragraph" },
    ]),
    "first paragraph\nsecond paragraph",
  );
});

test("recognizes paragraph and list item elements as display blocks", () => {
  assert.equal(isDisplayBlockTag("P"), true);
  assert.equal(isDisplayBlockTag("LI"), true);
  assert.equal(isDisplayBlockTag("SPAN"), false);
});
