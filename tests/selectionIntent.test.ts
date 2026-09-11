import assert from "node:assert/strict";
import test from "node:test";
import {
  getSelectionToolbarKind,
  getVisibleSelectionToolbarKind,
} from "../src/selectionIntent.ts";

test("hides an AI-only learning toolbar while signed out", () => {
  assert.equal(getVisibleSelectionToolbarKind("learn", false), null);
  assert.equal(getVisibleSelectionToolbarKind("learn", true), "learn");
  assert.equal(getVisibleSelectionToolbarKind("create", false), "create");
  assert.equal(getVisibleSelectionToolbarKind("create", true), "create");
});

test("uses the create toolbar when the selection does not touch a highlight", () => {
  const highlight = {} as Node;
  const range = { intersectsNode: () => false } as Pick<Range, "intersectsNode">;

  assert.equal(getSelectionToolbarKind(range, [highlight]), "create");
});

test("uses the learning toolbar when any part of the selection touches a highlight", () => {
  const first = {} as Node;
  const second = {} as Node;
  const range = {
    intersectsNode: (node: Node) => node === second,
  } as Pick<Range, "intersectsNode">;

  assert.equal(getSelectionToolbarKind(range, [first, second]), "learn");
});

test("ignores highlight nodes detached while resolving the selection", () => {
  const detached = {} as Node;
  const range = {
    intersectsNode: () => {
      throw new Error("detached");
    },
  } as Pick<Range, "intersectsNode">;

  assert.equal(getSelectionToolbarKind(range, [detached]), "create");
});
