import assert from "node:assert/strict";
import test from "node:test";
import { HoverRequestTracker } from "../src/hoverRequest.ts";

test("accepts only the latest active highlight request", () => {
  const tracker = new HoverRequestTracker();
  const first = tracker.begin("highlight-1");
  const second = tracker.begin("highlight-2");

  assert.equal(tracker.isCurrent(first), false);
  assert.equal(tracker.isCurrent(second), true);
});

test("rejects a request result after pointer out", () => {
  const tracker = new HoverRequestTracker();
  const request = tracker.begin("highlight-1");

  tracker.clear("highlight-1");

  assert.equal(tracker.isCurrent(request), false);
});

test("rejects an earlier request after leaving and re-entering the same highlight", () => {
  const tracker = new HoverRequestTracker();
  const first = tracker.begin("highlight-1");
  tracker.clear("highlight-1");
  const second = tracker.begin("highlight-1");

  assert.equal(tracker.isCurrent(first), false);
  assert.equal(tracker.isCurrent(second), true);
});

test("does not clear a newer request when an older highlight emits pointer out", () => {
  const tracker = new HoverRequestTracker();
  tracker.begin("highlight-1");
  const current = tracker.begin("highlight-2");

  tracker.clear("highlight-1");

  assert.equal(tracker.isCurrent(current), true);
});
