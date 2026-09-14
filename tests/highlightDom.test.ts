import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { updateHighlightAttributes } from "../src/content/highlightDom.ts";
import type { HighlightRecord } from "../src/shared/types.ts";

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
    new URL("../src/content/highlightDom.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /dataset\.tooltip/);
});

test("does not wrap whitespace-only ranges or put --last on blank spans", async () => {
  const source = await readFile(
    new URL("../src/content/highlightDom.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /if \(!range\.toString\(\)\.trim\(\)\) \{\s*return \[\];/s);
  assert.match(source, /if \(!selectedRange\.toString\(\)\.trim\(\)\) \{\s*continue;/s);
  assert.match(source, /if \(spans\[index\]\.textContent\?\.trim\(\)\) \{\s*spans\[index\]\.classList\.add\("liucai-highlight--last"\)/s);
});

test("uses note and tag presence flags to select tooltip highlights", async () => {
  const source = await readFile(
    new URL("../src/content/contentController.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /closest\?\.\("\.liucai-highlight"\)/);
  assert.match(source, /dataset\.hasNote === "true"/);
  assert.match(source, /dataset\.hasTags === "true"/);
  assert.doesNotMatch(source, /liucai-highlight--last:is/);
  assert.doesNotMatch(source, /\[data-tooltip\]/);
});

test("keeps tooltip visible when the pointer moves between spans of the same highlight", async () => {
  const source = await readFile(
    new URL("../src/content/contentController.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /other\.dataset\.id === id/);
});

test("wraps a highlight range once per block without extracting content before insert", async () => {
  const source = await readFile(
    new URL("../src/content/highlightDom.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /groupTextNodesByBlock/);
  assert.match(source, /range\.surroundContents\(span\)/);
  assert.doesNotMatch(source, /extractContents/);
});

test("classifies tags in one shared module instead of per-consumer lists", async () => {
  const [highlightSource, blockSource, tagsSource] = await Promise.all([
    readFile(new URL("../src/content/highlightDom.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/content/rangeDisplayText.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/content/domTags.ts", import.meta.url), "utf8"),
  ]);

  assert.match(tagsSource, /"BLOCKQUOTE"/);
  assert.match(tagsSource, /"TD"/);
  // Inline tags must stay out of the block list, or the two classifications merge by accident.
  assert.doesNotMatch(tagsSource, /"BUTTON"|"RUBY"|"SPAN"/);
  assert.doesNotMatch(highlightSource, /PHRASING_TAGS|DISPLAY_BLOCK_TAGS/);
  assert.doesNotMatch(blockSource, /PHRASING_TAGS|DISPLAY_BLOCK_TAGS/);
});
