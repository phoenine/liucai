import assert from "node:assert/strict";
import test from "node:test";
import { trimContextAroundSelection } from "../src/content/selectionContext.ts";

test("normalizes short context and keeps a long selection near the center", () => {
  assert.equal(trimContextAroundSelection("one\n  two", "two", 20), "one two");
  const full = `${"a".repeat(120)} TARGET ${"b".repeat(120)}`;
  const context = trimContextAroundSelection(full, "TARGET", 80);
  assert.equal(context.length, 80);
  assert.match(context, /TARGET/);
});
