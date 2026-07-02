import assert from "node:assert/strict";
import test from "node:test";
import { parseTags } from "../src/tags.ts";

test("normalizes and deduplicates tags", () => {
  assert.deepEqual(parseTags("#AI，Agent\nAI, 测试"), ["AI", "Agent", "测试"]);
});

test("ignores empty tag fragments", () => {
  assert.deepEqual(parseTags("，, \n #产品 "), ["产品"]);
});
