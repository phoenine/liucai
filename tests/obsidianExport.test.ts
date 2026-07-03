import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { formatObsidianHighlight } from "../src/obsidianExport.ts";
import type { HighlightColor, HighlightRecord } from "../src/types.ts";

function makeRecord(overrides: Partial<HighlightRecord> = {}): HighlightRecord {
  return {
    id: "highlight-1",
    pageId: "page-1",
    canonicalUrl: "https://example.com/articles/gson",
    text: "DwMessage 是 DeviceWise 网关推送消息的 Java 映射。",
    color: "coral",
    note: "Gson 用于在 Java 对象与 JSON 字符串之间自动转换。",
    tags: ["Gson", "Java"],
    selector: {
      exact: "DwMessage",
      prefix: "",
      suffix: "",
      start: 0,
      end: 9,
    },
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T00:00:00.000Z",
    ...overrides,
  };
}

test("formats a complete highlight as one Obsidian callout", () => {
  assert.equal(
    formatObsidianHighlight(makeRecord(), "网页标题"),
    [
      "> [!quote] 🟠 网页摘录 · [网页标题](https://example.com/articles/gson)",
      ">",
      "> *DwMessage 是 DeviceWise 网关推送消息的 Java 映射。*",
      ">",
      "> ---",
      ">",
      "> **批注**",
      ">",
      "> Gson 用于在 Java 对象与 JSON 字符串之间自动转换。",
      ">",
      "> **标签：** #Gson #Java",
    ].join("\n"),
  );
});

test("maps every highlight color to a visible marker", () => {
  const expected: Record<HighlightColor, string> = {
    gold: "🟡",
    mint: "🟢",
    coral: "🟠",
  };

  for (const [color, marker] of Object.entries(expected)) {
    assert.match(
      formatObsidianHighlight(
        makeRecord({ color: color as HighlightColor, note: "", tags: [] }),
        "Title",
      ),
      new RegExp(`^> \\[!quote\\] ${marker}`),
    );
  }
});

test("truncates the displayed title without changing the source URL", () => {
  const title = "这是一个用于验证网页标题过长时会被截断但链接仍然保持完整的特别特别长的网页标题以及额外内容";
  const result = formatObsidianHighlight(makeRecord(), title);

  assert.match(
    result,
    /^> \[!quote\] 🟠 网页摘录 · \[这是一个用于验证网页标题过长时会被截断但链接仍然保持完整的特别特别长的网页标题…\]\(https:\/\/example\.com\/articles\/gson\)/,
  );
});

test("uses the hostname when the page title is empty", () => {
  assert.match(
    formatObsidianHighlight(makeRecord({ note: "", tags: [] }), "  "),
    /^> \[!quote\] 🟠 网页摘录 · \[example\.com\]/,
  );
});

test("italicizes each source line and preserves Markdown lists in the note", () => {
  const result = formatObsidianHighlight(
    makeRecord({
      text: "第一行包含 * 星号\n第二行包含 [方括号]\n\n第四行",
      note: "说明：\n\n1. 第一项\n2. 第二项\n- 补充项",
      tags: [],
    }),
    "Title",
  );

  assert.match(
    result,
    /> \*第一行包含 \\\* 星号\*\n> \*第二行包含 \\\[方括号\\\]\*\n>\n> \*第四行\*/,
  );
  assert.match(result, /> 1\. 第一项\n> 2\. 第二项\n> - 补充项/);
});

test("omits empty sections and normalizes spaces in Obsidian tags", () => {
  const result = formatObsidianHighlight(
    makeRecord({ note: "", tags: ["机器 学习"] }),
    "Title",
  );

  assert.doesNotMatch(result, /批注/);
  assert.match(result, /> ---\n>\n> \*\*标签：\*\* #机器-学习$/);
});

test("uses the Obsidian formatter for sidebar copies", async () => {
  const source = await readFile(
    new URL("../src/contentController.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    source,
    /this\.copyText\(formatObsidianHighlight\(record,\s*document\.title\)\)/,
  );
});
