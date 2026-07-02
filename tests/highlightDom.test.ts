import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { updateHighlightAttributes } from "../src/highlightDom.ts";
import type { HighlightRecord } from "../src/types.ts";

test("updates tooltip presence flags without retaining tooltip content in the DOM", () => {
  const spans = [
    {
      dataset: { tooltip: "stale note and tags" },
      classList: { contains: () => false },
      removeAttribute(name: string) {
        if (name === "data-tooltip") delete this.dataset.tooltip;
      },
    },
    {
      dataset: { tooltip: "stale note and tags" },
      classList: { contains: () => true },
      removeAttribute(name: string) {
        if (name === "data-tooltip") delete this.dataset.tooltip;
      },
    },
  ];
  const previousDocument = globalThis.document;
  const previousCss = globalThis.CSS;

  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { querySelectorAll: () => spans },
  });
  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    value: { escape: (value: string) => value },
  });

  try {
    updateHighlightAttributes({
      id: "highlight-1",
      pageId: "page-1",
      url: "https://example.com",
      title: "Example",
      text: "Selected text",
      color: "gold",
      note: "Private note",
      tags: ["private-tag"],
      selector: {
        exact: "Selected text",
        prefix: "",
        suffix: "",
        start: 0,
        end: 13,
      },
      createdAt: "2026-07-02T00:00:00.000Z",
      updatedAt: "2026-07-02T00:00:00.000Z",
    } satisfies HighlightRecord);
  } finally {
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: previousDocument,
    });
    Object.defineProperty(globalThis, "CSS", {
      configurable: true,
      value: previousCss,
    });
  }

  for (const span of spans) {
    assert.equal(span.dataset.hasNote, "true");
    assert.equal(span.dataset.hasTags, "true");
    assert.equal(span.dataset.tooltip, undefined);
  }
});

test("does not write tooltip content into highlight DOM attributes", async () => {
  const source = await readFile(
    new URL("../src/highlightDom.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /dataset\.tooltip/);
});

test("uses note and tag presence flags to select tooltip highlights", async () => {
  const source = await readFile(
    new URL("../src/contentController.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /data-has-note="true"/);
  assert.match(source, /data-has-tags="true"/);
  assert.doesNotMatch(source, /\[data-tooltip\]/);
});
