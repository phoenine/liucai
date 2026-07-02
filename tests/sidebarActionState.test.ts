import assert from "node:assert/strict";
import test from "node:test";
import {
  nextDeleteState,
  runCopyAction,
  type CopyStatus,
} from "../src/sidebarActionState.ts";

test("reports copying before the action resolves and copied after success", async () => {
  const statuses: CopyStatus[] = [];
  let resolveCopy!: () => void;
  const copyPromise = new Promise<void>((resolve) => {
    resolveCopy = resolve;
  });

  const action = runCopyAction(
    () => copyPromise,
    (status) => statuses.push(status),
  );

  assert.deepEqual(statuses, ["copying"]);
  resolveCopy();
  await action;
  assert.deepEqual(statuses, ["copying", "copied"]);
});

test("reports failed and preserves a copy rejection", async () => {
  const statuses: CopyStatus[] = [];
  const error = new Error("copy failed");

  await assert.rejects(
    runCopyAction(
      () => Promise.reject(error),
      (status) => statuses.push(status),
    ),
    error,
  );
  assert.deepEqual(statuses, ["copying", "failed"]);
});

test("requires confirmation before entering the deleting state", () => {
  assert.equal(nextDeleteState("idle", "request"), "confirming");
  assert.equal(nextDeleteState("confirming", "cancel"), "idle");
  assert.equal(nextDeleteState("confirming", "confirm"), "deleting");
  assert.equal(nextDeleteState("deleting", "fail"), "confirming");
});
