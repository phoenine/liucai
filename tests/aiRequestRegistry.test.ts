import assert from "node:assert/strict";
import test from "node:test";
import { AiRequestRegistry } from "../src/aiRequestRegistry.ts";

test("cancels only the matching request in the matching tab", () => {
  const registry = new AiRequestRegistry();
  const tabOne = registry.begin("tab:1", "request-a");
  const tabTwo = registry.begin("tab:2", "request-b");

  assert.equal(registry.cancel("tab:1", "request-b"), false);
  assert.equal(tabOne.signal.aborted, false);
  assert.equal(tabTwo.signal.aborted, false);

  assert.equal(registry.cancel("tab:1", "request-a"), true);
  assert.equal(tabOne.signal.aborted, true);
  assert.equal(tabTwo.signal.aborted, false);
});

test("a replacement aborts only the previous request from the same tab", () => {
  const registry = new AiRequestRegistry();
  const previous = registry.begin("tab:1", "request-a");
  const otherTab = registry.begin("tab:2", "request-b");
  const replacement = registry.begin("tab:1", "request-c");

  assert.equal(previous.signal.aborted, true);
  assert.equal(replacement.signal.aborted, false);
  assert.equal(otherTab.signal.aborted, false);

  registry.finish("tab:1", "request-a", previous);
  assert.equal(registry.cancel("tab:1", "request-c"), true);
});
