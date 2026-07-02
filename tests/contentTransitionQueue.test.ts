import assert from "node:assert/strict";
import test from "node:test";
import { ContentTransitionQueue } from "../src/contentTransitionQueue.ts";

test("runs content transitions in order", async () => {
  const queue = new ContentTransitionQueue();
  const events: string[] = [];
  const first = queue.run(async () => {
    events.push("first:start");
    await Promise.resolve();
    events.push("first:end");
  });
  const second = queue.run(async () => {
    events.push("second");
  });

  await Promise.all([first, second]);

  assert.deepEqual(events, ["first:start", "first:end", "second"]);
});

test("continues after a failed transition", async () => {
  const queue = new ContentTransitionQueue();

  await assert.rejects(queue.run(async () => {
    throw new Error("failed");
  }));

  assert.equal(await queue.run(async () => "recovered"), "recovered");
});
