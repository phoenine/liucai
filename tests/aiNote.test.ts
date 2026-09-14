import assert from "node:assert/strict";
import test from "node:test";
import { appendNote, formatAiExplanationNote, MAX_NOTE_LENGTH } from "../src/aiNote.ts";

const explanation = {
  concept: "检索增强生成",
  explanation: "回答前先查资料，这里指引用**当前知识库**。",
};

test("formats localized AI notes and preserves an existing note", () => {
  const block = formatAiExplanationNote(explanation, "zh-CN", "客服机器人先搜索产品手册。");
  assert.equal(block, [
    "回答前先查资料，这里指引用**当前知识库**。",
    "",
    "**举个栗子🌰**",
    "客服机器人先搜索产品手册。",
  ].join("\n"));
  assert.equal(appendNote("我的批注", block), `我的批注\n\n${block}`);
  assert.equal(appendNote("", block), block);
  assert.equal(formatAiExplanationNote(explanation, "zh-CN"), explanation.explanation);
  assert.equal(
    formatAiExplanationNote(explanation, "en", "A support bot searches the manual first."),
    [
      explanation.explanation,
      "",
      "**Example 🌰**",
      "A support bot searches the manual first.",
    ].join("\n"),
  );
});

test("rejects an append that would exceed the note limit without truncating it", () => {
  const existing = "字".repeat(MAX_NOTE_LENGTH - 3);

  assert.throws(() => appendNote(existing, "新增内容"), /NOTE_TOO_LONG/);
  assert.equal(appendNote("原文", "新增"), "原文\n\n新增");
});
