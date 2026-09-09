import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createObsidianExportFilename,
  formatObsidianHighlight,
  formatObsidianPageExport,
} from "../src/obsidianExport.ts";
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

test("formats a page export using the Obsidian clipping template", () => {
  const exported = formatObsidianPageExport({
    pageTitle: "万字保姆级Pandas核心知识操作大全",
    canonicalUrl: "https://bbs.huaweicloud.com/blogs/337034",
    highlights: [
      makeRecord({
        id: "highlight-1",
        canonicalUrl: "https://bbs.huaweicloud.com/blogs/337034",
        text: "用到pandas做数据处理和分析，特意总结了",
        color: "gold",
        note: "简单测试下",
        tags: ["策四"],
      }),
      makeRecord({
        id: "highlight-2",
        canonicalUrl: "https://bbs.huaweicloud.com/blogs/337034",
        text: "计算字符串长",
        color: "gold",
        note: "再来一个检查",
        tags: ["测试"],
      }),
    ],
    exportedAt: new Date(2026, 3, 13, 13, 57),
  });

  assert.equal(
    exported,
    [
      "---",
      "创建时间: 2026-04-13 13:57",
      "划线数量: 2",
      "tags:",
      "  - 策四",
      "  - 测试",
      "原文链接: https://bbs.huaweicloud.com/blogs/337034",
      "---",
      "# 万字保姆级Pandas核心知识操作大全",
      "",
      "> [阅读原文](https://bbs.huaweicloud.com/blogs/337034)",
      "",
      "---",
      "",
      "> [!quote] 🟡 网页摘录 · [万字保姆级Pandas核心知识操作大全](https://bbs.huaweicloud.com/blogs/337034)",
      ">",
      "> *用到pandas做数据处理和分析，特意总结了*",
      ">",
      "> ---",
      ">",
      "> **批注**",
      ">",
      "> 简单测试下",
      ">",
      "> **标签：** #策四",
      "",
      "---",
      "",
      "> [!quote] 🟡 网页摘录 · [万字保姆级Pandas核心知识操作大全](https://bbs.huaweicloud.com/blogs/337034)",
      ">",
      "> *计算字符串长*",
      ">",
      "> ---",
      ">",
      "> **批注**",
      ">",
      "> 再来一个检查",
      ">",
      "> **标签：** #测试",
      "",
      "---",
    ].join("\n"),
  );
});

test("deduplicates and normalizes highlight tags in page export frontmatter", () => {
  const exported = formatObsidianPageExport({
    pageTitle: "Tag Test",
    canonicalUrl: "https://example.com/tags",
    highlights: [
      makeRecord({ tags: ["#机器 学习", "Java"] }),
      makeRecord({ id: "highlight-2", tags: ["机器-学习", ""] }),
    ],
    exportedAt: new Date("2026-04-13T13:57:00+08:00"),
  });

  assert.match(
    exported,
    /^tags:\n  - 机器-学习\n  - Java\n原文链接:/m,
  );
});

test("omits title from frontmatter while keeping page headings", () => {
  const exported = formatObsidianPageExport({
    pageTitle: "sqlpage/SQLPage: Fast SQL-only data application builder. Automatically build a UI on top of SQL queries.",
    canonicalUrl: "https://github.com/sqlpage/SQLPage",
    highlights: [
      makeRecord({
        canonicalUrl: "https://github.com/sqlpage/SQLPage",
        tags: ["new", "needs[quote]"],
      }),
    ],
    exportedAt: new Date("2026-07-07T11:23:00+08:00"),
  });

  assert.doesNotMatch(exported, /^标题:/m);
  assert.match(exported, /^# sqlpage\/SQLPage: Fast SQL-only data application builder\. Automatically build a UI on top of SQL queries\.$/m);
  assert.match(exported, /^  - "needs\[quote\]"\n原文链接:/m);
});

test("creates a safe clipping export filename", () => {
  assert.equal(
    createObsidianExportFilename("  React/TypeScript: Hooks? *Guide*  "),
    "【摘录】React-TypeScript Hooks Guide.md",
  );
  assert.equal(
    createObsidianExportFilename(""),
    "【摘录】未命名页面.md",
  );
});
